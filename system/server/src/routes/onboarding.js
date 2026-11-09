import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  ALL_DOC_TYPES,
  ONBOARDING_COUNTRY_CODES,
  REQUIRED_DOC_TYPES,
  TRIAL_DAYS,
  clientOnboardingPayload,
  countriesForClient,
  markPaymentComplete,
  onboardingStatusFromOrg,
  PLAN_INTERVALS,
} from "../lib/onboarding.js";
import { isSupportedCountry } from "../lib/countries.js";
import {
  appPublicUrl,
  buildCheckoutLineItem,
  getStripe,
  stripeConfigured,
  shouldBypassCheckout,
} from "../lib/stripe.js";
import { syncTaxPackFromCountry } from "../lib/taxPacks.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 8 },
  fileFilter(_req, file, cb) {
    const ok = /^(image\/(jpeg|png|webp)|application\/pdf)$/i.test(file.mimetype);
    if (!ok) {
      cb(new Error("Only PDF or image files (JPG, PNG, WEBP) are allowed"));
      return;
    }
    cb(null, true);
  },
});

function requireAdmin(req, res) {
  if (req.user?.role !== "ADMIN") {
    res.status(403).json({ error: "Only organization admin can complete onboarding" });
    return false;
  }
  return true;
}

async function loadOrg(organizationId) {
  return prisma.organization.findUnique({ where: { id: organizationId } });
}

async function documentTypesFor(organizationId) {
  const rows = await prisma.organizationDocument.findMany({
    where: { organizationId },
    select: { docType: true },
  });
  return rows.map((r) => r.docType);
}

router.use(authMiddleware);

router.get("/status", async (req, res, next) => {
  try {
    const org = await loadOrg(req.user.organizationId);
    if (!org) return res.status(404).json({ error: "Organization not found" });
    const docs = await documentTypesFor(org.id);
    res.json({
      onboarding: clientOnboardingPayload(org, docs),
      stripeConfigured: stripeConfigured(),
      paymentBypassEnabled: shouldBypassCheckout(),
      countries: countriesForClient(),
      countryCodes: ONBOARDING_COUNTRY_CODES,
    });
  } catch (e) {
    next(e);
  }
});

router.post(
  "/profile",
  (req, res, next) => {
    upload.fields([
      { name: "crDocument", maxCount: 1 },
      { name: "ownerIdDocument", maxCount: 1 },
      { name: "vatDocument", maxCount: 1 },
      { name: "licenseDocument", maxCount: 1 },
      { name: "ibanDocument", maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || "Upload failed" });
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      if (!requireAdmin(req, res)) return;
      const org = await loadOrg(req.user.organizationId);
      if (!org) return res.status(404).json({ error: "Organization not found" });

      const body = req.body || {};
      const legalName = String(body.legalName || "").trim();
      const country = String(body.country || "").trim().toUpperCase();
      const city = String(body.city || "").trim();
      const addressText = String(body.addressText || "").trim();
      const crNumber = String(body.crNumber || "").trim();
      const ownerFullName = String(body.ownerFullName || body.authorizedPersonName || "").trim();
      const ownerIdNumber = String(body.ownerIdNumber || "").trim();
      const ownerPhone = String(body.ownerPhone || "").trim();
      const acceptTerms = String(body.acceptTerms || "") === "true" || body.acceptTerms === true;

      if (!legalName || !country || !city || !addressText) {
        return res.status(400).json({ error: "Legal name, country, city, and address are required" });
      }
      if (!isSupportedCountry(country)) {
        return res.status(400).json({ error: "Please select a supported country" });
      }
      if (!crNumber || !ownerFullName || !ownerIdNumber || !ownerPhone) {
        return res.status(400).json({
          error: "CR number, owner name, owner ID number, and phone are required",
        });
      }
      if (!acceptTerms && !org.termsAcceptedAt) {
        return res.status(400).json({ error: "You must accept the Terms and Privacy Policy" });
      }

      const fileMap = {
        CR: req.files?.crDocument?.[0],
        OWNER_ID: req.files?.ownerIdDocument?.[0],
        VAT: req.files?.vatDocument?.[0],
        LICENSE: req.files?.licenseDocument?.[0],
        IBAN: req.files?.ibanDocument?.[0],
      };

      const existing = await documentTypesFor(org.id);
      for (const docType of REQUIRED_DOC_TYPES) {
        if (!fileMap[docType] && !existing.includes(docType)) {
          return res.status(400).json({
            error: `Required document missing: ${docType === "CR" ? "Commercial Registration" : "Owner ID"}`,
          });
        }
      }

      for (const [docType, file] of Object.entries(fileMap)) {
        if (!file || !ALL_DOC_TYPES.includes(docType)) continue;
        await prisma.organizationDocument.upsert({
          where: {
            organizationId_docType: { organizationId: org.id, docType },
          },
          create: {
            organizationId: org.id,
            docType,
            fileName: String(file.originalname || docType).slice(0, 200),
            mimeType: file.mimetype,
            size: file.size,
            data: file.buffer,
          },
          update: {
            fileName: String(file.originalname || docType).slice(0, 200),
            mimeType: file.mimetype,
            size: file.size,
            data: file.buffer,
          },
        });
      }

      const updated = await prisma.organization.update({
        where: { id: org.id },
        data: {
          legalName: legalName.slice(0, 200),
          name: legalName.slice(0, 200),
          country,
          city: city.slice(0, 120),
          addressText: addressText.slice(0, 500),
          crNumber: crNumber.slice(0, 80),
          licenseNumber: String(body.licenseNumber || "").trim().slice(0, 80) || null,
          ownerFullName: ownerFullName.slice(0, 200),
          ownerIdNumber: ownerIdNumber.slice(0, 80),
          ownerPhone: ownerPhone.slice(0, 40),
          vatNumber: String(body.vatNumber || "").trim().slice(0, 80) || null,
          taxNumber: String(body.taxNumber || "").trim().slice(0, 80) || null,
          iban: String(body.iban || "").trim().slice(0, 80) || null,
          authorizedPersonName:
            String(body.authorizedPersonName || ownerFullName).trim().slice(0, 200) || null,
          termsAcceptedAt: org.termsAcceptedAt || (acceptTerms ? new Date() : null),
          profileDocsDone: true,
          onboardingReviewStatus: "PENDING_REVIEW",
          onboardingReviewedAt: null,
          onboardingReviewedBy: null,
          onboardingReviewNote: null,
        },
      });

      await syncTaxPackFromCountry(prisma, org.id, country);

      const docs = await documentTypesFor(org.id);
      res.json({ onboarding: clientOnboardingPayload(updated, docs) });
    } catch (e) {
      next(e);
    }
  }
);

