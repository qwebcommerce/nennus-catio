import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { AuthShell } from "../marketing/AuthShell.jsx";
import { PasswordField } from "../components/PasswordField.jsx";

function errorText(x, locale, fallback) {
  const d = x?.data;
  if (d && typeof d === "object") return (locale === "ar" ? d.errorAr || d.error : d.errorEn || d.error) || fallback;
  return x?.message || fallback;
}

/** Staff "forgot password": asks for the email and sends a one-hour reset link. */
export function StaffForgotPassword() {
  const { t, locale } = useI18n();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState("");
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await api("/api/auth/forgot-password", { method: "POST", body: { email } });
      setSent(true);
      setDevLink(r?.resetLink || "");
    } catch (x) {
      setErr(errorText(x, locale, t("login.failed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t("pw.forgotTitle")} subtitle={t("pw.forgotSub")}>
      {sent ? (
        <div className="mkt-form">
          <p role="status">{t("pw.sent")}</p>
          {devLink ? (
            <p style={{ fontSize: 13, wordBreak: "break-all" }}>
              {t("pw.devLink")} <a href={devLink}>{devLink}</a>
            </p>
          ) : null}
          <Link to="/login" className="mkt-btn mkt-btn-primary mkt-btn-block">{t("pw.backToLogin")}</Link>
        </div>
      ) : (
        <form className="mkt-form" onSubmit={submit}>
          <div className="mkt-field">
            <label htmlFor="forgot-email">{t("login.email")}</label>
            <input id="forgot-email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {err ? <div className="mkt-error">{err}</div> : null}
          <button type="submit" className="mkt-btn mkt-btn-primary mkt-btn-block" disabled={busy}>{t("pw.sendLink")}</button>
          <p style={{ marginTop: 12, textAlign: "center" }}><Link to="/login">{t("pw.backToLogin")}</Link></p>
        </form>
      )}
    </AuthShell>
  );
}

/** Staff reset from the emailed link (/reset-password?token=...). */
export function StaffResetPassword() {
  const { t, locale } = useI18n();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (password.length < 8) return setErr(t("pw.minLength"));
    if (password !== confirm) return setErr(t("pw.mismatch"));
    setBusy(true);
    try {
      await api("/api/auth/reset-password", { method: "POST", body: { token, password } });
      setDone(true);
    } catch (x) {
      setErr(errorText(x, locale, t("login.failed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t("pw.resetTitle")} subtitle={t("pw.resetSub")}>
      {done || !token ? (
        <div className="mkt-form">
          <p role="status">{done ? t("pw.resetDone") : t("pw.noToken")}</p>
          <Link to={done ? "/login" : "/forgot-password"} className="mkt-btn mkt-btn-primary mkt-btn-block">
            {done ? t("pw.backToLogin") : t("pw.forgotTitle")}
          </Link>
        </div>
      ) : (
        <form className="mkt-form" onSubmit={submit}>
          <PasswordField id="reset-new" label={t("pw.newPassword")} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
          <PasswordField id="reset-confirm" label={t("pw.confirmPassword")} value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
          <p style={{ fontSize: 13, opacity: 0.75, margin: "0 0 12px" }}>{t("pw.minLength")}</p>
          {err ? <div className="mkt-error">{err}</div> : null}
          <button type="submit" className="mkt-btn mkt-btn-primary mkt-btn-block" disabled={busy}>{t("pw.save")}</button>
        </form>
      )}
    </AuthShell>
  );
}

/** Signed-in staff change their own password (inside the staff app). */
export function ChangePassword() {
  const { t, locale } = useI18n();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (password.length < 8) return setErr(t("pw.minLength"));
    if (password !== confirm) return setErr(t("pw.mismatch"));
    setBusy(true);
    try {
      await api("/api/auth/change-password", { method: "POST", body: { currentPassword: current, newPassword: password } });
      setMsg(t("pw.changed"));
      setCurrent("");
      setPassword("");
      setConfirm("");
    } catch (x) {
      setErr(errorText(x, locale, t("login.failed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 480 }}>
      <h1>{t("pw.changeTitle")}</h1>
      <p style={{ opacity: 0.75 }}>{t("pw.changeSub")}</p>
      <form className="mkt-form" onSubmit={submit}>
        <PasswordField id="change-current" label={t("pw.currentPassword")} value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
        <PasswordField id="change-new" label={t("pw.newPassword")} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
        <PasswordField id="change-confirm" label={t("pw.confirmPassword")} value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
        <p style={{ fontSize: 13, opacity: 0.75, margin: "0 0 12px" }}>{t("pw.minLength")}</p>
        {err ? <div className="mkt-error" role="alert">{err}</div> : null}
        {msg ? <div role="status" style={{ color: "var(--ok, #1e3e2f)", marginBottom: 12 }}>{msg}</div> : null}
        <button type="submit" className="btn-touch" style={{ background: "var(--accent)", color: "#fff" }} disabled={busy}>{t("pw.save")}</button>
      </form>
    </div>
  );
}
