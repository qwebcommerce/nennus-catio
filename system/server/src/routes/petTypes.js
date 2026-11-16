import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("products", "view"));

router.get("/", async (req, res) => {
  const rows = await prisma.catalogPetType.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { name: "asc" },
  });
  res.json(rows);
});

router.post("/", requireModule("products", "create"), async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const nameEn = String(req.body?.nameEn || "").trim();
  if (!name || !nameEn) return res.status(400).json({ error: "Arabic and English names are required" });
  const row = await prisma.catalogPetType.create({
    data: {
      organizationId: req.user.organizationId,
      name,
      nameEn,
      isActive: req.body?.isActive !== false,
    },
  });
  res.status(201).json(row);
});

router.patch("/:id", requireModule("products", "edit"), async (req, res) => {
  const existing = await prisma.catalogPetType.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });
  const data = {};
  if (req.body?.name != null) data.name = String(req.body.name).trim();
  if (req.body?.nameEn != null) data.nameEn = String(req.body.nameEn).trim();
  if (req.body?.isActive !== undefined) data.isActive = req.body.isActive !== false;
  const row = await prisma.catalogPetType.update({ where: { id: existing.id }, data });
  res.json(row);
});

export default router;
