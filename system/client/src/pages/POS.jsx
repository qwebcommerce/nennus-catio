import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { PosCartPanel } from "../components/PosCartPanel.jsx";
import { InvoicePrint } from "../components/InvoicePrint.jsx";
import {
  PAYMENT_METHOD_IDS,
  PaymentMethodIconGroup,
  PaymentSectionHeading,
  SPLIT_PAYMENT_METHOD_IDS,
  SplitPaymentToggle,
} from "../components/PaymentMethodControls.jsx";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner.js";
import { useCartStore } from "../store/cartStore.js";
import { useActiveBranchId, useActiveBranchLabel, useBranchContext } from "../context/BranchContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { usePrintSettings } from "../context/PrintSettingsContext.jsx";
import { buildReceiptPlainText } from "../utils/receiptText.js";
import { isUnitPriceAtOrBelowCost } from "../utils/saleCostWarning.js";
import { productDisplayName } from "../utils/productName.js";
import { ProductImagePreview } from "../components/ProductImagePreview.jsx";
import { useOrgCurrency } from "../lib/orgCurrency.js";
import { useAuth } from "../context/AuthContext.jsx";
import { lineDirhams, riyals, toDirhams } from "../utils/money.js";

function round2(n) {
  return Math.round(n * 100) / 100;
}

