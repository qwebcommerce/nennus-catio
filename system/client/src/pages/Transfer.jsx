import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { branchDisplayName } from "../utils/displayLabels.js";
import { formatDateTime, qatarYmd } from "../utils/qatarDate.js";
import StockLineEditor, { baseQuantity, productName, unitLabel, variantName } from "../components/StockLineEditor.jsx";

export function personName(p, locale) {
  if (!p) return "—";
  return locale === "en" ? p.nameEn || p.name : p.name || p.nameEn;
}

/** "Transfer" and "Transfer history" tabs (same sidebar entry). */
export function TransferTabs() {
  const { t } = useI18n();
  const { can, canModule } = useAuth();
  return (
    <nav className="vr-tabs" aria-label={t("transfer.title")}>
      {can("transfer") ? (
        <NavLink end to="/transfer" className={({ isActive }) => `vr-tab${isActive ? " vr-tab--on" : ""}`}>
          {t("transfer.tabTransfer")}
        </NavLink>
      ) : null}
      {canModule("warehouses", "view") ? (
        <NavLink to="/transfer/history" className={({ isActive }) => `vr-tab${isActive ? " vr-tab--on" : ""}`}>
          {t("transfer.tabHistory")}
        </NavLink>
      ) : null}
    </nav>
  );
}

function stockText(product, variant, t) {
  if (!product) return "";
  const q = variant ? variant.stocks?.[0]?.quantity ?? 0 : product.variants?.length ? product.variants.reduce((a, v) => a + (v.stocks?.[0]?.quantity ?? 0), 0) : product.inventories?.[0]?.quantity ?? 0;
  return product.sellBy === "WEIGHT" ? `${(q / 1000).toFixed(3).replace(/\.?0+$/, "") || 0} ${t("stockUnit.kg")}` : String(q);
}

