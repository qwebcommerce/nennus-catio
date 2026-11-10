import * as XLSX from "xlsx";

export const PRODUCTS_SHEET = "Products";

/** Sample and import columns, in the same order as the product form. */
export const PRODUCT_IMPORT_COLUMNS = [
  { key: "imageUrl", header: "Image URL" },
  { key: "category", header: "Category" },
  { key: "subcategory", header: "Sub-category" },
  { key: "nameEn", header: "Name (English)" },
  { key: "name", header: "Name (Arabic)" },
  { key: "price", header: "Price" },
  { key: "shortTitleEn", header: "Short title (English)" },
  { key: "shortTitle", header: "Short title (Arabic)" },
  { key: "descriptionEn", header: "Description (English)" },
  { key: "description", header: "Description (Arabic)" },
  { key: "heightCm", header: "Height (cm)" },
  { key: "widthCm", header: "Width (cm)" },
  { key: "depthCm", header: "Depth (cm)" },
  { key: "featuresEn", header: "Features (English)" },
  { key: "features", header: "Features (Arabic)" },
  { key: "sku", header: "SKU" },
  { key: "barcode", header: "Barcode" },
  { key: "stockQty", header: "Stock" },
  { key: "minStock", header: "Stock threshold" },
];

const HEADER_ALIASES = {
  "image url": "imageUrl",
  imageurl: "imageUrl",
  image: "imageUrl",
  category: "category",
  "sub-category": "subcategory",
  subcategory: "subcategory",
  "name (english)": "nameEn",
  nameen: "nameEn",
  "english name": "nameEn",
  "name (arabic)": "name",
  name: "name",
  "arabic name": "name",
  price: "price",
  "short title (english)": "shortTitleEn",
  shorttitleen: "shortTitleEn",
  "short title (arabic)": "shortTitle",
  shorttitle: "shortTitle",
  "description (english)": "descriptionEn",
  descriptionen: "descriptionEn",
  "description (arabic)": "description",
  description: "description",
  "height (cm)": "heightCm",
  heightcm: "heightCm",
  height: "heightCm",
  "width (cm)": "widthCm",
  widthcm: "widthCm",
  width: "widthCm",
  "depth (cm)": "depthCm",
  depthcm: "depthCm",
  depth: "depthCm",
  "features (english)": "featuresEn",
  featuresen: "featuresEn",
  "features (arabic)": "features",
  features: "features",
  sku: "sku",
  barcode: "barcode",
  stock: "stockQty",
  stockqty: "stockQty",
  "stock threshold": "minStock",
  minstock: "minStock",
  minstocklevel: "minStock",
};

function canonicalizeImportRow(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw || {})) {
    const alias = HEADER_ALIASES[String(key).trim().toLowerCase()];
    out[alias || key] = value;
  }
  return out;
}

/** Blank template plus one example row. Products are saved as drafts after review. */
export function buildProductSampleExcelBuffer() {
  const headers = PRODUCT_IMPORT_COLUMNS.map((col) => col.header);
  const example = [
    "",
    "Villas",
    "Outdoor",
    "Garden villa",
    "فيلا الحديقة",
    2499,
    "Outdoor cat villa",
    "فيلا قطط خارجية",
    "A weatherproof villa with a shaded lounge.",
    "فيلا مقاومة للطقس مع جلسة مظللة.",
    120,
    80,
    80,
    "Weatherproof\nEasy to clean",
    "مقاومة للطقس\nسهلة التنظيف",
    "",
    "",
    4,
    2,
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws["!cols"] = headers.map((header) => ({ wch: Math.max(18, header.length + 2) }));
  const notes = XLSX.utils.aoa_to_sheet([
    ["Column", "How to fill it"],
    ["Image URL", "Optional. Leave blank and add the photo when you edit the draft."],
    ["Category", "Must match a category name already in the catalog."],
    ["Sub-category", "Optional. Must belong to the category when used."],
    ["Name (English)", "Required."],
    ["Name (Arabic)", "Required."],
    ["Price", "Required. Use a number, for example 2499."],
    ["Short title (English)", "Optional."],
    ["Short title (Arabic)", "Optional."],
    ["Description (English)", "Optional."],
    ["Description (Arabic)", "Optional."],
    ["Height (cm)", "Optional number."],
    ["Width (cm)", "Optional number."],
    ["Depth (cm)", "Optional number."],
    ["Features (English)", "Optional. One feature per line inside the cell."],
    ["Features (Arabic)", "Optional. One feature per line inside the cell."],
    ["SKU", "Optional. Use a SKU code from the catalog."],
    ["Barcode", "Optional. Leave blank to generate one later in the product form."],
    ["Stock", "Quantity for the branch selected when you import."],
    ["Stock threshold", "Low-stock alert level for that branch."],
    ["", "Delete the example row before you import. Imported products are saved as drafts."],
  ]);
  notes["!cols"] = [{ wch: 28 }, { wch: 78 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, PRODUCTS_SHEET);
  XLSX.utils.book_append_sheet(wb, notes, "Instructions");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

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
function cellText(value) {
  return value == null ? "" : String(value).trim();
}

export function normalizeImportPreviewRows(rawRows) {
  const out = [];
  for (let i = 0; i < rawRows.length; i++) {
    const r = canonicalizeImportRow(rawRows[i] || {});
    const name = cellText(r.name);
    const nameEn = cellText(r.nameEn);
    if (!name && !nameEn && !cellText(r.category) && !cellText(r.sku)) continue;
    const priceNum = parseNumber(r.price);
    const rowNum = i + 2;
    out.push({
      key: `excel-${rowNum}-${out.length}`,
      rowNum,
      id: cellText(r.id),
      name,
      nameEn,
      sku: cellText(r.sku),
      barcode: cellText(r.barcode),
      category: cellText(r.category),
      subcategory: cellText(r.subcategory),
      price: r.price ?? "",
      imageUrl: cellText(r.imageUrl),
      stockQty: r.stockQty ?? "",
      minStock: r.minStock ?? "",
      shortTitle: cellText(r.shortTitle),
      shortTitleEn: cellText(r.shortTitleEn),
      description: cellText(r.description),
      descriptionEn: cellText(r.descriptionEn),
      heightCm: r.heightCm ?? "",
      widthCm: r.widthCm ?? "",
      depthCm: r.depthCm ?? "",
      features: cellText(r.features),
      featuresEn: cellText(r.featuresEn),
      invalidName: !name || !nameEn,
      invalidPrice: priceNum === null || priceNum < 0,
    });
  }
  return out;
}
