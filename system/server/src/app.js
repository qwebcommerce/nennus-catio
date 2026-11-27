import express from "express";
import "express-async-errors";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  apiRateLimiter,
  helmetMiddleware,
  loginRateLimiter,
} from "./middleware/security.js";
import authRoutes from "./routes/auth.js";
import branchRoutes from "./routes/branches.js";
import productRoutes from "./routes/products.js";
import inventoryRoutes from "./routes/inventory.js";
import transferRoutes from "./routes/transfers.js";
import vanReturnRoutes from "./routes/vanReturns.js";
import catalogRoutes from "./routes/catalog.js";
import saleRoutes from "./routes/sales.js";
import dashboardRoutes from "./routes/dashboard.js";
import userRoutes from "./routes/users.js";
import permissionsRoutes from "./routes/permissions.js";
import customerRoutes from "./routes/customers.js";
import refundRoutes from "./routes/refunds.js";
import supplierRoutes from "./routes/suppliers.js";
import purchaseRoutes from "./routes/purchases.js";
import cashSessionRoutes from "./routes/cashSessions.js";
import auditRoutes from "./routes/audit.js";
import heldCartRoutes from "./routes/heldCarts.js";
import notificationRoutes from "./routes/notifications.js";
import orgSettingsRoutes from "./routes/orgSettings.js";
import productImagesRoutes from "./routes/productImages.js";
import petTypeRoutes from "./routes/petTypes.js";
import purchaseOrderRoutes from "./routes/purchaseOrders.js";
import shopRoutes from "./routes/shop.js";
import groomingShopRoutes from "./routes/groomingShop.js";
import { relocationFiles, relocationShop, relocationStaff } from "./routes/relocation.js";
import onlineOrderRoutes from "./routes/onlineOrders.js";
import deliverySetupRoutes from "./routes/deliverySetup.js";
import promotionRoutes from "./routes/promotions.js";
import financeRoutes from "./routes/finance.js";
import vehicleRoutes from "./routes/vehicles.js";
import exportRoutes from "./routes/exports.js";
import customerAccountsRoutes from "./routes/customerAccounts.js";
import expensesRoutes from "./routes/expenses.js";
import reportsRoutes from "./routes/reports.js";
import appointmentsRoutes from "./routes/appointments.js";
import cronRoutes from "./routes/cron.js";
import salesOrderRoutes from "./routes/salesOrders.js";
import b2bRoutes from "./routes/b2b.js";
import pendingRoutes from "./routes/pending.js";
import fileRoutes, { businessFileDownloads } from "./routes/files.js";
import purchaseOrderExtraRoutes from "./routes/purchaseOrderExtras.js";
import { prisma } from "./lib/prisma.js";
import { csrfGuard } from "./middleware/auth.js";
import {
  dbUnavailableMessage,
  isDbUnavailableError,
  isSchemaDriftError,
  schemaDriftMessage,
} from "./lib/dbErrors.js";
import { databaseUrlFingerprint } from "./lib/databaseUrlFingerprint.js";
import { bilingualError, bilingualErrors } from "./lib/errorMessages.js";

const app = express();
app.set("trust proxy", 1);

/** على Vercel قد يصل المسار بدون بادئة /api — نُوحّدها قبل باقي الـ middleware */
if (process.env.VERCEL) {
  app.use((req, _res, next) => {
    const fix = (u) => {
      if (!u || typeof u !== "string") return u;
      if (u.startsWith("/api")) return u;
      if (u === "/" || u === "") return "/api/";
      return "/api" + (u.startsWith("/") ? u : "/" + u);
    };
    if (req.url) req.url = fix(req.url);
    if (req.originalUrl) req.originalUrl = fix(req.originalUrl);
    next();
  });
}

/** Every JSON error response carries both errorAr and errorEn (lib/errorMessages.js). */
app.use(bilingualErrors);
app.use(helmetMiddleware);
/**
 * Sessions are httpOnly cookies, so cross-origin credentialed requests are limited to
 * the app's own origins (same-origin requests send no CORS check at all).
 */
function allowedOrigins() {
  return [process.env.APP_PUBLIC_URL, process.env.CLIENT_URL, ...(process.env.CORS_ORIGINS || "").split(",")]
    .map((o) => String(o || "").trim().replace(/\/$/, ""))
    .filter(Boolean);
}
app.use(
  cors({
    credentials: true,
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      const o = origin.replace(/\/$/, "");
      if (allowedOrigins().includes(o)) return cb(null, true);
      if (process.env.NODE_ENV !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
  })
);
app.use(express.json({ limit: "8mb" }));
app.use("/api", csrfGuard);
app.use("/api/auth/login", loginRateLimiter);
app.use("/api/auth/forgot-password", loginRateLimiter);
app.use("/api/auth/reset-password", loginRateLimiter);
app.use("/api/auth/change-password", loginRateLimiter);
app.use("/api/shop/login", loginRateLimiter);
app.use("/api", apiRateLimiter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "petstore-pos-api" });
});

