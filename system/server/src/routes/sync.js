import crypto from "crypto";
import { Router } from "express";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import {
  getSyncConfig,
  saveSyncConfig,
  syncProductsFromWebsite,
  syncOrdersWithWebsite,
} from "../services/syncService.js";
import { syncFromSupabase } from "../services/supabaseSyncService.js";
import { syncProductsFromEzoo } from "../services/ezooSyncService.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole("ADMIN", "MANAGER"));

router.get("/settings", async (req, res) => {
  const cfg = await getSyncConfig(req.user.organizationId);
  res.json({
    websiteBaseUrl: cfg.websiteBaseUrl,
    apiKeySet: Boolean(cfg.apiKey),
    inventoryWebhookUrl: cfg.inventoryWebhookUrl ?? null,
    lastProductSyncAt: cfg.lastProductSyncAt,
    lastOrderSyncAt: cfg.lastOrderSyncAt,
    lastSupabaseSyncAt: cfg.lastSupabaseSyncAt,
  });
});

router.put("/settings", async (req, res) => {
  const { websiteBaseUrl, apiKey, inventoryWebhookUrl } = req.body || {};
  const cfg = await saveSyncConfig(req.user.organizationId, {
    websiteBaseUrl,
    apiKey,
    inventoryWebhookUrl,
  });
  res.json({
    websiteBaseUrl: cfg.websiteBaseUrl,
    apiKeySet: Boolean(cfg.apiKey),
    inventoryWebhookUrl: cfg.inventoryWebhookUrl ?? null,
    lastProductSyncAt: cfg.lastProductSyncAt,
    lastOrderSyncAt: cfg.lastOrderSyncAt,
    lastSupabaseSyncAt: cfg.lastSupabaseSyncAt,
  });
});

/** توليد مفتاح عشوائي آمن وحفظه — يُعاد النص الصريح مرةً للنسخ إلى متجرك الإلكتروني */
router.post("/generate-api-key", async (req, res, next) => {
  try {
    const plain = crypto.randomBytes(32).toString("base64url");
    await saveSyncConfig(req.user.organizationId, { apiKey: plain });
    res.json({ apiKey: plain, apiKeySet: true });
  } catch (e) {
    next(e);
  }
});

router.post("/supabase", async (req, res) => {
  try {
    const result = await syncFromSupabase(req.user.organizationId);
    res.json(result);
  } catch (e) {
    res.status(400).json({
      error: e instanceof Error ? e.message : "فشل مزامنة Supabase",
    });
  }
});

router.post("/products", async (req, res) => {
  try {
    const result = await syncProductsFromWebsite(req.user.organizationId);
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل المزامنة";
    const upstream = typeof e?.statusCode === "number" && e.statusCode >= 400 && e.statusCode < 600;
    const status = upstream
      ? e.statusCode === 401
        ? 401
        : 502
      : 400;
    res.status(status).json({ error: msg });
  }
});

/** منتجات من API مزود خارجي — GET get-products?nationality_id= */
router.post("/ezoo-products", async (req, res) => {
  try {
    const result = await syncProductsFromEzoo(req.user.organizationId);
    res.json(result);
  } catch (e) {
    res.status(400).json({
      error: e instanceof Error ? e.message : "فشل مزامنة Ezoo",
    });
  }
});

router.post("/orders", async (req, res) => {
  try {
    const result = await syncOrdersWithWebsite(req.user.organizationId);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "فشل المزامنة" });
  }
});

export default router;
