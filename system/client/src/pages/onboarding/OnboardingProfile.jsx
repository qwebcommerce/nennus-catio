import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useI18n } from "../../context/LanguageContext.jsx";
import { getPostAuthPath, isOnboardingComplete } from "../../lib/onboardingPath.js";
import { OnboardingShell } from "./OnboardingShell.jsx";
import { COUNTRY_PACKS } from "../../lib/countries.js";

const emptyForm = {
  legalName: "",
  country: "DZ",
  city: "",
  addressText: "",
  crNumber: "",
  licenseNumber: "",
  ownerFullName: "",
  ownerIdNumber: "",
  ownerPhone: "",
  vatNumber: "",
  taxNumber: "",
  iban: "",
  authorizedPersonName: "",
  acceptTerms: false,
};

export default function OnboardingProfile() {
  const { user, loading, refreshUser } = useAuth();
  const { t, locale } = useI18n();
  const nav = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [countries, setCountries] = useState(COUNTRY_PACKS);
  const [files, setFiles] = useState({});
  const [docsMeta, setDocsMeta] = useState([]);
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [boot, setBoot] = useState(true);

  useEffect(() => {
    if (!user || loading) return;
    if (isOnboardingComplete(user)) return;
    if (user.role !== "ADMIN") return;
    // Rejected users must stay on profile (or rejected page) — never auto-skip to payment.
    if (user.onboarding?.profileDocsDone && user.onboarding?.reviewStatus !== "REJECTED") {
      nav(
        user.onboarding?.paymentDone ? "/onboarding/review" : "/onboarding/payment",
        { replace: true },
      );
      return;
    }
    api("/api/onboarding/status")
      .then((data) => {
        const o = data.onboarding || {};
        if (Array.isArray(data.countries) && data.countries.length) {
          setCountries(data.countries);
        }
        setForm((prev) => ({
          ...prev,
          legalName: o.legalName || user.organizationName || "",
          country: o.country || prev.country || "DZ",
          city: o.city || "",
          addressText: o.addressText || "",
          crNumber: o.crNumber || "",
          licenseNumber: o.licenseNumber || "",
          ownerFullName: o.ownerFullName || user.name || "",
          ownerIdNumber: o.ownerIdNumber || "",
          ownerPhone: o.ownerPhone || "",
          vatNumber: o.vatNumber || "",
          taxNumber: o.taxNumber || "",
          iban: o.iban || "",
          authorizedPersonName: o.authorizedPersonName || o.ownerFullName || user.name || "",
          acceptTerms: Boolean(o.termsAcceptedAt),
        }));
        setDocsMeta(o.documents || []);
      })
      .catch((e) => setErr(e.message || t("onboarding.loadFailed")))
      .finally(() => setBoot(false));
  }, [user, loading, nav, t]);

  if (loading || boot) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>{t("common.loading")}</div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (isOnboardingComplete(user)) {
    return <Navigate to={getPostAuthPath(user)} replace />;
  }
  if (user.role !== "ADMIN") return <Navigate to="/onboarding/pending" replace />;
  if (user.onboarding?.profileDocsDone && user.onboarding?.reviewStatus !== "REJECTED") {
    return (
      <Navigate
        to={user.onboarding?.paymentDone ? "/onboarding/review" : "/onboarding/payment"}
        replace
      />
    );
  }

  const setField = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const setFile = (key) => (e) => {
    const file = e.target.files?.[0] || null;
    setFiles((f) => ({ ...f, [key]: file }));
  };

  const uploaded = (docType) => docsMeta.find((d) => d.docType === docType)?.uploaded;

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === "acceptTerms") fd.append(k, v ? "true" : "false");
        else fd.append(k, v == null ? "" : String(v));
      });
      if (files.crDocument) fd.append("crDocument", files.crDocument);
      if (files.ownerIdDocument) fd.append("ownerIdDocument", files.ownerIdDocument);
      if (files.vatDocument) fd.append("vatDocument", files.vatDocument);
      if (files.licenseDocument) fd.append("licenseDocument", files.licenseDocument);
      if (files.ibanDocument) fd.append("ibanDocument", files.ibanDocument);

      await api("/api/onboarding/profile", { method: "POST", body: fd });
      const u = await refreshUser();
      const paid = Boolean(u?.onboarding?.paymentDone ?? user.onboarding?.paymentDone);
      nav(paid ? "/onboarding/review" : "/onboarding/payment", { replace: true });
    } catch (x) {
      setErr(x.message || t("onboarding.profileFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const isRejected = user.onboarding?.reviewStatus === "REJECTED";
  const rejectNote = user.onboarding?.reviewNote;

  return (
    <OnboardingShell
      stepKey="profile"
      title={t("onboarding.profileTitle")}
      subtitle={t("onboarding.profileSubtitle")}
    >
      {isRejected ? (
        <div className="mkt-error" role="alert" style={{ marginBottom: 16 }}>
          <strong>{t("onboarding.rejectedBanner")}</strong>
          {rejectNote ? <div style={{ marginTop: 6 }}>{rejectNote}</div> : null}
          <p style={{ margin: "8px 0 0", fontSize: 13 }}>{t("onboarding.rejectedResubmitHint")}</p>
        </div>
      ) : null}
      <form className="mkt-form" onSubmit={submit}>
        <fieldset className="mkt-onboarding-fieldset">
          <legend>{t("onboarding.section.business")}</legend>
          <div className="mkt-field">
            <label htmlFor="ob-legal">{t("onboarding.legalName")} *</label>
            <input id="ob-legal" required value={form.legalName} onChange={setField("legalName")} />
          </div>
          <div className="mkt-form-row">
            <div className="mkt-field">
              <label htmlFor="ob-country">{t("onboarding.country")} *</label>
              <select id="ob-country" required value={form.country} onChange={setField("country")}>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {locale === "en" ? c.labelEn : c.labelAr}
                  </option>
                ))}
              </select>
            </div>
            <div className="mkt-field">
              <label htmlFor="ob-city">{t("onboarding.city")} *</label>
              <input id="ob-city" required value={form.city} onChange={setField("city")} />
            </div>
          </div>
          <div className="mkt-field">
            <label htmlFor="ob-address">{t("onboarding.address")} *</label>
            <textarea
              id="ob-address"
              required
              rows={2}
              value={form.addressText}
              onChange={setField("addressText")}
            />
          </div>
          <div className="mkt-form-row">
            <div className="mkt-field">
              <label htmlFor="ob-cr">{t("onboarding.crNumber")} *</label>
              <input id="ob-cr" required value={form.crNumber} onChange={setField("crNumber")} />
            </div>
            <div className="mkt-field">
              <label htmlFor="ob-license">{t("onboarding.licenseNumber")}</label>
              <input
                id="ob-license"
                value={form.licenseNumber}
                onChange={setField("licenseNumber")}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="mkt-onboarding-fieldset">
          <legend>{t("onboarding.section.owner")}</legend>
          <div className="mkt-field">
            <label htmlFor="ob-owner">{t("onboarding.ownerFullName")} *</label>
            <input
              id="ob-owner"
              required
              value={form.ownerFullName}
              onChange={setField("ownerFullName")}
            />
          </div>
          <div className="mkt-form-row">
            <div className="mkt-field">
              <label htmlFor="ob-oid">{t("onboarding.ownerIdNumber")} *</label>
              <input
                id="ob-oid"
                required
                value={form.ownerIdNumber}
                onChange={setField("ownerIdNumber")}
              />
            </div>
            <div className="mkt-field">
              <label htmlFor="ob-phone">{t("onboarding.ownerPhone")} *</label>
              <input
                id="ob-phone"
                required
                value={form.ownerPhone}
                onChange={setField("ownerPhone")}
              />
            </div>
          </div>
          <div className="mkt-field">
            <label htmlFor="ob-auth">{t("onboarding.authorizedPerson")}</label>
            <input
              id="ob-auth"
              value={form.authorizedPersonName}
              onChange={setField("authorizedPersonName")}
            />
          </div>
        </fieldset>

        <fieldset className="mkt-onboarding-fieldset">
          <legend>{t("onboarding.section.tax")}</legend>
          <div className="mkt-form-row">
            <div className="mkt-field">
              <label htmlFor="ob-vat">{t("onboarding.vatNumber")}</label>
              <input id="ob-vat" value={form.vatNumber} onChange={setField("vatNumber")} />
            </div>
            <div className="mkt-field">
              <label htmlFor="ob-tax">{t("onboarding.taxNumber")}</label>
              <input id="ob-tax" value={form.taxNumber} onChange={setField("taxNumber")} />
            </div>
          </div>
          <div className="mkt-field">
            <label htmlFor="ob-iban">{t("onboarding.iban")}</label>
            <input id="ob-iban" value={form.iban} onChange={setField("iban")} />
          </div>
        </fieldset>

        <fieldset className="mkt-onboarding-fieldset">
          <legend>{t("onboarding.section.documents")}</legend>
          <p className="mkt-onboarding-hint">{t("onboarding.documentsHint")}</p>
          <FileField
            id="ob-cr-file"
            label={`${t("onboarding.doc.CR")} *`}
            required={!uploaded("CR")}
            onChange={setFile("crDocument")}
            uploaded={uploaded("CR")}
            fileName={files.crDocument?.name}
            t={t}
          />
          <FileField
            id="ob-oid-file"
            label={`${t("onboarding.doc.OWNER_ID")} *`}
            required={!uploaded("OWNER_ID")}
            onChange={setFile("ownerIdDocument")}
            uploaded={uploaded("OWNER_ID")}
            fileName={files.ownerIdDocument?.name}
            t={t}
          />
          <FileField
            id="ob-vat-file"
            label={t("onboarding.doc.VAT")}
            onChange={setFile("vatDocument")}
            uploaded={uploaded("VAT")}
            fileName={files.vatDocument?.name}
            t={t}
          />
          <FileField
            id="ob-lic-file"
            label={t("onboarding.doc.LICENSE")}
            onChange={setFile("licenseDocument")}
            uploaded={uploaded("LICENSE")}
            fileName={files.licenseDocument?.name}
            t={t}
          />
          <FileField
            id="ob-iban-file"
            label={t("onboarding.doc.IBAN")}
            onChange={setFile("ibanDocument")}
            uploaded={uploaded("IBAN")}
            fileName={files.ibanDocument?.name}
            t={t}
          />
        </fieldset>

        <label className="mkt-onboarding-check">
          <input
            type="checkbox"
            checked={form.acceptTerms}
            onChange={setField("acceptTerms")}
            required={!form.acceptTerms}
          />
          <span>
            {t("onboarding.acceptTermsPrefix")}{" "}
            <Link to="/privacy" target="_blank">
              {t("onboarding.privacyLink")}
            </Link>
          </span>
        </label>

        {err ? (
          <div className="mkt-error" role="alert">
            {err}
          </div>
        ) : null}

        <button
          type="submit"
          className="mkt-btn mkt-btn-primary mkt-btn-block"
          disabled={submitting}
        >
          {submitting ? t("onboarding.saving") : t("onboarding.continuePayment")}
        </button>
      </form>
    </OnboardingShell>
  );
}

function FileField({ id, label, required, onChange, uploaded, fileName, t }) {
  return (
    <div className="mkt-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="file" accept=".pdf,image/*" required={required} onChange={onChange} />
      {fileName ? (
        <span className="mkt-onboarding-file-meta">{fileName}</span>
      ) : uploaded ? (
        <span className="mkt-onboarding-file-meta is-ok">{t("onboarding.docUploaded")}</span>
      ) : null}
    </div>
  );
}
