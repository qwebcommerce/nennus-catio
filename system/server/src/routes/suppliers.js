import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  const rows = await prisma.supplier.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { name: "asc" },
  });
  res.json(rows);
});

router.post("/", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const { name, phone, note } = req.body || {};
  const n = String(name || "").trim();
  if (!n) return res.status(400).json({ error: "اسم المورد مطلوب" });
  const row = await prisma.supplier.create({
    data: {
      organizationId: req.user.organizationId,
      name: n,
      phone: phone != null && String(phone).trim() ? String(phone).trim() : null,
      note: note != null && String(note).trim() ? String(note).trim() : null,
    },
  });
  res.status(201).json(row);
});

router.patch("/:id", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const { name, phone, note } = req.body || {};
  const data = {};
  if (name != null) {
    const n = String(name).trim();
    if (!n) return res.status(400).json({ error: "اسم المورد مطلوب" });
    data.name = n;
  }
  if (phone !== undefined) data.phone = phone ? String(phone).trim() : null;
  if (note !== undefined) data.note = note ? String(note).trim() : null;
  const existing = await prisma.supplier.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "غير موجود" });
  try {
    const row = await prisma.supplier.update({
      where: { id: existing.id },
      data,
    });
    res.json(row);
  } catch {
    res.status(404).json({ error: "غير موجود" });
  }
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const row = await prisma.supplier.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!row) return res.status(404).end();
  try {
    await prisma.supplier.delete({ where: { id: row.id } });
    res.status(204).end();
  } catch {
    res.status(400).json({ error: "تعذر الحذف" });
  }
});

export default router;
