import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { assertVersion, requireVersion, versionedUpdate } from "../lib/recordVersion.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("purchasing", "view"));

router.get("/", async (req, res) => {
  const rows = await prisma.supplier.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { name: "asc" },
  });
  res.json(rows);
});

router.post("/", requireModule("purchasing", "create"), async (req, res) => {
  const { name, phone, note, email, address, isActive } = req.body || {};
  const n = String(name || "").trim();
  if (!n) return res.status(400).json({ error: "اسم المورد مطلوب" });
  const row = await prisma.supplier.create({
    data: {
      organizationId: req.user.organizationId,
      name: n,
      phone: phone != null && String(phone).trim() ? String(phone).trim() : null,
      email: email != null && String(email).trim() ? String(email).trim() : null,
      address: address != null && String(address).trim() ? String(address).trim() : null,
      note: note != null && String(note).trim() ? String(note).trim() : null,
      isActive: isActive === false ? false : true,
    },
  });
  res.status(201).json(row);
});

router.patch("/:id", requireModule("purchasing", "edit"), async (req, res) => {
  const version = requireVersion(req);
  const { name, phone, note, email, address, isActive } = req.body || {};
  const data = {};
  if (name != null) {
    const n = String(name).trim();
    if (!n) return res.status(400).json({ error: "اسم المورد مطلوب" });
    data.name = n;
  }
  if (phone !== undefined) data.phone = phone ? String(phone).trim() : null;
  if (note !== undefined) data.note = note ? String(note).trim() : null;
  if (email !== undefined) data.email = email ? String(email).trim() : null;
  if (address !== undefined) data.address = address ? String(address).trim() : null;
  if (isActive !== undefined) data.isActive = isActive !== false;
  const existing = await prisma.supplier.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "غير موجود" });
  assertVersion(existing, version);
  const row = await versionedUpdate(prisma, "supplier", { id: existing.id, version, data });
  res.json(row);
});

router.delete("/:id", requireModule("purchasing", "delete"), async (req, res) => {
  const row = await prisma.supplier.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!row) return res.status(404).end();
  // Past purchases would lose their supplier (SetNull) and orders/bills fail the delete:
  // a supplier with history is deactivated instead.
  const [purchases, orders, bills] = await Promise.all([
    prisma.purchase.count({ where: { supplierId: row.id } }),
    prisma.purchaseOrder.count({ where: { supplierId: row.id } }),
    prisma.supplierBill.count({ where: { supplierId: row.id } }),
  ]);
  if (purchases + orders + bills > 0) {
    return res.status(409).json({
      error: "لا يمكن حذف هذا المورد لأن له مشتريات أو أوامر شراء أو فواتير. أوقفه بدلاً من ذلك.",
      errorAr: "لا يمكن حذف هذا المورد لأن له مشتريات أو أوامر شراء أو فواتير. أوقفه بدلاً من ذلك.",
      errorEn: "This supplier has purchases, purchase orders or bills, so it can't be deleted. Deactivate it instead.",
      code: "SUPPLIER_HAS_HISTORY",
    });
  }
  try {
    await prisma.supplier.delete({ where: { id: row.id } });
    res.status(204).end();
  } catch {
    res.status(400).json({ error: "تعذر الحذف" });
  }
});

export default router;
