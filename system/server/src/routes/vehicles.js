import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { fail } from "../lib/bizError.js";
import { assertVersion, requireVersion, versionedUpdate } from "../lib/recordVersion.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("delivery", "view"));

router.get("/", async (req, res) => {
  const rows = await prisma.vehicle.findMany({
    where: { organizationId: req.user.organizationId },
    include: { branch: { select: { id: true, name: true, kind: true } } },
    orderBy: { name: "asc" },
  });
  res.json(rows);
});

router.post("/", requireModule("delivery", "create"), async (req, res) => {
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
      // fix-rb: delivery van or grooming van.
      ...(req.body?.type ? { type: vehicleType(req.body.type) } : {}),
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

// ------------------------------------------------------------------ fix-rb: vehicle type

function vehicleType(raw) {
  const type = String(raw || "").toUpperCase();
  if (!["DELIVERY", "GROOMING"].includes(type)) {
    throw fail(400, "VEHICLE_TYPE_INVALID", "نوع المركبة غير صالح (توصيل أو تجميل)", "Vehicle type must be delivery or grooming");
  }
  return type;
}

/** PATCH /api/vehicles/:id { version, type?, name?, plate?, notes?, isActive? } — NFR-13 version required. */
router.patch("/:id", requireModule("delivery", "edit"), async (req, res) => {
  const version = requireVersion(req);
  const existing = await prisma.vehicle.findFirst({ where: { id: String(req.params.id), organizationId: req.user.organizationId } });
  if (!existing) throw fail(404, "VEHICLE_NOT_FOUND", "المركبة غير موجودة", "Vehicle not found");
  assertVersion(existing, version);
  const body = req.body || {};
  const data = {};
  if (body.type !== undefined) data.type = vehicleType(body.type);
  if (body.name !== undefined) {
    data.name = String(body.name || "").trim();
    if (!data.name) throw fail(400, "VEHICLE_NAME_REQUIRED", "الاسم ورقم اللوحة مطلوبان", "Name and plate are required");
  }
  if (body.plate !== undefined) {
    data.plate = String(body.plate || "").trim();
    if (!data.plate) throw fail(400, "VEHICLE_NAME_REQUIRED", "الاسم ورقم اللوحة مطلوبان", "Name and plate are required");
  }
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null;
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (data.type && data.type !== existing.type) {
    const open = await prisma.dispatchJob.count({ where: { vehicleId: existing.id, status: { in: ["ASSIGNED", "ACCEPTED"] } } });
    if (open) throw fail(409, "VEHICLE_HAS_JOBS", "لهذه المركبة طلبات مُسندة مفتوحة. أعد إسنادها قبل تغيير النوع.", "This van has open assigned jobs. Reassign them before changing its type.");
  }
  const row = await prisma.$transaction(async (tx) => {
    const updated = await versionedUpdate(tx, "vehicle", { id: existing.id, version, data, include: { branch: { select: { id: true, name: true, kind: true } } } });
    await writeAudit({
      userId: req.user.sub,
      action: "VEHICLE_EDIT",
      entityType: "Vehicle",
      entityId: existing.id,
      branchId: existing.branchId,
      summary: `${updated.name} ${updated.plate}: ${Object.keys(data).join(", ")}${data.type ? ` (${existing.type} -> ${data.type})` : ""}`,
    }, tx);
    return updated;
  });
  res.json(row);
});

export default router;