export default function POS() {
  const { classFor } = usePrintSettings();
  const { label: currencyLabel } = useOrgCurrency();
  const { t, locale } = useI18n();
  const branchId = useActiveBranchId();
  const branchName = useActiveBranchLabel(locale);
  const { activeBranch, branches, setActiveBranchId, canChooseBranch } = useBranchContext();
  const { user, canModule } = useAuth();
  /** Complimentary goods: manager / owner (complimentary → create). The server checks it again. */
  const canGiveFree = canModule("complimentary", "create");
  const tillKind = activeBranch?.kind || "SHOP";
  // FR-30: opening the till asks which location (shop or van) it sells from.
  const tillKey = `till:location:${user?.id || ""}`;
  const [tillConfirmedId, setTillConfirmedId] = useState(() => {
    try {
      return sessionStorage.getItem(tillKey) || "";
    } catch {
      return "";
    }
  });
  const tillChoices = useMemo(
    () =>
      (branches || []).filter(
        (b) =>
          b.isActive !== false &&
          b.kind !== "WAREHOUSE" &&
          (canChooseBranch || b.id === activeBranch?.id),
      ),
    [branches, canChooseBranch, activeBranch?.id],
  );
  const tillConfirmed = Boolean(activeBranch) && tillConfirmedId === activeBranch.id;
  const chooseTill = (id) => {
    if (canChooseBranch) setActiveBranchId(id);
    setTillConfirmedId(id);
    try {
      sessionStorage.setItem(tillKey, id);
    } catch {
      /* ignore */
    }
  };
  const tillOpen =
    Boolean(activeBranch) && activeBranch.isActive !== false && tillKind !== "WAREHOUSE" && tillConfirmed;
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHighlight, setSearchHighlight] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitRows, setSplitRows] = useState([
    { method: "CASH", amount: "" },
    { method: "CARD", amount: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [msg, setMsg] = useState("");
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [quickCustomerName, setQuickCustomerName] = useState("");
  const [discountInput, setDiscountInput] = useState("");
  const [holdLabel, setHoldLabel] = useState("");
  const [heldList, setHeldList] = useState([]);
  const [copyDone, setCopyDone] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  /** مبلغ يُدفع الآن عند البيع الجزئي بالآجل (يُترك فارغاً للدفع الكامل) */
  const [payNowInput, setPayNowInput] = useState("");
  const [openCashSession, setOpenCashSession] = useState(null);
  const [orderNote, setOrderNote] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [cashTendered, setCashTendered] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [payLink, setPayLink] = useState(null);
  const [salePrompt, setSalePrompt] = useState(null);
  const [promptVariantId, setPromptVariantId] = useState("");
  const [promptKg, setPromptKg] = useState("1");
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [groomingError, setGroomingError] = useState("");
  const searchWrapRef = useRef(null);
  const searchInputRef = useRef(null);

  const items = useCartStore((s) => s.items);
  const [freeKeys, setFreeKeys] = useState(() => new Set());
  const [wholeFree, setWholeFree] = useState(false);
  const [freeReason, setFreeReason] = useState("");
  const isFreeLine = (line) => wholeFree || freeKeys.has(line.lineKey);
  const toggleFree = (key) =>
    setFreeKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const syncLinePricesFromProducts = useCartStore((s) => s.syncLinePricesFromProducts);

  const addProduct = useCartStore((s) => s.addProduct);
  const setQty = useCartStore((s) => s.setQuantity);
  const removeLine = useCartStore((s) => s.removeLine);
  const total = useCartStore((s) => s.total());
  // Free lines bring no revenue: the amount to pay leaves them out.
  const freeTotal = riyals(items.filter(isFreeLine).reduce((s, i) => s + lineDirhams(i.unitPrice, i.quantity, i.sellBy), 0));
  const anyFree = items.some(isFreeLine);
  const cartSubtotal = riyals(toDirhams(total) - toDirhams(freeTotal));
  const discountNum = Math.min(
    Math.max(0, Number.parseFloat(String(discountInput).replace(",", ".")) || 0),
    cartSubtotal
  );
  /**
   * Offers (automatic ones and the coupon) are priced by the server exactly as the checkout will
   * apply them, so the total on screen is the total the sale records and the customer is charged.
   */
  const [promoQuote, setPromoQuote] = useState({ key: "", discount: 0, couponValid: null });
  const quoteKey = JSON.stringify([
    items.map((i) => [i.productId, i.variantId || "", i.quantity, isFreeLine(i) ? 1 : 0]),
    couponInput.trim(),
    discountNum,
  ]);
  const fetchQuote = useCallback(async () => {
    if (!items.length) return { key: quoteKey, discount: 0, couponValid: null };
    const r = await api("/api/sales/quote", {
      method: "POST",
      body: {
        items: items.map((i) => ({ productId: i.productId, variantId: i.variantId || undefined, quantity: i.quantity, isFree: isFreeLine(i) || undefined })),
        couponCode: couponInput.trim() || undefined,
        discountAmount: discountNum > 0 ? discountNum : undefined,
      },
    });
    return { key: quoteKey, discount: Number(r?.promotionDiscount) || 0, couponValid: r?.couponValid ?? null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      fetchQuote()
        .then((q) => { if (live) setPromoQuote(q); })
        .catch(() => {});
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [fetchQuote]);
  const promoDiscount = promoQuote.key === quoteKey ? promoQuote.discount : 0;
  // NFR-03: what is due is worked out in whole dirhams.
  const afterDisc = riyals(Math.max(0, toDirhams(cartSubtotal) - toDirhams(discountNum) - toDirhams(promoDiscount)));
  const amountDue = afterDisc;
  const clearCart = useCartStore((s) => s.clear);
  const setBranchCart = useCartStore((s) => s.setBranchId);
  const replaceAll = useCartStore((s) => s.replaceAll);

  useEffect(() => {
    api("/api/customers")
      .then(setCustomers)
      .catch(() => setCustomers([]));
  }, []);

  useEffect(() => {
    if (branchId) setBranchCart(branchId);
  }, [branchId, setBranchCart]);

  useEffect(() => {
    if (!branchId || typeof navigator === "undefined" || !navigator.onLine) {
      setOpenCashSession(null);
      return;
    }
    const loadSession = () => {
      const q = new URLSearchParams();
      q.set("branchId", branchId);
      api(`/api/cash-sessions/open?${q.toString()}`)
        .then((s) => setOpenCashSession(s || null))
        .catch(() => setOpenCashSession(null));
    };
    loadSession();
    const onFocus = () => loadSession();
    const onAlerts = () => loadSession();
    window.addEventListener("focus", onFocus);
    window.addEventListener("alerts-changed", onAlerts);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("alerts-changed", onAlerts);
    };
  }, [branchId]);

  const needsCashSessionWarning = useMemo(() => {
    if (openCashSession) return false;
    if (splitEnabled) {
      return splitRows.some((r) => String(r.method || "").toUpperCase() === "CASH" && Number(r.amount) > 0);
    }
    return paymentMethod === "CASH";
  }, [openCashSession, splitEnabled, splitRows, paymentMethod]);

  useEffect(() => {
    api("/api/catalog")
      .then((data) => setCategories(Array.isArray(data?.categories) ? data.categories : []))
      .catch(() => setCategories([]));
  }, []);

  const catalogLabel = (row) => {
    if (!row) return "";
    if (locale === "en" && row.nameEn?.trim()) return row.nameEn.trim();
    return row.name || row.nameEn || "";
  };

  const loadProducts = useCallback(async () => {
    const bid = branchId;
    const q = new URLSearchParams();
    if (bid) q.set("branchId", bid);
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    try {
      const list = await api(`/api/products?${q.toString()}`);
      const arr = Array.isArray(list) ? list : list?.items || [];
      setProducts(arr);
    } catch {
      /* keep the last list on a failed refresh */
    }
  }, [branchId]);

  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => {
        if (!p?.isActive && p?.isActive !== undefined) return false;
        if (categoryId && p.categoryId !== categoryId) return false;
        return (
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.nameEn && p.nameEn.toLowerCase().includes(q)) ||
          (p.sku && String(p.sku).toLowerCase().includes(q)) ||
          (p.barcode && String(p.barcode).toLowerCase().includes(q)) ||
          (Array.isArray(p.variants) &&
            p.variants.some(
              (v) =>
                (v.sku && String(v.sku).toLowerCase().includes(q)) ||
                (v.barcode && String(v.barcode).toLowerCase().includes(q)) ||
                (v.label && v.label.toLowerCase().includes(q)) ||
                (v.labelEn && v.labelEn.toLowerCase().includes(q))
            ))
        );
      })
      .slice(0, 14);
  }, [search, products, categoryId]);

  const pickSearchProduct = useCallback(
    (p) => {
      if (!p) return;
      const variants = (p.variants || []).filter((v) => v.isActive !== false);
      if (variants.length || p.sellBy === "WEIGHT") {
        setSalePrompt(p);
        setPromptVariantId(variants[0]?.id || "");
        setPromptKg("1");
        setSearch("");
        setSearchOpen(false);
        setMsg("");
        return;
      }
      addProduct(p, 1);
      setSearch("");
      setSearchOpen(false);
      setSearchHighlight(0);
      setMsg("");
      searchInputRef.current?.focus();
    },
    [addProduct]
  );

  useEffect(() => {
    const onDoc = (e) => {
      if (!searchWrapRef.current?.contains(e.target)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    setSearchHighlight(0);
  }, [search]);

  const loadHeldCarts = useCallback(async () => {
    const bid = branchId;
    if (!bid) {
      setHeldList([]);
      return;
    }
    try {
      const q = new URLSearchParams();
      q.set("branchId", bid);
      const list = await api(`/api/held-carts?${q.toString()}`);
      setHeldList(list);
    } catch {
      setHeldList([]);
    }
  }, [branchId]);

  useEffect(() => {
    loadProducts().catch(() => setProducts([]));
  }, [loadProducts]);

  useEffect(() => {
    if (products.length > 0) syncLinePricesFromProducts(products);
  }, [products, syncLinePricesFromProducts]);

  useEffect(() => {
    loadHeldCarts();
  }, [loadHeldCarts]);

  /** أجهزة متعددة: القائمة لا تُحدَّث تلقائياً من السيرفر إلا عند إعادة الجلب — نحدّث عند العودة للتبويب + دورياً */
  const lastSoftRefreshRef = useRef(0);
  const softRefreshCatalog = useCallback(() => {
    const now = Date.now();
    if (now - lastSoftRefreshRef.current < 2500) return;
    lastSoftRefreshRef.current = now;
    loadProducts().catch(() => {});
    loadHeldCarts().catch(() => {});
  }, [loadProducts, loadHeldCarts]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      softRefreshCatalog();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", softRefreshCatalog);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", softRefreshCatalog);
    };
  }, [softRefreshCatalog]);

  useEffect(() => {
    const id = setInterval(() => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (document.visibilityState !== "visible") return;
      softRefreshCatalog();
    }, 40000);
    return () => clearInterval(id);
  }, [softRefreshCatalog]);

  const onScan = useCallback(
    (code) => {
      const p = products.find((x) => x.barcode === code || x.sku === code);
      if (p) {
        pickSearchProduct(p);
        return;
      }
      setMsg(t("pos.barcodeMiss", { code }));
    },
    [products, pickSearchProduct, t],
  );

  useBarcodeScanner(onScan, true);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customers, customerId]
  );

  const paymentMethodIds = useMemo(() => {
    const ids = tillKind === "VAN" ? [...PAYMENT_METHOD_IDS, "FAWRAN", "PAYMENT_LINK"] : PAYMENT_METHOD_IDS;
    return customerId && selectedCustomer?.creditApproved ? ids : ids.filter((m) => m !== "ON_ACCOUNT");
  }, [customerId, selectedCustomer, tillKind]);

  useEffect(() => {
    if (!customerId && paymentMethod === "ON_ACCOUNT") {
      setPaymentMethod("CASH");
    }
    if (tillKind !== "VAN" && (paymentMethod === "FAWRAN" || paymentMethod === "PAYMENT_LINK")) {
      setPaymentMethod("CASH");
    }
  }, [customerId, paymentMethod, tillKind]);

  useEffect(() => {
    if (!branchId) {
      setTodayAppointments([]);
      return;
    }
    let cancelled = false;
    setGroomingError("");
    api(`/api/appointments/today?branchId=${encodeURIComponent(branchId)}`)
      .then((rows) => {
        if (!cancelled) setTodayAppointments(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setTodayAppointments([]);
        setGroomingError(err?.message || t("pos.todayGroomingFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const hasBelowCostWarning = useMemo(
    () => items.some((line) => isUnitPriceAtOrBelowCost(line.unitPrice, line.cost)),
    [items]
  );

  const fillRemainder = (idx) => {
    const due = amountDue;
    const others = splitRows.reduce((s, r, j) => {
      if (j === idx) return s;
      return s + toDirhams(Number.parseFloat(String(r.amount).replace(",", ".")) || 0);
    }, 0);
    const rem = riyals(Math.max(0, toDirhams(due) - others));
    setSplitRows((rows) => rows.map((r, j) => (j === idx ? { ...r, amount: rem > 0 ? String(rem) : "" } : r)));
  };

  const splitSum = useMemo(
    () =>
      riyals(
        splitRows.reduce(
          (s, r) => s + toDirhams(Number.parseFloat(String(r.amount).replace(",", ".")) || 0),
          0,
        ),
      ),
    [splitRows],
  );
  const splitRemaining = riyals(toDirhams(amountDue) - toDirhams(splitSum));

  const addSplitRow = () => {
    setSplitRows((rows) => [...rows, { method: "ONLINE", amount: "" }]);
  };

  const holdCart = async () => {
    setMsg("");
    if (!items.length) {
      setMsg(t("pos.holdNeedItems"));
      return;
    }
    if (paymentMethod === "ON_DELIVERY") {
      if (!customerId) {
        setMsg(t("pos.deliveryCustomerRequired"));
        return;
      }
      if (!deliveryAddress.trim()) {
        setMsg(t("pos.deliveryAddressRequired"));
        return;
      }
    }
    const bid = branchId;
    if (!bid) return;
    setLoading(true);
    try {
      await api("/api/held-carts", {
        method: "POST",
        body: {
          branchId: bid,
          label:
            holdLabel.trim() ||
            (paymentMethod === "ON_DELIVERY" ? t("pos.deliveryHoldLabel") : undefined),
          items: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
          customerId: customerId || undefined,
          discountInput,
          paymentMethod,
          deliveryAddress: deliveryAddress.trim() || undefined,
          orderNote: orderNote.trim() || undefined,
        },
      });
      setHoldLabel("");
      clearCart();
      setCustomerId("");
      setDeliveryAddress("");
      setDiscountInput("");
      setOrderNote("");
      setSplitEnabled(false);
      setPaymentMethod("CASH");
      await loadHeldCarts();
      await loadProducts();
      setMsg(t("pos.holdSaved"));
    } catch (e) {
      setMsg(e.message || t("pos.saleFailed"));
    } finally {
      setLoading(false);
    }
  };

  const restoreHeld = async (row) => {
    const p = row.payload;
    if (!p?.items?.length) return;
    setMsg("");
    replaceAll(p.items);
    setCustomerId(typeof p.customerId === "string" ? p.customerId : "");
    setDiscountInput(p.discountInput != null ? String(p.discountInput) : "");
    setDeliveryAddress(typeof p.deliveryAddress === "string" ? p.deliveryAddress : "");
    setOrderNote(typeof p.orderNote === "string" ? p.orderNote : "");
    const pm = typeof p.paymentMethod === "string" ? p.paymentMethod.toUpperCase() : "";
    if (PAYMENT_METHOD_IDS.includes(pm)) {
      setPaymentMethod(pm);
      setSplitEnabled(false);
    } else {
      setSplitEnabled(false);
    }
    // Resuming takes the cart off the held list: left there it could be resumed and sold twice,
    // and resumed carts piled up until holding was refused (per-user limit).
    await api(`/api/held-carts/${row.id}`, { method: "DELETE" }).catch(() => {});
    await loadHeldCarts();
    await loadProducts();
    setMsg(t("pos.heldRestored"));
  };

  const deleteHeld = async (id) => {
    setMsg("");
    try {
      await api(`/api/held-carts/${id}`, { method: "DELETE" });
      await loadHeldCarts();
    } catch (e) {
      setMsg(e.message || t("pos.saleFailed"));
    }
  };

  const copyLastReceipt = async () => {
    if (!lastSale) return;
    const text = buildReceiptPlainText(lastSale, branchName, locale);
    try {
      await navigator.clipboard.writeText(text);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    } catch {
      setMsg(t("pos.saleFailed"));
    }
  };

  const checkout = async () => {
    setMsg("");
    if (!items.length) return;
    const bid = branchId;
    if (!tillOpen) {
      setMsg(t("pos.tillLocationRequired"));
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setMsg(t("pos.offlineBlocked"));
      return;
    }
    // The total on screen must include the offers the sale will apply before anyone is charged.
    try {
      const fresh = await fetchQuote();
      // Only stop when the offers change what is on screen (a quote still on its way is fine
      // as long as the amount shown is already right).
      setPromoQuote(fresh);
      if (Math.abs(fresh.discount - promoDiscount) > 0.001) {
        setMsg(t("pos.totalChanged"));
        return;
      }
      if (fresh.couponValid === false) {
        setMsg(t("pos.couponInvalid"));
        return;
      }
    } catch {
      /* the checkout below reports any real problem */
    }
    for (const line of items) {
      const onHand = Number(line.maxStock ?? 0);
      if (line.quantity > onHand) {
        setMsg(t("pos.insufficientStock", { name: productDisplayName(line, locale) }));
        return;
      }
    }

    if (!splitEnabled && paymentMethod === "CASH" && cashTendered.trim() !== "") {
      const tendered = round2(Number.parseFloat(String(cashTendered).replace(",", ".")) || 0);
      if (!(tendered + 0.001 >= amountDue)) {
        setMsg(t("pos.cashShort"));
        return;
      }
    }
    if (!splitEnabled && (paymentMethod === "FAWRAN" || paymentMethod === "PAYMENT_LINK")) {
      if (!paymentReference.trim()) {
        setMsg(t("pos.paymentReferenceRequired"));
        return;
      }
    }

    if (paymentMethod === "ON_DELIVERY" && !splitEnabled) {
      if (!customerId) {
        setMsg(t("pos.deliveryCustomerRequired"));
        return;
      }
      if (!deliveryAddress.trim()) {
        setMsg(t("pos.deliveryAddressRequired"));
        return;
      }
    }

    const tenderNeedsCashSession = (() => {
      if (splitEnabled) {
        return splitRows.some(
          (r) =>
            String(r.method || "").toUpperCase() === "CASH" &&
            round2(Number.parseFloat(String(r.amount).replace(",", ".")) || 0) > 0,
        );
      }
      if (paymentMethod !== "CASH") return false;
      if (payNowInput.trim() === "") return true;
      return round2(Number.parseFloat(String(payNowInput).replace(",", ".")) || 0) > 0;
    })();

    if (tenderNeedsCashSession && !openCashSession) {
      setMsg(t("pos.cashSessionRequired"));
      return;
    }

    let paymentSplits = undefined;
    if (splitEnabled) {
      const parsed = splitRows
        .map((r) => ({
          method: String(r.method || "CASH").toUpperCase(),
          amount: round2(Number.parseFloat(String(r.amount).replace(",", ".")) || 0),
        }))
        .filter((r) => r.amount > 0);
      if (parsed.length < 2) {
        setMsg(t("pos.splitMismatch"));
        return;
      }
      // The server needs the split rows to add up to the bill exactly (whole dirhams).
      const sum = parsed.reduce((s, x) => s + toDirhams(x.amount), 0);
      if (sum !== toDirhams(amountDue)) {
        setMsg(t("pos.splitMismatch"));
        return;
      }
      const badSplit = parsed.some((r) => !["CASH", "CARD", "ONLINE"].includes(r.method));
      if (badSplit) {
        setMsg(t("pos.splitMethodsOnly"));
        return;
      }
      paymentSplits = parsed;
    }

    if (
      !paymentSplits &&
      ["CASH", "CARD", "ONLINE"].includes(paymentMethod) &&
      payNowInput.trim() !== ""
    ) {
      const paidNow = round2(Number.parseFloat(String(payNowInput).replace(",", ".")) || 0);
      if (Number.isNaN(paidNow) || paidNow < 0) {
        setMsg(t("pos.payNowInvalid"));
        return;
      }
      if (paidNow - amountDue > 0.02) {
        setMsg(t("pos.payNowExceeds"));
        return;
      }
      if (amountDue - paidNow > 0.02 && !customerId) {
        setMsg(t("pos.payNowNeedCustomer"));
        return;
      }
    }

    const body = {
      branchId: bid,
      customerId: customerId || undefined,
      discountAmount: discountNum > 0 ? discountNum : undefined,
      items: items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId || undefined,
        quantity: i.quantity,
        ...(isFreeLine(i) ? { isFree: true } : {}),
      })),
    };
    if (anyFree) {
      if (!freeReason.trim()) {
        setMsg(t("so.freeReasonRequired"));
        return;
      }
      body.freeReason = freeReason.trim();
      if (wholeFree) body.complimentary = true;
    }
    if (paymentMethod === "ON_DELIVERY" && !splitEnabled && deliveryAddress.trim()) {
      body.deliveryAddress = deliveryAddress.trim();
    }
    if (discountNum > 0 && discountReason.trim()) {
      body.discountReason = discountReason.trim();
    }
    const cTrim = couponInput.trim();
    if (cTrim) body.couponCode = cTrim;
    if (paymentSplits) {
      body.paymentSplits = paymentSplits;
    } else {
      body.paymentMethod = paymentMethod;
      if (
        !paymentSplits &&
        ["CASH", "CARD", "ONLINE"].includes(paymentMethod) &&
        payNowInput.trim() !== ""
      ) {
        body.amountPaid = round2(Number.parseFloat(String(payNowInput).replace(",", ".")) || 0);
      }
      if (
        (paymentMethod === "FAWRAN" || paymentMethod === "PAYMENT_LINK" || paymentMethod === "BANK_TRANSFER") &&
        paymentReference.trim()
      ) {
        body.paymentReference = paymentReference.trim();
      }
    }

    setLoading(true);
    try {
      const sale = await api("/api/sales/checkout", {
        method: "POST",
        body,
      });
      setLastSale(sale);
      setCopyDone(false);
      clearCart();
      setCustomerId("");
      setDeliveryAddress("");
      setDiscountInput("");
      setDiscountReason("");
      setOrderNote("");
      setSplitEnabled(false);
      setSplitRows([
        { method: "CASH", amount: "" },
        { method: "CARD", amount: "" },
      ]);
      setCouponInput("");
      setPayNowInput("");
      setCashTendered("");
      setPaymentReference("");
      setFreeKeys(new Set());
      setWholeFree(false);
      setFreeReason("");
      await loadProducts();
      await loadHeldCarts();
      api("/api/customers")
        .then(setCustomers)
        .catch(() => {});
      setTimeout(() => window.print(), 200);
    } catch (e) {
      setMsg(e.message || t("pos.saleFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pos-page-root">
      <div className="pos-top-bar">
        <h1 className="pos-top-bar__title">{t("pos.title")}</h1>
        <div className="pos-search" ref={searchWrapRef}>
          <input
            ref={searchInputRef}
            className="pos-search__input"
            placeholder={t("pos.searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(e) => {
              if (!searchOpen && (e.key === "ArrowDown" || e.key === "Enter")) {
                setSearchOpen(true);
              }
              if (e.key === "Escape") {
                setSearchOpen(false);
                return;
              }
              if (!searchHits.length) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSearchHighlight((i) => Math.min(i + 1, searchHits.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSearchHighlight((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                pickSearchProduct(searchHits[searchHighlight] || searchHits[0]);
              }
            }}
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={searchOpen && search.trim().length > 0}
          />
          {searchOpen && search.trim() ? (
            <div className="pos-search__menu" role="listbox">
              {searchHits.length === 0 ? (
                <div className="pos-search__empty">{t("pos.searchNoResults")}</div>
              ) : (
                searchHits.map((p, idx) => {
                  const stock = p.inventories?.[0]?.quantity ?? 0;
                  const price = Number(p.price);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="option"
                      aria-selected={idx === searchHighlight}
                      className={`pos-search__option${idx === searchHighlight ? " is-active" : ""}`}
                      onMouseEnter={() => setSearchHighlight(idx)}
                      onClick={() => pickSearchProduct(p)}
                    >
                      <ProductImagePreview url={p.imageUrl} alt="" width={44} height={44} />
                      <span className="pos-search__option-main">
                        <span className="pos-search__option-name">
                          {productDisplayName(p, locale)}
                        </span>
                        <span className="pos-search__option-meta">
                          {p.sku ? `SKU ${p.sku}` : p.barcode || "—"}
                          {" · "}
                          {t("pos.inStock", { n: stock })}
                        </span>
                      </span>
                      <span className="pos-search__option-price">
                        {price.toFixed(2)} {currencyLabel}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
        {categories.length > 0 ? (
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="pos-top-bar__select"
            aria-label={t("products.category")}
          >
            <option value="">{t("pos.categoryAll")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {catalogLabel(c)}
              </option>
            ))}
          </select>
        ) : null}
        <button type="button" className="btn-touch" onClick={() => loadProducts()} style={{ background: "var(--surface2)" }}>
          {t("pos.refresh")}
        </button>
      </div>

      {needsCashSessionWarning ? (
        <div
          className="card"
          role="alert"
          style={{
            margin: "0 0 8px",
            padding: "10px 14px",
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            background: "color-mix(in srgb, var(--danger, #c62828) 12%, var(--surface))",
            borderColor: "var(--danger, #c62828)",
          }}
        >
          <span style={{ flex: 1, fontSize: 13 }}>{t("pos.cashSessionRequired")}</span>
          <Link to="/cash" className="btn-touch" style={{ background: "var(--accent)", color: "#fff", textDecoration: "none" }}>
            {t("nav.funds")}
          </Link>
        </div>
      ) : null}

      {salePrompt ? (
        <div className="card" style={{ margin: "0 0 8px", padding: 14, display: "grid", gap: 8 }}>
          <strong>{productDisplayName(salePrompt, locale)}</strong>
          {(salePrompt.variants || []).filter((v) => v.isActive !== false).length ? (
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span>{t("pos.variant")}</span>
              <select value={promptVariantId} onChange={(e) => setPromptVariantId(e.target.value)}>
                {(salePrompt.variants || [])
                  .filter((v) => v.isActive !== false)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {(locale === "en" ? v.labelEn || v.label : v.label)} · {Number(v.price).toFixed(2)} · {t("pos.inStock", { n: v.stocks?.[0]?.quantity ?? 0 })}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
          {salePrompt.sellBy === "WEIGHT" ? (
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span>{t("pos.weightKg")}</span>
              <input value={promptKg} inputMode="decimal" onChange={(e) => setPromptKg(e.target.value)} />
            </label>
          ) : null}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn-touch"
              style={{ background: "var(--accent)", color: "#fff" }}
              onClick={() => {
                const variant = (salePrompt.variants || []).find((v) => v.id === promptVariantId) || null;
                const kg = Number(String(promptKg).replace(",", "."));
                const qty = salePrompt.sellBy === "WEIGHT" ? Math.round(kg * 1000) : 1;
                if (salePrompt.sellBy === "WEIGHT" && (!Number.isFinite(qty) || qty < 1)) {
                  setMsg(t("pos.weightKg"));
                  return;
                }
                addProduct(salePrompt, qty, { variant });
                setSalePrompt(null);
              }}
            >
              {t("pos.addToCart")}
            </button>
            <button type="button" className="btn-touch" style={{ background: "var(--surface2)" }} onClick={() => setSalePrompt(null)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {!tillConfirmed ? (
        <div className="card" role="dialog" aria-modal="true" style={{ margin: "0 0 8px", padding: 14, display: "grid", gap: 10 }}>
          <strong>{t("pos.chooseTillLocation")}</strong>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{t("pos.chooseTillLocationHint")}</span>
          {tillChoices.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {tillChoices.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="btn-touch"
                  style={{ background: b.id === activeBranch?.id ? "var(--accent)" : "var(--surface2)", color: b.id === activeBranch?.id ? "#fff" : undefined }}
                  onClick={() => chooseTill(b.id)}
                >
                  {(locale === "en" ? b.nameEn || b.name : b.name) || b.id} · {t(`branches.kind.${b.kind || "SHOP"}`)}
                </button>
              ))}
            </div>
          ) : (
            <span role="alert">{t("pos.tillLocationRequired")}</span>
          )}
        </div>
      ) : !tillOpen ? (
        <div className="card" role="alert" style={{ margin: "0 0 8px", padding: "10px 14px", fontSize: 13 }}>
          {t("pos.tillLocationRequired")}
        </div>
      ) : (
        <div className="card" style={{ margin: "0 0 8px", padding: "10px 14px", fontSize: 13, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <strong>{branchName || "—"}</strong>
          <span style={{ color: "var(--muted)" }}>{t(`branches.kind.${tillKind}`)}</span>
          {tillChoices.length > 1 ? (
            <button
              type="button"
              className="btn-touch"
              style={{ marginInlineStart: "auto", background: "var(--surface2)" }}
              onClick={() => {
                if (items.length && !window.confirm(t("pos.changeTillConfirm"))) return;
                setTillConfirmedId("");
                try {
                  sessionStorage.removeItem(tillKey);
                } catch {
                  /* ignore */
                }
              }}
            >
              {t("pos.changeTillLocation")}
            </button>
          ) : null}
        </div>
      )}

      {groomingError ? (
        <div className="card" role="alert" style={{ margin: "0 0 8px", padding: "10px 14px", fontSize: 13 }}>
          {t("pos.todayGrooming")}: {groomingError}
        </div>
      ) : null}

      {todayAppointments.length > 0 ? (
        <div className="card" style={{ margin: "0 0 8px", padding: "10px 14px" }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>{t("pos.todayGrooming")}</div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {todayAppointments.slice(0, 6).map((row) => (
              <li key={row.id} style={{ fontSize: 13 }}>
                {new Date(row.startAt).toLocaleTimeString(locale === "en" ? "en-GB" : "ar-QA", { timeZone: "Asia/Qatar", hour: "2-digit", minute: "2-digit" })}
                {" · "}
                {row.customer?.name || "—"}
                {row.petName ? ` · ${row.petName}` : ""}
                {row.service?.name ? ` · ${row.service.name}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 16,
        }}
        className="pos-grid"
      >
        <style>{`
          @media (min-width: 960px) {
            .pos-grid { grid-template-columns: minmax(0, 1fr) minmax(300px, 400px) !important; align-items: stretch !important; }
          }
        `}</style>
        <div className="pos-products-frame pos-products-frame--cart">
          {hasBelowCostWarning ? (
            <div className="pos-cart-banner" role="status">
              {t("pos.belowCostBanner")}
            </div>
          ) : null}
          <PosCartPanel
            lines={items}
            onChangeQty={(id, v) => setQty(id, Number(v))}
            onRemove={removeLine}
            total={cartSubtotal}
            canGiveFree={canGiveFree}
            isFree={isFreeLine}
            onToggleFree={toggleFree}
          />
        </div>
        <div className="pos-checkout-column">
          <div className="pos-column-scroll">
          <div className="card">
            <div style={{ fontWeight: 800, marginBottom: 8 }}>{t("pos.heldList")}</div>
            {heldList.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 14 }}>{t("pos.heldEmpty")}</div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {heldList.map((h) => (
                  <li
                    key={h.id}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <span style={{ flex: "1 1 140px", fontSize: 14 }}>
                      {h.label || `#${h.id.slice(0, 8)}`}
                      <span style={{ color: "var(--muted)", marginInlineStart: 8 }}>
                        {Number(h.subtotal).toFixed(2)} {currencyLabel} · {h.lineCount}{" "}
                        {locale === "en" ? "lines" : "سطر"}
                      </span>
                    </span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      {h.user?.name || "—"}
                    </span>
                    <button type="button" className="btn-touch" style={{ background: "var(--accent)", color: "#fff" }} onClick={() => restoreHeld(h)}>
                      {t("pos.heldRestore")}
                    </button>
                    <button type="button" className="btn-touch" style={{ background: "var(--danger)", color: "#fff" }} onClick={() => deleteHeld(h.id)}>
                      {t("pos.heldDelete")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                placeholder={t("pos.holdLabel")}
                value={holdLabel}
                onChange={(e) => setHoldLabel(e.target.value)}
                style={{
                  minHeight: 44,
                  padding: "0 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                }}
              />
              <button
                type="button"
                className="btn-touch"
                disabled={loading || !items.length}
                onClick={holdCart}
                style={{ background: "var(--surface2)", maxWidth: 280 }}
              >
                {t("pos.holdCart")} / {t("pos.holdSave")}
              </button>
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 800, marginBottom: 8 }}>{t("pos.customer")}</div>
            <select
              value={customerId}
              onChange={(e) => {
                const id = e.target.value;
                setCustomerId(id);
                const c = customers.find((x) => x.id === id);
                if (c?.address && String(c.address).trim()) {
                  setDeliveryAddress(String(c.address).trim());
                }
              }}
              style={{
                width: "100%",
                minHeight: 44,
                marginBottom: 10,
                padding: "8px 12px",
                borderRadius: 12,
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
            >
              <option value="">{t("pos.walkIn")}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` — ${c.phone}` : ""}
                </option>
              ))}
            </select>
            {paymentMethod === "ON_DELIVERY" && !splitEnabled ? (
              <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {t("pos.deliveryAddress")} *
                </span>
                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder={t("pos.deliveryAddressPh")}
                  rows={2}
                  required
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    resize: "vertical",
                    fontSize: 16,
                  }}
                />
              </label>
            ) : null}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <input
                placeholder={t("pos.quickCustomer")}
                value={quickCustomerName}
                onChange={(e) => setQuickCustomerName(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 140,
                  minHeight: 44,
                  padding: "0 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                }}
              />
              <button
                type="button"
                className="btn-touch"
                disabled={!quickCustomerName.trim()}
                onClick={async () => {
                  const name = quickCustomerName.trim();
                  if (!name) return;
                  setMsg("");
                  try {
                    const c = await api("/api/customers", {
                      method: "POST",
                      body: {
                        name,
                        ...(deliveryAddress.trim() ? { address: deliveryAddress.trim() } : {}),
                      },
                    });
                    setCustomers((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
                    setCustomerId(c.id);
                    setQuickCustomerName("");
                  } catch (e) {
                    setMsg(e.message || t("pos.saleFailed"));
                  }
                }}
                style={{ background: "var(--surface2)" }}
              >
                {t("pos.quickCustomerBtn")}
              </button>
            </div>
            {selectedCustomer && selectedCustomer.accountBalance != null ? (
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
                {t("receivable.balance")}:{" "}
                <strong>{Number(selectedCustomer.accountBalance).toFixed(2)}</strong> {currencyLabel}
              </div>
            ) : null}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("pos.couponCode")}</span>
              <input
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                style={{
                  minHeight: 44,
                  padding: "0 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                }}
              />
            </label>
            <PaymentSectionHeading t={t} />
            <SplitPaymentToggle
              enabled={splitEnabled}
              onChange={(v) => {
                setSplitEnabled(v);
                setPayNowInput("");
                setMsg("");
              }}
              t={t}
            />
            {!splitEnabled ? (
              <>
                <PaymentMethodIconGroup
                  value={paymentMethod}
                  onChange={(m) => {
                    setPaymentMethod(m);
                    setPayNowInput("");
                    setMsg("");
                  }}
                  t={t}
                  methodIds={paymentMethodIds}
                />
                {customerId && ["CASH", "CARD", "ONLINE"].includes(paymentMethod) ? (
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("pos.payNowPartial")}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={payNowInput}
                      onChange={(e) => setPayNowInput(e.target.value)}
                      placeholder={String(amountDue)}
                      style={{
                        minHeight: 44,
                        padding: "0 12px",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "var(--bg)",
                        color: "var(--text)",
                      }}
                    />
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      {t("pos.payNowHint", { total: amountDue.toFixed(2) })}
                    </span>
                  </label>
                ) : null}
                {paymentMethod === "CASH" ? (
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("pos.cashReceived")}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      placeholder={amountDue.toFixed(2)}
                      style={{
                        minHeight: 44,
                        padding: "0 12px",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "var(--bg)",
                        color: "var(--text)",
                      }}
                    />
                    {cashTendered.trim() !== "" &&
                    round2(Number.parseFloat(String(cashTendered).replace(",", ".")) || 0) + 0.001 >= amountDue ? (
                      <span style={{ fontSize: 13, fontWeight: 700 }}>
                        {t("pos.changeDue")}{" "}
                        {round2(
                          round2(Number.parseFloat(String(cashTendered).replace(",", ".")) || 0) - amountDue
                        ).toFixed(2)}{" "}
                        {currencyLabel}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("pos.cashReceivedHint")}</span>
                    )}
                  </label>
                ) : null}
                {paymentMethod === "BANK_TRANSFER" ? (
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("so.transferReference")}</span>
                    <input
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder={t("so.transferReferenceHint")}
                      aria-label={t("so.transferReference")}
                    />
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("so.transferNotCash")}</span>
                  </label>
                ) : null}
                {paymentMethod === "FAWRAN" || paymentMethod === "PAYMENT_LINK" ? (
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("pos.paymentReference")}</span>
                    <input
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder={t("pos.paymentReferenceHint")}
                      style={{
                        minHeight: 44,
                        padding: "0 12px",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "var(--bg)",
                        color: "var(--text)",
                      }}
                    />
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("pos.paymentReferenceNote")}</span>
                  </label>
                ) : null}
                {paymentMethod === "PAYMENT_LINK" ? (
                  <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                    <button
                      type="button"
                      className="btn-touch"
                      onClick={async () => {
                        try {
                          const link = await api("/api/sales/payment-link", {
                            method: "POST",
                            body: {
                              amount: amountDue,
                              branchId,
                              name: selectedCustomer?.name || "Customer",
                              phone: selectedCustomer?.phone || "",
                              email: selectedCustomer?.email || "",
                            },
                          });
                          setPayLink(link);
                          setPaymentReference(link.id || "");
                        } catch (err) {
                          setMsg(err.message);
                        }
                      }}
                    >
                      {t("shop.payLink")}
                    </button>
                    {payLink?.payUrl ? (
                      <>
                        <a href={payLink.payUrl} target="_blank" rel="noreferrer">{payLink.payUrl}</a>
                        {payLink.qr ? <img src={payLink.qr} alt="" width={180} height={180} /> : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
                {splitRows.map((row, idx) => (
                  <div key={idx} className="pos-split-row">
                    <PaymentMethodIconGroup
                      compact
                      methodIds={SPLIT_PAYMENT_METHOD_IDS}
                      value={row.method}
                      onChange={(m) => {
                        setSplitRows((rows) => rows.map((r, j) => (j === idx ? { ...r, method: m } : r)));
                      }}
                      t={t}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={t("pos.splitAmount")}
                      value={row.amount}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSplitRows((rows) => rows.map((r, j) => (j === idx ? { ...r, amount: v } : r)));
                      }}
                      style={{
                        minHeight: 44,
                        minWidth: 100,
                        padding: "0 12px",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "var(--bg)",
                        color: "var(--text)",
                      }}
                    />
                    <button type="button" className="btn-touch" style={{ background: "var(--surface2)" }} onClick={() => fillRemainder(idx)}>
                      {t("pos.splitRemainder")}
                    </button>
                    {splitRows.length > 2 ? (
                      <button
                        type="button"
                        className="btn-touch"
                        style={{ background: "var(--danger)", color: "#fff" }}
                        onClick={() => setSplitRows((rows) => rows.filter((_, j) => j !== idx))}
                      >
                        {t("common.delete")}
                      </button>
                    ) : null}
                  </div>
                ))}
                <button type="button" className="btn-touch" style={{ background: "var(--surface2)", maxWidth: 220 }} onClick={addSplitRow}>
                  {t("pos.splitAdd")}
                </button>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>
                  {t("pos.afterDiscount")}: {amountDue.toFixed(2)} {currencyLabel}
                  {" · "}
                  {t("pos.splitSum")}: {splitSum.toFixed(2)}
                  {Math.abs(splitRemaining) > 0.009 ? (
                    <span style={{ color: splitRemaining > 0 ? "var(--warn, #b45309)" : "var(--danger)" }}>
                      {" · "}
                      {splitRemaining > 0
                        ? t("pos.splitLeft", { n: splitRemaining.toFixed(2) })
                        : t("pos.splitOver", { n: Math.abs(splitRemaining).toFixed(2) })}
                    </span>
                  ) : (
                    <span style={{ color: "var(--success, #15803d)" }}>
                      {" · "}
                      {t("pos.splitBalanced")}
                    </span>
                  )}
                </div>
              </div>
            )}
            {canGiveFree && items.length ? (
              <div className="card" style={{ display: "grid", gap: 6, marginBottom: 10, padding: 10 }}>
                <label className="pos-free-toggle">
                  <input type="checkbox" checked={wholeFree} onChange={(e) => setWholeFree(e.target.checked)} />
                  <span>{t("so.wholeInvoiceFree")}</span>
                </label>
                {anyFree ? (
                  <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("so.freeReason")} *</span>
                    <input type="text" value={freeReason} onChange={(e) => setFreeReason(e.target.value)} placeholder={t("so.freeReasonPh")} aria-label={t("so.freeReason")} />
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("so.freeHint", { n: freeTotal.toFixed(2) })}</span>
                  </label>
                ) : null}
              </div>
            ) : null}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("pos.discountLabel")}</span>
              <input
                type="text"
                inputMode="decimal"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                placeholder="0"
                style={{
                  minHeight: 44,
                  padding: "0 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                }}
              />
            </label>
            {discountNum > 0 ? (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {t("pos.discountReason")}
                </span>
                <input
                  type="text"
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                  placeholder={t("pos.discountReasonPh")}
                  style={{
                    minHeight: 44,
                    padding: "0 12px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text)",
                  }}
                />
              </label>
            ) : null}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14 }}>
              <span>{t("pos.subtotal")}</span>
              <span>
                {cartSubtotal.toFixed(2)} {currencyLabel}
              </span>
            </div>
            {discountNum > 0 ? (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14, color: "var(--muted)" }}>
                <span>{t("invoice.discount")}</span>
                <span>
                  −{discountNum.toFixed(2)} {currencyLabel}
                </span>
              </div>
            ) : null}
            {promoDiscount > 0 ? (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14, color: "var(--muted)" }}>
                <span>{t("pos.offers")}</span>
                <span>
                  −{promoDiscount.toFixed(2)} {currencyLabel}
                </span>
              </div>
            ) : null}
            {promoQuote.key === quoteKey && promoQuote.couponValid === false ? (
              <div style={{ marginBottom: 6, fontSize: 13, color: "var(--danger)" }}>{t("pos.couponInvalid")}</div>
            ) : null}
          </div>

          {lastSale ? (
            <div className="card pos-last-sale-actions">
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{t("invoice.copyHint")}</div>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--muted)" }}>{t("pos.thermalHint")}</p>
              <button type="button" className="btn-touch" style={{ background: "var(--surface2)", maxWidth: 320 }} onClick={copyLastReceipt}>
                {copyDone ? t("pos.receiptCopied") : t("pos.copyReceipt")}
              </button>
            </div>
          ) : null}
          </div>

          <div className="pos-checkout-dock" aria-label={t("pos.checkout")}>
            <div className="pos-checkout-dock__total">
              <span>{t("pos.afterDiscount")}</span>
              <span>
                {amountDue.toFixed(2)} {currencyLabel}
              </span>
            </div>
            {items.length > 0 ? (
              <div className="pos-checkout-dock__hint">
                {items.length} {locale === "en" ? "lines" : "سطر"} · {t("pos.subtotal")}{" "}
                {cartSubtotal.toFixed(2)} {currencyLabel}
              </div>
            ) : null}
            {msg ? <div className="pos-checkout-dock__msg">{msg}</div> : null}
            <div className="pos-checkout-dock__actions">
              {paymentMethod === "ON_DELIVERY" && !splitEnabled ? (
                <button
                  type="button"
                  className="btn-touch pos-checkout-dock__hold"
                  disabled={loading || !items.length}
                  onClick={holdCart}
                >
                  {loading ? t("pos.processing") : t("pos.holdCart")}
                </button>
              ) : null}
              <button
                type="button"
                className="btn-touch pos-checkout-dock__btn"
                disabled={loading || !items.length || !tillOpen}
                onClick={checkout}
              >
                {loading ? t("pos.processing") : t("pos.checkout")}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`print-invoice ${classFor("retail")}`}
        style={{ position: "fixed", left: -99999, top: 0, width: 400 }}
      >
        <InvoicePrint sale={lastSale} branchName={branchName} />
      </div>
    </div>
  );
}
