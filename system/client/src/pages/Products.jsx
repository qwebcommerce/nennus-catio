import React, { useEffect, useRef, useState } from "react";
import { api, apiBlob, apiUploadExcel, apiUploadImage } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { productDisplayName } from "../utils/productName.js";
import { useActiveBranchId } from "../context/BranchContext.jsx";
import { ProductImagePreview } from "../components/ProductImagePreview.jsx";
import { BarcodeLabelPrint } from "../components/BarcodeLabelPrint.jsx";
import { usePrintSettings } from "../context/PrintSettingsContext.jsx";
import { isVerticalFeatureEnabled } from "../lib/verticalFeatures.js";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function emptyProductForm() {
  return {
    name: "",
    nameEn: "",
    price: "",
    wholesalePrice: "",
    cost: "",
    categoryId: "",
    subcategoryId: "",
    imageUrl: "",
    sku: "",
    barcode: "",
    initialStock: "",
    minStockLevel: "",
    expiryDate: todayISO(),
    /** @type {{ key: string, label: string, labelAr: string, priceDelta: string }[]} */
    modifiers: [],
  };
}

export default function Products() {
  const { user, isAdmin, can } = useAuth();
  const { t, locale } = useI18n();
  const { showToast } = useToast();
  const { classFor } = usePrintSettings();
  const [list, setList] = useState([]);
  const [printProduct, setPrintProduct] = useState(null);
  const [printBarcodeCode, setPrintBarcodeCode] = useState("");
  const [low, setLow] = useState([]);
  const [lotsProduct, setLotsProduct] = useState(null);
  const [lotsRows, setLotsRows] = useState([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [lotsMsg, setLotsMsg] = useState("");
  const [form, setForm] = useState(() => emptyProductForm());
  const [formMode, setFormMode] = useState(null); // null | "create" | "edit"
  const [editId, setEditId] = useState("");
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const imageFileRef = useRef(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [excelBusy, setExcelBusy] = useState(false);
  const [importRows, setImportRows] = useState(null); // null | array
  const [importBusy, setImportBusy] = useState(false);
  const fileRef = useRef(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [catalog, setCatalog] = useState({ categories: [], subcategories: [], skus: [] });

  const activeBranchId = useActiveBranchId();
  const canEditProducts = can("productsEdit");
  const showLots = isVerticalFeatureEnabled("lotsExpiry", user?.businessVertical);
  const showCafeModifiers = isVerticalFeatureEnabled("cafePosExtras", user?.businessVertical);

  const catalogLabel = (row) => {
    if (!row) return "";
    if (locale === "en" && row.nameEn?.trim()) return row.nameEn.trim();
    return row.name || row.nameEn || "";
  };

  const modalSubs = catalog.subcategories.filter((s) => !form.categoryId || s.categoryId === form.categoryId);
  const modalSkus = catalog.skus.filter(
    (s) => !form.subcategoryId || !s.subcategoryId || s.subcategoryId === form.subcategoryId
  );

  const loadCatalog = async () => {
    const data = await api("/api/catalog");
    setCatalog({
      categories: Array.isArray(data?.categories) ? data.categories : [],
      subcategories: Array.isArray(data?.subcategories) ? data.subcategories : [],
      skus: Array.isArray(data?.skus) ? data.skus : [],
    });
  };

  const load = async () => {
    const bid = activeBranchId;
    const qs = new URLSearchParams();
    if (bid) qs.set("branchId", bid);
    if (search) qs.set("search", search);
    qs.set("includeInactive", "1");
    qs.set("page", String(page));
    qs.set("pageSize", String(pageSize));
    qs.set("paginate", "1");
    const q = qs.toString() ? `?${qs.toString()}` : "";
    const [res, l] = await Promise.all([
      api(`/api/products${q}`),
      api(`/api/inventory/low-stock${bid ? `?branchId=${bid}` : ""}`),
    ]);
    if (res && Array.isArray(res.items)) {
      setList(res.items);
      setTotal(res.total ?? 0);
    } else {
      setList(Array.isArray(res) ? res : []);
      setTotal(Array.isArray(res) ? res.length : 0);
    }
    setLow(l);
  };

  useEffect(() => {
    setPage(1);
  }, [user?.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();
      setSearch((prev) => {
        if (prev !== next) setPage(1);
        return next;
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadCatalog().catch(() => {});
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [activeBranchId, page, pageSize, search]);

  const closeFormModal = () => {
    setFormMode(null);
    setEditId("");
    setFormError("");
    setForm(emptyProductForm());
  };

  const openCreateModal = () => {
    setForm(emptyProductForm());
    setEditId("");
    setFormError("");
    setFormMode("create");
  };

  const openEditModal = (p) => {
    const mods = Array.isArray(p.modifiers)
      ? p.modifiers.map((m) => ({
          key: String(m.key || ""),
          label: String(m.label || ""),
          labelAr: String(m.labelAr || ""),
          priceDelta: String(m.priceDelta ?? "0"),
        }))
      : [];
    const inv = Array.isArray(p.inventories) ? p.inventories[0] : null;
    setForm({
      name: p.name && p.nameEn && p.name === p.nameEn ? "" : p.name || "",
      nameEn: p.nameEn || "",
      price: String(p.price ?? ""),
      wholesalePrice: p.wholesalePrice != null ? String(p.wholesalePrice) : "",
      cost: p.cost != null ? String(p.cost) : "",
      categoryId: p.categoryId || "",
      subcategoryId: p.subcategoryId || "",
      imageUrl: p.imageUrl || "",
      sku: p.sku || "",
      barcode: p.barcode || "",
      initialStock: "",
      minStockLevel: inv?.minStockLevel != null ? String(inv.minStockLevel) : "5",
      expiryDate: p.expiryDate ? String(p.expiryDate).slice(0, 10) : todayISO(),
      modifiers: mods,
    });
    setEditId(p.id);
    setFormError("");
    setFormMode("edit");
  };

  const validateProductFields = (data) => {
    const nameEn = String(data.nameEn || "").trim();
    if (!nameEn || nameEn.length < 2) return t("products.nameEnRequired");
    if (data.name && String(data.name).trim().length > 120) return t("products.errNameLong");
    const price = Number(data.price);
    if (data.price === "" || Number.isNaN(price) || price < 0) return t("products.errPrice");
    if (data.cost !== "" && data.cost != null) {
      const c = Number(data.cost);
      if (Number.isNaN(c) || c < 0) return t("products.errCost");
    }
    if (data.wholesalePrice !== "" && data.wholesalePrice != null) {
      const w = Number(data.wholesalePrice);
      if (Number.isNaN(w) || w < 0) return t("products.errWholesale");
    }
    if (!data.categoryId) return t("products.categoryRequired");
    const img = String(data.imageUrl || "").trim();
    if (!img) return t("products.imageRequired");
    if (!/^https?:\/\/\S+/i.test(img) && !img.startsWith("/")) return t("products.errImageUrl");
    if (data.initialStock != null && data.initialStock !== "") {
      const s = Number(data.initialStock);
      if (Number.isNaN(s) || s < 0 || !Number.isInteger(s)) return t("products.errStock");
    }
    if (data.minStockLevel != null && data.minStockLevel !== "") {
      const m = Number(data.minStockLevel);
      if (Number.isNaN(m) || m < 0 || !Number.isInteger(m)) return t("products.errMinStock");
    }
    return "";
  };

  const submitProductForm = async (e) => {
    e.preventDefault();
    setFormError("");
    const err = validateProductFields(form);
    if (err) {
      setFormError(err);
      return;
    }
    setFormBusy(true);
    try {
      const modifiersPayload = showCafeModifiers
        ? (form.modifiers || [])
            .map((m) => ({
              key: String(m.key || "").trim(),
              label: String(m.label || m.key || "").trim(),
              labelAr: String(m.labelAr || "").trim() || null,
              priceDelta: Number(String(m.priceDelta).replace(",", ".")) || 0,
            }))
            .filter((m) => m.key)
        : undefined;
      if (formMode === "create") {
        const bid = activeBranchId;
        if (!bid) {
          setFormError(t("products.pickBranch"));
          return;
        }
        await api("/api/products", {
          method: "POST",
          body: {
            name: form.name?.trim() || "",
            nameEn: form.nameEn.trim(),
            price: Number(form.price),
            wholesalePrice: form.wholesalePrice === "" ? null : Number(form.wholesalePrice),
            cost: form.cost === "" ? null : Number(form.cost),
            categoryId: form.categoryId || null,
            subcategoryId: form.subcategoryId || null,
            sku: form.sku || null,
            barcode: form.barcode || null,
            imageUrl: form.imageUrl.trim(),
            branchId: bid,
            petType: "OTHER",
            initialStock: form.initialStock === "" ? 0 : Number(form.initialStock),
            minStockLevel: form.minStockLevel === "" ? 5 : Number(form.minStockLevel),
            expiryDate: form.expiryDate?.trim() || null,
            ...(modifiersPayload !== undefined ? { modifiers: modifiersPayload } : {}),
          },
        });
        showToast(t("products.toastCreated"), "success");
      } else if (formMode === "edit" && editId) {
        await api(`/api/products/${editId}`, {
          method: "PATCH",
          body: {
            name: form.name?.trim() || "",
            nameEn: form.nameEn.trim(),
            price: Number(form.price),
            wholesalePrice: form.wholesalePrice === "" ? null : Number(form.wholesalePrice),
            cost: form.cost === "" ? null : Number(form.cost),
            expiryDate: form.expiryDate === "" ? null : form.expiryDate,
            petType: "OTHER",
            categoryId: form.categoryId || null,
            subcategoryId: form.subcategoryId || null,
            imageUrl: String(form.imageUrl || "").trim(),
            sku: form.sku || null,
            barcode: form.barcode,
            ...(modifiersPayload !== undefined ? { modifiers: modifiersPayload } : {}),
          },
        });
        const bid = activeBranchId;
        if (bid && form.minStockLevel !== "" && form.minStockLevel != null) {
          await api(`/api/inventory/${editId}/${bid}`, {
            method: "PATCH",
            body: { minStockLevel: Number(form.minStockLevel) },
          });
        }
        showToast(t("products.toastUpdated"), "success");
      }
      closeFormModal();
      await load();
    } catch (ex) {
      setFormError(ex.message || t("products.saveFailed"));
      showToast(ex.message || t("products.saveFailed"), "error");
    } finally {
      setFormBusy(false);
    }
  };

  const remove = async (id) => {
    if (!confirm(t("products.confirmDelete"))) return;
    try {
      await api(`/api/products/${id}`, { method: "DELETE" });
      showToast(t("products.toastDeleted"), "success");
      await load();
    } catch (e) {
      showToast(e.message || t("products.deleteFailed"), "error");
    }
  };

  const toggleActive = async (p) => {
    try {
      await api(`/api/products/${p.id}`, {
        method: "PATCH",
        body: { isActive: !p.isActive },
      });
      showToast(p.isActive ? t("products.toastDisabled") : t("products.toastEnabled"), "success");
      await load();
    } catch (e) {
      showToast(e.message || t("products.saveFailed"), "error");
    }
  };

  const idsOnPage = list.map((p) => p.id);
  const allSelectedOnPage =
    idsOnPage.length > 0 && idsOnPage.every((id) => selectedIds.includes(id));

  const toggleSelectRow = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const generateBarcode = async () => {
    try {
      const qs =
        formMode === "edit" && editId
          ? `?excludeProductId=${encodeURIComponent(editId)}`
          : "";
      const { barcode: b } = await api(`/api/products/generate-barcode${qs}`);
      setForm((f) => ({ ...f, barcode: b }));
      showToast(t("products.toastBarcode"), "success");
    } catch (e) {
      showToast(e?.message || t("products.generateBarcodeFailed"), "error");
    }
  };

  const printBarcode = (p) => {
    const code = String(p.barcode || p.sku || "").trim();
    if (!code) {
      showToast(t("products.noBarcodeToPrint"), "error");
      return;
    }
    setPrintProduct(p);
    setPrintBarcodeCode(code);
    setTimeout(() => window.print(), 180);
  };

  const openLots = async (p) => {
    if (!activeBranchId) {
      showToast(t("products.needBranchForLots"), "error");
      return;
    }
    setLotsProduct(p);
    setLotsRows([]);
    setLotsMsg("");
    setLotsLoading(true);
    try {
      const q = new URLSearchParams();
      q.set("branchId", activeBranchId);
      const res = await api(`/api/products/${encodeURIComponent(p.id)}/lots?${q.toString()}`);
      setLotsRows(Array.isArray(res?.lots) ? res.lots : []);
      if (!(res?.lots || []).length) setLotsMsg(t("products.lotsEmpty"));
    } catch (e) {
      setLotsMsg(e.message || t("products.lotsLoadFailed"));
    } finally {
      setLotsLoading(false);
    }
  };

  const toggleSelectAllOnPage = () => {
    if (allSelectedOnPage) {
      setSelectedIds((prev) => prev.filter((id) => !idsOnPage.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...idsOnPage])]);
    }
  };

  const runBulkPatch = async (isActive) => {
    if (selectedIds.length === 0) return;
    const n = selectedIds.length;
    const ids = [...selectedIds];
    setBulkBusy(true);
    let ok = 0;
    try {
      for (const id of ids) {
        try {
          await api(`/api/products/${id}`, {
            method: "PATCH",
            body: { isActive },
          });
          ok += 1;
        } catch {
          /* continue */
        }
      }
      setSelectedIds([]);
      await load();
      if (ok < n) showToast(t("products.bulkFailed"), "error");
      else showToast(t("products.bulkDone", { n: ok }), "success");
    } catch (e) {
      showToast(e.message || t("products.bulkFailed"), "error");
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkEnable = () => runBulkPatch(true);
  const bulkDisable = () => runBulkPatch(false);

  const bulkDelete = async () => {
    if (selectedIds.length === 0 || !isAdmin) return;
    if (!confirm(t("products.bulkConfirmDelete", { n: selectedIds.length }))) return;
    setBulkBusy(true);
    const toDelete = [...selectedIds];
    let ok = 0;
    try {
      for (const id of toDelete) {
        try {
          await api(`/api/products/${id}`, { method: "DELETE" });
          ok += 1;
        } catch {
          /* continue */
        }
      }
      setSelectedIds([]);
      await load();
      if (ok < toDelete.length) showToast(t("products.bulkFailed"), "error");
      else showToast(t("products.bulkDone", { n: ok }), "success");
    } catch (e) {
      showToast(e.message || t("products.bulkFailed"), "error");
    } finally {
      setBulkBusy(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / pageSize) || 1);

  const fmtExpiry = (iso) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "ar-SA");
    } catch {
      return "—";
    }
  };

  const downloadExcel = async () => {
    if (!activeBranchId) {
      showToast(t("products.excelPickBranch"), "error");
      return;
    }
    setExcelBusy(true);
    try {
      const blob = await apiBlob(
        `/api/products/export/excel?branchId=${encodeURIComponent(activeBranchId)}`
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "products-export.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      showToast(t("products.toastExported"), "success");
    } catch (e) {
      showToast(e.message || "Export failed", "error");
    } finally {
      setExcelBusy(false);
    }
  };

  const onExcelFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !activeBranchId) {
      if (!activeBranchId) showToast(t("products.excelPickBranch"), "error");
      return;
    }
    setExcelBusy(true);
    try {
      const r = await apiUploadExcel("/api/products/import/excel/preview", file, activeBranchId);
      const rows = Array.isArray(r.rows) ? r.rows : [];
      if (!rows.length) {
        showToast(t("products.excelEmpty"), "error");
        return;
      }
      setImportRows(rows);
    } catch (err) {
      showToast(err.message || "Import failed", "error");
    } finally {
      setExcelBusy(false);
    }
  };

  const closeImportModal = () => {
    if (importBusy) return;
    setImportRows(null);
  };

  const removeImportRow = (key) => {
    setImportRows((prev) => (prev ? prev.filter((r) => r.key !== key) : prev));
  };

  const clearImportRows = () => setImportRows([]);

  const submitImportRows = async () => {
    if (!importRows?.length || !activeBranchId) {
      showToast(t("products.excelNoRows"), "error");
      return;
    }
    setImportBusy(true);
    try {
      const r = await api(`/api/products/import/excel/confirm?branchId=${encodeURIComponent(activeBranchId)}`, {
        method: "POST",
        body: { rows: importRows, branchId: activeBranchId },
      });
      const msg = t("products.excelResult", {
        created: r.created ?? 0,
        updated: r.updated ?? 0,
        errors: r.errorCount ?? 0,
      });
      const detail =
        r.errors?.length > 0
          ? `\n${r.errors
              .slice(0, 5)
              .map((x) => (locale === "en" ? `Row ${x.row}: ${x.message}` : `صف ${x.row}: ${x.message}`))
              .join("\n")}${r.errors.length > 5 ? "\n…" : ""}`
          : "";
      showToast(msg + detail, (r.errorCount ?? 0) > 0 ? "info" : "success", { duration: 5000 });
      setImportRows(null);
      await load();
    } catch (err) {
      showToast(err.message || "Import failed", "error");
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>{t("products.title")}</h1>
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t("products.searchPlaceholder")}
          aria-label={t("products.searchPlaceholder")}
          style={{
            flex: "1 1 220px",
            minWidth: 180,
            maxWidth: 360,
            minHeight: 44,
            padding: "0.55rem 0.85rem",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
          }}
        />
        {canEditProducts ? (
          <button
            type="button"
            className="btn-touch"
            onClick={openCreateModal}
            style={{ background: "var(--accent)", color: "#fff", marginInlineStart: "auto" }}
          >
            {t("products.addProduct")}
          </button>
        ) : null}
      </div>

      {canEditProducts ? (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <strong>{t("products.excelTitle")}</strong>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{t("products.excelHint")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              className="btn-touch"
              disabled={excelBusy || !activeBranchId}
              onClick={downloadExcel}
              style={{ background: "var(--surface2)", color: "var(--text)", minHeight: 44 }}
            >
              {t("products.excelDownload")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              style={{ display: "none" }}
              onChange={onExcelFile}
            />
            <button
              type="button"
              className="btn-touch"
              disabled={excelBusy || !activeBranchId}
              onClick={() => fileRef.current?.click()}
              style={{ background: "var(--accent)", color: "#fff", minHeight: 44 }}
            >
              {t("products.excelUpload")}
            </button>
          </div>
        </div>
      ) : null}

      {low.length ? (
        <div className="card" style={{ borderInlineStart: "4px solid var(--warning)" }}>
          <strong>{t("products.lowStockTitle")}</strong>
          <ul style={{ margin: "8px 0 0", paddingInlineStart: 20 }}>
            {low.slice(0, 8).map((r) => (
              <li key={r.id}>
                {t("products.lowStockLine", {
                  name: r.product.name,
                  qty: r.quantity,
                  min: r.minStockLevel,
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="card" style={{ overflowX: "auto" }}>
        {canEditProducts && selectedIds.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 10,
              marginBottom: 12,
              padding: "10px 12px",
              borderRadius: 12,
              background: "var(--surface2)",
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ fontWeight: 700 }}>{t("products.bulkSelected", { n: selectedIds.length })}</span>
            <button
              type="button"
              className="btn-touch"
              disabled={bulkBusy}
              onClick={bulkEnable}
              style={{ background: "var(--success)", color: "#fff" }}
            >
              {t("products.bulkEnable")}
            </button>
            <button
              type="button"
              className="btn-touch"
              disabled={bulkBusy}
              onClick={bulkDisable}
              style={{ background: "var(--warning)", color: "#111" }}
            >
              {t("products.bulkDisable")}
            </button>
            {isAdmin ? (
              <button
                type="button"
                className="btn-touch"
                disabled={bulkBusy}
                onClick={bulkDelete}
                style={{ background: "var(--danger)", color: "#fff" }}
              >
                {t("products.bulkDelete")}
              </button>
            ) : null}
            <button
              type="button"
              className="btn-touch"
              disabled={bulkBusy}
              onClick={() => setSelectedIds([])}
              style={{ background: "transparent", color: "var(--muted)", marginInlineStart: "auto" }}
            >
              {t("common.cancel")}
            </button>
          </div>
        ) : null}
        <table className="products-table">
          <thead>
            <tr>
              {canEditProducts ? (
                <th className="products-table__check">
                  <input
                    type="checkbox"
                    checked={allSelectedOnPage}
                    onChange={toggleSelectAllOnPage}
                    disabled={!list.length || bulkBusy}
                    title={t("products.colSelect")}
                    aria-label={t("products.colSelect")}
                  />
                </th>
              ) : null}
              <th className="products-table__img">{t("products.colImage")}</th>
              <th className="products-table__name">{t("products.name")}</th>
              <th>{t("products.sku")}</th>
              <th>{t("products.category")}</th>
              <th className="products-table__num">{t("products.colPurchase")}</th>
              <th className="products-table__num">{t("products.colRetail")}</th>
              <th className="products-table__num">{t("products.colWholesale")}</th>
              <th>{t("products.colExpiry")}</th>
              <th className="products-table__num">{t("products.colStock")}</th>
              <th>{t("products.colStatus")}</th>
              <th className="products-table__actions">{t("products.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const inv = p.inventories?.[0];
              return (
                <tr key={p.id}>
                  {canEditProducts ? (
                    <td className="products-table__check">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(p.id)}
                        onChange={() => toggleSelectRow(p.id)}
                        disabled={bulkBusy}
                        aria-label={t("products.colSelect")}
                      />
                    </td>
                  ) : null}
                  <td className="products-table__img">
                    <ProductImagePreview url={p.imageUrl} alt="" width={48} height={48} />
                  </td>
                  <td className="products-table__name">{productDisplayName(p, locale)}</td>
                  <td>{p.sku || "—"}</td>
                  <td>
                    <div>{catalogLabel(p.productCategory) || p.category || "—"}</div>
                    {p.productSubcategory ? (
                      <div className="products-table__sub">{catalogLabel(p.productSubcategory)}</div>
                    ) : null}
                  </td>
                  <td className="products-table__num">{p.cost != null ? Number(p.cost).toFixed(2) : "—"}</td>
                  <td className="products-table__num">{Number(p.price).toFixed(2)}</td>
                  <td className="products-table__num">
                    {p.wholesalePrice != null ? Number(p.wholesalePrice).toFixed(2) : "—"}
                  </td>
                  <td>{fmtExpiry(p.expiryDate)}</td>
                  <td className="products-table__num">{inv?.quantity ?? t("common.none")}</td>
                  <td>{p.isActive ? t("products.statusActive") : t("products.statusInactive")}</td>
                  <td className="products-table__actions">
                    <div className="products-table__btns">
                      <button
                        type="button"
                        style={{ ...btnSm, background: "var(--accent)", color: "#fff" }}
                        onClick={() => printBarcode(p)}
                        title={t("products.printBarcode")}
                      >
                        {t("products.printBarcode")}
                      </button>
                      {showLots ? (
                        <button
                          type="button"
                          style={{ ...btnSm, background: "var(--surface2)" }}
                          onClick={() => openLots(p)}
                          title={t("products.viewLots")}
                        >
                          {t("products.viewLots")}
                        </button>
                      ) : null}
                      {canEditProducts ? (
                        <>
                          <button type="button" style={btnSm} onClick={() => openEditModal(p)}>
                            {t("common.edit")}
                          </button>
                          <button
                            type="button"
                            style={{ ...btnSm, background: "var(--danger)", color: "#fff" }}
                            onClick={() => remove(p.id)}
                          >
                            {t("common.delete")}
                          </button>
                          <button
                            type="button"
                            style={{
                              ...btnSm,
                              background: p.isActive ? "var(--warning)" : "var(--success)",
                              color: p.isActive ? "#111" : "#fff",
                            }}
                            onClick={() => toggleActive(p)}
                          >
                            {p.isActive ? t("products.disable") : t("products.enable")}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 16,
            paddingTop: 12,
            borderTop: "1px solid var(--border)",
          }}
        >
          <span style={{ color: "var(--muted)", fontSize: 14 }}>
            {t("products.pagination", { total, page, pages })}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn-touch"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{ background: "var(--surface2)" }}
            >
              {t("common.previous")}
            </button>
            <button
              type="button"
              className="btn-touch"
              disabled={page * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
              style={{ background: "var(--surface2)" }}
            >
              {t("common.next")}
            </button>
          </div>
        </div>
      </div>


      {formMode ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "grid",
            placeItems: "center",
            padding: 16,
            background: "rgba(15, 23, 42, 0.55)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !formBusy) closeFormModal();
          }}
        >
          <form
            className="card"
            onSubmit={submitProductForm}
            noValidate
            style={{
              width: "min(720px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
              margin: 0,
              display: "grid",
              gap: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <h3 style={{ margin: 0 }}>{formMode === "edit" ? t("products.editTitle") : t("products.addProduct")}</h3>
              <button
                type="button"
                onClick={closeFormModal}
                disabled={formBusy}
                style={{ ...btnSm, background: "var(--surface2)" }}
              >
                {t("common.close")}
              </button>
            </div>

            {formError ? <div style={{ color: "var(--danger)", fontSize: 14 }}>{formError}</div> : null}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "12px 14px",
                alignItems: "start",
              }}
              className="product-form-grid"
            >
              <label style={fld}>
                <span>{t("products.nameEnField")} *</span>
                <input
                  style={inp}
                  required
                  minLength={2}
                  maxLength={120}
                  value={form.nameEn}
                  onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                />
              </label>
              <label style={fld}>
                <span>{t("products.nameLocalOptional")}</span>
                <input
                  style={inp}
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label style={fld}>
                <span>{t("products.purchasePrice")}</span>
                <input
                  style={inp}
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })}
                />
              </label>
              <label style={fld}>
                <span>{t("products.retailPrice")} *</span>
                <input
                  style={inp}
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </label>
              <label style={fld}>
                <span>{t("products.wholesalePrice")}</span>
                <input
                  style={inp}
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.wholesalePrice}
                  onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })}
                />
              </label>
              <label style={fld}>
                <span>{t("products.expiryDate")}</span>
                <input
                  style={inp}
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                />
              </label>
              <label style={fld}>
                <span>{t("products.category")} *</span>
                <select
                  style={inp}
                  required
                  value={form.categoryId}
                  onChange={(e) =>
                    setForm({ ...form, categoryId: e.target.value, subcategoryId: "", sku: "" })
                  }
                >
                  <option value="">{t("products.pickCategory")}</option>
                  {catalog.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {catalogLabel(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={fld}>
                <span>{t("products.subcategory")}</span>
                <select
                  style={inp}
                  value={form.subcategoryId}
                  disabled={!form.categoryId}
                  onChange={(e) => setForm({ ...form, subcategoryId: e.target.value, sku: "" })}
                >
                  <option value="">{t("products.pickSubcategory")}</option>
                  {modalSubs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {catalogLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={fld}>
                <span>{t("products.sku")}</span>
                <select
                  style={inp}
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                >
                  <option value="">{t("products.pickSku")}</option>
                  {form.sku && !modalSkus.some((s) => s.code === form.sku) ? (
                    <option value={form.sku}>{form.sku}</option>
                  ) : null}
                  {modalSkus.map((s) => (
                    <option key={s.id} value={s.code}>
                      {s.code}
                      {s.name ? ` — ${s.name}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label style={fld}>
                <span>{t("products.barcode")}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                  <input
                    style={{ ...inp, flex: 1, minWidth: 0 }}
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  />
                  {!String(form.barcode || "").trim() ? (
                    <button
                      type="button"
                      onClick={generateBarcode}
                      style={{ ...btnSm, background: "var(--surface2)", alignSelf: "stretch", minHeight: 42 }}
                      title={t("products.generateBarcodeTitle")}
                    >
                      {t("products.generateBarcode")}
                    </button>
                  ) : null}
                </div>
              </label>
              {formMode === "create" ? (
                <label style={fld}>
                  <span>{t("products.initialStock")}</span>
                  <input
                    style={inp}
                    type="number"
                    min={0}
                    step={1}
                    value={form.initialStock}
                    onChange={(e) => setForm({ ...form, initialStock: e.target.value })}
                  />
                </label>
              ) : null}
              <label style={fld}>
                <span>{t("products.minLevel")}</span>
                <input
                  style={inp}
                  type="number"
                  min={0}
                  step={1}
                  value={form.minStockLevel}
                  onChange={(e) => setForm({ ...form, minStockLevel: e.target.value })}
                  disabled={formMode === "edit" && !activeBranchId}
                />
              </label>
              <label style={{ ...fld, gridColumn: "1 / -1" }}>
                <span>{t("products.imageFile")} *</span>
                <input
                  ref={imageFileRef}
                  style={inp}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={formBusy || imageUploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) {
                      setFormError(t("products.imageTooLarge"));
                      return;
                    }
                    setFormError("");
                    setImageUploading(true);
                    try {
                      const res = await apiUploadImage(
                        "/api/products/upload-image",
                        file,
                        formMode === "edit" && editId ? { productId: editId } : {}
                      );
                      if (!res?.url) throw new Error(t("products.imageUploadFailed"));
                      setForm((f) => ({ ...f, imageUrl: res.url }));
                      showToast(t("products.imageUploaded"), "success");
                    } catch (err) {
                      setFormError(err.message || t("products.imageUploadFailed"));
                    } finally {
                      setImageUploading(false);
                    }
                  }}
                />
                <span style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  {imageUploading ? t("products.imageUploading") : t("products.imageFileHint")}
                </span>
              </label>
              {String(form.imageUrl || "").trim() ? (
                <div style={{ gridColumn: "1 / -1" }}>
                  <span style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 8 }}>
                    {t("products.imagePreview")}
                  </span>
                  <ProductImagePreview url={form.imageUrl} alt="" width={140} height={140} />
                </div>
              ) : null}
              {showCafeModifiers ? (
                <div style={{ gridColumn: "1 / -1", display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <strong style={{ fontSize: 14 }}>{t("products.modifiersTitle")}</strong>
                    <button
                      type="button"
                      className="btn-touch"
                      style={{ background: "var(--surface2)", maxWidth: 180 }}
                      onClick={() =>
                        setForm({
                          ...form,
                          modifiers: [
                            ...(form.modifiers || []),
                            { key: "", label: "", labelAr: "", priceDelta: "0" },
                          ],
                        })
                      }
                    >
                      {t("products.addModifier")}
                    </button>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
                    {t("products.modifiersHint")}
                  </p>
                  {(form.modifiers || []).map((m, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                        gap: 8,
                        alignItems: "end",
                      }}
                    >
                      <label style={fld}>
                        <span>{t("products.modKey")}</span>
                        <input
                          style={inp}
                          value={m.key}
                          onChange={(e) => {
                            const modifiers = [...form.modifiers];
                            modifiers[idx] = { ...modifiers[idx], key: e.target.value };
                            setForm({ ...form, modifiers });
                          }}
                        />
                      </label>
                      <label style={fld}>
                        <span>{t("products.modLabelEn")}</span>
                        <input
                          style={inp}
                          value={m.label}
                          onChange={(e) => {
                            const modifiers = [...form.modifiers];
                            modifiers[idx] = { ...modifiers[idx], label: e.target.value };
                            setForm({ ...form, modifiers });
                          }}
                        />
                      </label>
                      <label style={fld}>
                        <span>{t("products.modLabelAr")}</span>
                        <input
                          style={inp}
                          value={m.labelAr}
                          onChange={(e) => {
                            const modifiers = [...form.modifiers];
                            modifiers[idx] = { ...modifiers[idx], labelAr: e.target.value };
                            setForm({ ...form, modifiers });
                          }}
                        />
                      </label>
                      <label style={fld}>
                        <span>{t("products.modDelta")}</span>
                        <input
                          style={inp}
                          type="number"
                          step="0.01"
                          value={m.priceDelta}
                          onChange={(e) => {
                            const modifiers = [...form.modifiers];
                            modifiers[idx] = { ...modifiers[idx], priceDelta: e.target.value };
                            setForm({ ...form, modifiers });
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn-touch"
                        style={{ background: "var(--danger)", color: "#fff", maxWidth: 100 }}
                        onClick={() => {
                          const modifiers = form.modifiers.filter((_, i) => i !== idx);
                          setForm({ ...form, modifiers });
                        }}
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn-touch"
                disabled={formBusy}
                style={{ background: "var(--surface2)" }}
                onClick={closeFormModal}
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className="btn-touch"
                disabled={formBusy}
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {formMode === "edit" ? t("common.save") : t("products.saveProduct")}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {importRows !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="excel-import-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            display: "grid",
            placeItems: "center",
            padding: 16,
            background: "rgba(15, 23, 42, 0.55)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !importBusy) closeImportModal();
          }}
        >
          <div
            className="card"
            style={{
              width: "min(960px, 100%)",
              maxHeight: "90vh",
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              padding: 18,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <h3 id="excel-import-title" style={{ margin: 0 }}>
                  {t("products.excelReviewTitle")}
                </h3>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted)" }}>
                  {t("products.excelReviewHint", { n: importRows.length })}
                </p>
              </div>
              <button
                type="button"
                onClick={closeImportModal}
                disabled={importBusy}
                style={{ ...btnSm, background: "var(--surface2)" }}
              >
                {t("common.close")}
              </button>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                className="btn-touch"
                disabled={importBusy || importRows.length === 0}
                onClick={clearImportRows}
                style={{ background: "var(--surface2)", minHeight: 40 }}
              >
                {t("products.excelRemoveAll")}
              </button>
            </div>

            <div style={{ overflow: "auto", flex: 1, minHeight: 0, border: "1px solid var(--border)", borderRadius: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ position: "sticky", top: 0, background: "var(--surface2)", textAlign: "start" }}>
                    <th style={thCell}>#</th>
                    <th style={thCell}>{t("products.name")}</th>
                    <th style={thCell}>SKU</th>
                    <th style={thCell}>{t("products.category")}</th>
                    <th style={thCell}>{t("products.colRetail")}</th>
                    <th style={thCell}>{t("products.colStock")}</th>
                    <th style={thCell}>{t("products.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                        {t("products.excelNoRows")}
                      </td>
                    </tr>
                  ) : (
                    importRows.map((row) => (
                      <tr
                        key={row.key}
                        style={{
                          borderTop: "1px solid var(--border)",
                          background: row.invalidPrice
                            ? "color-mix(in srgb, #dc2626 8%, transparent)"
                            : undefined,
                        }}
                      >
                        <td style={tdCell}>{row.rowNum}</td>
                        <td style={tdCell}>
                          <div style={{ fontWeight: 600 }}>{row.nameEn || row.name}</div>
                          {row.nameEn && row.name && row.name !== row.nameEn ? (
                            <div style={{ color: "var(--muted)", fontSize: 12 }}>{row.name}</div>
                          ) : null}
                          {row.invalidPrice ? (
                            <div style={{ color: "var(--danger)", fontSize: 12 }}>{t("products.excelInvalidPrice")}</div>
                          ) : null}
                        </td>
                        <td style={tdCell}>{row.sku || "—"}</td>
                        <td style={tdCell}>
                          {[row.category, row.subcategory].filter(Boolean).join(" / ") || "—"}
                        </td>
                        <td style={tdCell}>{row.price === "" || row.price == null ? "—" : row.price}</td>
                        <td style={tdCell}>{row.stockQty === "" || row.stockQty == null ? "—" : row.stockQty}</td>
                        <td style={tdCell}>
                          <button
                            type="button"
                            disabled={importBusy}
                            onClick={() => removeImportRow(row.key)}
                            style={{ ...btnSm, background: "var(--surface2)", color: "var(--danger)" }}
                          >
                            {t("common.delete")}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn-touch"
                disabled={importBusy}
                style={{ background: "var(--surface2)" }}
                onClick={closeImportModal}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="btn-touch"
                disabled={importBusy || importRows.length === 0}
                style={{ background: "var(--accent)", color: "#fff" }}
                onClick={submitImportRows}
              >
                {importBusy ? t("common.loading") : t("products.excelSubmitImport")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {lotsProduct ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            display: "grid",
            placeItems: "center",
            padding: 16,
            background: "rgba(15, 23, 42, 0.55)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setLotsProduct(null);
          }}
        >
          <div className="card" style={{ width: "min(720px, 100%)", maxHeight: "85vh", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>{t("products.lotsTitle")}</h2>
                <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>
                  {productDisplayName(lotsProduct, locale)}
                </p>
              </div>
              <button type="button" className="btn-touch" onClick={() => setLotsProduct(null)}>
                {t("common.cancel")}
              </button>
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--muted)" }}>{t("products.lotsIntro")}</p>
            {lotsLoading ? (
              <div style={{ padding: 16 }}>{t("common.loading")}</div>
            ) : lotsMsg && !lotsRows.length ? (
              <div style={{ padding: "16px 0", color: "var(--muted)" }}>{lotsMsg}</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 12 }}>
                <thead>
                  <tr style={{ color: "var(--muted)", textAlign: "start" }}>
                    <th style={thCell}>{t("products.lotReceived")}</th>
                    <th style={thCell}>{t("products.colExpiry")}</th>
                    <th style={thCell}>{t("products.lotQtyOnHand")}</th>
                    <th style={thCell}>{t("products.lotQtyReceived")}</th>
                    <th style={thCell}>{t("products.colPurchase")}</th>
                  </tr>
                </thead>
                <tbody>
                  {lotsRows.map((lot) => {
                    const exp = lot.expiryDate ? String(lot.expiryDate).slice(0, 10) : "—";
                    const days =
                      lot.expiryDate != null
                        ? Math.ceil(
                            (new Date(lot.expiryDate).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) /
                              86400000,
                          )
                        : null;
                    const tone =
                      days == null
                        ? undefined
                        : days < 0
                          ? "var(--danger)"
                          : days <= 30
                            ? "var(--warning)"
                            : undefined;
                    return (
                      <tr key={lot.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={tdCell}>
                          {lot.receivedAt
                            ? new Date(lot.receivedAt).toLocaleDateString(locale === "en" ? "en-GB" : "ar-SA")
                            : "—"}
                        </td>
                        <td style={{ ...tdCell, color: tone, fontWeight: tone ? 700 : undefined }}>
                          {exp}
                          {days != null ? (
                            <div style={{ fontSize: 11, fontWeight: 500 }}>
                              {days < 0
                                ? t("products.lotExpired")
                                : t("products.lotDaysLeft", { days: String(days) })}
                            </div>
                          ) : null}
                        </td>
                        <td style={tdCell}>{Number(lot.quantityOnHand ?? 0)}</td>
                        <td style={tdCell}>{Number(lot.quantityReceived ?? 0)}</td>
                        <td style={tdCell}>
                          {lot.unitCost != null ? Number(lot.unitCost).toFixed(2) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}

      <div
        className={`print-barcode ${classFor("other")}`}
        style={{ position: "fixed", left: -99999, top: 0, width: 360 }}
        aria-hidden="true"
      >
        <BarcodeLabelPrint product={printProduct} code={printBarcodeCode} />
      </div>
    </div>
  );
}

const thCell = { padding: "10px 12px", fontWeight: 600, whiteSpace: "nowrap" };
const tdCell = { padding: "10px 12px", verticalAlign: "top" };

const inp = {
  padding: 10,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};
const fld = { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 };
const btnSm = {
  padding: "4px 10px",
  minHeight: 28,
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.2,
  borderRadius: 999,
  border: "none",
  cursor: "pointer",
  background: "var(--surface2)",
  color: "var(--text)",
  whiteSpace: "nowrap",
};
