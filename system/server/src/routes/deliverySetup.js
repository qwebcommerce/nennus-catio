import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("delivery", "view"));

router.get("/areas", async (req, res) => {
  const rows = await prisma.deliveryArea.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { name: "asc" },
  });
  res.json(rows);
});

router.post("/areas", requireModule("delivery", "create"), async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Area name is required" });
  const fee = Number(req.body?.fee);
  const row = await prisma.deliveryArea.create({
    data: {
      organizationId: req.user.organizationId,
      name,
      nameEn: req.body?.nameEn ? String(req.body.nameEn).trim() : null,
      city: req.body?.city ? String(req.body.city).trim() : null,
      fee: new Prisma.Decimal((Number.isFinite(fee) && fee >= 0 ? fee : 0).toFixed(2)),
    },
  });
  res.status(201).json(row);
});

router.get("/windows", async (req, res) => {
  const rows = await prisma.deliveryWindow.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
  });
  res.json(rows);
});

router.post("/windows", requireModule("delivery", "create"), async (req, res) => {
  const label = String(req.body?.label || "").trim();
  const startTime = String(req.body?.startTime || "").trim();
  const endTime = String(req.body?.endTime || "").trim();
  const seats = Math.floor(Number(req.body?.seats) || 0);
  if (!label || !startTime || !endTime || seats < 1) {
    return res.status(400).json({ error: "Label, times, and at least one seat are required" });
  }
  const weekday = req.body?.weekday === "" || req.body?.weekday == null ? null : Number(req.body.weekday);
  const row = await prisma.deliveryWindow.create({
    data: {
      organizationId: req.user.organizationId,
      label,
      labelEn: req.body?.labelEn ? String(req.body.labelEn).trim() : null,
      weekday: Number.isInteger(weekday) ? weekday : null,
      startTime,
      endTime,
      seats,
    },
  });
  res.status(201).json(row);
});

export default router;
