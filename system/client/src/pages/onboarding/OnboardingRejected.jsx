import React from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useI18n } from "../../context/LanguageContext.jsx";
import { getPostAuthPath, isOnboardingComplete } from "../../lib/onboardingPath.js";
import { OnboardingShell } from "./OnboardingShell.jsx";

export default function OnboardingRejected() {
  const { user, loading, refreshUser } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center" }}>{t("common.loading")}</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (isOnboardingComplete(user)) {
    return <Navigate to={getPostAuthPath(user)} replace />;
  }
  if (user.onboarding?.reviewStatus !== "REJECTED") {
    return <Navigate to={getPostAuthPath(user)} replace />;
  }

  return (
    <OnboardingShell
      stepKey="profile"
      title={t("onboarding.rejectedTitle")}
      subtitle={t("onboarding.rejectedSubtitle")}
    >
      {user.onboarding?.reviewNote ? (
        <div className="mkt-error" role="alert">
          {user.onboarding.reviewNote}
        </div>
      ) : null}
      <p className="mkt-onboarding-hint">{t("onboarding.rejectedBody")}</p>
      <button
        type="button"
        className="mkt-btn mkt-btn-primary mkt-btn-block"
        onClick={async () => {
          await refreshUser();
          nav("/onboarding/profile", { replace: true });
        }}
      >
        {t("onboarding.resubmit")}
      </button>
      <p className="mkt-auth-link">
        <Link to="/contact">{t("onboarding.ctaContact")}</Link>
      </p>
    </OnboardingShell>
  );
}
