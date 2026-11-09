import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";

const card = {
  padding: 16,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  marginBottom: 20,
};

const inp = {
  minHeight: 40,
  padding: "8px 12px",
  borderRadius: 12,
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  width: "100%",
  boxSizing: "border-box",
};

export default function LoyaltyCoupons() {
  const { t } = useI18n();
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(null);
  const [coupons, setCoupons] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [couponForm, setCouponForm] = useState({
    code: "",
    kind: "PERCENT",
    value: "",
    minOrderAmount: "",
    maxDiscountAmount: "",
    maxUsesTotal: "",
    maxUsesPerCustomer: "",
    validUntil: "",
    channel: "BOTH",
    note: "",
  });

  const load = useCallback(async () => {
    setMsg("");
    try {
      const [s, c, l] = await Promise.all([
        api("/api/loyalty-settings"),
        api("/api/coupons"),
        api("/api/loyalty-settings/ledger?limit=80"),
      ]);
      setSettings(s);
      setCoupons(c);
      setLedger(l);
    } catch (e) {
      setMsg(e.message || t("loyalty.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    setMsg("");
    try {
      const row = await api("/api/loyalty-settings", {
        method: "PUT",
        body: settings,
      });
      setSettings(row);
      setMsg(t("loyalty.saved"));
      try {
        window.dispatchEvent(new Event("loyalty-settings-changed"));
      } catch {
        /* ignore */
      }
    } catch (e) {
      setMsg(e.message || t("loyalty.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const addCoupon = async () => {
    setMsg("");
    try {
      await api("/api/coupons", {
        method: "POST",
        body: {
          ...couponForm,
          value: Number(couponForm.value),
          minOrderAmount: couponForm.minOrderAmount || undefined,
          maxDiscountAmount: couponForm.maxDiscountAmount || undefined,
          maxUsesTotal: couponForm.maxUsesTotal || undefined,
          maxUsesPerCustomer: couponForm.maxUsesPerCustomer || undefined,
          validUntil: couponForm.validUntil || null,
        },
      });
      setCouponForm({
        code: "",
        kind: "PERCENT",
        value: "",
        minOrderAmount: "",
        maxDiscountAmount: "",
        maxUsesTotal: "",
        maxUsesPerCustomer: "",
        validUntil: "",
        channel: "BOTH",
        note: "",
      });
      await load();
    } catch (e) {
      setMsg(e.message || t("loyalty.couponError"));
    }
  };

  const toggleCoupon = async (row) => {
    try {
      await api(`/api/coupons/${row.id}`, {
        method: "PATCH",
        body: { active: !row.active },
      });
      await load();
    } catch (e) {
      setMsg(e.message || t("loyalty.couponError"));
    }
  };

  const removeCoupon = async (row) => {
    if (!window.confirm(t("loyalty.confirmDeleteCoupon"))) return;
    try {
      await api(`/api/coupons/${row.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setMsg(e.message || t("loyalty.couponError"));
    }
  };

  if (loading || !settings) {
    return (
      <div style={{ padding: 24 }}>
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      <h1 style={{ marginTop: 0 }}>{t("loyalty.title")}</h1>
      <p style={{ color: "var(--muted)", fontSize: 14 }}>{t("loyalty.intro")}</p>
      {msg ? (
        <p style={{ color: msg.includes("✓") || msg.includes("حفظ") ? "var(--success, #0d9488)" : "var(--danger, #c62828)" }}>
          {msg}
        </p>
      ) : null}

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>{t("loyalty.sectionProgram")}</h2>
        <p style={{ marginTop: 0, marginBottom: 12, fontSize: 13, color: "var(--muted)", lineHeight: 1.45 }}>
          {t("loyalty.allVerticalsHint")}
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
          />
          {t("loyalty.enabled")}
        </label>

        <div className="page-form-grid" style={{ marginBottom: 12 }}>
          <label className="page-form-field">
            <span style={{ fontWeight: 700, color: "var(--text)" }}>{t("loyalty.earnBase")}</span>
            <select
              value={settings.earnBase}
              onChange={(e) => setSettings({ ...settings, earnBase: e.target.value })}
              style={inp}
            >
              <option value="PER_ORDER_TOTAL">{t("loyalty.earnPerOrder")}</option>
              <option value="LIFETIME_SPEND">{t("loyalty.earnLifetime")}</option>
            </select>
          </label>
          <label className="page-form-field">
            <span>{t("loyalty.earnEvery")}</span>
            <input
              type="number"
              min="0.01"
              step="any"
              value={String(settings.earnEveryAmount)}
              onChange={(e) => setSettings({ ...settings, earnEveryAmount: e.target.value })}
              style={inp}
            />
          </label>
          <label className="page-form-field">
            <span>{t("loyalty.earnPoints")}</span>
            <input
              type="number"
              min="0"
              value={settings.earnPoints}
              onChange={(e) => setSettings({ ...settings, earnPoints: parseInt(e.target.value, 10) || 0 })}
              style={inp}
            />
          </label>
          <label className="page-form-field">
            <span>{t("loyalty.minOrder")}</span>
            <input
              type="number"
              min="0"
              step="any"
              value={String(settings.minOrderForEarn)}
              onChange={(e) => setSettings({ ...settings, minOrderForEarn: e.target.value })}
              style={inp}
            />
          </label>
          <label className="page-form-field">
            <span style={{ fontWeight: 700, color: "var(--text)" }}>{t("loyalty.awardTiming")}</span>
            <select
              value={settings.awardTiming}
              onChange={(e) => setSettings({ ...settings, awardTiming: e.target.value })}
              style={inp}
            >
              <option value="ON_PAYMENT">{t("loyalty.onPayment")}</option>
              <option value="ON_DELIVERY">{t("loyalty.onDelivery")}</option>
            </select>
          </label>
          <label className="page-form-field">
            <span>{t("loyalty.redeemPointsPer")}</span>
            <input
              type="number"
              min="0.01"
              step="any"
              value={String(settings.redeemPointsPerCurrency)}
              onChange={(e) => setSettings({ ...settings, redeemPointsPerCurrency: e.target.value })}
              style={inp}
            />
          </label>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={settings.excludeWholesale}
            onChange={(e) => setSettings({ ...settings, excludeWholesale: e.target.checked })}
          />
          {t("loyalty.excludeWholesale")}
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={settings.redemptionEnabled}
            onChange={(e) => setSettings({ ...settings, redemptionEnabled: e.target.checked })}
          />
          {t("loyalty.redemptionEnabled")}
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          {t("loyalty.maxRedeemPct")}
          <input
            type="number"
            min="0"
            max="100"
            value={settings.maxRedemptionPercentOfInvoice}
            onChange={(e) =>
              setSettings({
                ...settings,
                maxRedemptionPercentOfInvoice: parseInt(e.target.value, 10) || 0,
              })
            }
            style={{ ...inp, display: "block", marginTop: 6 }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={settings.allowCouponWithPoints}
            onChange={(e) => setSettings({ ...settings, allowCouponWithPoints: e.target.checked })}
          />
          {t("loyalty.allowCouponWithPoints")}
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <input
            type="checkbox"
            checked={settings.guestPhoneRequired}
            onChange={(e) => setSettings({ ...settings, guestPhoneRequired: e.target.checked })}
          />
          {t("loyalty.guestPhoneRequired")}
        </label>

        <button type="button" className="btn-touch" onClick={saveSettings} disabled={saving}>
          {saving ? t("common.loading") : t("common.save")}
        </button>
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>{t("loyalty.sectionCoupons")}</h2>
        <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
          <input
            placeholder={t("loyalty.couponCode")}
            value={couponForm.code}
            onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value })}
            style={inp}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <select
              value={couponForm.kind}
              onChange={(e) => setCouponForm({ ...couponForm, kind: e.target.value })}
              style={inp}
            >
              <option value="PERCENT">{t("loyalty.kindPercent")}</option>
              <option value="FIXED">{t("loyalty.kindFixed")}</option>
            </select>
            <input
              placeholder={t("loyalty.couponValue")}
              value={couponForm.value}
              onChange={(e) => setCouponForm({ ...couponForm, value: e.target.value })}
              style={inp}
            />
            <select
              value={couponForm.channel}
              onChange={(e) => setCouponForm({ ...couponForm, channel: e.target.value })}
              style={inp}
            >
              <option value="BOTH">{t("loyalty.chBoth")}</option>
              <option value="RETAIL">{t("loyalty.chRetail")}</option>
              <option value="WHOLESALE">{t("loyalty.chWholesale")}</option>
            </select>
          </div>
          <button type="button" className="btn-touch" onClick={addCoupon}>
            {t("loyalty.addCoupon")}
          </button>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "start" }}>
              <th>{t("loyalty.colCode")}</th>
              <th>{t("loyalty.colKind")}</th>
              <th>{t("loyalty.colValue")}</th>
              <th>{t("loyalty.colUses")}</th>
              <th>{t("loyalty.colActive")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "8px 4px" }}>{c.code}</td>
                <td>{c.kind}</td>
                <td>{String(c.value)}</td>
                <td>
                  {c.usesCount}
                  {c.maxUsesTotal != null ? ` / ${c.maxUsesTotal}` : ""}
                </td>
                <td>{c.active ? t("common.yes") : t("common.no")}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button type="button" className="btn-touch" onClick={() => toggleCoupon(c)}>
                    {c.active ? t("loyalty.deactivate") : t("loyalty.activate")}
                  </button>{" "}
                  <button type="button" className="btn-touch" onClick={() => removeCoupon(c)}>
                    {t("common.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>{t("loyalty.sectionLedger")}</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "start" }}>
              <th>{t("loyalty.colDate")}</th>
              <th>{t("loyalty.colCustomer")}</th>
              <th>{t("loyalty.colType")}</th>
              <th>{t("loyalty.colPoints")}</th>
              <th>{t("loyalty.colBalance")}</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "6px 4px" }}>
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td>{r.customer?.name || "—"}</td>
                <td>{r.type}</td>
                <td>{r.points > 0 ? `+${r.points}` : r.points}</td>
                <td>{r.balanceAfter}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
