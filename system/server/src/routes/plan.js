import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import {
  PLAN_INTERVALS,
  TRIAL_DAYS,
  canUpgradePlan,
  markPaymentComplete,
} from "../lib/onboarding.js";
import { planDisplayPayload, currencyFromCountry } from "../lib/fxGulf.js";
import {
  appPublicUrl,
  buildCheckoutLineItem,
  getStripe,
  shouldBypassCheckout,
} from "../lib/stripe.js";
import { sendError } from "../lib/apiError.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole("ADMIN"));

async function loadOrg(organizationId) {
  return prisma.organization.findUnique({ where: { id: organizationId } });
}

async function planPayload(organizationId) {
  const [organization, branchCount, userCount] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        plan: true,
        maxBranches: true,
        createdAt: true,
        updatedAt: true,
        paymentDone: true,
        selectedPlanInterval: true,
        country: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    }),
    prisma.branch.count({ where: { organizationId } }),
    prisma.user.count({ where: { organizationId } }),
  ]);

  if (!organization) return null;

  let purchases = [];
  try {
    purchases = await prisma.organizationPlanPurchase.findMany({
      where: { organizationId },
      orderBy: [{ purchasedAt: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
  } catch (error) {
    if (!["P2021", "P2022"].includes(error?.code)) throw error;
  }

  const atBranchLimit = branchCount >= (organization.maxBranches ?? 3);
  const country = organization.country || "SA";
  const intervalId = organization.selectedPlanInterval || null;
  const intervalCfg = intervalId ? PLAN_INTERVALS[intervalId] : null;
  const upgradeAvailable = canUpgradePlan(organization);
  const isHighestPlan = !upgradeAvailable;
  const plans = Object.values(PLAN_INTERVALS).map((p) => ({
    ...planDisplayPayload(p, country),
    features: [
      "pos",
      "inventory",
      "branches10",
      "support",
      "intelligence",
    ],
  }));

  return {
    current: {
      id: organization.id,
      name: organization.name,
      plan: organization.plan || "FREE",
      maxBranches: organization.maxBranches ?? 3,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
      paymentDone: Boolean(organization.paymentDone),
      selectedPlanInterval: intervalId,
      intervalLabelEn: intervalCfg?.labelEn || null,
      intervalLabelAr: intervalCfg?.labelAr || null,
      intervalAmountSar: intervalCfg?.amount ?? null,
      currencyCharge: "SAR",
      currencyLocal: currencyFromCountry(country),
      hasStripeCustomer: Boolean(organization.stripeCustomerId),
      hasStripeSubscription: Boolean(organization.stripeSubscriptionId),
      branchCount,
      userCount,
      atBranchLimit,
      branchesRemaining: Math.max(0, (organization.maxBranches ?? 3) - branchCount),
      upgradeAvailable,
      isHighestPlan,
      trialDays: TRIAL_DAYS,
    },
    plans,
    purchases: purchases.map((purchase) => ({
      ...purchase,
      amount: purchase.amount == null ? null : Number(purchase.amount),
    })),
  };
}

router.get("/", async (req, res, next) => {
  try {
    const payload = await planPayload(req.user.organizationId);
    if (!payload) {
      return res.status(404).json({ error: "Organization not found", code: "NOT_FOUND" });
    }
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

/**
 * Start Stripe Checkout to upgrade FREE → PREMIUM.
 * POST /api/plan/checkout-session { planInterval: month|six|year }
 */
router.post("/checkout-session", async (req, res) => {
  try {
    const org = await loadOrg(req.user.organizationId);
    if (!org) {
      return sendError(res, 404, "المؤسسة غير موجودة", "Organization not found");
    }
    if (!canUpgradePlan(org)) {
      return sendError(
        res,
        400,
        "أنت على أعلى خطة (بريميوم)",
        "You are already on the highest plan (Premium)",
      );
    }

    const planInterval = String(req.body?.planInterval || "year").toLowerCase();
    if (!PLAN_INTERVALS[planInterval]) {
      return sendError(res, 400, "فترة اشتراك غير صالحة", "Invalid plan interval");
    }

    if (shouldBypassCheckout()) {
      const updated = await markPaymentComplete(org, {
        planInterval,
        reference: `BYPASS-UPGRADE-${Date.now()}`,
        purpose: "upgrade",
      });
      const payload = await planPayload(updated.id);
      return res.json({ bypass: true, url: null, plan: payload });
    }

    const stripe = getStripe();
    if (!stripe) {
      return sendError(
        res,
        503,
        "Stripe غير مضبوط على الخادم",
        "Stripe is not configured. Set STRIPE_SECRET_KEY, or set STRIPE_BYPASS_CHECKOUT=true to skip payment during closed testing.",
      );
    }

    const lineItem = buildCheckoutLineItem(planInterval);
    const base = appPublicUrl();
    const user = await prisma.user.findFirst({
      where: {
        id: req.user.id || req.user.sub || req.user.userId,
        organizationId: org.id,
      },
    });

    const sessionParams = {
      mode: "subscription",
      client_reference_id: org.id,
      success_url: `${base}/plan?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/plan?checkout=cancelled`,
      line_items: [lineItem],
      metadata: {
        organizationId: org.id,
        planInterval,
        purpose: "upgrade",
      },
      subscription_data: {
        metadata: {
          organizationId: org.id,
          planInterval,
          purpose: "upgrade",
        },
      },
      allow_promotion_codes: true,
    };

    // First-time payers get the trial; upgrades of already-paid orgs skip it.
    if (!org.paymentDone) {
      sessionParams.subscription_data.trial_period_days = TRIAL_DAYS;
    }

    if (org.stripeCustomerId) {
      sessionParams.customer = org.stripeCustomerId;
    } else {
      sessionParams.customer_email = user?.email || undefined;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    await prisma.organization.update({
      where: { id: org.id },
      data: { selectedPlanInterval: planInterval },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    if (e?.status) {
      return sendError(res, e.status, e.errorAr || e.message, e.errorEn || e.message);
    }
    console.error(e);
    return sendError(res, 500, "تعذر بدء الدفع", "Could not start checkout");
  }
});

/**
 * Confirm Stripe checkout after redirect (webhook fallback).
 * POST /api/plan/confirm-checkout { sessionId }
 */
router.post("/confirm-checkout", async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || "").trim();
    if (!sessionId) {
      return sendError(res, 400, "معرّف الجلسة مطلوب", "sessionId is required");
    }

    const org = await loadOrg(req.user.organizationId);
    if (!org) {
      return sendError(res, 404, "المؤسسة غير موجودة", "Organization not found");
    }

    if (!canUpgradePlan(org) && org.paymentDone) {
      const payload = await planPayload(org.id);
      return res.json({ alreadyPremium: true, plan: payload });
    }

    const stripe = getStripe();
    if (!stripe) {
      return sendError(res, 503, "Stripe غير مضبوط", "Stripe is not configured");
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata?.organizationId !== org.id) {
      return sendError(
        res,
        403,
        "جلسة الدفع لا تتبع هذه المؤسسة",
        "Checkout session does not belong to this organization",
      );
    }
    if (session.status !== "complete" && session.payment_status !== "paid") {
      return sendError(res, 400, "الدفع لم يكتمل بعد", "Checkout is not complete yet");
    }

    const planInterval =
      session.metadata?.planInterval || org.selectedPlanInterval || "year";
    const purpose = session.metadata?.purpose || "upgrade";
    await markPaymentComplete(org, {
      stripeCustomerId:
        typeof session.customer === "string" ? session.customer : session.customer?.id,
      stripeSubscriptionId:
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id,
      planInterval,
      reference: session.id,
      purpose,
    });

    const payload = await planPayload(org.id);
    res.json({ ok: true, plan: payload });
  } catch (e) {
    console.error(e);
    return sendError(res, 500, "تعذر تأكيد الدفع", "Could not confirm checkout");
  }
});

export default router;