export default function Transfer() {
  const { t, locale } = useI18n();
  const { can, user } = useAuth();
  const [branches, setBranches] = useState([]);
  const [options, setOptions] = useState({ staff: [], vehicles: [] });
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [products, setProducts] = useState([]);
  const [lines, setLines] = useState([]);
  const [transferredBy, setTransferredBy] = useState("");
  const [authorisedBy, setAuthorisedBy] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [vehicleTouched, setVehicleTouched] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const canSubmit = can("transfer");

  useEffect(() => {
    api("/api/branches")
      .then((bs) => {
        const active = (bs || []).filter((b) => b.isActive !== false);
        setBranches(active);
        const own = active.find((b) => b.id === user?.branchId);
        const first = user?.role !== "ADMIN" && own ? own : active[0];
        if (first) {
          setFromId(first.id);
          const other = active.find((b) => b.id !== first.id);
          if (other) setToId(other.id);
        }
      })
      .catch((e) => setError(e.message));
    api("/api/transfers/options").then(setOptions).catch(() => {});
  }, [user?.branchId, user?.role]);

  useEffect(() => {
    if (user?.id && !transferredBy) setTransferredBy(user.id);
  }, [user?.id, transferredBy]);

  const loadProducts = useCallback((branchId) => {
    api(`/api/products?branchId=${encodeURIComponent(branchId)}`)
      .then((rows) => setProducts((rows || []).filter((p) => p.takesStock !== false)))
      .catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    if (fromId) loadProducts(fromId);
  }, [fromId, loadProducts]);

  // Vehicle defaults to the van's vehicle when one end is a van (until changed by hand).
  useEffect(() => {
    if (vehicleTouched) return;
    const kindOf = (id) => branches.find((b) => b.id === id)?.kind;
    const vanEnd = kindOf(toId) === "VAN" ? toId : kindOf(fromId) === "VAN" ? fromId : "";
    const v = vanEnd ? options.vehicles.find((x) => x.branchId === vanEnd && x.isActive !== false) : null;
    setVehicleId(v?.id || "");
  }, [fromId, toId, branches, options.vehicles, vehicleTouched]);

  const remoteLookup = useCallback(async (code) => {
    const hit = await api(`/api/transfers/lookup?code=${encodeURIComponent(code)}`);
    return hit ? { productId: hit.productId, variantId: hit.variantId } : null;
  }, []);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setDone(null);
    if (!fromId || !toId || fromId === toId) {
      setError(t("transfer.invalid"));
      return;
    }
    const items = [];
    for (const l of lines) {
      const p = byId.get(l.productId);
      const v = (p?.variants || []).find((x) => x.id === l.variantId) || null;
      if (p?.variants?.length && !v) {
        setError(t("transfer.pickVariant", { name: productName(p, locale) }));
        return;
      }
      if (baseQuantity(l, p, v) == null) {
        setError(t("transfer.badQty", { name: productName(p, locale) }));
        return;
      }
      items.push({ productId: l.productId, variantId: l.variantId || null, unit: l.unit, quantity: String(l.quantity).replace(",", ".") });
    }
    if (!items.length) {
      setError(t("returns.needLines"));
      return;
    }
    setBusy(true);
    try {
      const res = await api("/api/inventory/transfer", {
        method: "POST",
        body: {
          fromBranchId: fromId,
          toBranchId: toId,
          items,
          transferredByUserId: transferredBy || undefined,
          authorisedByUserId: authorisedBy || null,
          vehicleId: vehicleId || null,
          note,
        },
      });
      setLines([]);
      setNote("");
      setAuthorisedBy("");
      setDone(res);
      loadProducts(fromId);
    } catch (x) {
      setError(x.message || t("transfer.failed"));
    } finally {
      setBusy(false);
    }
  };

  const staffOption = (s) => <option key={s.id} value={s.id}>{personName(s, locale)}</option>;

  return (
    <div className="vr-page">
      <h1>{t("transfer.title")}</h1>
      <TransferTabs />
      {error ? <div role="alert" className="vr-alert" data-testid="page-error">{error}</div> : null}
      {done ? (
        <div role="status" className="vr-ok" data-testid="transfer-done">
          {t("transfer.savedAs", { reference: done.reference })}{" "}
          <Link to={`/transfer/history/${done.id}`}>{t("transfer.open")}</Link>
        </div>
      ) : null}
      <p className="vr-muted">{t("transfer.intro")}</p>

      <form className="card vr-card" onSubmit={submit}>
        <div className="vr-grid">
          <label className="vr-field">
            <span>{t("transfer.from")}</span>
            <select value={fromId} onChange={(e) => { setFromId(e.target.value); setLines([]); }} data-testid="from">
              {branches.map((b) => <option key={b.id} value={b.id}>{branchDisplayName(b, locale)}</option>)}
            </select>
          </label>
          <label className="vr-field">
            <span>{t("transfer.to")}</span>
            <select value={toId} onChange={(e) => setToId(e.target.value)} data-testid="to">
              {branches.map((b) => <option key={b.id} value={b.id}>{branchDisplayName(b, locale)}</option>)}
            </select>
          </label>
          <label className="vr-field">
            <span>{t("transfer.transferredBy")}</span>
            <select value={transferredBy} onChange={(e) => setTransferredBy(e.target.value)} data-testid="transferred-by">
              {options.staff.map(staffOption)}
            </select>
          </label>
          <label className="vr-field">
            <span>{t("transfer.authorisedBy")}</span>
            <select value={authorisedBy} onChange={(e) => setAuthorisedBy(e.target.value)} data-testid="authorised-by">
              <option value="">{t("transfer.nobody")}</option>
              {options.staff.map(staffOption)}
            </select>
          </label>
          <label className="vr-field">
            <span>{t("transfer.vehicle")}</span>
            <select value={vehicleId} onChange={(e) => { setVehicleTouched(true); setVehicleId(e.target.value); }} data-testid="vehicle">
              <option value="">{t("transfer.noVehicle")}</option>
              {options.vehicles.filter((v) => v.isActive !== false || v.id === vehicleId).map((v) => (
                <option key={v.id} value={v.id}>{v.name} · {v.plate}</option>
              ))}
            </select>
          </label>
          <label className="vr-field">
            <span>{t("transfer.note")}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </label>
        </div>

        <strong>{t("returns.lines")}</strong>
        <StockLineEditor
          products={products}
          lines={lines}
          setLines={setLines}
          t={t}
          locale={locale}
          remoteLookup={remoteLookup}
          onMessage={setInfo}
          stockOf={(p, v) => stockText(p, v, t)}
        />
        {info ? <div className="vr-muted" role="status" data-testid="scan-msg">{info}</div> : null}

        {canSubmit ? (
          <button type="submit" className="btn-touch vr-btn vr-btn--primary" disabled={busy} data-testid="submit-transfer">
            {busy ? t("common.loading") : t("transfer.submit")}
          </button>
        ) : (
          <p className="vr-muted">{t("transfer.noPermission")}</p>
        )}
      </form>
    </div>
  );
}

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

