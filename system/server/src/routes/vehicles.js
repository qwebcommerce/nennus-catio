import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule, requireRole } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";

const router = Router();
router.use(authMiddleware);

router.get("/", requireModule("delivery", "view"), async (req, res) => {
  const rows = await prisma.vehicle.findMany({
    where: { organizationId: req.user.organizationId },
    include: { branch: { select: { id: true, name: true, kind: true } } },
    orderBy: { name: "asc" },
  });
  res.json(rows);
});

router.post("/", requireRole("ADMIN", "MANAGER"), requireModule("delivery", "create"), async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const plate = String(req.body?.plate || "").trim();
  if (!name || !plate) return res.status(400).json({ error: "Name and plate are required" });
  let branchId = req.body?.branchId ? String(req.body.branchId) : null;
  if (branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, organizationId: req.user.organizationId, kind: "VAN", isActive: true },
    });
    if (!branch) return res.status(400).json({ error: "Choose an active van" });
    const taken = await prisma.vehicle.findUnique({ where: { branchId } });
    if (taken) return res.status(409).json({ error: "That van already has a vehicle" });
  }
  const row = await prisma.vehicle.create({
    data: {
      organizationId: req.user.organizationId,
      name,
      plate,
      branchId,
      notes: req.body?.notes ? String(req.body.notes).trim() : null,
    },
  });
  await writeAudit({
    userId: req.user.sub,
    action: "VEHICLE_CREATE",
    entityType: "Vehicle",
    entityId: row.id,
    summary: `${row.name} ${row.plate}`,
  });
  res.status(201).json(row);
});

export default router;
