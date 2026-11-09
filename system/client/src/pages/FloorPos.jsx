import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useActiveBranchId } from "../context/BranchContext.jsx";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner.js";
import { InvoicePrint } from "../components/InvoicePrint.jsx";
import { productDisplayName } from "../utils/productName.js";
import { ProductImagePreview } from "../components/ProductImagePreview.jsx";

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Floor associate POS — scan products anywhere in the store, checkout, print receipt.
 * Mobile-first; ASSOCIATE role is locked to this screen.
 */
export default function FloorPos() {
  const { user, logout } = useAuth();
  const { t, locale } = useI18n();
  const nav = useNavigate();
  const branchId = useActiveBranchId() || user?.branchId || "";
  const scanInputRef = useRef(null);
  const canAcceptPayment = user?.role !== "ASSOCIATE" || user?.associateCanAcceptPayment !== false;

  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]); // { productId, product, quantity }
  const [scan, setScan] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CARD");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [taxPercent, setTaxPercent] = useState(
    user?.tax?.defaultTaxPercent != null ? Number(user.tax.defaultTaxPercent) : 0
  );

  const currency =
    (locale === "en" ? user?.tax?.currencyLabelEn || user?.tax?.currency : user?.tax?.currencyLabelAr) ||
    t("common.currency");

  const loadProducts = useCallback(async () => {
    if (!branchId) return;
    try {
      const q = new URLSearchParams({ branchId: String(branchId) });
      const list = await api(`/api/products?${q.toString()}`);
      setProducts(Array.isArray(list) ? list : list?.items || []);
    } catch (e) {
      setMsg(e.message || t("floorPos.loadFailed"));
    }
  }, [branchId, t]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (user?.tax?.defaultTaxPercent != null) {
      setTaxPercent(Number(user.tax.defaultTaxPercent) || 0);
    }
  }, [user?.tax?.defaultTaxPercent]);

  const addProduct = useCallback(
    (product, qty = 1) => {
      if (!product?.id) return;
      setCart((prev) => {
        const i = prev.findIndex((r) => r.productId === product.id);
        if (i >= 0) {
          const next = [...prev];
          next[i] = { ...next[i], quantity: next[i].quantity + qty };
          return next;
        }
        return [...prev, { productId: product.id, product, quantity: qty }];
      });
      setMsg("");
    },
    []
  );

  const findByCode = useCallback(
    (code) => {
      const q = String(code || "").trim().toLowerCase();
      if (!q) return null;
      return (
        products.find((p) => p.barcode && String(p.barcode).toLowerCase() === q) ||
        products.find((p) => p.sku && String(p.sku).toLowerCase() === q) ||
        null
      );
    },
    [products]
  );

  const onScanCode = useCallback(
    (code) => {
      const p = findByCode(code);
      if (!p) {
        setMsg(t("floorPos.notFound", { code: String(code) }));
        return;
      }
      addProduct(p, 1);
      setScan("");
    },
    [addProduct, findByCode, t]
  );

  useBarcodeScanner(onScanCode, true);

  const searchHits = useMemo(() => {
    const q = scan.trim().toLowerCase();
    if (q.length < 2) return [];
    return products
      .filter((p) => {
        const name = productDisplayName(p, locale).toLowerCase();
        return (
          name.includes(q) ||
          (p.barcode && String(p.barcode).toLowerCase().includes(q)) ||
          (p.sku && String(p.sku).toLowerCase().includes(q))
        );
      })
      .slice(0, 8);
  }, [scan, products, locale]);

  const subtotal = useMemo(
    () => round2(cart.reduce((s, r) => s + Number(r.product.price || 0) * r.quantity, 0)),
    [cart]
  );
  const taxAmount = useMemo(() => round2(subtotal * (Number(taxPercent) || 0) / 100), [subtotal, taxPercent]);
  const total = useMemo(() => round2(subtotal + taxAmount), [subtotal, taxAmount]);

  const setQty = (productId, quantity) => {
    const q = Math.max(0, Math.floor(Number(quantity) || 0));
    setCart((prev) =>
      q <= 0 ? prev.filter((r) => r.productId !== productId) : prev.map((r) => (r.productId === productId ? { ...r, quantity: q } : r))
    );
  };

  const checkout = async () => {
    setMsg("");
    if (!cart.length) {
      setMsg(t("floorPos.emptyCart"));
      return;
    }
    if (!branchId) {
      setMsg(t("floorPos.noBranch"));
      return;
    }
    if (!canAcceptPayment) {
      setMsg(t("floorPos.paymentDisabled"));
      return;
    }
    setBusy(true);
    try {
      const sale = await api("/api/sales/checkout", {
        method: "POST",
        body: {
          branchId,
          items: cart.map((r) => ({ productId: r.productId, quantity: r.quantity })),
          paymentMethod,
          taxPercent: Number(taxPercent) || 0,
          discountAmount: 0,
        },
      });
      setLastSale(sale);
      setCart([]);
      setMsg(t("floorPos.saleOk"));
      setTimeout(() => window.print(), 250);
    } catch (e) {
      setMsg(e.message || t("floorPos.saleFailed"));
    } finally {
      setBusy(false);
    }
  };

  const sendToCashier = async () => {
    setMsg("");
    if (!cart.length) {
      setMsg(t("floorPos.emptyCart"));
      return;
    }
    if (!branchId) {
      setMsg(t("floorPos.noBranch"));
      return;
    }
    setBusy(true);
    try {
      const label = `${t("floorPos.heldLabel")} · ${user?.name || user?.email || ""}`.slice(0, 80);
      await api("/api/held-carts", {
        method: "POST",
        body: {
          branchId,
          label,
          items: cart.map((r) => ({ productId: r.productId, quantity: r.quantity })),
          taxPercent: Number(taxPercent) || 0,
        },
      });
      setCart([]);
      setMsg(t("floorPos.sentToCashier"));
    } catch (e) {
      setMsg(e.message || t("floorPos.sendFailed"));
    } finally {
      setBusy(false);
    }
  };

  const branchName = user?.branchName || "";

  return (
    <div className="floor-pos" lang={locale === "en" ? "en" : "ar"} dir={locale === "en" ? "ltr" : "rtl"}>
      <header className="floor-pos__header">
        <div>
          <div className="floor-pos__brand">{t("floorPos.title")}</div>
          <div className="floor-pos__meta">
            {user?.name || user?.email}
            {branchName ? ` · ${branchName}` : ""}
          </div>
        </div>
        <button
          type="button"
          className="btn-touch floor-pos__logout"
          onClick={() => {
            logout();
            nav("/login");
          }}
        >
          {t("nav.logout")}
        </button>
      </header>

      <div className="floor-pos__scan">
        <input
          ref={scanInputRef}
          className="floor-pos__scan-input"
          value={scan}
          onChange={(e) => setScan(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onScanCode(scan);
            }
          }}
          placeholder={t("floorPos.scanPlaceholder")}
          inputMode="search"
          autoComplete="off"
          autoFocus
        />
        <button type="button" className="btn-touch floor-pos__scan-btn" onClick={() => onScanCode(scan)}>
          {t("floorPos.add")}
        </button>
      </div>

      {searchHits.length > 0 ? (
        <ul className="floor-pos__hits">
          {searchHits.map((p) => (
            <li key={p.id}>
              <button type="button" className="floor-pos__hit" onClick={() => { addProduct(p, 1); setScan(""); }}>
                <ProductImagePreview url={p.imageUrl} alt="" width={40} height={40} />
                <span className="floor-pos__hit-name">{productDisplayName(p, locale)}</span>
                <span className="floor-pos__hit-price">
                  {Number(p.price).toFixed(2)} {currency}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {msg ? <div className="floor-pos__msg">{msg}</div> : null}

      <section className="floor-pos__cart card">
        <h2 className="floor-pos__cart-title">{t("floorPos.cart")}</h2>
        {!cart.length ? (
          <p className="floor-pos__empty">{t("floorPos.emptyHint")}</p>
        ) : (
          <ul className="floor-pos__lines">
            {cart.map((r) => (
              <li key={r.productId} className="floor-pos__line">
                <div className="floor-pos__line-main">
                  <strong>{productDisplayName(r.product, locale)}</strong>
                  <span>
                    {Number(r.product.price).toFixed(2)} × {r.quantity} ={" "}
                    {(Number(r.product.price) * r.quantity).toFixed(2)} {currency}
                  </span>
                </div>
                <div className="floor-pos__qty">
                  <button type="button" className="btn-touch" onClick={() => setQty(r.productId, r.quantity - 1)}>
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={r.quantity}
                    onChange={(e) => setQty(r.productId, e.target.value)}
                  />
                  <button type="button" className="btn-touch" onClick={() => setQty(r.productId, r.quantity + 1)}>
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="floor-pos__checkout card">
        <div className="floor-pos__totals">
          <div>
            <span>{t("floorPos.subtotal")}</span>
            <strong>
              {subtotal.toFixed(2)} {currency}
            </strong>
          </div>
          <div>
            <span>
              {t("floorPos.tax")} ({taxPercent}%)
            </span>
            <strong>
              {taxAmount.toFixed(2)} {currency}
            </strong>
          </div>
          <div className="floor-pos__grand">
            <span>{t("floorPos.total")}</span>
            <strong>
              {total.toFixed(2)} {currency}
            </strong>
          </div>
        </div>

        {canAcceptPayment ? (
          <>
            <div className="floor-pos__pay">
              {["CARD", "CASH", "ONLINE"].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`btn-touch floor-pos__pay-btn${paymentMethod === m ? " is-active" : ""}`}
                  onClick={() => setPaymentMethod(m)}
                >
                  {t(`payment.${m === "CARD" ? "card" : m === "CASH" ? "cash" : "online"}`)}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="btn-touch floor-pos__submit"
              disabled={busy || !cart.length}
              onClick={checkout}
            >
              {busy ? t("common.loading") : t("floorPos.finalize")}
            </button>
          </>
        ) : (
          <>
            <p className="floor-pos__empty" style={{ marginBottom: 12 }}>
              {t("floorPos.paymentDisabledHint")}
            </p>
            <button
              type="button"
              className="btn-touch floor-pos__submit"
              disabled={busy || !cart.length}
              onClick={sendToCashier}
            >
              {busy ? t("common.loading") : t("floorPos.sendToCashier")}
            </button>
          </>
        )}

        {lastSale ? (
          <button
            type="button"
            className="btn-touch floor-pos__reprint"
            onClick={() => window.print()}
          >
            {t("floorPos.reprint")}
          </button>
        ) : null}
      </section>

      <div className="print-invoice" style={{ position: "fixed", left: -99999, top: 0, width: 400 }}>
        <InvoicePrint sale={lastSale} branchName={branchName} taxInfo={user?.tax} />
      </div>
    </div>
  );
}
