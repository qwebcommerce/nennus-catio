import React, { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useI18n } from "../../context/LanguageContext.jsx";
import { getPostAuthPath, isOnboardingComplete } from "../../lib/onboardingPath.js";
import { OnboardingShell } from "./OnboardingShell.jsx";

export default function OnboardingReview() {
  const { user, loading, logout, refreshUser } = useAuth();
  const { t } = useI18n();

  // Poll so approval unlocks the app without forcing re-login.
  useEffect(() => {
    if (!user || isOnboardingComplete(user)) return undefined;
    const id = setInterval(() => {
      refreshUser?.().catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, [user, refreshUser]);

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center" }}>{t("common.loading")}</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (isOnboardingComplete(user)) {
    return <Navigate to={getPostAuthPath(user)} replace />;
  }
  if (user.onboarding?.reviewStatus === "REJECTED") {
    return <Navigate to="/onboarding/rejected" replace />;
  }
  if (!user.onboarding?.profileDocsDone) {
    return <Navigate to="/onboarding/profile" replace />;
  }
  if (!user.onboarding?.paymentDone) {
    return <Navigate to="/onboarding/payment" replace />;
  }

  return (
    <OnboardingShell
      stepKey="done"
      title={t("onboarding.reviewTitle")}
      subtitle={t("onboarding.reviewSubtitle")}
    >
      <p className="mkt-onboarding-hint">{t("onboarding.reviewBody")}</p>
      <button
        type="button"
        className="mkt-btn mkt-btn-primary mkt-btn-block"
        style={{ marginBottom: 12 }}
        onClick={() => refreshUser?.()}
      >
        {t("onboarding.checkStatus")}
      </button>
      <button type="button" className="mkt-btn mkt-btn-ghost" onClick={logout}>
        {t("onboarding.signOut")}
      </button>
    </OnboardingShell>
  );
}
