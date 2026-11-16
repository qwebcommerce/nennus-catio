import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { assertVersion, requireVersion, versionedUpdate } from "../lib/recordVersion.js";
import { minutesOf } from "../lib/groomingSlots.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("delivery", "view"));

function bad(res, error, errorAr) {
  return res.status(400).json({ error, errorEn: error, ...(errorAr ? { errorAr } : {}) });
}

/** Reads area fields; returns { data } or { error }. partial=true for PATCH. */
function readArea(body, partial) {
  const data = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name || "").trim();
    if (!name) return { error: "Area name is required" };
    data.name = name;
  }
  if (body.nameEn !== undefined) data.nameEn = body.nameEn ? String(body.nameEn).trim() : null;
  if (body.city !== undefined) data.city = body.city ? String(body.city).trim() : null;
  if (!partial || body.fee !== undefined) {
    const fee = body.fee === "" || body.fee == null ? 0 : Number(body.fee);
    if (!Number.isFinite(fee) || fee < 0 || fee > 100000) return { error: "The delivery fee must be zero or more" };
    data.fee = new Prisma.Decimal(fee.toFixed(2));
  }
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  return { data };
}

/** Reads window fields and validates weekday, HH:MM times, end after start and seats. */
function readWindow(body, partial, existing) {
  const data = {};
  if (!partial || body.label !== undefined) {
    const label = String(body.label || "").trim();
    if (!label) return { error: "Label is required" };
    data.label = label;
  }
  if (body.labelEn !== undefined) data.labelEn = body.labelEn ? String(body.labelEn).trim() : null;
  if (!partial || body.weekday !== undefined) {
    const weekday = body.weekday === "" || body.weekday == null ? null : Number(body.weekday);
    if (weekday != null && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)) {
      return { error: "Weekday must be 0 (Sunday) to 6 (Saturday)" };
    }
    data.weekday = weekday;
  }
  if (!partial || body.startTime !== undefined) data.startTime = String(body.startTime || "").trim();
  if (!partial || body.endTime !== undefined) data.endTime = String(body.endTime || "").trim();
  const start = minutesOf(data.startTime ?? existing?.startTime);
  const end = minutesOf(data.endTime ?? existing?.endTime);
  if (start == null || end == null) return { error: "Times must be HH:MM between 00:00 and 23:59" };
  if (end <= start) return { error: "The window must end after it starts" };
  if (!partial || body.seats !== undefined) {
    const seats = Number(body.seats);
    if (!Number.isInteger(seats) || seats < 1 || seats > 1000) return { error: "At least one seat is required" };
    data.seats = seats;
  }
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  return { data };
}

router.get("/areas", async (req, res) => {
  const rows = await prisma.deliveryArea.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { name: "asc" },
  });
  res.json(rows);
});

router.post("/areas", requireModule("delivery", "create"), async (req, res) => {
  const { data, error } = readArea(req.body || {}, false);
  if (error) return bad(res, error);
  const row = await prisma.deliveryArea.create({ data: { organizationId: req.user.organizationId, ...data } });
  await writeAudit({ userId: req.user.sub, action: "DELIVERY_AREA_CREATE", entityType: "DeliveryArea", entityId: row.id, summary: `${row.name} ${row.fee}` });
  res.status(201).json(row);
});

router.patch("/areas/:id", requireModule("delivery", "edit"), async (req, res) => {
  const version = requireVersion(req);
  const existing = await prisma.deliveryArea.findFirst({ where: { id: req.params.id, organizationId: req.user.organizationId } });
  if (!existing) return res.status(404).json({ error: "Area not found" });
  assertVersion(existing, version);
  const { data, error } = readArea(req.body || {}, true);
  if (error) return bad(res, error);
  const row = await versionedUpdate(prisma, "deliveryArea", { id: existing.id, version, data });
  await writeAudit({ userId: req.user.sub, action: "DELIVERY_AREA_UPDATE", entityType: "DeliveryArea", entityId: row.id, summary: `${row.name} ${row.fee} ${row.isActive ? "active" : "inactive"}` });
  res.json(row);
});

/** Deactivates (never deletes) so past orders keep their area. */
router.delete("/areas/:id", requireModule("delivery", "delete"), async (req, res) => {
  const existing = await prisma.deliveryArea.findFirst({ where: { id: req.params.id, organizationId: req.user.organizationId } });
  if (!existing) return res.status(404).json({ error: "Area not found" });
  const row = await prisma.deliveryArea.update({ where: { id: existing.id }, data: { isActive: false } });
  await writeAudit({ userId: req.user.sub, action: "DELIVERY_AREA_UPDATE", entityType: "DeliveryArea", entityId: row.id, summary: "deactivated" });
  res.json(row);
});

router.get("/windows", async (req, res) => {
  const rows = await prisma.deliveryWindow.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
  });
  res.json(rows);
});

router.post("/windows", requireModule("delivery", "create"), async (req, res) => {
  const { data, error } = readWindow(req.body || {}, false);
  if (error) return bad(res, error);
  const row = await prisma.deliveryWindow.create({ data: { organizationId: req.user.organizationId, ...data } });
  await writeAudit({ userId: req.user.sub, action: "DELIVERY_WINDOW_CREATE", entityType: "DeliveryWindow", entityId: row.id, summary: `${row.label} ${row.startTime}-${row.endTime} x${row.seats}` });
  res.status(201).json(row);
});

router.patch("/windows/:id", requireModule("delivery", "edit"), async (req, res) => {
  const version = requireVersion(req);
  const existing = await prisma.deliveryWindow.findFirst({ where: { id: req.params.id, organizationId: req.user.organizationId } });
  if (!existing) return res.status(404).json({ error: "Window not found" });
  assertVersion(existing, version);
  const { data, error } = readWindow(req.body || {}, true, existing);
  if (error) return bad(res, error);
  const row = await versionedUpdate(prisma, "deliveryWindow", { id: existing.id, version, data });
  await writeAudit({ userId: req.user.sub, action: "DELIVERY_WINDOW_UPDATE", entityType: "DeliveryWindow", entityId: row.id, summary: `${row.label} ${row.startTime}-${row.endTime} x${row.seats} ${row.isActive ? "active" : "inactive"}` });
  res.json(row);
});

router.delete("/windows/:id", requireModule("delivery", "delete"), async (req, res) => {
  const existing = await prisma.deliveryWindow.findFirst({ where: { id: req.params.id, organizationId: req.user.organizationId } });
  if (!existing) return res.status(404).json({ error: "Window not found" });
  const row = await prisma.deliveryWindow.update({ where: { id: existing.id }, data: { isActive: false } });
  await writeAudit({ userId: req.user.sub, action: "DELIVERY_WINDOW_UPDATE", entityType: "DeliveryWindow", entityId: row.id, summary: "deactivated" });
  res.json(row);
});

export default router;
