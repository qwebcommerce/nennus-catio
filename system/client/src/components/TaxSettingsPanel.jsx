import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { COUNTRY_PACKS } from "../lib/countries.js";

export default function TaxSettingsPanel() {
  const { t, locale } = useI18n();
  const { user, refreshUser, isAdmin } = useAuth();
  const [form, setForm] = useState({
    countryCode: "DZ",
    currency: "DZD",
    standardRate: "19",
    enabled: true,
  });
  const [packs, setPacks] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAdmin && user?.role !== "MANAGER") return;
    api("/api/tax-settings")
      .then((s) => {
        setForm({
          countryCode: s.countryCode || "DZ",
          currency: s.currency || "DZD",
          standardRate: String(s.standardRate ?? 0),
          enabled: s.enabled !== false,
        });
        setPacks(Array.isArray(s.packs) ? s.packs : []);
      })
      .catch(() => {});
  }, [isAdmin, user?.role]);

  if (!isAdmin) {
    return (
      <section className="settings-card" aria-labelledby="settings-tax-heading">
        <h2 id="settings-tax-heading">{t("tax.title")}</h2>
        <p className="settings-row-hint">
          {user?.tax
            ? t("tax.readOnly", {
                country: user.tax.countryCode || "—",
                rate: String(user.tax.standardRate ?? 0),
                currency: user.tax.currency || "—",
              })
            : t("tax.loadHint")}
        </p>
      </section>
    );
  }

  const applyPack = (code) => {
    const pack = packs.find((p) => p.countryCode === code);
    setForm((f) => ({
      ...f,
      countryCode: code,
      currency: pack?.currency || f.currency,
      standardRate: pack != null ? String(pack.standardRate) : f.standardRate,
    }));
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const s = await api("/api/tax-settings", {
        method: "PUT",
        body: {
          countryCode: form.countryCode,
          currency: form.currency,
          standardRate: Number(form.standardRate),
          enabled: form.enabled,
          applyPackDefaults: false,
        },
      });
      setForm({
        countryCode: s.countryCode || form.countryCode,
        currency: s.currency || form.currency,
        standardRate: String(s.standardRate ?? 0),
        enabled: s.enabled !== false,
      });
      await refreshUser();
      setMsg(t("tax.saved"));
    } catch (x) {
      setMsg(x.message || t("tax.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-card" aria-labelledby="settings-tax-heading">
      <h2 id="settings-tax-heading">{t("tax.title")}</h2>
      <p className="settings-row-hint" style={{ marginBottom: 12 }}>
        {t("tax.intro")}
      </p>
      <form onSubmit={save} style={{ display: "grid", gap: 12 }}>
        <label className="settings-row" style={{ display: "grid", gap: 6 }}>
          <span className="settings-row-label">{t("tax.countryPack")}</span>
          <select
            value={form.countryCode}
            onChange={(e) => applyPack(e.target.value)}
            style={{ minHeight: 42, borderRadius: 10, padding: "8px 10px" }}
          >
            {(packs.length
              ? packs
              : COUNTRY_PACKS.map((c) => ({
                  countryCode: c.code,
                  labelEn: c.labelEn,
                  labelAr: c.labelAr,
                  currency: c.currency,
                  standardRate: c.standardRate,
                }))
            ).map((p) => (
              <option key={p.countryCode} value={p.countryCode}>
                {locale === "en" ? p.labelEn : p.labelAr} ({p.countryCode})
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span className="settings-row-label">{t("tax.standardRate")}</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={form.standardRate}
              onChange={(e) => setForm({ ...form, standardRate: e.target.value })}
              style={{ minHeight: 42, borderRadius: 10, padding: "8px 10px" }}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span className="settings-row-label">{t("tax.currency")}</span>
            <input
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              style={{ minHeight: 42, borderRadius: 10, padding: "8px 10px" }}
            />
          </label>
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          <span>{t("tax.enabled")}</span>
        </label>

        {msg ? <div style={{ fontSize: 13, color: "var(--muted)" }}>{msg}</div> : null}

        <button type="submit" className="btn-touch" disabled={busy} style={{ justifySelf: "start" }}>
          {busy ? t("tax.saving") : t("tax.save")}
        </button>
      </form>
    </section>
  );
}
