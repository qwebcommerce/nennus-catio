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

function emptyProductForm() {
  return {
    name: "",
    nameEn: "",
    price: "",
    categoryId: "",
    subcategoryId: "",
    imageUrl: "",
    shortTitle: "",
    shortTitleEn: "",
    description: "",
    descriptionEn: "",
    heightCm: "",
    widthCm: "",
    depthCm: "",
    features: "",
    featuresEn: "",
    status: "draft",
    sku: "",
    barcode: "",
    stock: "",
    minStockLevel: "5",
  };
}

export default function Products() {
  const { user, isAdmin, can } = useAuth();
  const { t, locale } = useI18n();
  const { showToast } = useToast();
  const { classFor } = usePrintSettings();
  const [list, setList] = useState([]);
  const [listLoading, setListLoading] = useState(true);
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
  const [statusFilter, setStatusFilter] = useState("all");
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
    setListLoading(true);
    try {
      const bid = activeBranchId;
      const qs = new URLSearchParams();
      if (bid) qs.set("branchId", bid);
      if (search) qs.set("search", search);
      if (statusFilter === "draft" || statusFilter === "published") qs.set("status", statusFilter);
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
    } finally {
      setListLoading(false);
    }
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
  }, [activeBranchId, page, pageSize, search, statusFilter]);

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
    const inv = Array.isArray(p.inventories)
      ? p.inventories.find((row) => !activeBranchId || row.branchId === activeBranchId) || p.inventories[0]
      : null;
    setForm({
      name: p.name && p.nameEn && p.name === p.nameEn ? "" : p.name || "",
      nameEn: p.nameEn || "",
      price: String(p.price ?? ""),
      categoryId: p.categoryId || "",
      subcategoryId: p.subcategoryId || "",
      imageUrl: p.imageUrl || "",
      shortTitle: p.shortTitle || "",
      shortTitleEn: p.shortTitleEn || "",
      description: p.description || "",
      descriptionEn: p.descriptionEn || "",
      heightCm: p.heightCm != null ? String(p.heightCm) : "",
      widthCm: p.widthCm != null ? String(p.widthCm) : "",
      depthCm: p.depthCm != null ? String(p.depthCm) : "",
      features: p.features || "",
      featuresEn: p.featuresEn || "",
      status: p.isActive === false ? "draft" : "published",
      sku: p.sku || "",
      barcode: p.barcode || "",
      stock: inv?.quantity != null ? String(inv.quantity) : "",
      minStockLevel: inv?.minStockLevel != null ? String(inv.minStockLevel) : "5",
    });
    setEditId(p.id);
    setFormError("");
    setFormMode("edit");
  };

  const validateProductFields = (data) => {
    const nameEn = String(data.nameEn || "").trim();
    const nameAr = String(data.name || "").trim();
    if (!nameEn || nameEn.length < 2) return t("products.nameEnRequired");
    if (!nameAr) return t("products.nameArRequired");
    if (nameAr.length > 120 || nameEn.length > 120) return t("products.errNameLong");
    const price = Number(data.price);
    if (data.price === "" || Number.isNaN(price) || price < 0) return t("products.errPrice");
    if (!data.categoryId) return t("products.categoryRequired");
    for (const key of ["heightCm", "widthCm", "depthCm"]) {
      if (data[key] === "" || data[key] == null) continue;
      const n = Number(data[key]);
      if (Number.isNaN(n) || n < 0) return t("products.errDimension");
    }
    const img = String(data.imageUrl || "").trim();
    const publishing = data.status === "published";
    if (publishing && !img) return t("products.imageRequired");
    if (img && !/^https?:\/\/\S+/i.test(img) && !img.startsWith("/")) return t("products.errImageUrl");
    if (data.stock !== "" && data.stock != null) {
      const stock = Number(data.stock);
      if (Number.isNaN(stock) || stock < 0 || !Number.isInteger(stock)) return t("products.errStock");
    }
    if (data.minStockLevel !== "" && data.minStockLevel != null) {
      const threshold = Number(data.minStockLevel);
      if (Number.isNaN(threshold) || threshold < 0 || !Number.isInteger(threshold)) return t("products.errMinStock");
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
      const catalogBody = {
        name: form.name.trim(),
        nameEn: form.nameEn.trim(),
        price: Number(form.price),
        categoryId: form.categoryId || null,
        subcategoryId: form.subcategoryId || null,
        imageUrl: String(form.imageUrl || "").trim(),
        shortTitle: form.shortTitle.trim(),
        shortTitleEn: form.shortTitleEn.trim(),
        description: form.description.trim(),
        descriptionEn: form.descriptionEn.trim(),
        heightCm: form.heightCm,
        widthCm: form.widthCm,
        depthCm: form.depthCm,
        features: form.features,
        featuresEn: form.featuresEn,
        status: form.status === "published" ? "published" : "draft",
        sku: form.sku || null,
        barcode: form.barcode.trim() || null,
      };
      const stockQty = form.stock === "" ? 0 : Number(form.stock);
      const stockThreshold = form.minStockLevel === "" ? 5 : Number(form.minStockLevel);
      if (formMode === "create") {
        const bid = activeBranchId;
        if (!bid) {
          setFormError(t("products.pickBranch"));
          return;
        }
        await api("/api/products", {
          method: "POST",
          body: {
            ...catalogBody,
            branchId: bid,
            petType: "OTHER",
            initialStock: stockQty,
            minStockLevel: stockThreshold,
          },
        });
        showToast(t("products.toastCreated"), "success");
      } else if (formMode === "edit" && editId) {
        await api(`/api/products/${editId}`, {
          method: "PATCH",
          body: catalogBody,
        });
        const bid = activeBranchId;
        if (bid) {
          await api(`/api/inventory/${editId}/${bid}`, {
            method: "PATCH",
            body: { quantity: stockQty, minStockLevel: stockThreshold },
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

  const generateBarcode = async () => {
    try {
      const qs =
        formMode === "edit" && editId
          ? `?excludeProductId=${encodeURIComponent(editId)}`
          : "";
      const { barcode: code } = await api(`/api/products/generate-barcode${qs}`);
      setForm((current) => ({ ...current, barcode: code }));
      showToast(t("products.toastBarcode"), "success");
    } catch (e) {
      showToast(e?.message || t("products.generateBarcodeFailed"), "error");
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

  const downloadSampleExcel = async () => {
    setExcelBusy(true);
    try {
      const blob = await apiBlob("/api/products/import/excel/sample");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "products-sample.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      showToast(e.message || "Download failed", "error");
    } finally {
      setExcelBusy(false);
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
        body: { rows: importRows, branchId: activeBranchId, asDraft: true },
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
        <select
          value={statusFilter}
          aria-label={t("products.statusFilter")}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          style={{
            minHeight: 44,
            minWidth: 160,
            padding: "0.55rem 0.85rem",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
          }}
        >
          <option value="all">{t("products.statusAll")}</option>
          <option value="draft">{t("products.draft")}</option>
          <option value="published">{t("products.published")}</option>
        </select>
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
              disabled={excelBusy}
              onClick={downloadSampleExcel}
              style={{ background: "var(--surface2)", color: "var(--text)", minHeight: 44 }}
            >
              {t("products.excelSample")}
            </button>
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
              <th className="products-table__num">{t("products.colRetail")}</th>
              <th className="products-table__num">{t("products.colStock")}</th>
              <th>{t("products.colStatus")}</th>
              <th className="products-table__actions">{t("products.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {listLoading ? (
              <tr>
                <td colSpan={canEditProducts ? 9 : 8} className="products-table__loading">
                  <span className="products-spinner" aria-hidden="true" />
                  {t("products.loading")}
                </td>
              </tr>
            ) : null}
            {!listLoading && list.length === 0 ? (
              <tr>
                <td colSpan={canEditProducts ? 9 : 8} className="products-table__loading">
                  {t("products.empty")}
                </td>
              </tr>
            ) : null}
            {!listLoading
              ? list.map((p) => {
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
                  <td className="products-table__num">{Number(p.price).toFixed(2)}</td>
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
            })
              : null}
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
              <label style={{ ...fld, gridColumn: "1 / -1" }}>
                <span>
                  {t("products.imageFile")}
                  {form.status === "published" ? " *" : ""}
                </span>
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
                <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <ProductImagePreview url={form.imageUrl} alt="" width={140} height={140} />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, imageUrl: "" }))}
                    style={{ ...btnSm, background: "var(--surface2)" }}
                  >
                    {t("products.removeImage")}
                  </button>
                </div>
              ) : null}
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
              <label style={fld}>
                <span>{t("products.stockValue")}</span>
                <input
                  style={inp}
                  type="number"
                  min={0}
                  step={1}
                  value={form.stock}
                  disabled={formMode === "edit" && !activeBranchId}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                />
              </label>
              <label style={fld}>
                <span>{t("products.stockThreshold")}</span>
                <input
                  style={inp}
                  type="number"
                  min={0}
                  step={1}
                  value={form.minStockLevel}
                  disabled={formMode === "edit" && !activeBranchId}
                  onChange={(e) => setForm({ ...form, minStockLevel: e.target.value })}
                />
              </label>
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
                <span>{t("products.nameArField")} *</span>
                <input
                  style={inp}
                  required
                  maxLength={120}
                  dir="rtl"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label style={fld}>
                <span>{t("products.price")} *</span>
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
                <span>{t("products.status")}</span>
                <select
                  style={inp}
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="draft">{t("products.draft")}</option>
                  <option value="published">{t("products.published")}</option>
                </select>
              </label>
              <label style={fld}>
                <span>{t("products.shortTitleEn")}</span>
                <input
                  style={inp}
                  maxLength={160}
                  value={form.shortTitleEn}
                  onChange={(e) => setForm({ ...form, shortTitleEn: e.target.value })}
                />
              </label>
              <label style={fld}>
                <span>{t("products.shortTitleAr")}</span>
                <input
                  style={inp}
                  maxLength={160}
                  dir="rtl"
                  value={form.shortTitle}
                  onChange={(e) => setForm({ ...form, shortTitle: e.target.value })}
                />
              </label>
              <label style={{ ...fld, gridColumn: "1 / -1" }}>
                <span>{t("products.descriptionEn")}</span>
                <textarea
                  style={{ ...inp, minHeight: 88, resize: "vertical" }}
                  value={form.descriptionEn}
                  onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })}
                />
              </label>
              <label style={{ ...fld, gridColumn: "1 / -1" }}>
                <span>{t("products.descriptionAr")}</span>
                <textarea
                  style={{ ...inp, minHeight: 88, resize: "vertical" }}
                  dir="rtl"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>
              <label style={fld}>
                <span>{t("products.height")}</span>
                <input
                  style={inp}
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.heightCm}
                  onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
                />
              </label>
              <label style={fld}>
                <span>{t("products.width")}</span>
                <input
                  style={inp}
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.widthCm}
                  onChange={(e) => setForm({ ...form, widthCm: e.target.value })}
                />
              </label>
              <label style={fld}>
                <span>{t("products.depth")}</span>
                <input
                  style={inp}
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.depthCm}
                  onChange={(e) => setForm({ ...form, depthCm: e.target.value })}
                />
              </label>
              <label style={{ ...fld, gridColumn: "1 / -1" }}>
                <span>{t("products.featuresEn")}</span>
                <textarea
                  style={{ ...inp, minHeight: 96, resize: "vertical" }}
                  value={form.featuresEn}
                  onChange={(e) => setForm({ ...form, featuresEn: e.target.value })}
                />
              </label>
              <label style={{ ...fld, gridColumn: "1 / -1" }}>
                <span>{t("products.featuresAr")}</span>
                <textarea
                  style={{ ...inp, minHeight: 96, resize: "vertical" }}
                  dir="rtl"
                  value={form.features}
                  onChange={(e) => setForm({ ...form, features: e.target.value })}
                />
              </label>
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
                aria-busy={formBusy}
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {formBusy ? <span className="products-spinner products-spinner--light" aria-hidden="true" /> : null}
                {formBusy
                  ? t("products.saving")
                  : formMode === "edit"
                    ? t("common.save")
                    : t("products.saveProduct")}
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
                    <th style={thCell}>{t("products.barcode")}</th>
                    <th style={thCell}>{t("products.colRetail")}</th>
                    <th style={thCell}>{t("products.colStock")}</th>
                    <th style={thCell}>{t("products.status")}</th>
                    <th style={thCell}>{t("products.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                        {t("products.excelNoRows")}
                      </td>
                    </tr>
                  ) : (
                    importRows.map((row) => (
                      <tr
                        key={row.key}
                        style={{
                          borderTop: "1px solid var(--border)",
                          background: row.invalidPrice || row.invalidName
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
                          {row.invalidName ? (
                            <div style={{ color: "var(--danger)", fontSize: 12 }}>{t("products.excelInvalidName")}</div>
                          ) : null}
                          {row.invalidPrice ? (
                            <div style={{ color: "var(--danger)", fontSize: 12 }}>{t("products.excelInvalidPrice")}</div>
                          ) : null}
                        </td>
                        <td style={tdCell}>{row.sku || "—"}</td>
                        <td style={tdCell}>
                          {[row.category, row.subcategory].filter(Boolean).join(" / ") || "—"}
                        </td>
                        <td style={tdCell}>{row.barcode || "—"}</td>
                        <td style={tdCell}>{row.price === "" || row.price == null ? "—" : row.price}</td>
                        <td style={tdCell}>{row.stockQty === "" || row.stockQty == null ? "—" : row.stockQty}</td>
                        <td style={tdCell}>{t("products.draft")}</td>
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
                disabled={
                  importBusy ||
                  importRows.length === 0 ||
                  importRows.some((row) => row.invalidPrice || row.invalidName)
                }
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
                onClick={submitImportRows}
              >
                {importBusy ? <span className="products-spinner products-spinner--light" aria-hidden="true" /> : null}
                {importBusy ? t("products.saving") : t("products.excelSaveDrafts")}
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
