import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";

function normalize(row) {
  const product = row.product || {};
  return {
    key: row.id || `${row.productId}-${row.variantId || ""}-${row.branchId}`,
    name: row.name || product.name || "",
    nameEn: row.nameEn || product.nameEn || "",
    variant: row.variantLabel || row.variant?.label || "",
    variantEn: row.variantLabelEn || row.variant?.labelEn || "",
    branch: row.branch || null,
    branchName: row.branchName || row.location || "",
    quantity: Number(row.quantity ?? 0),
    level: Number(row.lowStockLevel ?? row.minStockLevel ?? 0),
    weight: (row.sellBy || product.sellBy) === "WEIGHT",
  };
}

/**
 * Items at or below their low-stock level (FR-81). Uses the list from the dashboard summary when
 * the server sends one, otherwise the inventory low-stock list.
 */
export function LowStockList({ items, branchId }) {
  const { t, locale } = useI18n();
  const [fetched, setFetched] = useState(null);
  const provided = Array.isArray(items) ? items : null;
  useEffect(() => {
    if (provided) return;
    const q = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
    api(`/api/inventory/low-stock${q}`)
      .then((rows) => setFetched(Array.isArray(rows) ? rows : rows?.items || []))
      .catch(() => setFetched([]));
  }, [provided, branchId]);
  const rows = (provided || fetched || []).map(normalize);
  if (!provided && fetched == null) return null;
  return (
    <section className="dash-shell-card fd-lowstock" aria-labelledby="fd-lowstock-title">
      <div className="dash-strip-head">
        <h3 id="fd-lowstock-title">{t("dashboard.lowStock")} ({rows.length})</h3>
        <Link to="/products" className="dash-link-all">{t("dashboard.viewAll")}</Link>
      </div>
      {!rows.length ? (
        <div className="dash-empty">{t("fd.lowStockNone")}</div>
      ) : (
        <ul className="fd-lowstock__list">
          {rows.slice(0, 12).map((row) => {
            const name = locale === "en" ? row.nameEn || row.name : row.name || row.nameEn;
            const variant = locale === "en" ? row.variantEn || row.variant : row.variant || row.variantEn;
            const where = row.branch ? branchDisplayName(row.branch, locale) : row.branchName;
            const qty = row.weight ? `${(row.quantity / 1000).toFixed(2)} ${t("fd.cart.kg")}` : row.quantity;
            const level = row.weight ? `${(row.level / 1000).toFixed(2)} ${t("fd.cart.kg")}` : row.level;
            return (
              <li key={row.key}>
                <span>{name}{variant ? ` · ${variant}` : ""}{where ? <small> — {where}</small> : null}</span>
                <strong>{t("fd.lowStockQty", { qty, level })}</strong>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
