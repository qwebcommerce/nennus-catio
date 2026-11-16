import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { assertVersion, requireVersion, versionedUpdate } from "../lib/recordVersion.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("promotions", "view"));
const KINDS = ["PERCENT", "FIXED", "PRODUCT", "CATEGORY", "BUNDLE", "BOGO"];
const CHANNELS = ["ALL", "TILL", "WEBSITE", "GROOMING"];

function decimalOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return new Prisma.Decimal(n.toFixed(2));
}

router.get("/", async (req, res) => {
  const rows = await prisma.promotion.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { createdAt: "desc" },
  });
  res.json(rows);
});

router.post("/", requireModule("promotions", "create"), async (req, res) => {
  const body = req.body || {};
  const name = String(body.name || "").trim();
  const kind = String(body.kind || "").toUpperCase();
  if (!name || !KINDS.includes(kind)) return res.status(400).json({ error: "Name and offer type are required" });
  const row = await prisma.promotion.create({
    data: {
      organizationId: req.user.organizationId,
      name,
      nameEn: body.nameEn ? String(body.nameEn).trim() : null,
      kind,
      code: body.code ? String(body.code).trim() : null,
      percent: decimalOrNull(body.percent),
      amount: decimalOrNull(body.amount),
      productId: body.productId || null,
      categoryId: body.categoryId || null,
      buyQty: body.buyQty ? Math.floor(Number(body.buyQty)) : null,
      getQty: body.getQty ? Math.floor(Number(body.getQty)) : null,
      bundleProductIds: Array.isArray(body.bundleProductIds) ? body.bundleProductIds : null,
      bundlePrice: decimalOrNull(body.bundlePrice),
      minOrderAmount: decimalOrNull(body.minOrderAmount),
      startsAt: body.startsAt ? new Date(body.startsAt) : new Date(),
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      active: body.active !== false,
      channel: CHANNELS.includes(String(body.channel || "").toUpperCase()) ? String(body.channel).toUpperCase() : "ALL",
    },
  });
  await writeAudit({
    userId: req.user.sub,
    action: "PROMOTION_CREATE",
    entityType: "Promotion",
    entityId: row.id,
    summary: row.name,
  });
  res.status(201).json(row);
});

router.patch("/:id", requireModule("promotions", "edit"), async (req, res) => {
  const version = requireVersion(req);
  const existing = await prisma.promotion.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "Offer not found" });
  assertVersion(existing, version);
  const data = {};
  if (req.body?.active != null) data.active = Boolean(req.body.active);
  if (req.body?.endsAt !== undefined) data.endsAt = req.body.endsAt ? new Date(req.body.endsAt) : null;
  const row = await versionedUpdate(prisma, "promotion", { id: existing.id, version, data });
  await writeAudit({
    userId: req.user.sub,
    action: "PROMOTION_UPDATE",
    entityType: "Promotion",
    entityId: row.id,
    summary: `${row.name} active=${row.active}`,
  });
  res.json(row);
});

export default router;
