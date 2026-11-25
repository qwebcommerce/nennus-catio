import React, { useRef, useState } from "react";
import { api, resolveApiErrorMessage } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";

export function money(n) {
  return Number(n || 0).toFixed(2);
}

/** Methods that need a proof file (bank transfer). */
export function proofNeeded(method) {
  return method === "BANK_TRANSFER" || method === "BANK";
}

/**
 * Proof of payment: a picture or PDF uploaded to /api/files; calls onChange(fileId | "").
 * Required for bank transfers (the server refuses the payment without it).
 */
export function ProofUpload({ value, onChange, required = false, label }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const ref = useRef(null);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    setErr("");
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErr(t("so.fileTooLarge"));
      e.target.value = "";
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const saved = await api("/api/files", { method: "POST", body: fd });
      setName(saved.fileName);
      onChange(saved.id);
    } catch (ex) {
      setErr(ex.message);
      onChange("");
      if (ref.current) ref.current.value = "";
    } finally {
      setBusy(false);
    }
  };
  return (
    <label className="biz-proof">
      <span>
        {label || t("so.proof")}
        {required ? <b className="biz-req"> *</b> : <span className="fd-muted"> ({t("so.optional")})</span>}
      </span>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={pick} aria-label={label || t("so.proof")} />
      {busy ? <small>{t("so.uploading")}</small> : value && name ? <small>✓ {name}</small> : null}
      {err ? <small className="biz-err" role="alert">{err}</small> : null}
    </label>
  );
}

/** Opens a private file through its short signed link (permission checked on the server). */
export function FileLink({ file, label }) {
  const { t } = useI18n();
  const [err, setErr] = useState("");
  if (!file?.id) return null;
  const open = async () => {
    setErr("");
    try {
      const link = await api(`/api/files/${file.id}/link`);
      window.open(link.url, "_blank", "noopener");
    } catch (e) {
      setErr(e.message);
    }
  };
  return (
    <span className="biz-file">
      <button type="button" className="fd-linkish" onClick={open} title={file.fileName}>
        📎 {label || file.fileName || t("so.viewFile")}
      </button>
      {err ? <small className="biz-err">{err}</small> : null}
    </span>
  );
}

/** Simple tab bar (buttons with aria-selected). */
export function PageTabs({ tabs, value, onChange }) {
  return (
    <div className="biz-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          className={`biz-tab${value === tab.id ? " biz-tab--on" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Downloads /api/exports/:name in the given format and UI language. Returns an error message or "". */
export async function downloadExport(name, format, locale, query = "") {
  const lang = locale === "en" ? "en" : "ar";
  const res = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/exports/${name}?format=${format}&lang=${lang}${query ? `&${query}` : ""}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return resolveApiErrorMessage(data, "Download failed");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}-${lang}.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "";
}
