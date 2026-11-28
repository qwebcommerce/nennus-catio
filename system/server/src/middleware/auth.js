import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { LEGACY_TO_MODULE, ORG_PERMISSION_SELECT, resolveModulePermissions } from "../lib/permissions.js";
import { isOrganizationOwner } from "../lib/orgOwner.js";
import {
  dbUnavailableMessage,
  dbUnavailableMessageEn,
  isDbUnavailableError,
} from "../lib/dbErrors.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

/** Session cookies (httpOnly — page scripts cannot read them). Staff and customer use different names. */
export const STAFF_COOKIE = "nc_staff";
export const CUSTOMER_COOKIE = "nc_customer";
export const STAFF_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const CUSTOMER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export function signToken(payload, expiresIn = "7d") {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function readCookies(req) {
  if (req._cookies) return req._cookies;
  const out = {};
  const raw = req.headers?.cookie;
  if (raw) {
    for (const part of String(raw).split(";")) {
      const i = part.indexOf("=");
      if (i < 0) continue;
      const k = part.slice(0, i).trim();
      if (!k || k in out) continue;
      try {
        out[k] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        out[k] = part.slice(i + 1).trim();
      }
    }
  }
  req._cookies = out;
  return out;
}

function cookieBase() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
  };
}

export function setSessionCookie(res, name, token, maxAgeMs) {
  res.cookie(name, token, { ...cookieBase(), maxAge: maxAgeMs });
}

export function clearSessionCookie(res, name) {
  res.clearCookie(name, cookieBase());
}

function bearer(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

/** Cookie first; Authorization: Bearer is still accepted for API scripts/tests (not CSRF-able). */
export function staffTokenFrom(req) {
  return readCookies(req)[STAFF_COOKIE] || bearer(req);
}

export function customerTokenFrom(req) {
  return readCookies(req)[CUSTOMER_COOKIE] || bearer(req);
}

/**
 * CSRF guard for cookie sessions: state-changing requests that carry a session cookie
 * must send the custom X-Requested-With header (a cross-site form cannot set it, and
 * CORS blocks other origins from sending it).
 */
export function csrfGuard(req, res, next) {
  const m = req.method;
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return next();
  const cookies = readCookies(req);
  if (!cookies[STAFF_COOKIE] && !cookies[CUSTOMER_COOKIE]) return next();
  if (bearer(req)) return next();
  if (req.headers["x-requested-with"]) return next();
  return res.status(403).json({
    error: "طلب مرفوض (حماية CSRF)",
    errorAr: "طلب مرفوض (حماية CSRF)",
    errorEn: "Request blocked (missing X-Requested-With header)",
    code: "CSRF",
  });
}

function unauthorized(res, code, ar, en) {
  return res.status(401).json({ error: ar, errorAr: ar, errorEn: en, code });
}

/**
 * Staff session: verifies the JWT, then loads the user from the DB on every request.
 * The CURRENT role / branch / active state is used (not what the token was issued with),
 * so demotion, deactivation and password change take effect immediately.
 */
export async function authMiddleware(req, res, next) {
  const token = staffTokenFrom(req);
  if (!token) return unauthorized(res, "UNAUTHENTICATED", "يجب تسجيل الدخول", "Please sign in");
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return unauthorized(res, "INVALID_TOKEN", "جلسة غير صالحة", "Invalid session");
  }
  if (payload.role === "CUSTOMER") {
    return unauthorized(res, "CUSTOMER_SESSION", "هذه الجلسة للعميل فقط", "This session is for the shop only");
  }
  if (!payload.organizationId || !payload.sub) {
    return unauthorized(res, "SESSION_EXPIRED", "انتهت الجلسة — سجّل الدخول مجدداً", "Session expired — please sign in again");
  }
  try {
    const user = await prisma.user.findFirst({
      where: { id: String(payload.sub), organizationId: String(payload.organizationId) },
      select: {
        id: true,
        role: true,
        active: true,
        sessionVersion: true,
        branchId: true,
        organizationId: true,
        organization: { select: ORG_PERMISSION_SELECT },
      },
    });
    if (!user || !user.active || Number(payload.sv ?? 0) !== user.sessionVersion) {
      if (readCookies(req)[STAFF_COOKIE]) clearSessionCookie(res, STAFF_COOKIE);
      return unauthorized(res, "SESSION_REVOKED", "انتهت الجلسة — سجّل الدخول مجدداً", "Your session has ended — please sign in again");
    }
    req.user = {
      sub: user.id,
      role: user.role,
      branchId: user.branchId,
      organizationId: user.organizationId,
    };
    req._org = user.organization;
    next();
  } catch (e) {
    if (isDbUnavailableError(e)) {
      return res.status(503).json({
        error: dbUnavailableMessage,
        errorAr: dbUnavailableMessage,
        errorEn: dbUnavailableMessageEn,
        code: "DB_UNAVAILABLE",
      });
    }
    next(e);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "غير مصرح" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "صلاحية غير كافية",
        errorAr: "صلاحية غير كافية",
        errorEn: "Insufficient permission",
        code: "FORBIDDEN",
      });
    }
    next();
  };
}

