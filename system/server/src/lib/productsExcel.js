import * as XLSX from "xlsx";

export const PRODUCTS_SHEET = "Products";

/** تحويل تاريخ من Excel (رقم تسلسلي أو نص) */
export function parseExpiryCell(v) {
  if (v === "" || v == null) return null;
  if (typeof v === "number" && Number.isFinite(v) && v > 20000 && v < 1000000) {
    const utc = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(utc);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(v).trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function categoryName(p) {
  return p.productCategory?.name || p.category || "";
}

function subcategoryName(p) {
  return p.productSubcategory?.name || "";
}

/**
 * Export columns aligned with current product + catalog model.
 */
export function buildProductsExcelBuffer(products, inventoryByProductId) {
  const rows = products.map((p) => {
    const inv = inventoryByProductId?.get(p.id);
    return {
      id: p.id,
      nameEn: p.nameEn ?? "",
      name: p.name ?? "",
      sku: p.sku ?? "",
      barcode: p.barcode ?? "",
      category: categoryName(p),
      subcategory: subcategoryName(p),
      cost: p.cost != null ? Number(p.cost) : "",
      price: Number(p.price),
      wholesalePrice: p.wholesalePrice != null ? Number(p.wholesalePrice) : "",
      imageUrl: p.imageUrl ?? "",
      isActive: p.isActive ? "yes" : "no",
      stockQty: inv ? inv.quantity : "",
      minStock: inv ? inv.minStockLevel : "",
      expiryDate: p.expiryDate ? new Date(p.expiryDate).toISOString().slice(0, 10) : "",
      description: p.description ?? "",
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, PRODUCTS_SHEET);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

export function readFirstSheetRows(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const name = wb.SheetNames[0];
  if (!name) throw new Error("الملف لا يحتوي ورقة عمل");
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "", raw: false });
}

export function parseYesNo(v) {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (s === "" || s === "yes" || s === "true" || s === "1" || s === "y" || s === "نعم") return true;
  if (s === "no" || s === "false" || s === "0" || s === "n" || s === "لا") return false;
  return true;
}

export function parsePetType(v) {
  const s = String(v ?? "")
    .trim()
    .toUpperCase();
  if (s === "CAT" || s === "DOG" || s === "OTHER") return s;
  return "OTHER";
}

export function parseNumber(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/,/g, ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize sheet rows for import preview / confirm.
 * Skips blank name+nameEn rows. Preserves Excel field names used by the importer.
 */
export function normalizeImportPreviewRows(rawRows) {
  const out = [];
  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i] || {};
    const name = String(r.name ?? "").trim();
    const nameEn = String(r.nameEn ?? "").trim();
    if (!name && !nameEn) continue;
    const priceNum = parseNumber(r.price);
    const rowNum = i + 2;
    out.push({
      key: `excel-${rowNum}-${out.length}`,
      rowNum,
      id: r.id != null && String(r.id).trim() ? String(r.id).trim() : "",
      name: name || nameEn,
      nameEn,
      sku: r.sku != null && String(r.sku).trim() ? String(r.sku).trim() : "",
      barcode: r.barcode != null && String(r.barcode).trim() ? String(r.barcode).trim() : "",
      category: r.category != null ? String(r.category).trim() : "",
      subcategory: r.subcategory != null ? String(r.subcategory).trim() : "",
      cost: r.cost ?? "",
      price: r.price ?? "",
      wholesalePrice: r.wholesalePrice ?? "",
      imageUrl: r.imageUrl != null ? String(r.imageUrl).trim() : "",
      isActive: r.isActive ?? "yes",
      stockQty: r.stockQty ?? "",
      minStock: r.minStock ?? "",
      expiryDate: r.expiryDate ?? "",
      description: r.description != null ? String(r.description).trim() : "",
      petType: r.petType ?? "OTHER",
      invalidPrice: priceNum === null || priceNum < 0,
    });
  }
  return out;
}
