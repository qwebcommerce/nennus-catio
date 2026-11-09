import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useI18n } from "../../context/LanguageContext.jsx";
import { getPostAuthPath, isOnboardingComplete } from "../../lib/onboardingPath.js";
import { OnboardingShell } from "./OnboardingShell.jsx";

export default function OnboardingPending() {
  const { user, loading } = useAuth();
  const { t } = useI18n();

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>{t("common.loading")}</div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (isOnboardingComplete(user)) {
    return <Navigate to={getPostAuthPath(user)} replace />;
  }
  if (user.role === "ADMIN") {
    return <Navigate to={getPostAuthPath(user)} replace />;
  }

  return (
    <OnboardingShell
      stepKey="profile"
      title={t("onboarding.pendingTitle")}
      subtitle={t("onboarding.pendingSubtitle")}
    >
      <p className="mkt-onboarding-hint">{t("onboarding.pendingBody")}</p>
    </OnboardingShell>
  );
}
