import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { BUSINESS_VERTICAL_IDS, isMvpVerticalEnabled } from "../lib/businessVerticalIds.js";
import { BusinessVerticalIcon } from "../lib/businessVerticalIcons.jsx";
import { getPostAuthPath } from "../lib/onboardingPath.js";
import { AuthShell } from "../marketing/AuthShell.jsx";
import { useMarketingCopy } from "../marketing/copy.js";
import { PasswordField } from "../components/PasswordField.jsx";

const btnGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
  gap: 8,
};

export default function Register() {
  const { registerOrganization, user, loading } = useAuth();
  const { t, locale } = useI18n();
  const c = useMarketingCopy(locale);
  const nav = useNavigate();

  const [step, setStep] = useState(1);
  const [businessVertical, setBusinessVertical] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [branchName, setBranchName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [registrationSecret, setRegistrationSecret] = useState(
    () => import.meta.env.VITE_ORG_REGISTRATION_SECRET || ""
  );
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dbUrlInfo, setDbUrlInfo] = useState(null);

  const defaultSlugFromName = useMemo(() => {
    const raw = organizationName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 48);
    return raw.replace(/^-+|-+$/g, "");
  }, [organizationName]);

  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    } catch {
      window.scrollTo(0, 0);
    }
  }, [step]);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        {t("common.loading")}
      </div>
    );
  }
  if (user) {
    return <Navigate to={getPostAuthPath(user)} replace />;
  }

  const applySuggestedSlug = () => {
    if (defaultSlugFromName) setOrganizationSlug(defaultSlugFromName);
  };

  const goNext = () => {
    setErr("");
    setDbUrlInfo(null);
    if (!businessVertical) {
      setErr(t("register.verticalRequired"));
      return;
    }
    if (!isMvpVerticalEnabled(businessVertical)) {
      setErr(t("register.mvpVerticalHint"));
      return;
    }
    setStep(2);
  };

  const goBack = () => {
    setErr("");
    setDbUrlInfo(null);
    setStep(1);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setDbUrlInfo(null);
    if (!businessVertical) {
      setErr(t("register.verticalRequired"));
      setStep(1);
      return;
    }
    setSubmitting(true);
    try {
      const created = await registerOrganization({
        registrationSecret: registrationSecret.trim() || undefined,
        organizationName: organizationName.trim(),
        organizationSlug: organizationSlug.trim().toLowerCase(),
        branchName: branchName.trim() || undefined,
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim(),
        adminPassword,
        businessVertical,
      });
      nav(getPostAuthPath(created), { replace: true });
    } catch (x) {
      setErr(x.message || t("register.failed"));
      const info = x?.data?.urlInfo;
      setDbUrlInfo(info && typeof info === "object" ? info : null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title={c.auth.signUpTitle} subtitle={c.auth.signUpSub}>
      <form className="mkt-form" onSubmit={submit}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "var(--mkt-muted)" }}>
          {t("register.stepProgress", { step: String(step) })}
        </p>
        <p style={{ margin: 0, fontSize: 13, color: "var(--mkt-muted)", lineHeight: 1.45 }}>
          {step === 1 ? t("register.step1Subtitle") : t("register.step2Subtitle")}
        </p>

        {step === 1 ? (
          <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
            <legend style={{ fontWeight: 600, marginBottom: 8 }}>{t("register.verticalSection")}</legend>
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--mkt-muted)", lineHeight: 1.4 }}>
              {t("register.mvpVerticalHint")}
            </p>
            <div style={btnGrid}>
              {BUSINESS_VERTICAL_IDS.map((id) => {
                const enabled = isMvpVerticalEnabled(id);
                const selected = businessVertical === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!enabled}
                    onClick={() => enabled && setBusinessVertical(id)}
                    aria-pressed={selected}
                    title={enabled ? undefined : t("register.comingSoon")}
                    style={{
                      minHeight: 72,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      padding: "10px 8px",
                      fontSize: 12,
                      lineHeight: 1.25,
                      textAlign: "center",
                      borderRadius: "0.65rem",
                      cursor: enabled ? "pointer" : "not-allowed",
                      fontFamily: "inherit",
                      opacity: enabled ? 1 : 0.45,
                      border: selected
                        ? "2px solid var(--mkt-blue)"
                        : "1px solid var(--mkt-line)",
                      background: selected ? "color-mix(in srgb, var(--mkt-sky) 18%, #fff)" : "#fff",
                      color: "var(--mkt-ink)",
                    }}
                  >
                    <BusinessVerticalIcon id={id} size={22} color="#0f172a" />
                    <span>{t(`register.vertical.${id}`)}</span>
                    {!enabled ? (
                      <span style={{ fontSize: 10, color: "var(--mkt-muted)" }}>{t("register.comingSoon")}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {step === 2 ? (
          <>
            <div className="mkt-field">
              <label htmlFor="reg-org">{t("register.orgName")}</label>
              <input
                id="reg-org"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                required
              />
            </div>
            <div className="mkt-field">
              <label htmlFor="reg-slug">{t("register.orgSlug")}</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  id="reg-slug"
                  value={organizationSlug}
                  onChange={(e) => setOrganizationSlug(e.target.value.toLowerCase())}
                  required
                  pattern="[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?"
                  title={t("register.slugHint")}
                  style={{ flex: "1 1 160px" }}
                />
                <button
                  type="button"
                  className="mkt-btn mkt-btn-ghost"
                  onClick={applySuggestedSlug}
                  disabled={!defaultSlugFromName}
                >
                  {t("register.suggestSlug")}
                </button>
              </div>
            </div>
            <div className="mkt-field">
              <label htmlFor="reg-branch">{t("register.branchName")}</label>
              <input id="reg-branch" value={branchName} onChange={(e) => setBranchName(e.target.value)} />
            </div>
            <div className="mkt-field">
              <label htmlFor="reg-admin">{t("register.adminName")}</label>
              <input
                id="reg-admin"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                required
              />
            </div>
            <div className="mkt-field">
              <label htmlFor="reg-email">{t("register.adminEmail")}</label>
              <input
                id="reg-email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                type="email"
                required
                autoComplete="email"
              />
            </div>
            <PasswordField
              id="reg-pass"
              label={t("register.adminPassword")}
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
            <PasswordField
              id="reg-secret"
              label={t("register.registrationSecret")}
              value={registrationSecret}
              onChange={(e) => setRegistrationSecret(e.target.value)}
              autoComplete="off"
              placeholder={t("register.registrationSecretPlaceholder")}
            />
          </>
        ) : null}

        {err ? (
          <div className="mkt-error" role="alert">
            {err}
          </div>
        ) : null}
        {dbUrlInfo?.hint ? (
          <div style={{ fontSize: 13, color: "var(--mkt-muted)" }}>{dbUrlInfo.hint}</div>
        ) : null}

        {step === 1 ? (
          <button type="button" className="mkt-btn mkt-btn-primary mkt-btn-block" onClick={goNext}>
            {t("common.next")}
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="mkt-btn mkt-btn-ghost"
              onClick={goBack}
              disabled={submitting}
            >
              {t("common.previous")}
            </button>
            <button
              type="submit"
              className="mkt-btn mkt-btn-primary"
              disabled={submitting}
              style={{ flex: 1 }}
            >
              {submitting ? t("register.submitting") : t("register.submit")}
            </button>
          </div>
        )}

        <p className="mkt-auth-link">
          {c.auth.hasAccount} <Link to="/login">{c.auth.signInLink}</Link>
        </p>
      </form>
    </AuthShell>
  );
}