/** فحص اتصال قاعدة البيانات + بصمة آمنة لـ DATABASE_URL (بدون أسرار) */
app.get("/api/health/db", async (_req, res) => {
  const urlInfo = databaseUrlFingerprint();
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: true, urlInfo });
  } catch (e) {
    console.error("[health/db]", e);
    const body = {
      ok: false,
      db: false,
      error: "تعذر الاتصال بقاعدة البيانات",
      urlInfo,
      prismaCode: e?.code ?? undefined,
    };
    if (e?.message && typeof e.message === "string") {
      const safe = e.message.replace(/postgresql:\/\/[^@\s]+@/gi, "postgresql://***@");
      body.prismaMessage = safe.slice(0, 280);
    }
    res.status(503).json(body);
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/products", productRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/transfers", transferRoutes);
app.use("/api/van-returns", vanReturnRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/permissions", permissionsRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/customer-accounts", customerAccountsRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/appointments", appointmentsRoutes);
app.use("/api/refunds", refundRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/cash-sessions", cashSessionRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/held-carts", heldCartRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/org-settings", orgSettingsRoutes);
app.use("/api/product-images", productImagesRoutes);
app.use("/api/pet-types", petTypeRoutes);
app.use("/api/purchase-orders", purchaseOrderExtraRoutes);
app.use("/api/purchase-orders", purchaseOrderRoutes);
app.use("/api/sales-orders", salesOrderRoutes);
// fix-ra: B2B / Wholesale tab (delivery note → invoice → cash receipt).
app.use("/api/b2b", b2bRoutes);
app.use("/api/pending", pendingRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/business-files", businessFileDownloads);
app.use("/api/shop/grooming", groomingShopRoutes);
app.use("/api/shop/relocation", relocationShop);
app.use("/api/relocation", relocationStaff);
app.use("/api/relocation-files", relocationFiles);
app.use("/api/shop", shopRoutes);
app.use("/api/promotions", promotionRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/exports", exportRoutes);
app.use("/api/online-orders", onlineOrderRoutes);
app.use("/api/delivery-setup", deliverySetupRoutes);
app.use("/api/cron", cronRoutes);

/** Unknown API paths answer JSON (bilingual) instead of Express's HTML page. */
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "غير موجود", errorAr: "غير موجود", errorEn: "Not found" });
});

/**
 * Local single-process mode: serve the Vite build from the same Express port.
 * Used by `npm start` from system/ (after client build). Skipped on Vercel
 * (static files are served by the CDN there).
 */
const clientDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../client/dist"
);
const serveClient =
  !process.env.VERCEL &&
  (process.env.SERVE_CLIENT === "true" ||
    process.env.SERVE_CLIENT === "1" ||
    fs.existsSync(path.join(clientDist, "index.html")));

if (serveClient) {
  app.use(express.static(clientDist, { index: false }));
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      error: "تعذر قراءة الطلب (JSON غير صالح أو تالف)",
      errorAr: "تعذر قراءة الطلب (JSON غير صالح أو تالف)",
      errorEn: "Could not parse request (invalid JSON)",
    });
  }
  if (err?.errorAr || err?.errorEn) {
    const status = Number(err.status) || 400;
    const { ar, en } = bilingualError(err.message, { ar: err.errorAr, en: err.errorEn });
    return res.status(status).json({
      error: err.errorAr || err.message,
      errorAr: ar,
      errorEn: en,
      ...(err.code ? { code: err.code } : {}),
      ...(err.extra && typeof err.extra === "object" ? err.extra : {}),
    });
  }
  if (err?.status && Number(err.status) >= 400 && Number(err.status) < 500) {
    const message = err.message || "طلب غير صالح";
    const { ar, en } = bilingualError(message);
    return res.status(Number(err.status)).json({ error: message, errorAr: ar, errorEn: en });
  }
  if (isDbUnavailableError(err)) {
    console.error("[db]", err.message);
    return res.status(503).json({
      error: dbUnavailableMessage,
      errorAr: dbUnavailableMessage,
      errorEn: "Database unavailable. Please try again shortly.",
    });
  }
  if (isSchemaDriftError(err)) {
    console.error("[schema]", err.code, err.meta ?? "");
    return res.status(503).json({
      error: schemaDriftMessage,
      errorAr: schemaDriftMessage,
      errorEn: "Database schema needs migration. Contact support.",
      prismaCode: err.code,
    });
  }
  console.error(err);
  res.status(500).json({
    error: "خطأ في الخادم",
    errorAr: "خطأ في الخادم",
    errorEn: "Server error",
  });
});

export default app;