const FILTER_KEYS = ["from", "to", "fromBranchId", "toBranchId", "vehicleId", "staffId", "productId"];

/** Transfer history with filters; each row opens the transfer. */
export function TransferHistory() {
  const { t, locale } = useI18n();
  const query = useQuery();
  const navigate = useNavigate();
  const [branches, setBranches] = useState([]);
  const [options, setOptions] = useState({ staff: [], vehicles: [] });
  const [products, setProducts] = useState([]);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const filterKey = FILTER_KEYS.map((k) => query.get(k) || "").join("|");
  const filters = useMemo(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, query.get(k) || ""])), [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api("/api/branches").then(setBranches).catch(() => {});
    api("/api/transfers/options").then(setOptions).catch(() => {});
    api("/api/products").then((r) => setProducts(r || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const q = new URLSearchParams();
    for (const k of FILTER_KEYS) if (filters[k]) q.set(k, filters[k]);
    setError("");
    api(`/api/transfers?${q.toString()}`)
      .then((r) => setRows(r.rows || []))
      .catch((e) => { setRows([]); setError(e.message); });
  }, [filters]);

  const setFilter = (key, value) => {
    const q = new URLSearchParams(query);
    if (value) q.set(key, value);
    else q.delete(key);
    const s = q.toString();
    navigate(`/transfer/history${s ? `?${s}` : ""}`, { replace: true });
  };

  return (
    <div className="vr-page">
      <h1>{t("transfer.title")}</h1>
      <TransferTabs />
      {error ? <div role="alert" className="vr-alert">{error}</div> : null}
      <div className="card vr-card">
        <div className="vr-grid vr-filters">
          <label className="vr-field"><span>{t("fd.from")}</span><input type="date" value={filters.from} max={filters.to || qatarYmd()} onChange={(e) => setFilter("from", e.target.value)} data-testid="f-from" /></label>
          <label className="vr-field"><span>{t("fd.to")}</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilter("to", e.target.value)} data-testid="f-to" /></label>
          <label className="vr-field">
            <span>{t("transfer.from")}</span>
            <select value={filters.fromBranchId} onChange={(e) => setFilter("fromBranchId", e.target.value)} data-testid="f-fromBranch">
              <option value="">{t("fd.allLocations")}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{branchDisplayName(b, locale)}</option>)}
            </select>
          </label>
          <label className="vr-field">
            <span>{t("transfer.to")}</span>
            <select value={filters.toBranchId} onChange={(e) => setFilter("toBranchId", e.target.value)} data-testid="f-toBranch">
              <option value="">{t("fd.allLocations")}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{branchDisplayName(b, locale)}</option>)}
            </select>
          </label>
          <label className="vr-field">
            <span>{t("transfer.vehicle")}</span>
            <select value={filters.vehicleId} onChange={(e) => setFilter("vehicleId", e.target.value)} data-testid="f-vehicle">
              <option value="">{t("transfer.allVehicles")}</option>
              {options.vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.plate}</option>)}
            </select>
          </label>
          <label className="vr-field">
            <span>{t("transfer.staff")}</span>
            <select value={filters.staffId} onChange={(e) => setFilter("staffId", e.target.value)} data-testid="f-staff">
              <option value="">{t("transfer.allStaff")}</option>
              {options.staff.map((s) => <option key={s.id} value={s.id}>{personName(s, locale)}</option>)}
            </select>
          </label>
          <label className="vr-field">
            <span>{t("transfer.product")}</span>
            <select value={filters.productId} onChange={(e) => setFilter("productId", e.target.value)} data-testid="f-product">
              <option value="">{t("transfer.allProducts")}</option>
              {products.map((p) => <option key={p.id} value={p.id}>{productName(p, locale)}</option>)}
            </select>
          </label>
          <button type="button" className="btn-touch vr-btn vr-btn--ghost" onClick={() => navigate("/transfer/history", { replace: true })}>
            {t("transfer.clearFilters")}
          </button>
        </div>
      </div>
      {rows == null ? <p className="vr-muted">{t("common.loading")}</p> : null}
      {rows && !rows.length ? <p className="vr-muted" data-testid="history-empty">{t("transfer.noHistory")}</p> : null}
      <ul className="vr-list" data-testid="history-list">
        {(rows || []).map((row) => (
          <li key={row.id} className="card vr-item" data-testid="history-row">
            <Link to={`/transfer/history/${row.id}`} className="vr-item__head">
              <strong>{row.reference}</strong>
              <span>{formatDateTime(row.createdAt, locale)}</span>
            </Link>
            <div className="vr-route">{branchDisplayName(row.fromBranch, locale)} <span aria-hidden="true">{locale === "ar" ? "←" : "→"}</span> {branchDisplayName(row.toBranch, locale)}</div>
            <dl className="vr-meta">
              <div><dt>{t("transfer.vehicle")}</dt><dd>{row.vehicleName ? `${row.vehicleName} · ${row.vehiclePlate}` : "—"}</dd></div>
              <div><dt>{t("transfer.transferredBy")}</dt><dd>{personName(row.transferredBy, locale)}</dd></div>
              <div><dt>{t("transfer.authorisedBy")}</dt><dd>{personName(row.authorisedBy, locale)}</dd></div>
              <div><dt>{t("transfer.items")}</dt><dd>{row.itemCount}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

function baseUnitText(line, t) {
  if (line.product?.sellBy === "WEIGHT") return t("stockUnit.grams", { grams: line.baseQty });
  return t("stockUnit.pieces", { pieces: line.baseQty });
}

function stockQtyText(qty, line, t) {
  if (line.product?.sellBy === "WEIGHT") return `${(qty / 1000).toFixed(3).replace(/\.?0+$/, "") || 0} ${t("stockUnit.kg")}`;
  return String(qty);
}

/** One transfer: every line with the unit entered, stock units and stock before → after at both ends. */
export function TransferDetail() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const [row, setRow] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api(`/api/transfers/${encodeURIComponent(id)}`).then(setRow).catch((e) => setError(e.message));
  }, [id]);
  const arrow = locale === "ar" ? "←" : "→";
  return (
    <div className="vr-page">
      <h1>{t("transfer.title")}</h1>
      <TransferTabs />
      {error ? <div role="alert" className="vr-alert">{error}</div> : null}
      <Link to="/transfer/history" className="vr-back">{t("transfer.backToHistory")}</Link>
      {row ? (
        <>
          <section className="card vr-card" data-testid="transfer-detail">
            <div className="vr-item__head"><strong>{row.reference}</strong><span>{formatDateTime(row.createdAt, locale)}</span></div>
            <div className="vr-route">{branchDisplayName(row.fromBranch, locale)} <span aria-hidden="true">{arrow}</span> {branchDisplayName(row.toBranch, locale)}</div>
            <dl className="vr-meta">
              <div><dt>{t("transfer.vehicle")}</dt><dd>{row.vehicleName ? `${row.vehicleName} · ${row.vehiclePlate}` : "—"}</dd></div>
              <div><dt>{t("transfer.transferredBy")}</dt><dd>{personName(row.transferredBy, locale)}</dd></div>
              <div><dt>{t("transfer.authorisedBy")}</dt><dd>{personName(row.authorisedBy, locale)}</dd></div>
              <div><dt>{t("transfer.createdBy")}</dt><dd>{personName(row.createdBy, locale)}</dd></div>
              {row.note ? <div><dt>{t("transfer.note")}</dt><dd>{row.note}</dd></div> : null}
            </dl>
          </section>
          <ul className="vr-list">
            {row.lines.map((line) => (
              <li key={line.id} className="card vr-item" data-testid="detail-line">
                <strong>{productName(line.product, locale)}{line.variant ? ` · ${variantName(line.variant, locale)}` : ""}</strong>
                <div>
                  {line.enteredQty} {unitLabel(line.unit, { variant: line.variant, t })}
                  {line.unit === "CARTON" ? ` × ${line.piecesPerCarton}` : ""} = <b>{baseUnitText(line, t)}</b>
                </div>
                <dl className="vr-meta">
                  <div><dt>{branchDisplayName(row.fromBranch, locale)}</dt><dd data-testid="from-stock">{stockQtyText(line.fromBefore, line, t)} {arrow} {stockQtyText(line.fromAfter, line, t)}</dd></div>
                  <div><dt>{branchDisplayName(row.toBranch, locale)}</dt><dd data-testid="to-stock">{stockQtyText(line.toBefore, line, t)} {arrow} {stockQtyText(line.toAfter, line, t)}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
