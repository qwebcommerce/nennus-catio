import React, { useEffect, useRef, useState } from "react";
import { useSearchParams as useTabParams } from "react-router-dom";
import { PageTabs } from "../components/BizShared.jsx";
import { PendingPayments, PendingStock } from "../components/PendingPanels.jsx";
import { useI18n as useTabI18n } from "../context/LanguageContext.jsx";
import { useAuth as useTabAuth } from "../context/AuthContext.jsx";
import { Link } from "react-router-dom";
import { api, apiBlob, apiUploadExcel, apiUploadImage, editErrorMessage, isStaleEdit, resolveRowMessage } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useI18n } from "../context/LanguageContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { productDisplayName } from "../utils/productName.js";
import { useActiveBranchId } from "../context/BranchContext.jsx";
import { ProductImagePreview } from "../components/ProductImagePreview.jsx";
import { BarcodeLabelPrint } from "../components/BarcodeLabelPrint.jsx";
import { usePrintSettings } from "../context/PrintSettingsContext.jsx";

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
    stockOriginal: "",
    stockReason: "",
    minStockLevel: "5",
    sellBy: "PIECE",
    petTypeIds: [],
    galleryText: "",
    variants: [],
    preferredSupplierId: "",
    isPetHouse: false,
    leadTimeDays: "",
    houseDeliveryFee: "0",
    takesStock: true,
    piecesPerCarton: "",
  };
}

