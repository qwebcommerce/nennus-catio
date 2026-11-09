import { prisma } from "./prisma.js";
import { currencyFromCountry, planDisplayPayload } from "./fxGulf.js";
import { ONBOARDING_COUNTRY_CODES, countriesForClient } from "./countries.js";

/** First three months free (Stripe subscription trial). */
export const TRIAL_DAYS = 90;

/** Plan intervals — amounts are always SAR (Stripe charge currency). */
export const PLAN_INTERVALS = {
  month: {
    id: "month",
    amount: 150,
    interval: "month",
    intervalCount: 1,
    labelEn: "Monthly",
    labelAr: "شهري",
  },
  six: {
    id: "six",
    amount: 600,
    interval: "month",
    intervalCount: 6,
    labelEn: "6 months",
    labelAr: "٦ أشهر",
  },
  year: {
    id: "year",
    amount: 1000,
    interval: "year",
    intervalCount: 1,
    labelEn: "Yearly",
    labelAr: "سنوي",
  },
};

export const REQUIRED_DOC_TYPES = ["CR", "OWNER_ID"];
export const OPTIONAL_DOC_TYPES = ["VAT", "LICENSE", "IBAN"];
export const ALL_DOC_TYPES = [...REQUIRED_DOC_TYPES, ...OPTIONAL_DOC_TYPES];

/** @deprecated prefer ONBOARDING_COUNTRY_CODES / countriesForClient() */
export const GULF_COUNTRIES = ONBOARDING_COUNTRY_CODES;
export { ONBOARDING_COUNTRY_CODES, countriesForClient };

/** NOT_SUBMITTED | PENDING_REVIEW | APPROVED | REJECTED */
export function normalizeReviewStatus(raw) {
  const s = String(raw || "NOT_SUBMITTED").toUpperCase();
  if (["NOT_SUBMITTED", "PENDING_REVIEW", "APPROVED", "REJECTED"].includes(s)) return s;
  return "NOT_SUBMITTED";
}

export function onboardingStatusFromOrg(org) {
  const profileDocsDone = Boolean(org?.profileDocsDone);
  const paymentDone = Boolean(org?.paymentDone);
  const reviewStatus = normalizeReviewStatus(org?.onboardingReviewStatus);
  let nextStep = "COMPLETE";
  if (!profileDocsDone) nextStep = "PROFILE";
  else if (!paymentDone) nextStep = "PAYMENT";
  else if (reviewStatus === "REJECTED") nextStep = "REJECTED";
  else if (reviewStatus !== "APPROVED") nextStep = "REVIEW";
  const complete =
    profileDocsDone && paymentDone && reviewStatus === "APPROVED";
  return {
    profileDocsDone,
    paymentDone,
    reviewStatus,
    reviewNote: org?.onboardingReviewNote ?? null,
    complete,
    nextStep,
  };
}

export function clientOnboardingPayload(org, documentTypes = []) {
  const status = onboardingStatusFromOrg(org);
  const country = org.country || "SA";
  const displayCurrency = currencyFromCountry(country);
  return {
    ...status,
    legalName: org.legalName ?? "",
    country: org.country ?? "",
    city: org.city ?? "",
    addressText: org.addressText ?? "",
    crNumber: org.crNumber ?? "",
    licenseNumber: org.licenseNumber ?? "",
    ownerFullName: org.ownerFullName ?? "",
    ownerIdNumber: org.ownerIdNumber ?? "",
    ownerPhone: org.ownerPhone ?? "",
    vatNumber: org.vatNumber ?? "",
    taxNumber: org.taxNumber ?? "",
    iban: org.iban ?? "",
    authorizedPersonName: org.authorizedPersonName ?? "",
    termsAcceptedAt: org.termsAcceptedAt ?? null,
    selectedPlanInterval: org.selectedPlanInterval ?? null,
    documents: ALL_DOC_TYPES.map((docType) => ({
      docType,
      uploaded: documentTypes.includes(docType),
      required: REQUIRED_DOC_TYPES.includes(docType),
    })),
    currencyCharge: "SAR",
    currencyLocal: displayCurrency,
    plans: Object.values(PLAN_INTERVALS).map((p) => planDisplayPayload(p, country)),
  };
}

export async function markPaymentComplete(
  org,
  { stripeCustomerId, stripeSubscriptionId, planInterval, reference, purpose = "onboarding" }
) {
  const amount = PLAN_INTERVALS[planInterval]?.amount ?? null;
  const isUpgrade = purpose === "upgrade" || org.plan === "PREMIUM" || org.paymentDone;
  const updated = await prisma.organization.update({
    where: { id: org.id },
    data: {
      paymentDone: true,
      selectedPlanInterval: planInterval || org.selectedPlanInterval,
      plan: "PREMIUM",
      maxBranches: Math.max(org.maxBranches || 3, 10),
      ...(stripeCustomerId ? { stripeCustomerId } : {}),
      ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
    },
  });

  if (reference) {
    const existing = await prisma.organizationPlanPurchase.findFirst({
      where: { organizationId: org.id, reference },
    });
    if (!existing) {
      const note = isUpgrade
        ? `Stripe upgrade (${planInterval || "plan"})`
        : `Stripe checkout (${planInterval || "plan"}) — ${TRIAL_DAYS}-day trial`;
      await prisma.organizationPlanPurchase.create({
        data: {
          organizationId: org.id,
          plan: "PREMIUM",
          amount,
          currency: "SAR",
          reference,
          note,
        },
      });
    }
  }
  return updated;
}

/** True when org should still be offered a paid upgrade CTA. */
export function canUpgradePlan(org) {
  return String(org?.plan || "FREE").toUpperCase() !== "PREMIUM";
}
