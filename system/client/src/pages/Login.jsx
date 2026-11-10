import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { getPostAuthPath } from "../lib/onboardingPath.js";
import { AuthShell } from "../marketing/AuthShell.jsx";
import { useMarketingCopy } from "../marketing/copy.js";
import { PasswordField } from "../components/PasswordField.jsx";

export default function Login() {
  const { login, user, loading } = useAuth();
  const { t, locale } = useI18n();
  const c = useMarketingCopy(locale);
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [dbUrlInfo, setDbUrlInfo] = useState(null);

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

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setDbUrlInfo(null);
    try {
      const loggedIn = await login(email, password);
      nav(getPostAuthPath(loggedIn), { replace: true });
    } catch (x) {
      setErr(x.message || t("login.failed"));
      const info = x?.data?.urlInfo;
      setDbUrlInfo(info && typeof info === "object" ? info : null);
    }
  };

  return (
    <AuthShell title={c.auth.signInTitle} subtitle={c.auth.signInSub}>
      <form className="mkt-form" onSubmit={submit}>
        <div className="mkt-field">
          <label htmlFor="login-email">{t("login.email")}</label>
          <input
            id="login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            autoComplete="username"
          />
        </div>
        <PasswordField
          id="login-password"
          label={t("login.password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        {err ? <div className="mkt-error">{err}</div> : null}
        {dbUrlInfo ? (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              fontSize: 13,
              lineHeight: 1.45,
              color: "var(--mkt-muted)",
              background: "#fff",
              border: "1px solid var(--mkt-line)",
              borderRadius: "0.65rem",
            }}
          >
            <strong style={{ color: "var(--mkt-ink)", display: "block", marginBottom: 6 }}>
              {t("login.dbDiagnostics")}
            </strong>
            {dbUrlInfo.hint ? <div style={{ marginBottom: 8 }}>{dbUrlInfo.hint}</div> : null}
            {dbUrlInfo.databaseUrlSet && dbUrlInfo.host ? (
              <div style={{ fontSize: 12, fontFamily: "ui-monospace, monospace" }}>
                {t("login.dbHost")}: {String(dbUrlInfo.host)} — {t("login.dbPort")}:{" "}
                {String(dbUrlInfo.port ?? "—")}
              </div>
            ) : null}
          </div>
        ) : null}
        <button type="submit" className="mkt-btn mkt-btn-primary mkt-btn-block">
          {t("login.submit")}
        </button>
      </form>
    </AuthShell>
  );
}
