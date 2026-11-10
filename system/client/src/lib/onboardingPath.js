/**
 * Where to send a logged-in user based on organization onboarding progress.
 * Platform admins bypass onboarding.
 */
export function getPostAuthPath(user) {
  if (!user) return "/login";
  if (user.isPlatformAdmin) return "/dashboard";
  if (user.role === "ASSOCIATE") return "/floor-pos";

  if (isOnboardingComplete(user)) return "/dashboard";

  // Offline / legacy session without onboarding payload — don't trap the user
  if (user.onboardingComplete == null && user.onboarding == null) {
    return "/dashboard";
  }

  if (user.role !== "ADMIN") return "/onboarding/pending";

  const onboarding = user.onboarding || {};
  // Rejected orgs must see the reason + resubmit CTA even when profileDocsDone was reset.
  if (onboarding.reviewStatus === "REJECTED") return "/onboarding/rejected";
  if (!onboarding.profileDocsDone) return "/onboarding/profile";
  if (!onboarding.paymentDone) return "/onboarding/payment";
  return "/onboarding/review";
}

export function isOnboardingComplete(user) {
  if (!user) return false;
  if (user.isPlatformAdmin) return true;
  if (user.onboardingComplete === true) return true;
  if (user.onboardingComplete === false) return false;
  // Missing payload (offline JWT fallback / old cache): allow app access
  if (!user.onboarding) return true;
  const o = user.onboarding;
  if (!o.profileDocsDone || !o.paymentDone) return false;
  if (o.reviewStatus != null && String(o.reviewStatus).trim() !== "") {
    return o.reviewStatus === "APPROVED";
  }
  return true;
}

/** True when the path is part of the onboarding wizard (allowed while incomplete). */
export function isOnboardingRoute(pathname) {
  return String(pathname || "").startsWith("/onboarding");
}
