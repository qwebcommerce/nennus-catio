import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useI18n } from "../../context/LanguageContext.jsx";
import { AuthShell } from "../../marketing/AuthShell.jsx";

const STEPS = [
  { key: "account", path: null },
  { key: "profile", path: "/onboarding/profile" },
  { key: "payment", path: "/onboarding/payment" },
  { key: "done", path: null },
];

export function OnboardingShell({ stepKey, title, subtitle, children }) {
  const { t } = useI18n();
  const { logout } = useAuth();
  const activeIdx = Math.max(
    0,
    STEPS.findIndex((s) => s.key === stepKey)
  );

  return (
    <AuthShell title={title} subtitle={subtitle}>
      <ol className="mkt-onboarding-steps" aria-label={t("onboarding.stepsLabel")}>
        {STEPS.map((s, i) => (
          <li
            key={s.key}
            className={
              i < activeIdx ? "is-done" : i === activeIdx ? "is-active" : undefined
            }
          >
            <span className="mkt-onboarding-step-n">{i + 1}</span>
            <span>{t(`onboarding.step.${s.key}`)}</span>
          </li>
        ))}
      </ol>
      {children}
      <p className="mkt-auth-link" style={{ marginTop: "1.25rem" }}>
        <button
          type="button"
          className="mkt-btn mkt-btn-ghost"
          style={{ minHeight: "2.25rem" }}
          onClick={logout}
        >
          {t("onboarding.signOut")}
        </button>
        <Link to="/privacy" style={{ marginInlineStart: 12 }}>
          {t("onboarding.privacyLink")}
        </Link>
      </p>
    </AuthShell>
  );
}
