import React, { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useI18n } from "../../context/LanguageContext.jsx";
import { OnboardingShell } from "./OnboardingShell.jsx";
import { getPostAuthPath } from "../../lib/onboardingPath.js";

export default function OnboardingPaymentSuccess() {
  const { user, loading, refreshUser } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!user || loading) return;
    const sessionId = params.get("session_id");
    if (!sessionId) {
      setErr(t("onboarding.missingSession"));
      return;
    }
    api("/api/onboarding/confirm-checkout", {
      method: "POST",
      body: { sessionId },
    })
      .then(() => refreshUser())
      .then((u) => nav(getPostAuthPath(u) || "/dashboard", { replace: true }))
      .catch((e) => setErr(e.message || t("onboarding.paymentFailed")));
  }, [user, loading, params, refreshUser, nav, t]);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>{t("common.loading")}</div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  return (
    <OnboardingShell
      stepKey="payment"
      title={t("onboarding.confirmingPayment")}
      subtitle={t("onboarding.confirmingPaymentSub")}
    >
      {err ? (
        <div className="mkt-error" role="alert">
          {err}
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="mkt-btn mkt-btn-primary"
              onClick={() => nav("/onboarding/payment", { replace: true })}
            >
              {t("onboarding.backToPayment")}
            </button>
          </div>
        </div>
      ) : (
        <p className="mkt-onboarding-hint">{t("common.loading")}</p>
      )}
    </OnboardingShell>
  );
}
