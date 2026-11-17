import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";
import { productDisplayName } from "../utils/productName.js";

const inp = {
  padding: 10,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};

export default function Count() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const branchId = useActiveBranchId();
  const [products, setProducts] = useState([]);
  const [counts, setCounts] = useState({});
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const bid = branchId;
    if (!bid) return;
    const q = new URLSearchParams();
    q.set("branchId", bid);
    api(`/api/products?${q.toString()}`)
      .then((list) => {
        // One row per variant (stock is kept per variant), or per product when it has none.
        const rows = [];
        for (const p of Array.isArray(list) ? list : []) {
          const vs = Array.isArray(p.variants) ? p.variants : [];
          if (vs.length) {
            for (const v of vs) {
              const st = (v.stocks || []).find((row) => row.branchId === bid);
              rows.push({ key: `${p.id}::${v.id}`, productId: p.id, variantId: v.id, product: p, label: locale === "en" ? v.labelEn || v.label : v.label, qty: st?.quantity ?? 0 });
            }
          } else {
            rows.push({ key: p.id, productId: p.id, variantId: null, product: p, label: "", qty: p.inventories?.[0]?.quantity ?? 0 });
          }
        }
        setProducts(rows);
        const m = {};
        for (const r of rows) m[r.key] = String(r.qty);
        setCounts(m);
      })
      .catch(() => setProducts([]));
  }, [branchId]);

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    const bid = branchId;
    if (!bid) return;
    // Only counted rows that differ are sent; each becomes an ADJUSTMENT movement on the server.
    const lines = products
      .filter((r) => String(counts[r.key] ?? "") !== String(r.qty))
      .map((r) => ({
        productId: r.productId,
        ...(r.variantId ? { variantId: r.variantId } : {}),
        quantity: Math.max(0, parseInt(String(counts[r.key] ?? "0"), 10) || 0),
      }));
    if (!lines.length) {
      setMsg(t("count.done"));
      return;
    }
    try {
      await api("/api/inventory/reconcile", {
        method: "POST",
        body: { branchId: bid, lines, reason: "Stock count" },
      });
      setProducts((rows) => rows.map((r) => ({ ...r, qty: Number(counts[r.key] ?? r.qty) })));
      setMsg(t("count.done"));
    } catch (x) {
      setMsg(x.message || t("count.failed"));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("count.title")}</h1>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{t("count.intro")}</p>

      <form className="card" onSubmit={submit}>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("products.searchPlaceholder")}
          aria-label={t("products.searchPlaceholder")}
          style={{ ...inp, width: "100%", boxSizing: "border-box", marginBottom: 10 }}
        />
        <div style={{ overflowX: "auto", maxHeight: "60vh" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                <th style={th}>{t("invoice.colProduct")}</th>
                <th style={th}>{t("count.colQty")}</th>
              </tr>
            </thead>
            <tbody>
              {products.filter((p) => {
                const needle = filter.trim().toLowerCase();
                if (!needle) return true;
                const hay = [p.product?.name, p.product?.nameEn, p.product?.sku, p.product?.barcode, p.label].filter(Boolean).join(" ").toLowerCase();
                return hay.includes(needle);
              }).map((p) => (
                <tr key={p.key}>
                  <td style={td}>
                    {productDisplayName(p.product, locale)}
                    {p.label ? ` — ${p.label}` : ""}
                  </td>
                  <td style={td}>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      aria-label={`${productDisplayName(p.product, locale)}${p.label ? ` — ${p.label}` : ""}`}
                      value={counts[p.key] ?? "0"}
                      onChange={(e) => setCounts({ ...counts, [p.key]: e.target.value })}
                      style={{ ...inp, width: 100 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="submit" className="btn-touch" style={{ background: "var(--accent)", color: "#fff", marginTop: 12, maxWidth: 280 }}>
          {t("count.submit")}
        </button>
        {msg ? (
          <div style={{ marginTop: 8, color: "var(--muted)" }}>{msg}</div>
        ) : null}
      </form>
    </div>
  );
}

const th = { padding: 8, borderBottom: "1px solid var(--border)" };
const td = { padding: 8, borderBottom: "1px solid var(--border)" };
