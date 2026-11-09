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
import catalogRoutes from "./routes/catalog.js";
import saleRoutes from "./routes/sales.js";
import dashboardRoutes from "./routes/dashboard.js";
import userRoutes from "./routes/users.js";
import permissionsRoutes from "./routes/permissions.js";
import syncRoutes from "./routes/sync.js";
import customerRoutes from "./routes/customers.js";
import refundRoutes from "./routes/refunds.js";
import supplierRoutes from "./routes/suppliers.js";
import purchaseRoutes from "./routes/purchases.js";
import intelligenceRoutes from "./routes/intelligence.js";
import pricingIntelligenceRoutes from "./routes/pricingIntelligence.js";
import cashierIntelligenceRoutes from "./routes/cashierIntelligence.js";
import ownerBriefRoutes from "./routes/ownerBrief.js";
import costIntelligenceRoutes from "./routes/costIntelligence.js";
import stockBalancerRoutes from "./routes/stockBalancer.js";
import customerRfmRoutes from "./routes/customerRfm.js";
import cashSessionRoutes from "./routes/cashSessions.js";
import auditRoutes from "./routes/audit.js";
import heldCartRoutes from "./routes/heldCarts.js";
import platformRoutes from "./routes/platform.js";
import notificationRoutes from "./routes/notifications.js";
import loyaltySettingsRoutes from "./routes/loyaltySettings.js";
import taxSettingsRoutes from "./routes/taxSettings.js";
import orgSettingsRoutes from "./routes/orgSettings.js";
import productImagesRoutes from "./routes/productImages.js";
import couponsRoutes from "./routes/coupons.js";
import employeesRoutes from "./routes/employees.js";
import payrollRoutes from "./routes/payroll.js";
import employeeLoansRoutes from "./routes/employeeLoans.js";
import customerAccountsRoutes from "./routes/customerAccounts.js";
import zakatRoutes from "./routes/zakat.js";
import expensesRoutes from "./routes/expenses.js";
import reportsRoutes from "./routes/reports.js";
import appointmentsRoutes from "./routes/appointments.js";
import accountingRoutes from "./routes/accounting.js";
import automationsRoutes from "./routes/automations.js";
import commissionsRoutes from "./routes/commissions.js";
import planRoutes from "./routes/plan.js";
import onboardingRoutes from "./routes/onboarding.js";
import billingWebhookRoutes from "./routes/billingWebhook.js";
import { prisma } from "./lib/prisma.js";
import {
  dbUnavailableMessage,
  isDbUnavailableError,
  isSchemaDriftError,
  schemaDriftMessage,
} from "./lib/dbErrors.js";
import { databaseUrlFingerprint } from "./lib/databaseUrlFingerprint.js";

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

app.use(helmetMiddleware);
app.use(cors({ origin: true, credentials: true }));
/** Stripe webhook needs raw body — mount before express.json() */
app.use("/api/billing", billingWebhookRoutes);
app.use(express.json({ limit: "2mb" }));
app.use("/api/auth/login", loginRateLimiter);
app.use("/api/auth/register-organization", loginRateLimiter);
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
app.use("/api/sales", saleRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/permissions", permissionsRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/customer-accounts", customerAccountsRoutes);
app.use("/api/zakat", zakatRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/appointments", appointmentsRoutes);
app.use("/api/accounting", accountingRoutes);
app.use("/api/automations", automationsRoutes);
app.use("/api/commissions", commissionsRoutes);
app.use("/api/plan", planRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/refunds", refundRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/intelligence", intelligenceRoutes);
app.use("/api/intelligence/pricing", pricingIntelligenceRoutes);
app.use("/api/intelligence/cashier", cashierIntelligenceRoutes);
app.use("/api/intelligence/brief", ownerBriefRoutes);
app.use("/api/intelligence/cost", costIntelligenceRoutes);
app.use("/api/intelligence/balancer", stockBalancerRoutes);
app.use("/api/intelligence/customers", customerRfmRoutes);
app.use("/api/cash-sessions", cashSessionRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/held-carts", heldCartRoutes);
app.use("/api/platform", platformRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/loyalty-settings", loyaltySettingsRoutes);
app.use("/api/tax-settings", taxSettingsRoutes);
app.use("/api/org-settings", orgSettingsRoutes);
app.use("/api/product-images", productImagesRoutes);
app.use("/api/coupons", couponsRoutes);
app.use("/api/employees", employeesRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/employee-loans", employeeLoansRoutes);

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
    return res.status(status).json({
      error: err.errorAr || err.message,
      errorAr: err.errorAr || err.message,
      errorEn: err.errorEn || err.message,
      ...(err.code ? { code: err.code } : {}),
    });
  }
  if (err?.status && Number(err.status) >= 400 && Number(err.status) < 500) {
    return res.status(Number(err.status)).json({
      error: err.message || "طلب غير صالح",
      errorAr: err.message || "طلب غير صالح",
      errorEn: err.message || "Bad request",
    });
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
