import { randomInt } from "node:crypto";

/**
 * باركود رقمي 13 رقماً يبدأ بـ 2 (نطاق داخلي شائع) — يُتحقق من عدم التكرار ضمن المؤسسة.
 */
export async function allocateUniqueBarcode(prisma, organizationId, { excludeProductId } = {}) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = "2";
    for (let i = 0; i < 12; i += 1) code += String(randomInt(0, 10));
    const dup = await prisma.product.findFirst({
      where: {
        organizationId,
        barcode: code,
        ...(excludeProductId ? { NOT: { id: excludeProductId } } : {}),
      },
      select: { id: true },
    });
    if (!dup) return code;
  }
  const err = new Error("تعذر توليد باركود فريد — أعد المحاولة");
  err.status = 503;
  throw err;
}

export async function assertBarcodeAvailable(prisma, organizationId, barcode, excludeProductId) {
  const b = barcode != null && String(barcode).trim() ? String(barcode).trim() : null;
  if (!b) return;
  const dup = await prisma.product.findFirst({
    where: {
      organizationId,
      barcode: b,
      ...(excludeProductId ? { NOT: { id: excludeProductId } } : {}),
    },
    select: { id: true },
  });
  if (dup) {
    const err = new Error("الباركود مستخدم لمنتج آخر في نفس المؤسسة");
    err.status = 400;
    throw err;
  }
}
