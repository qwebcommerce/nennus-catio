import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  dbUnavailableMessage,
  dbUnavailableMessageEn,
  isDbUnavailableError,
} from "../lib/dbErrors.js";

const router = Router();
router.use(authMiddleware);

/** فروع ضمن نطاق المستخدم + ?branchId= */
async function branchesForFeed(req) {
  const orgId = req.user.organizationId;
  const q = req.query.branchId ?? req.body?.branchId;
  if (q != null && String(q).trim()) {
    const b = await prisma.branch.findFirst({
      where: { id: String(q).trim(), organizationId: orgId },
      select: { id: true, name: true, nameEn: true },
    });
    return b ? [b] : [];
  }
  if (req.user.role === "ADMIN") {
    return prisma.branch.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, nameEn: true },
      orderBy: { name: "asc" },
    });
  }
  if (req.user.branchId) {
    const b = await prisma.branch.findFirst({
      where: { id: req.user.branchId, organizationId: orgId },
      select: { id: true, name: true, nameEn: true },
    });
    return b ? [b] : [];
  }
  return prisma.branch.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, nameEn: true },
    orderBy: { name: "asc" },
  });
}

function parseTypes(req) {
  const raw = req.query.types ?? req.body?.types;
  if (raw == null || !String(raw).trim()) {
    return new Set(["LOW_STOCK", "CASH_NO_SESSION"]);
  }
  return new Set(
    String(raw)
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
}

async function loadReadKeys(userId) {
  const rows = await prisma.notificationRead.findMany({
    where: { userId },
    select: { notificationKey: true },
  });
  return new Set(rows.map((r) => r.notificationKey));
}

async function buildItems(req, types) {
  const orgId = req.user.organizationId;
  const branchRaw = req.query.branchId ?? req.body?.branchId;
  const branchIdFilter =
    branchRaw != null && String(branchRaw).trim() ? String(branchRaw).trim() : null;

  const items = [];

  if (types.has("LOW_STOCK")) {
    const bid = branchIdFilter || req.user.branchId || null;
    const rows = await prisma.inventory.findMany({
      where: bid
        ? {
            branchId: String(bid),
            branch: { organizationId: orgId },
            product: { organizationId: orgId },
          }
        : {
            branch: { organizationId: orgId },
            product: { organizationId: orgId },
          },
      include: { product: true, branch: true },
    });
    const low = rows.filter((r) => r.quantity <= r.minStockLevel);
    for (const r of low) {
      items.push({
        key: `low-stock:${r.id}`,
        type: "LOW_STOCK",
        severity: r.quantity <= 0 ? "critical" : "warning",
        at: r.product.updatedAt?.toISOString?.() || new Date().toISOString(),
        branchId: r.branchId,
        branchName: r.branch.name,
        branchNameEn: r.branch.nameEn ?? null,
        payload: {
          inventoryId: r.id,
          productId: r.product.id,
          productName: r.product.name,
          productNameEn: r.product.nameEn ?? null,
          sku: r.product.sku,
          quantity: r.quantity,
          minStockLevel: r.minStockLevel,
        },
        action: { path: "/products", hash: "stock" },
      });
    }
  }

  if (types.has("CASH_NO_SESSION")) {
    const branches = await branchesForFeed(req);
    const skipCashWideAdmin =
      req.user.role === "ADMIN" &&
      !branchIdFilter &&
      branches.length > 1;
    if (!skipCashWideAdmin) {
      for (const br of branches) {
        const open = await prisma.cashSession.findFirst({
          where: {
            branchId: br.id,
            closedAt: null,
            branch: { organizationId: orgId },
          },
          select: { id: true },
        });
        if (!open) {
          items.push({
            key: `cash-no-session:${br.id}`,
            type: "CASH_NO_SESSION",
            severity: "warning",
            at: new Date().toISOString(),
            branchId: br.id,
            branchName: br.name,
            branchNameEn: br.nameEn ?? null,
            payload: { branchId: br.id },
            action: { path: "/cash" },
          });
        }
      }
    }
  }

  items.sort((a, b) => {
    const ta = new Date(a.at).getTime();
    const tb = new Date(b.at).getTime();
    return ta - tb;
  });

  return items;
}

/** تغذية موحّدة + مفاتيح مقروءة من الخادم */
router.get("/", async (req, res) => {
  try {
    const types = parseTypes(req);
    const items = await buildItems(req, types);
    const readKeys = await loadReadKeys(req.user.sub);
    res.json({ items, readKeys: [...readKeys] });
  } catch (e) {
    console.error("[notifications]", e);
    if (isDbUnavailableError(e)) {
      return res.status(503).json({
        error: dbUnavailableMessage,
        errorAr: dbUnavailableMessage,
        errorEn: dbUnavailableMessageEn,
        code: "DB_UNAVAILABLE",
      });
    }
    res.status(500).json({ error: "تعذر جلب التنبيهات" });
  }
});

router.get("/unread-count", async (req, res) => {
  try {
    const types = parseTypes(req);
    const items = await buildItems(req, types);
    const readKeys = await loadReadKeys(req.user.sub);
    const n = items.filter((it) => !readKeys.has(it.key)).length;
    res.json({ count: n });
  } catch (e) {
    console.error("[notifications/unread-count]", e);
    if (isDbUnavailableError(e)) {
      return res.status(503).json({
        error: dbUnavailableMessage,
        errorAr: dbUnavailableMessage,
        errorEn: dbUnavailableMessageEn,
        code: "DB_UNAVAILABLE",
      });
    }
    res.status(500).json({ error: "تعذر حساب غير المقروء" });
  }
});

router.post("/mark-read", async (req, res) => {
  try {
    const keys = Array.isArray(req.body?.keys) ? req.body.keys.map((k) => String(k)) : [];
    if (!keys.length) return res.json({ ok: true, created: 0 });
    const orgId = req.user.organizationId;
    const userId = req.user.sub;
    const result = await prisma.notificationRead.createMany({
      data: keys.map((notificationKey) => ({
        userId,
        organizationId: orgId,
        notificationKey,
      })),
      skipDuplicates: true,
    });
    res.json({ ok: true, created: result.count });
  } catch (e) {
    console.error("[notifications/mark-read]", e);
    res.status(500).json({ error: "تعذر تحديث حالة القراءة" });
  }
});

router.post("/mark-all-read", async (req, res) => {
  try {
    const types = parseTypes(req);
    const items = await buildItems(req, types);
    const orgId = req.user.organizationId;
    const userId = req.user.sub;
    const keys = items.map((it) => it.key);
    if (!keys.length) return res.json({ ok: true, created: 0 });
    const result = await prisma.notificationRead.createMany({
      data: keys.map((notificationKey) => ({
        userId,
        organizationId: orgId,
        notificationKey,
      })),
      skipDuplicates: true,
    });
    res.json({ ok: true, created: result.count });
  } catch (e) {
    console.error("[notifications/mark-all-read]", e);
    res.status(500).json({ error: "تعذر تحديث حالة القراءة" });
  }
});

export default router;
