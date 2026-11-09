import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { hasPermission, resolveRolePermissions } from "../lib/permissions.js";
import {
  dbUnavailableMessage,
  dbUnavailableMessageEn,
  isDbUnavailableError,
} from "../lib/dbErrors.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || req.headers.Authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({
      error: "يجب تسجيل الدخول",
      errorAr: "يجب تسجيل الدخول",
      errorEn: "Please sign in",
      code: "UNAUTHENTICATED",
    });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.organizationId) {
      return res.status(401).json({
        error: "انتهت الجلسة — سجّل الدخول مجدداً",
        errorAr: "انتهت الجلسة — سجّل الدخول مجدداً",
        errorEn: "Session expired — please sign in again",
        code: "SESSION_EXPIRED",
      });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({
      error: "جلسة غير صالحة",
      errorAr: "جلسة غير صالحة",
      errorEn: "Invalid session",
      code: "INVALID_TOKEN",
    });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "غير مصرح" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "صلاحية غير كافية" });
    }
    next();
  };
}

/**
 * Fine-grained permission check. ADMIN always passes.
 * Loads org permission matrices on demand (cached on req).
 */
export function requirePermission(...keys) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: "غير مصرح" });
      if (req.user.role === "ADMIN") return next();

      if (!req._rolePermissions) {
        const org = await prisma.organization.findUnique({
          where: { id: req.user.organizationId },
          select: {
            managerPermissions: true,
            cashierPermissions: true,
          },
        });
        req._rolePermissions = resolveRolePermissions(org, req.user.role);
      }

      for (const key of keys) {
        if (!hasPermission(req._rolePermissions, key)) {
          return res.status(403).json({
            error: "Insufficient permission for this action",
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