function ProductsMain() {
  const { user, isAdmin, can, canModule } = useAuth();
  const { t, locale } = useI18n();
  const { showToast } = useToast();
  const { classFor } = usePrintSettings();
  const [list, setList] = useState([]);
  const [petTypes, setPetTypes] = useState([]);
  const [petTypesError, setPetTypesError] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [printProduct, setPrintProduct] = useState(null);
  const [printBarcodeCode, setPrintBarcodeCode] = useState("");
  const [low, setLow] = useState([]);
  const [form, setForm] = useState(() => emptyProductForm());
  const [formMode, setFormMode] = useState(null); // null | "create" | "edit"
  const [editId, setEditId] = useState("");
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  /** Picked image, previewed locally and uploaded only when the form is saved. */
  const [pendingImage, setPendingImage] = useState(null);
  const clearPendingImage = () =>
    setPendingImage((cur) => {
      if (cur?.previewUrl) URL.revokeObjectURL(cur.previewUrl);
      return null;
    });
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

  /** Only the newest list request may fill the table: on a slow line an older reply (say the full
   *  list from before a search was typed) can arrive last and would overwrite the search results. */
  const loadSeq = useRef(0);
  const load = async () => {
    const seq = ++loadSeq.current;
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
      if (seq !== loadSeq.current) return res && Array.isArray(res.items) ? res.items : Array.isArray(res) ? res : [];
      if (res && Array.isArray(res.items)) {
        setList(res.items);
        setTotal(res.total ?? 0);
      } else {
        setList(Array.isArray(res) ? res : []);
        setTotal(Array.isArray(res) ? res.length : 0);
      }
      setLow(l);
      return res && Array.isArray(res.items) ? res.items : Array.isArray(res) ? res : [];
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
    api("/api/pet-types")
      .then((rows) => {
        setPetTypes(Array.isArray(rows) ? rows : []);
        setPetTypesError(false);
      })
      .catch(() => {
        setPetTypes([]);
        setPetTypesError(true);
      });
    // The preferred-supplier list needs Purchasing → view; without it the field just stays empty.
    if (canModule("purchasing", "view")) api("/api/suppliers").then(setSuppliers).catch(() => setSuppliers([]));
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [activeBranchId, page, pageSize, search, statusFilter]);

  const closeFormModal = () => {
    clearPendingImage();
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
      stockOriginal: inv?.quantity != null ? String(inv.quantity) : "",
      stockReason: "",
      minStockLevel: inv?.minStockLevel != null ? String(inv.minStockLevel) : "5",
      sellBy: p.sellBy || "PIECE",
      petTypeIds: Array.isArray(p.petLinks) ? p.petLinks.map((link) => link.petTypeId || link.petType?.id).filter(Boolean) : [],
      galleryText: Array.isArray(p.gallery) ? p.gallery.join("\n") : "",
      preferredSupplierId: p.preferredSupplierId || "",
      isPetHouse: p.isPetHouse === true,
      leadTimeDays: p.leadTimeDays != null ? String(p.leadTimeDays) : "",
      houseDeliveryFee: p.houseDeliveryFee != null ? String(p.houseDeliveryFee) : "0",
      takesStock: p.takesStock !== false,
      piecesPerCarton: p.piecesPerCarton != null ? String(p.piecesPerCarton) : "",
      // NFR-13: the save names the version this copy was loaded at.
      version: p.version,
      variants: Array.isArray(p.variants)
        ? p.variants.map((v) => ({
            id: v.id,
            version: v.version,
            label: v.label || "",
            labelEn: v.labelEn || "",
            sku: v.sku || "",
            price: String(v.price ?? ""),
            packWeight: v.packWeight != null ? String(v.packWeight) : "",
            barcode: v.barcode || "",
            piecesPerCarton: v.piecesPerCarton != null ? String(v.piecesPerCarton) : "",
            isActive: v.isActive !== false,
            ...(() => {
              const st = Array.isArray(v.stocks) ? v.stocks.find((row) => row.branchId === activeBranchId) : null;
              const qty = st?.quantity != null ? String(st.quantity) : "0";
              return { stock: qty, stockOriginal: qty, minStockLevel: st?.minStockLevel != null ? String(st.minStockLevel) : "5", minOriginal: st?.minStockLevel != null ? String(st.minStockLevel) : "5" };
            })(),
          }))
        : [],
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
    if (publishing && !img && !pendingImage) return t("products.imageRequired");
    if (img && !/^https?:\/\/\S+/i.test(img) && !img.startsWith("/")) return t("products.errImageUrl");
    if (data.stock !== "" && data.stock != null) {
      const stock = Number(data.stock);
      if (Number.isNaN(stock) || stock < 0 || !Number.isInteger(stock)) return t("products.errStock");
    }
    if (data.minStockLevel !== "" && data.minStockLevel != null) {
      const threshold = Number(data.minStockLevel);
      if (Number.isNaN(threshold) || threshold < 0 || !Number.isInteger(threshold)) return t("products.errMinStock");
    }
    for (const v of data.variants || []) {
      for (const key of ["stock", "minStockLevel"]) {
        if (v[key] === "" || v[key] == null) continue;
        const n = Number(v[key]);
        if (Number.isNaN(n) || n < 0 || !Number.isInteger(n)) return t("products.errStock");
      }
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
      let imageUrl = String(form.imageUrl || "").trim();
      if (pendingImage?.file) {
        setImageUploading(true);
        try {
          const res = await apiUploadImage(
            "/api/products/upload-image",
            pendingImage.file,
            formMode === "edit" && editId ? { productId: editId } : {}
          );
          if (!res?.url) throw new Error(t("products.imageUploadFailed"));
          imageUrl = res.url;
          // Uploaded now: a retry after a later error must not upload it again.
          clearPendingImage();
          setForm((f) => ({ ...f, imageUrl }));
        } finally {
          setImageUploading(false);
        }
      }
      const catalogBody = {
        name: form.name.trim(),
        nameEn: form.nameEn.trim(),
        price: Number(form.price),
        categoryId: form.categoryId || null,
        subcategoryId: form.subcategoryId || null,
        imageUrl,
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
        sellBy: form.sellBy || "PIECE",
        preferredSupplierId: form.preferredSupplierId || null,
        isPetHouse: Boolean(form.isPetHouse),
        leadTimeDays: form.leadTimeDays,
        houseDeliveryFee: form.houseDeliveryFee,
        takesStock: form.takesStock !== false,
        piecesPerCarton: form.sellBy === "WEIGHT" ? "" : form.piecesPerCarton ?? "",
        petTypeIds: form.petTypeIds || [],
        gallery: String(form.galleryText || "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        variants: (form.variants || [])
          .filter((v) => String(v.label || v.labelEn || "").trim() && v.price !== "")
          .map((v) => ({
            id: v.id,
            version: v.version,
            label: v.label || v.labelEn,
            labelEn: v.labelEn,
            sku: v.sku || null,
            price: Number(v.price),
            packWeight: v.packWeight === "" || v.packWeight == null ? null : Number(v.packWeight),
            barcode: String(v.barcode || "").trim() || null,
            piecesPerCarton: v.piecesPerCarton ?? "",
            isActive: v.isActive !== false,
            // New variants on a new product: opening stock and low-stock level at this location.
            ...(formMode === "create"
              ? {
                  initialStock: v.stock === "" || v.stock == null ? 0 : Number(v.stock),
                  ...(v.minStockLevel === "" || v.minStockLevel == null ? {} : { minStockLevel: Number(v.minStockLevel) }),
                }
              : {}),
          })),
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
            // With variants, stock is kept per variant (sent on each variant above).
            initialStock: catalogBody.variants.length ? 0 : stockQty,
            minStockLevel: stockThreshold,
          },
        });
        showToast(t("products.toastCreated"), "success");
      } else if (formMode === "edit" && editId) {
        const bid = activeBranchId;
        const reason = String(form.stockReason || "").trim();
        const savedVariants = (form.variants || []).filter((v) => v.id);
        // Ask for the stock-change reason before saving anything: otherwise the product is saved,
        // the form keeps its old version and the next "Save" is refused as someone else's edit.
        const stockEdited = bid && (savedVariants.length
          ? savedVariants.some((v) => String(v.stock) !== String(v.stockOriginal))
          : String(form.stock) !== String(form.stockOriginal));
        if (stockEdited && !reason) throw new Error(t("products.stockReasonRequired"));
        const saved = await api(`/api/products/${editId}`, {
          method: "PATCH",
          body: { ...catalogBody, version: form.version },
        });
        // Saved: a retry of the stock step below must send the new version, not the old one.
        if (saved?.version != null) setForm((f) => ({ ...f, version: saved.version }));
        if (bid && savedVariants.length) {
          // Stock and low-stock level are kept per variant at this location (FR-17, FR-92).
          for (const v of savedVariants) {
            const body = {};
            if (String(v.stock) !== String(v.stockOriginal)) body.quantity = Number(v.stock);
            if (String(v.minStockLevel) !== String(v.minOriginal)) body.minStockLevel = Number(v.minStockLevel);
            if (body.quantity !== undefined && !reason) throw new Error(t("products.stockReasonRequired"));
            if (Object.keys(body).length) {
              await api(`/api/inventory/variants/${v.id}/${bid}`, { method: "PATCH", body: { ...body, reason } });
            }
          }
        } else if (bid) {
          const stockChanged = String(form.stock) !== String(form.stockOriginal);
          if (stockChanged && !reason) throw new Error(t("products.stockReasonRequired"));
          await api(`/api/inventory/${editId}/${bid}`, {
            method: "PATCH",
            body: { ...(stockChanged ? { quantity: stockQty, reason } : {}), minStockLevel: stockThreshold },
          });
        }
        showToast(t("products.toastUpdated"), "success");
      }
      closeFormModal();
      await load();
    } catch (ex) {
      const message = isStaleEdit(ex) ? editErrorMessage(ex, t) : ex.message || t("products.saveFailed");
      showToast(message, "error");
      if (isStaleEdit(ex) && editId) {
        // Someone else saved this product first: reload it into the form (their values, new version).
        const rows = await load().catch(() => null);
        const fresh = Array.isArray(rows) ? rows.find((row) => row.id === editId) : null;
        if (fresh) openEditModal(fresh);
        else closeFormModal();
      }
      setFormError(message);
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
        body: { isActive: !p.isActive, version: p.version },
      });
      showToast(p.isActive ? t("products.toastDisabled") : t("products.toastEnabled"), "success");
      await load();
    } catch (e) {
      showToast(isStaleEdit(e) ? editErrorMessage(e, t) : e.message || t("products.saveFailed"), "error");
      if (isStaleEdit(e)) await load().catch(() => {});
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
          // The version shown on this page; a product picked on another page is read first.
          const shown = list.find((row) => row.id === id);
          const version = shown ? shown.version : (await api(`/api/products/${id}`)).version;
          await api(`/api/products/${id}`, {
            method: "PATCH",
            body: { isActive, version },
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
      showToast(e.message || t("errors.generic"), "error");
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
      showToast(e.message || t("errors.generic"), "error");
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
      showToast(err.message || t("errors.generic"), "error");
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
              .map((x) => (locale === "en" ? `Row ${x.row}: ${resolveRowMessage(x)}` : `صف ${x.row}: ${resolveRowMessage(x)}`))
              .join("\n")}${r.errors.length > 5 ? "\n…" : ""}`
          : "";
      showToast(msg + detail, (r.errorCount ?? 0) > 0 ? "info" : "success", { duration: 5000 });
      setImportRows(null);
      await load();
    } catch (err) {
      showToast(err.message || t("errors.generic"), "error");
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
                  name: `${r.product?.name || "—"}${r.variant ? ` (${r.variant.label})` : ""}${r.branch && !activeBranchId ? ` · ${r.branch.name}` : ""}`,
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
                  <td className="products-table__num">{Number(p.price).toFixed(2)}{p.sellBy === "WEIGHT" ? ` ${t("pos.perKg")}` : ""}</td>
                  <td className="products-table__num">
                    {(() => {
                      // Stock at this location: the variants' sum for a variant product, kg for weight goods.
                      const vs = Array.isArray(p.variants) ? p.variants : [];
                      const qty = vs.length
                        ? vs.reduce((sum, v) => sum + Number((v.stocks || []).find((row) => !activeBranchId || row.branchId === activeBranchId)?.quantity ?? 0), 0)
                        : inv?.quantity;
                      if (qty == null) return t("common.none");
                      return p.sellBy === "WEIGHT" ? `${(Number(qty) / 1000).toFixed(3)} kg` : qty;
                    })()}
                  </td>
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
              width: "min(880px, 100%)",
              boxSizing: "border-box",
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
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) {
                      setFormError(t("products.imageTooLarge"));
                      return;
                    }
                    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
                      setFormError(t("products.imageUploadFailed"));
                      return;
                    }
                    setFormError("");
                    clearPendingImage();
                    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
                  }}
                />
                <span style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  {imageUploading
                    ? t("products.imageUploading")
                    : pendingImage
                      ? t("products.imagePendingHint")
                      : t("products.imageFileHint")}
                </span>
              </label>
              {pendingImage || String(form.imageUrl || "").trim() ? (
                <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  {pendingImage ? (
                    <img
                      src={pendingImage.previewUrl}
                      alt=""
                      width={140}
                      height={140}
                      style={{ objectFit: "cover", borderRadius: 12, border: "1px solid var(--border)" }}
                    />
                  ) : (
                    <ProductImagePreview url={form.imageUrl} alt="" width={140} height={140} />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      clearPendingImage();
                      setForm((f) => ({ ...f, imageUrl: "" }));
                    }}
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
              {(form.variants || []).length ? (
                <p style={{ gridColumn: "1 / -1", margin: 0, fontSize: 13, color: "var(--muted)" }}>
                  {t("products.stockPerVariant")}
                </p>
              ) : (
              <>
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
              </>
              )}
              {formMode === "edit" ? (
                <label style={fld}>
                  <span>{t("products.stockReason")}</span>
                  <input
                    style={inp}
                    value={form.stockReason}
                    placeholder={t("products.stockReasonHint")}
                    onChange={(e) => setForm({ ...form, stockReason: e.target.value })}
                  />
                </label>
              ) : null}
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
                <span>{t("po.supplier")}</span>
                <select style={inp} value={form.preferredSupplierId || ""} onChange={(e) => setForm({ ...form, preferredSupplierId: e.target.value })}>
                  <option value="">—</option>
                  {suppliers.filter((row) => row.isActive !== false).map((row) => (
                    <option key={row.id} value={row.id}>{row.name}</option>
                  ))}
                </select>
              </label>
              <label style={checkRow}>
                <input type="checkbox" style={checkBox} checked={Boolean(form.isPetHouse)} onChange={(e) => setForm({ ...form, isPetHouse: e.target.checked })} />
                <span>{t("shop.petHouse")}</span>
              </label>
              {form.isPetHouse ? (
                <>
                  <label style={checkRow}>
                    <input type="checkbox" style={checkBox} checked={form.takesStock !== false} onChange={(e) => setForm({ ...form, takesStock: e.target.checked })} />
                    <span>{t("shop.takesStock")}</span>
                  </label>
                  <label style={fld}>
                    <span>{t("shop.leadTime")}</span>
                    <input style={inp} type="number" min="0" value={form.leadTimeDays} onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })} />
                  </label>
                  <label style={fld}>
                    <span>{t("shop.houseFee")}</span>
                    <input style={inp} type="number" min="0" step="0.01" value={form.houseDeliveryFee} onChange={(e) => setForm({ ...form, houseDeliveryFee: e.target.value })} />
                  </label>
                </>
              ) : null}
              <label style={fld}>
                <span>{t("products.sellBy")}</span>
                <select style={inp} value={form.sellBy || "PIECE"} onChange={(e) => setForm({ ...form, sellBy: e.target.value })}>
                  <option value="PIECE">{t("products.sellPiece")}</option>
                  <option value="WEIGHT">{t("products.sellWeight")}</option>
                </select>
              </label>
              {form.sellBy !== "WEIGHT" ? (
                <label style={fld}>
                  <span>{t("products.piecesPerCarton")}</span>
                  <input
                    style={inp}
                    type="number"
                    min={2}
                    step={1}
                    inputMode="numeric"
                    value={form.piecesPerCarton ?? ""}
                    onChange={(e) => setForm({ ...form, piecesPerCarton: e.target.value })}
                    placeholder={t("products.piecesPerCartonHint")}
                    data-testid="pieces-per-carton"
                  />
                </label>
              ) : null}
              <fieldset style={{ ...fld, gridColumn: "1 / -1", border: 0, padding: 0, margin: 0 }}>
                <legend style={{ padding: 0, marginBottom: 6 }}>{t("products.petTypes")}</legend>
                {petTypes.filter((row) => row.isActive !== false).length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {petTypes.filter((row) => row.isActive !== false).map((row) => {
                      const on = (form.petTypeIds || []).includes(row.id);
                      return (
                        <label
                          key={row.id}
                          style={{
                            ...checkRow,
                            minHeight: 0,
                            padding: "6px 12px",
                            borderRadius: 999,
                            border: `1px solid ${on ? "var(--accent, #1e3e2f)" : "var(--border)"}`,
                            background: on ? "var(--surface2)" : "transparent",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            style={checkBox}
                            checked={on}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                petTypeIds: e.target.checked
                                  ? [...(f.petTypeIds || []), row.id]
                                  : (f.petTypeIds || []).filter((id) => id !== row.id),
                              }))
                            }
                          />
                          <span>{locale === "en" ? row.nameEn || row.name : row.name}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
                    {petTypesError ? t("products.petTypesLoadFailed") : t("products.noPetTypes")}{" "}
                    {!petTypesError ? <Link to="/pet-types">{t("products.managePetTypes")}</Link> : null}
                  </p>
                )}
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("products.petTypesHint")}</span>
              </fieldset>
              <label style={fld}>
                <span>{t("products.gallery")}</span>
                <textarea
                  style={{ ...inp, minHeight: 72 }}
                  value={form.galleryText || ""}
                  onChange={(e) => setForm({ ...form, galleryText: e.target.value })}
                  placeholder={t("products.galleryHint")}
                />
              </label>
              <div style={{ ...fld, gridColumn: "1 / -1" }}>
                <span style={{ fontWeight: 600 }}>{t("products.variants")}</span>
                {(form.variants || []).length ? (
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    {formMode === "create" ? t("products.variantsCreateHint") : t("products.variantsEditHint")}
                  </span>
                ) : null}
                {(form.variants || []).map((variant, index) => {
                  const setVariant = (patch) =>
                    setForm((f) => ({
                      ...f,
                      variants: f.variants.map((row, i) => (i === index ? { ...row, ...patch } : row)),
                    }));
                  const showStock = formMode === "create" || (formMode === "edit" && variant.id && activeBranchId);
                  return (
                    <div
                      key={variant.id || `new-${index}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                        gap: 8,
                        padding: 10,
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        alignItems: "end",
                      }}
                    >
                      <label style={fldSm}>
                        <span>{t("products.variantLabel")}</span>
                        <input style={inp} value={variant.label} onChange={(e) => setVariant({ label: e.target.value })} />
                      </label>
                      <label style={fldSm}>
                        <span>{t("products.variantLabelEn")}</span>
                        <input style={inp} value={variant.labelEn} onChange={(e) => setVariant({ labelEn: e.target.value })} />
                      </label>
                      <label style={fldSm}>
                        <span>{t("products.price")}</span>
                        <input style={inp} type="number" min={0} step="0.01" value={variant.price} onChange={(e) => setVariant({ price: e.target.value })} />
                      </label>
                      <label style={fldSm}>
                        <span>{t("products.variantBarcode")}</span>
                        <input style={inp} value={variant.barcode ?? ""} onChange={(e) => setVariant({ barcode: e.target.value })} />
                      </label>
                      {form.sellBy !== "WEIGHT" ? (
                        <label style={fldSm}>
                          <span>{t("products.piecesPerCarton")}</span>
                          <input style={inp} type="number" min={2} step={1} inputMode="numeric" value={variant.piecesPerCarton ?? ""} onChange={(e) => setVariant({ piecesPerCarton: e.target.value })} />
                        </label>
                      ) : null}
                      {showStock ? (
                        <>
                          <label style={fldSm}>
                            <span>{formMode === "create" ? t("products.variantOpeningStock") : t("products.variantStockHere")}</span>
                            <input style={inp} type="number" min={0} step={1} value={variant.stock ?? ""} onChange={(e) => setVariant({ stock: e.target.value })} />
                          </label>
                          <label style={fldSm}>
                            <span>{t("products.variantLowStockHere")}</span>
                            <input style={inp} type="number" min={0} step={1} value={variant.minStockLevel ?? ""} onChange={(e) => setVariant({ minStockLevel: e.target.value })} />
                          </label>
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>{t("products.variantStockAfterSave")}</span>
                      )}
                      {variant.id ? (
                        // A saved variant is switched off rather than removed (it has stock and sales history).
                        <label style={checkRow}>
                          <input type="checkbox" style={checkBox} checked={variant.isActive !== false} onChange={(e) => setVariant({ isActive: e.target.checked })} />
                          <span>{t("products.variantActive")}</span>
                        </label>
                      ) : null}
                      {!variant.id ? (
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, variants: f.variants.filter((_, i) => i !== index) }))}
                          style={{ ...btnSm, background: "var(--surface2)", justifySelf: "start", alignSelf: "end", minHeight: 40 }}
                        >
                          {t("products.removeVariant")}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="btn-touch"
                  style={{ background: "var(--surface2)", justifySelf: "start" }}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      variants: [
                        ...(f.variants || []),
                        { label: "", labelEn: "", sku: "", price: f.price || "", packWeight: "", barcode: "", piecesPerCarton: "", isActive: true, stock: "", minStockLevel: "" },
                      ],
                    }))
                  }
                >
                  {t("products.addVariant")}
                </button>
              </div>
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
            // One shrinkable column: an auto track grew to the table's width on a phone and
            // pushed "Save as drafts" off the screen.
            gridTemplateColumns: "minmax(0, 1fr)",
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
              minWidth: 0,
              boxSizing: "border-box",
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
  width: "100%",
  boxSizing: "border-box",
  minWidth: 0,
  padding: 10,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};
