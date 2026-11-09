import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";

export default function Audit() {
  const { t } = useI18n();
  const branchId = useActiveBranchId();
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setMsg("");
    setLoading(true);
    try {
      const p = new URLSearchParams();
      p.set("limit", "150");
      if (branchId) p.set("branchId", branchId);
      const data = await api(`/api/audit-logs?${p.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setRows([]);
      setMsg(e.message || t("audit.loadError"));
    } finally {
      setLoading(false);
    }
  }, [branchId, t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("audit.title")}</h1>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{t("audit.intro")}</p>

      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <button type="button" className="btn-touch" onClick={() => load()} style={{ background: "var(--surface2)" }}>
          {t("pos.refresh")}
        </button>
      </div>

      {msg ? <p style={{ color: "var(--danger)", margin: 0 }}>{msg}</p> : null}

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="audit-table">
          <thead>
            <tr>
              <th>{t("returns.colDate")}</th>
              <th>{t("audit.action")}</th>
              <th>{t("audit.user")}</th>
              <th>{t("audit.summary")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="audit-table__empty">
                  {t("common.loading")}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="audit-table__empty">
                  {msg ? "—" : t("audit.empty") || "—"}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="audit-table__date">{new Date(r.createdAt).toLocaleString()}</td>
                  <td>
                    <code className="audit-table__action">{r.action}</code>
                  </td>
                  <td>{r.user?.name || r.user?.email || "—"}</td>
                  <td>{r.summary || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
