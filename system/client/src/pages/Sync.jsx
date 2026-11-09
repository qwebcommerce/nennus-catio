import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import {
  getStoredSyncApiKey,
  setStoredSyncApiKey,
  clearStoredSyncApiKey,
} from "../lib/syncApiKeySession.js";
import { useI18n } from "../context/LanguageContext.jsx";

export default function Sync() {
  const { t, locale } = useI18n();
  const [settings, setSettings] = useState(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [inventoryWebhookUrl, setInventoryWebhookUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [skippedPreview, setSkippedPreview] = useState([]);
  const [skippedCopyHint, setSkippedCopyHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedKey, setGeneratedKey] = useState("");
  const [copyHint, setCopyHint] = useState("");

  const loc = locale === "en" ? "en-US" : "ar-SA";

  const applyCachedApiKeyToFields = () => {
    const cached = getStoredSyncApiKey();
    if (cached) {
      setApiKey(cached);
      setGeneratedKey(cached);
    } else {
      setApiKey("");
      setGeneratedKey("");
    }
  };

  const load = async () => {
    const s = await api("/api/sync/settings");
    setSettings(s);
    setBaseUrl(s.websiteBaseUrl || "");
    setInventoryWebhookUrl(s.inventoryWebhookUrl || "");
    applyCachedApiKeyToFields();
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const generateApiKey = async () => {
    if (!confirm(t("sync.generateApiKeyConfirm"))) return;
    setLoading(true);
    setMsg("");
    setCopyHint("");
    try {
      const r = await api("/api/sync/generate-api-key", { method: "POST" });
      const plain = r.apiKey || "";
      setStoredSyncApiKey(plain);
      setGeneratedKey(plain);
      setApiKey(plain);
      setSettings((prev) =>
        prev ? { ...prev, apiKeySet: true } : { apiKeySet: true }
      );
      setMsg("");
    } catch (x) {
      setMsg(x.message || t("sync.saveFailed"));
      setGeneratedKey("");
    } finally {
      setLoading(false);
    }
  };

  const copyGeneratedKey = async () => {
    const text = generatedKey || apiKey;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint(t("sync.copied"));
      setTimeout(() => setCopyHint(""), 2000);
    } catch {
      setCopyHint("");
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      const body = {
        websiteBaseUrl: baseUrl,
        inventoryWebhookUrl: inventoryWebhookUrl.trim() || null,
      };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      const s = await api("/api/sync/settings", { method: "PUT", body });
      setSettings(s);
      if (body.apiKey) setStoredSyncApiKey(body.apiKey);
      applyCachedApiKeyToFields();
      setMsg(t("sync.saved"));
    } catch (x) {
      setMsg(x.message || t("sync.saveFailed"));
    } finally {
      setLoading(false);
    }
  };

  const syncProducts = async () => {
    setLoading(true);
    setMsg("");
    setSkippedPreview([]);
    try {
      const r = await api("/api/sync/products", { method: "POST" });
      setSkippedPreview(Array.isArray(r.skippedItems) ? r.skippedItems : []);
      setMsg(
        t("sync.msgProducts", {
          n: r.upserted,
          s: r.skipped ?? 0,
          at: r.at,
        })
      );
      await load();
    } catch (x) {
      setMsg(x.message || t("sync.syncFailed"));
      setSkippedPreview([]);
    } finally {
      setLoading(false);
    }
  };

  const syncOrders = async () => {
    setLoading(true);
    setMsg("");
    try {
      const r = await api("/api/sync/orders", { method: "POST" });
      setMsg(`${r.message} — ${r.at}`);
      await load();
    } catch (x) {
      setMsg(x.message || t("sync.syncFailed"));
    } finally {
      setLoading(false);
    }
  };

  const fmt = (d) => (d ? new Date(d).toLocaleString(loc) : t("sync.never"));

  const syncEzoo = async () => {
    setLoading(true);
    setMsg("");
    try {
      const r = await api("/api/sync/ezoo-products", { method: "POST" });
      setMsg(
        t("sync.msgEzoo", {
          n: r.upserted,
          t: r.totalRemote ?? r.upserted,
          at: new Date(r.at).toLocaleString(loc),
        })
      );
      await load();
    } catch (x) {
      setMsg(x.message || t("sync.syncFailed"));
    } finally {
      setLoading(false);
    }
  };

  const syncSupabase = async () => {
    setLoading(true);
    setMsg("");
    try {
      const r = await api("/api/sync/supabase", { method: "POST" });
      setMsg(
        t("sync.msgSupabase", {
          b: r.brands,
          c: r.categories,
          p: r.products,
          i: r.inventory,
          s: r.inventorySkipped ?? 0,
          at: new Date(r.at).toLocaleString(loc),
        })
      );
      await load();
    } catch (x) {
      setMsg(x.message || t("sync.syncFailed"));
    } finally {
      setLoading(false);
    }
  };

  const msgIsError = (m) =>
    m &&
    (m.includes("فشل") ||
      m.toLowerCase().includes("fail") ||
      m.toLowerCase().includes("error"));

  const copySkippedAsJson = async () => {
    if (!skippedPreview.length) return;
    try {
      const text = JSON.stringify(skippedPreview, null, 2);
      await navigator.clipboard.writeText(text);
      setSkippedCopyHint(t("sync.copiedJson"));
      setTimeout(() => setSkippedCopyHint(""), 2000);
    } catch {
      setSkippedCopyHint("");
    }
  };

  const copySkippedAsCsv = async () => {
    if (!skippedPreview.length) return;
    const escapeCsv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["externalId", "barcode", "sku", "reason"];
    const rows = skippedPreview.map((it) => [
      it.externalId ?? "",
      it.barcode ?? "",
      it.sku ?? "",
      it.reason ?? "",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");
    try {
      await navigator.clipboard.writeText(csv);
      setSkippedCopyHint(t("sync.copiedCsv"));
      setTimeout(() => setSkippedCopyHint(""), 2000);
    } catch {
      setSkippedCopyHint("");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
      <h1 style={{ margin: 0 }}>{t("sync.title")}</h1>
      <p style={{ color: "var(--muted)", margin: 0 }}>
        {t("sync.intro")}{" "}
        <code style={{ color: "var(--accent)" }}>/api/products</code> {locale === "ar" ? "و" : "&"}{" "}
        <code style={{ color: "var(--accent)" }}>/api/orders/pending</code> {t("sync.introEnd")}
      </p>

      <form className="card" onSubmit={save}>
        <div className="page-form-grid" style={{ marginBottom: 12 }}>
          <label className="page-form-field">
            <span>{t("sync.baseUrl")}</span>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://example.com"
              style={inp}
            />
          </label>
          <label className="page-form-field">
            <span>{t("sync.apiKey")}</span>
            <span style={{ fontSize: 12 }}>{t("sync.apiKeySessionHint")}</span>
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type="password"
              placeholder={settings?.apiKeySet && !apiKey ? "••••••••" : ""}
              autoComplete="off"
              style={inp}
            />
          </label>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 8 }}>
            <button
              type="button"
              disabled={loading}
              className="btn-touch"
              onClick={generateApiKey}
              style={{ background: "var(--surface2)", color: "var(--text)" }}
            >
              {t("sync.generateApiKey")}
            </button>
          </div>
          {apiKey || generatedKey ? (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("sync.generateApiKeyDone")}</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "stretch" }}>
                <input readOnly value={generatedKey || apiKey} style={{ ...inp, flex: "1 1 240px", fontFamily: "monospace", fontSize: 13 }} />
                <button
                  type="button"
                  className="btn-touch"
                  onClick={copyGeneratedKey}
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  {copyHint || t("sync.copyApiKey")}
                </button>
              </div>
            </div>
          ) : null}
          {apiKey || generatedKey ? (
            <button
              type="button"
              className="btn-touch"
              onClick={() => {
                clearStoredSyncApiKey();
                setApiKey("");
                setGeneratedKey("");
              }}
              style={{ marginTop: 8, background: "transparent", color: "var(--muted)", fontSize: 13 }}
            >
              {t("sync.clearApiKeySession")}
            </button>
          ) : null}
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          <span>{t("sync.inventoryWebhookUrl")}</span>
          <input
            value={inventoryWebhookUrl}
            onChange={(e) => setInventoryWebhookUrl(e.target.value)}
            placeholder="https://your-site.com/api/pos/inventory-webhook"
            style={inp}
          />
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("sync.inventoryWebhookHint")}</span>
        </label>
        {settings ? (
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
            <div>
              {t("sync.lastProducts")} {fmt(settings.lastProductSyncAt)}
            </div>
            <div>
              {t("sync.lastOrders")} {fmt(settings.lastOrderSyncAt)}
            </div>
            <div>
              {t("sync.lastSupabase")} {fmt(settings.lastSupabaseSyncAt)}
            </div>
          </div>
        ) : null}
        {msg ? (
          <div style={{ marginBottom: 12, color: msgIsError(msg) ? "var(--danger)" : "var(--success)" }}>{msg}</div>
        ) : null}
        <button type="submit" disabled={loading} className="btn-touch" style={{ background: "var(--accent)", color: "#fff" }}>
          {t("sync.saveSettings")}
        </button>
      </form>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <strong>{t("sync.ezooTitle")}</strong>
        <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>{t("sync.ezooIntro")}</p>
        <button
          type="button"
          disabled={loading}
          className="btn-touch"
          style={{ background: "var(--accent2)", color: "#fff", maxWidth: 320 }}
          onClick={syncEzoo}
        >
          {t("sync.btnEzoo")}
        </button>
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <strong>{t("sync.supabaseTitle")}</strong>
        <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>{t("sync.supabaseIntro")}</p>
        <button
          type="button"
          disabled={loading}
          className="btn-touch"
          style={{ background: "var(--accent)", color: "#fff", maxWidth: 320 }}
          onClick={syncSupabase}
        >
          {t("sync.btnSupabase")}
        </button>
      </div>

      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <button type="button" disabled={loading} className="btn-touch" style={{ background: "var(--surface2)" }} onClick={syncProducts}>
          {t("sync.btnProducts")}
        </button>
        <button type="button" disabled={loading} className="btn-touch" style={{ background: "var(--surface2)" }} onClick={syncOrders}>
          {t("sync.btnOrders")}
        </button>
      </div>

      {skippedPreview.length ? (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <strong>
            {t("sync.skippedTitle", { n: String(skippedPreview.length) })}
          </strong>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-touch"
              onClick={copySkippedAsJson}
              style={{ background: "var(--surface2)", color: "var(--text)" }}
            >
              {t("sync.copySkippedJson")}
            </button>
            <button
              type="button"
              className="btn-touch"
              onClick={copySkippedAsCsv}
              style={{ background: "var(--surface2)", color: "var(--text)" }}
            >
              {t("sync.copySkippedCsv")}
            </button>
            {skippedCopyHint ? (
              <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>
                {skippedCopyHint}
              </span>
            ) : null}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                  <th style={th}>{t("sync.colExternalId")}</th>
                  <th style={th}>{t("sync.colBarcode")}</th>
                  <th style={th}>{t("sync.colSku")}</th>
                  <th style={th}>{t("sync.colReason")}</th>
                </tr>
              </thead>
              <tbody>
                {skippedPreview.map((it, idx) => (
                  <tr key={`${it.externalId || "noid"}-${idx}`}>
                    <td style={td}>{it.externalId || "—"}</td>
                    <td style={td}>{it.barcode || "—"}</td>
                    <td style={td}>{it.sku || "—"}</td>
                    <td style={td}>
                      {it.reason === "duplicate_unique_field"
                        ? t("sync.reasonDuplicate")
                        : String(it.reason || "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const inp = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};
const th = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
const td = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