router.get("/documents/:docType", async (req, res, next) => {
  try {
    const docType = String(req.params.docType || "").toUpperCase();
    if (!ALL_DOC_TYPES.includes(docType)) {
      return res.status(400).json({ error: "Invalid document type" });
    }
    const doc = await prisma.organizationDocument.findUnique({
      where: {
        organizationId_docType: {
          organizationId: req.user.organizationId,
          docType,
        },
      },
    });
    if (!doc) return res.status(404).json({ error: "Document not found" });
    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(doc.fileName)}"`
    );
    res.send(Buffer.from(doc.data));
  } catch (e) {
    next(e);
  }
});

router.post("/checkout-session", async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const org = await loadOrg(req.user.organizationId);
    if (!org) return res.status(404).json({ error: "Organization not found" });
    const status = onboardingStatusFromOrg(org);
    if (!status.profileDocsDone) {
      return res.status(400).json({ error: "Complete business profile and documents first" });
    }
    if (status.paymentDone) {
      return res.status(400).json({ error: "Payment already completed" });
    }

    const planInterval = String(req.body?.planInterval || "year").toLowerCase();
    if (!PLAN_INTERVALS[planInterval]) {
      return res.status(400).json({ error: "Invalid plan interval" });
    }

    if (shouldBypassCheckout()) {
      const updated = await prisma.organization.update({
        where: { id: org.id },
        data: {
          paymentDone: true,
          selectedPlanInterval: planInterval,
          plan: "PREMIUM",
          maxBranches: Math.max(org.maxBranches || 3, 10),
        },
      });
      await prisma.organizationPlanPurchase.create({
        data: {
          organizationId: org.id,
          plan: "PREMIUM",
          amount: PLAN_INTERVALS[planInterval].amount,
          currency: "SAR",
          reference: "BYPASS",
          note: `Checkout bypass (${planInterval}) — STRIPE_BYPASS_CHECKOUT=true`,
        },
      });
      const docs = await documentTypesFor(org.id);
      return res.json({
        bypass: true,
        url: null,
        onboarding: clientOnboardingPayload(updated, docs),
      });
    }

    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({
        error:
          "Stripe is not configured. Set STRIPE_SECRET_KEY, or set STRIPE_BYPASS_CHECKOUT=true to skip payment during closed testing.",
      });
    }

    const lineItem = buildCheckoutLineItem(planInterval);
    const base = appPublicUrl();
    const user = await prisma.user.findFirst({
      where: { id: req.user.sub, organizationId: org.id },
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user?.email || undefined,
      client_reference_id: org.id,
      success_url: `${base}/onboarding/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/onboarding/payment?cancelled=1`,
      line_items: [lineItem],
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: {
          organizationId: org.id,
          planInterval,
        },
      },
      metadata: {
        organizationId: org.id,
        planInterval,
      },
      allow_promotion_codes: true,
    });

    await prisma.organization.update({
      where: { id: org.id },
      data: { selectedPlanInterval: planInterval },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    next(e);
  }
});

router.post("/confirm-checkout", async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const sessionId = String(req.body?.sessionId || "").trim();
    if (!sessionId) return res.status(400).json({ error: "sessionId is required" });

    const org = await loadOrg(req.user.organizationId);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    if (org.paymentDone && String(org.plan || "").toUpperCase() === "PREMIUM") {
      const docs = await documentTypesFor(org.id);
      return res.json({ onboarding: clientOnboardingPayload(org, docs) });
    }

    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ error: "Stripe is not configured" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata?.organizationId !== org.id) {
      return res.status(403).json({ error: "Checkout session does not belong to this organization" });
    }
    if (session.status !== "complete") {
      return res.status(400).json({ error: "Checkout is not complete yet" });
    }

    const planInterval = session.metadata?.planInterval || org.selectedPlanInterval || "year";
    const updated = await markPaymentComplete(org, {
      stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
      stripeSubscriptionId:
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id,
      planInterval,
      reference: session.id,
      purpose: session.metadata?.purpose || "onboarding",
    });

    const docs = await documentTypesFor(org.id);
    res.json({ onboarding: clientOnboardingPayload(updated, docs) });
  } catch (e) {
    next(e);
  }
});

export default router;
