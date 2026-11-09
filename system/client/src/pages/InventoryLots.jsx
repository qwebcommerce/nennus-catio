import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";
import { productDisplayName } from "../utils/productName.js";
import { EmptyState } from "../components/EmptyState.jsx";

const inp = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};

export default function InventoryLots() {
  const { t, locale } = useI18n();
  const branchId = useActiveBranchId();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [inStock, setInStock] = useState(true);
  const [withinDays, setWithinDays] = useState("");
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    setMsg("");
    try {
      const qs = new URLSearchParams();
      if (branchId) qs.set("branchId", branchId);
      if (search) qs.set("q", search);
      qs.set("inStock", inStock ? "1" : "0");
      if (withinDays !== "" && Number.isFinite(Number(withinDays))) {
        qs.set("withinDays", String(Math.max(0, Math.floor(Number(withinDays)))));
      }
      const res = await api(`/api/inventory/lots?${qs.toString()}`);
      setLots(Array.isArray(res?.lots) ? res.lots : []);
      if (!(res?.lots || []).length) setMsg(t("lotsBrowser.empty"));
    } catch (e) {
      setLots([]);
      setMsg(e.message || t("lotsBrowser.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on branch/filters
  }, [branchId, search, inStock, withinDays]);

  const loc = locale === "en" ? "en-US" : "ar-SA";

  const rows = useMemo(() => lots, [lots]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0 }}>{t("lotsBrowser.title")}</h1>
        <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>{t("lotsBrowser.intro")}</p>
      </div>

      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
        <label style={{ display: "grid", gap: 4, flex: "1 1 180px" }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("sales.search")}</span>
          <input
            style={inp}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setSearch(q.trim());
            }}
            placeholder={t("lotsBrowser.searchPlaceholder")}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("lotsBrowser.withinDays")}</span>
          <input
            style={{ ...inp, width: 100 }}
            type="number"
            min={0}
            max={365}
            value={withinDays}
            onChange={(e) => setWithinDays(e.target.value)}
            placeholder="—"
          />
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", paddingBottom: 10 }}>
          <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} />
          <span style={{ fontSize: 14 }}>{t("lotsBrowser.inStockOnly")}</span>
        </label>
        <button
          type="button"
          className="btn-touch"
          style={{ background: "var(--accent)", color: "#fff" }}
          onClick={() => setSearch(q.trim())}
          disabled={loading}
        >
          {loading ? t("common.loading") : t("sales.search")}
        </button>
      </div>

      {loading ? (
        <div style={{ color: "var(--muted)" }}>{t("common.loading")}</div>
      ) : !rows.length ? (
        <EmptyState title={msg || t("lotsBrowser.empty")} />
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                <th style={th}>{t("lotsBrowser.colProduct")}</th>
                <th style={th}>{t("lotsBrowser.colBranch")}</th>
                <th style={th}>{t("lotsBrowser.colQty")}</th>
                <th style={th}>{t("lotsBrowser.colExpiry")}</th>
                <th style={th}>{t("lotsBrowser.colDays")}</th>
                <th style={th}>{t("lotsBrowser.colReceived")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((lot) => {
                const days = lot.daysUntilExpiry;
                const urgent = days != null && days <= 7;
                const expired = days != null && days < 0;
                return (
                  <tr key={lot.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>
                        {productDisplayName(lot.product, locale)}
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: 12 }}>
                        {lot.product?.sku || lot.product?.barcode || "—"}
                      </div>
                    </td>
                    <td style={td}>
                      {locale === "en" && lot.branch?.nameEn
                        ? lot.branch.nameEn
                        : lot.branch?.name || "—"}
                    </td>
                    <td style={td}>{lot.quantityOnHand}</td>
                    <td style={td}>
                      {lot.expiryDate
                        ? new Date(lot.expiryDate).toLocaleDateString(loc)
                        : "—"}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontWeight: urgent || expired ? 700 : 400,
                        color: expired
                          ? "var(--danger, #c62828)"
                          : urgent
                            ? "var(--warning, #b45309)"
                            : undefined,
                      }}
                    >
                      {days == null ? "—" : days}
                    </td>
                    <td style={td}>
                      {lot.receivedAt
                        ? new Date(lot.receivedAt).toLocaleDateString(loc)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
const td = { padding: "8px 6px", verticalAlign: "top" };
