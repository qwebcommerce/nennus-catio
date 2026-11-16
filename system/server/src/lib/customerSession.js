import { prisma } from "./prisma.js";
import {
  CUSTOMER_COOKIE,
  CUSTOMER_SESSION_MS,
  clearSessionCookie,
  customerTokenFrom,
  readCookies,
  setSessionCookie,
  signToken,
  verifyToken,
} from "../middleware/auth.js";

/**
 * Customer (shop) session from the httpOnly `nc_customer` cookie (Bearer still accepted
 * for API scripts). The account is re-read on every request: a password reset bumps
 * `sessionVersion`, which ends every older session.
 */
export async function customerSession(req, res) {
  if (req._customerSession !== undefined) return req._customerSession;
  req._customerSession = null;
  const token = customerTokenFrom(req);
  if (!token) return null;
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return null;
  }
  if (payload.role !== "CUSTOMER" || !payload.sub) return null;
  const customer = await prisma.customer.findFirst({
    where: { id: String(payload.sub), organizationId: String(payload.organizationId || "") },
    select: { id: true, organizationId: true, email: true, sessionVersion: true, passwordHash: true },
  });
  if (!customer || !customer.passwordHash || Number(payload.sv ?? 0) !== customer.sessionVersion) {
    if (res && readCookies(req)[CUSTOMER_COOKIE]) clearSessionCookie(res, CUSTOMER_COOKIE);
    return null;
  }
  req._customerSession = {
    sub: customer.id,
    role: "CUSTOMER",
    organizationId: customer.organizationId,
    email: customer.email,
  };
  return req._customerSession;
}

export function startCustomerSession(res, customer) {
  const token = signToken(
    {
      sub: customer.id,
      role: "CUSTOMER",
      organizationId: customer.organizationId,
      sv: customer.sessionVersion ?? 0,
    },
    "30d"
  );
  setSessionCookie(res, CUSTOMER_COOKIE, token, CUSTOMER_SESSION_MS);
}

export function endCustomerSession(res) {
  clearSessionCookie(res, CUSTOMER_COOKIE);
}