async function modulesFor(req) {
  if (req._modules) return req._modules;
  let org = req._org;
  if (!org) {
    org = await prisma.organization.findUnique({
      where: { id: req.user.organizationId },
      select: ORG_PERMISSION_SELECT,
    });
  }
  req._modules = resolveModulePermissions(org, req.user.role);
  return req._modules;
}

export async function hasModule(req, mod, action) {
  if (!req.user) return false;
  if (req.user.role === "ADMIN") return true;
  const allowed = await modulesFor(req);
  return Boolean(allowed?.[mod]?.[action]);
}

function forbidden(res, mod, action) {
  return res.status(403).json({
    error: "لا تملك صلاحية هذا الإجراء",
    errorAr: "لا تملك صلاحية هذا الإجراء",
    errorEn: "Insufficient permission for this action",
    code: "FORBIDDEN",
    module: mod,
    action,
  });
}

/**
 * Module permission check (FR-08/FR-10). ADMIN always passes.
 * `action` may be an array: any one of them is enough (e.g. ["create", "edit"]).
 */
export function requireModule(mod, action) {
  const actions = Array.isArray(action) ? action : [action];
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: "غير مصرح" });
      for (const a of actions) {
        if (await hasModule(req, mod, a)) return next();
      }
      return forbidden(res, mod, actions.join("|"));
    } catch (e) {
      next(e);
    }
  };
}

/**
 * Legacy permission keys, now resolved through the module matrix so there is a
 * single source of truth (see LEGACY_TO_MODULE in lib/permissions.js).
 */
export function requirePermission(...keys) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: "غير مصرح" });
      for (const key of keys) {
        const [mod, action] = LEGACY_TO_MODULE[key] || [];
        if (!mod || !(await hasModule(req, mod, action))) {
          return res.status(403).json({
            error: "لا تملك صلاحية هذا الإجراء",
            errorAr: "لا تملك صلاحية هذا الإجراء",
            errorEn: "Insufficient permission for this action",
            code: "FORBIDDEN",
            permission: key,
          });
        }
      }
      next();
    } catch (e) {
      if (isDbUnavailableError(e)) {
        return res.status(503).json({
          error: dbUnavailableMessage,
          errorAr: dbUnavailableMessage,
          errorEn: dbUnavailableMessageEn,
          code: "DB_UNAVAILABLE",
        });
      }
      next(e);
    }
  };
}

/** FR-09: roles, business settings and payment settings — organisation owner only. */
export async function requireOwner(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ error: "غير مصرح" });
    if (await isOrganizationOwner(prisma, req.user.organizationId, req.user.sub)) return next();
    return res.status(403).json({
      error: "هذا الإجراء لمالك المؤسسة فقط",
      errorAr: "هذا الإجراء لمالك المؤسسة فقط",
      errorEn: "Only the business owner can do this",
      code: "OWNER_ONLY",
    });
  } catch (e) {
    next(e);
  }
}
