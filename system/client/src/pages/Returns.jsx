import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api/client.js";
import { useOffline } from "../context/OfflineContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import {
  applyOfflineRefundToInventory,
  hydrateInventoryFromProducts,
  loadProductsForBranch,
  saveProductsForBranch,
} from "../offline/cache.js";
import { getOrCreateDeviceId, SYNC_TYPES } from "../offline/db.js";
import { enqueue } from "../offline/syncQueue.js";
import { useActiveBranchId } from "../context/BranchContext.jsx";

const inp = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};

export default function Returns() {
  const { t } = useI18n();
  const location = useLocation();
  const { refreshPending, online } = useOffline();
  const branchId = useActiveBranchId();
  const [products, setProducts] = useState([]);
  const [lines, setLines] = useState([{ productId: "", quantity: "1" }]);
  const [saleId, setSaleId] = useState("");
  const [note, setNote] = useState("");
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const st = location.state;
    if (!st || typeof st !== "object") return;
    if (st.saleId) setSaleId(String(st.saleId));
    if (st.note) setNote(String(st.note));
    if (Array.isArray(st.items) && st.items.length) {
      setLines(
        st.items.map((it) => ({
          productId: String(it.productId || ""),
          quantity: String(it.quantity || "1"),
        })),
      );
      setMsg(t("returns.prefilledFromSale"));
    }
  }, [location.state, t]);

  useEffect(() => {
    const bid = branchId;
    if (!bid) return;
    const q = new URLSearchParams();
    q.set("branchId", bid);
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    if (offline) {
      loadProductsForBranch(bid)
        .then(setProducts)
        .catch(() => setProducts([]));
      return;
    }
    api(`/api/products?${q.toString()}`)
      .then(async (rows) => {
        setProducts(rows);
        await saveProductsForBranch(bid, rows);
        await hydrateInventoryFromProducts(bid, rows);
      })
      .catch(async () => {
        const cached = await loadProductsForBranch(bid);
        setProducts(cached);
      });
  }, [branchId]);

  const loadRefunds = () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setList([]);
      return Promise.resolve();
    }
    const bid = branchId;
    const p = new URLSearchParams();
    if (bid) p.set("branchId", bid);
    return api(`/api/refunds?${p.toString()}`).then(setList);
  };

  useEffect(() => {
    loadRefunds().catch(() => setList([]));
  }, [branchId]);

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    const bid = branchId;
    if (!bid) {
      setMsg(t("returns.needBranch"));
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
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const cached = await loadProductsForBranch(bid);
        if (cached.length === 0) {
          setMsg(t("offline.needCache"));
          return;
        }
        const clientMutationId = crypto.randomUUID();
        const deviceId = await getOrCreateDeviceId();
        const body = {
          branchId: bid,
          saleId: saleId.trim() || undefined,
          note: note.trim() || undefined,
          items,
          clientMutationId,
          deviceId,
        };
        await enqueue(SYNC_TYPES.REFUND, clientMutationId, body);
        await applyOfflineRefundToInventory(bid, items);
        await refreshPending();
        setLines([{ productId: "", quantity: "1" }]);
        setSaleId("");
        setNote("");
        setMsg(t("offline.savedLocal"));
        return;
      }
      await api("/api/refunds", {
        method: "POST",
        body: {
          branchId: bid,
          saleId: saleId.trim() || undefined,
          note: note.trim() || undefined,
          items,
        },
      });
      setLines([{ productId: "", quantity: "1" }]);
      setSaleId("");
      setNote("");
      await loadRefunds();
      setMsg(t("returns.done"));
    } catch (x) {
      setMsg(x.message || t("returns.failed"));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ margin: 0 }}>{t("returns.title")}</h1>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>{t("returns.intro")}</p>

      <form className="card" onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <div className="page-form-grid">
          <label className="page-form-field">
            <span>{t("returns.saleIdOptional")}</span>
            <input value={saleId} onChange={(e) => setSaleId(e.target.value)} placeholder="cuid…" style={inp} />
          </label>
          <label className="page-form-field">
            <span>{t("returns.note")}</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={inp}
              placeholder={t("returns.noteHint")}
            />
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("returns.noteRequiredHint")}</span>
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
                  {p.name} {p.sku ? `(${p.sku})` : ""}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
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
        <button type="submit" className="btn-touch" style={{ background: "var(--accent)", color: "#fff", maxWidth: 280 }}>
          {t("returns.submit")}
        </button>
        {msg ? <div style={{ color: "var(--muted)" }}>{msg}</div> : null}
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        <strong>{t("returns.recent")}</strong>
        {!online ? (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)" }}>{t("returns.offlineListHint")}</p>
        ) : null}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginTop: 12 }}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "start" }}>
              <th style={th}>{t("returns.colDate")}</th>
              <th style={th}>{t("returns.colTotal")}</th>
              <th style={th}>{t("returns.colSale")}</th>
              <th style={th}>{t("returns.colItems")}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td style={td}>{new Date(r.createdAt).toLocaleString()}</td>
                <td style={td}>
                  {Number(r.total).toFixed(2)} {t("common.currency")}
                </td>
                <td style={td}>{r.saleId ? r.saleId.slice(0, 8) + "…" : "—"}</td>
                <td style={td}>
                  {r.items?.map((it) => `${it.product?.name || "?"} ×${it.quantity}`).join("، ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
const td = { padding: "8px 6px", borderBottom: "1px solid var(--border)" };
