import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";

const inp = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};

export default function Transfer() {
  const { t, locale } = useI18n();
  const { can } = useAuth();
  const [branches, setBranches] = useState([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [products, setProducts] = useState([]);
  const [lines, setLines] = useState([{ productId: "", quantity: "1" }]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const canSubmit = can("transfer");

  useEffect(() => {
    api("/api/branches")
      .then((bs) => {
        setBranches(bs);
        if (bs[0]) {
          setFromId(bs[0].id);
          if (bs[1]) setToId(bs[1].id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!fromId) return;
    const q = new URLSearchParams();
    q.set("branchId", fromId);
    api(`/api/products?${q.toString()}`)
      .then(setProducts)
      .catch(() => setProducts([]));
  }, [fromId]);

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    if (!fromId || !toId || fromId === toId) {
      setMsg(t("transfer.invalid"));
      return;
    }
    const items = lines
      .filter((l) => l.productId)
      .map((l) => ({
        productId: l.productId,
        quantity: Math.max(1, parseInt(String(l.quantity), 10) || 1),
      }));
    if (!items.length) {
      setMsg(t("returns.needLines"));
      return;
    }
    setBusy(true);
    try {
      await api("/api/inventory/transfer", {
        method: "POST",
        body: { fromBranchId: fromId, toBranchId: toId, items },
      });
      setLines([{ productId: "", quantity: "1" }]);
      setMsg(t("transfer.done"));
    } catch (x) {
      setMsg(x.message || t("transfer.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("transfer.title")}</h1>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{t("transfer.intro")}</p>

      <form className="card" onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("transfer.from")}</span>
            <select value={fromId} onChange={(e) => setFromId(e.target.value)} style={{ ...inp, minHeight: 44 }}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {branchDisplayName(b, locale)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("transfer.to")}</span>
            <select value={toId} onChange={(e) => setToId(e.target.value)} style={{ ...inp, minHeight: 44 }}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {branchDisplayName(b, locale)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <strong>{t("returns.lines")}</strong>
        {lines.map((line, i) => (
          <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <select
              value={line.productId}
              onChange={(e) => {
                const next = [...lines];
                next[i] = { ...next[i], productId: e.target.value };
                setLines(next);
              }}
              style={{ ...inp, flex: 1, minWidth: 200, minHeight: 44 }}
            >
              <option value="">{t("returns.pickProduct")}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({t("productCard.stock")} {p.inventories?.[0]?.quantity ?? 0})
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              placeholder={t("invoice.colQty")}
              value={line.quantity}
              onChange={(e) => {
                const next = [...lines];
                next[i] = { ...next[i], quantity: e.target.value };
                setLines(next);
              }}
              style={{ ...inp, width: 100, minHeight: 44 }}
            />
            <button
              type="button"
              className="btn-touch"
              onClick={() => setLines(lines.filter((_, j) => j !== i))}
              disabled={lines.length < 2}
            >
              {t("returns.removeLine")}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn-touch"
          onClick={() => setLines([...lines, { productId: "", quantity: "1" }])}
          style={{ background: "var(--surface2)", maxWidth: 200 }}
        >
          {t("returns.addLine")}
        </button>
        {canSubmit ? (
          <button
            type="submit"
            className="btn-touch"
            disabled={busy}
            style={{ background: "var(--accent)", color: "#fff", maxWidth: 280 }}
          >
            {busy ? t("common.loading") : t("transfer.submit")}
          </button>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{t("transfer.noPermission")}</p>
        )}
        {msg ? <div style={{ color: "var(--muted)" }}>{msg}</div> : null}
      </form>
    </div>
  );
}