const fld = { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 };
const fldSm = { display: "flex", flexDirection: "column", gap: 4, minWidth: 0, fontSize: 12 };
/** Checkbox with its text on one line, the same height as an input so it lines up in the grid. */
const checkRow = { display: "flex", flexDirection: "row", alignItems: "center", gap: 8, minHeight: 42, alignSelf: "end", cursor: "pointer" };
const checkBox = { width: 18, height: 18, margin: 0, flex: "0 0 auto" };
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

/** Products with the pending stock / pending payments tabs (?tab=). */
export default function Products() {
  const { t } = useTabI18n();
  const { canModule } = useTabAuth();
  const [params, setParams] = useTabParams();
  const tab = params.get("tab") || "products";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <PageTabs
        value={tab}
        onChange={(id) => setParams(id === "products" ? {} : { tab: id })}
        tabs={[
          { id: "products", label: t("products.title") },
          { id: "stock", label: t("so.pendingStock") },
          ...(canModule("finance", "view") ? [{ id: "pending", label: t("so.pendingPayments") }] : []),
        ]}
      />
      {tab === "products" ? <ProductsMain /> : null}
      {tab === "stock" ? <PendingStock /> : null}
      {tab === "pending" ? <PendingPayments side="tous" /> : null}
    </div>
  );
}
