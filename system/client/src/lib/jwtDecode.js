/** فك حمولة JWT للعرض فقط (دون تحقق توقيع) — عند العمل دون اتصال */
export function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    if (pad) base64 += "=".repeat(4 - pad);
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

/** حقول من token التوقيع (sub, role, branchId, organizationId) */
export function minimalUserFromTokenPayload(p) {
  if (!p?.sub) return null;
  return {
    id: p.sub,
    email: "",
    name: "",
    nameEn: null,
    role: p.role || "CASHIER",
    branchId: p.branchId ?? null,
    branchName: null,
    branchNameEn: null,
    organizationId: p.organizationId ?? null,
    organizationName: null,
    organizationSlug: null,
    loyaltyProgramEnabled: false,
    loyaltyRedemptionEnabled: false,
    isPlatformAdmin: false,
  };
}
