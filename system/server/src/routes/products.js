import { Router } from "express";
import multer from "multer";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { resolveStoredImageUrl } from "../lib/productImageUrl.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import {
  buildProductsExcelBuffer,
  buildProductSampleExcelBuffer,
  readFirstSheetRows,
  normalizeImportPreviewRows,
  parseYesNo,
  parsePetType,
  parseNumber,
  parseMoneyCell,
} from "../lib/productsExcel.js";
import { toDirhams } from "../lib/money.js";
import { toApi } from "../lib/moneyFields.js";
import {
  allocateUniqueBarcode,
  assertBarcodeAvailable,
} from "../lib/productBarcode.js";
import { productExtrasData, syncProductExtras, syncProductLinks } from "../lib/catalogExtras.js";
import { parsePiecesPerCarton } from "../lib/stockUnits.js";
import { assertVersion, requireVersion, versionedUpdate } from "../lib/recordVersion.js";
import { writeAudit } from "../lib/auditLog.js";
import { normalizeImage } from "../lib/imageNormalize.js";
import {
  PRODUCT_IMAGES_BUCKET,
  objectKey,
  productImageKeyFromUrl,
  publicObjectUrl,
  removeObjects,
  storageEnabled,
  uploadObject,
} from "../lib/storage.js";
import { setStockCount } from "../lib/stockLedger.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import {
  PRODUCT_IMAGE_MAX_BYTES,
  extractProductImageId,
  productImagePublicPath,
} from "../lib/productImageDb.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("products", "view"));

const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(xlsx|xls)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error("يُقبل ملف Excel فقط (.xlsx أو .xls)"));
  },
});

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PRODUCT_IMAGE_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG or WebP images are allowed"));
  },
});

/** Response shape of a product row: money in riyals (NFR-03 boundary) and a resolved image URL. */
function withResolvedImageUrl(product) {
  if (!product) return product;
  return {
    ...toApi("Product", product),
    imageUrl: resolveStoredImageUrl(product.imageUrl),
  };
}

const BAD_PRICE = {
  error: "سعر غير صالح (رقمان عشريان كحد أقصى)",
  errorAr: "سعر غير صالح (رقمان عشريان كحد أقصى)",
  errorEn: "Enter a valid price (at most 2 decimals)",
  code: "AMOUNT_INVALID",
};

/** Price / cost from the product form: riyals → whole dirhams. Empty is 0 (price) or no cost. */
function formDirhams(value, emptyAs) {
  if (value == null || String(value).trim() === "") return emptyAs;
  const n = toDirhams(value);
  return n == null ? undefined : n;
}

/** Every image URL a product row shows: main image, then gallery. */
function productImageUrls(product) {
  if (!product) return [];
  const gallery = Array.isArray(product.gallery) ? product.gallery : [];
  return [product.imageUrl, ...gallery].filter((u) => typeof u === "string" && u.trim());
}

/**
 * Removes bucket objects that a product no longer shows (replaced / removed / product deleted),
 * unless another product of the organisation still uses the same URL. Only keys under the
 * organisation's own prefix are touched.
 */
async function removeUnusedProductImages(orgId, before, after) {
  if (!storageEnabled()) return;
  const keep = new Set(productImageUrls(after));
  const gone = productImageUrls(before).filter((url) => !keep.has(url));
  const keys = [];
  for (const url of new Set(gone)) {
    const key = productImageKeyFromUrl(url);
    if (!key || !key.startsWith(`${orgId}/`)) continue;
    const stillUsed = await prisma.$queryRaw`
      SELECT 1 FROM "Product"
      WHERE "organizationId" = ${orgId}
        AND ("imageUrl" = ${url} OR ("gallery" IS NOT NULL AND jsonb_typeof("gallery") = 'array' AND "gallery" @> ${JSON.stringify([url])}::jsonb))
      LIMIT 1`;
    if (!stillUsed.length) keys.push(key);
  }
  await removeObjects(PRODUCT_IMAGES_BUCKET, keys);
}

async function linkProductImage(orgId, productId, imageUrl) {
  const imageId = extractProductImageId(imageUrl);
  if (!imageId || !productId) return;
  await prisma.productImage.updateMany({
    where: { id: imageId, organizationId: orgId },
    data: { productId },
  });
}

async function resolveCatalogLinks(orgId, { categoryId, subcategoryId, sku, requireCatalogSku = true }) {
  let resolvedCategoryId = null;
  let resolvedSubcategoryId = null;
  let resolvedSku = sku != null && String(sku).trim() ? String(sku).trim() : null;
  let categoryLabel = null;

  if (categoryId) {
    const cat = await prisma.category.findFirst({
      where: { id: String(categoryId), organizationId: orgId },
    });
    if (!cat) {
      const err = new Error("Invalid category");
      err.status = 400;
      throw err;
    }
    resolvedCategoryId = cat.id;
    categoryLabel = cat.nameEn?.trim() || cat.name;
  }

  if (subcategoryId) {
    const sub = await prisma.subcategory.findFirst({
      where: { id: String(subcategoryId), organizationId: orgId },
    });
    if (!sub) {
      const err = new Error("Invalid subcategory");
      err.status = 400;
      throw err;
    }
    if (resolvedCategoryId && sub.categoryId !== resolvedCategoryId) {
      const err = new Error("Subcategory does not belong to the selected category");
      err.status = 400;
      throw err;
    }
    resolvedSubcategoryId = sub.id;
    if (!resolvedCategoryId) resolvedCategoryId = sub.categoryId;
  }

  if (resolvedSku && requireCatalogSku) {
    const catalog = await prisma.catalogSku.findFirst({
      where: { organizationId: orgId, code: resolvedSku },
    });
    if (!catalog) {
      const err = new Error("SKU must be selected from the catalog");
      err.status = 400;
      throw err;
    }
    if (
      catalog.subcategoryId &&
      resolvedSubcategoryId &&
      catalog.subcategoryId !== resolvedSubcategoryId
    ) {
      const err = new Error("SKU does not belong to the selected subcategory");
      err.status = 400;
      throw err;
    }
  }

  return {
    categoryId: resolvedCategoryId,
    subcategoryId: resolvedSubcategoryId,
    sku: resolvedSku,
    category: categoryLabel,
  };
}

/** Resolve catalog IDs from Excel name/code columns (best-effort for import). */
async function resolveCatalogFromExcel(orgId, { categoryName, subcategoryName, sku }) {
  let categoryId = null;
  let subcategoryId = null;
  let categoryLabel =
    categoryName != null && String(categoryName).trim() ? String(categoryName).trim() : null;
  let resolvedSku = sku != null && String(sku).trim() ? String(sku).trim() : null;

  const nameMatch = (row, raw) => {
    const key = String(raw).trim().toLowerCase();
    if (!key) return false;
    return (
      String(row.name || "")
        .trim()
        .toLowerCase() === key ||
      (row.nameEn &&
        String(row.nameEn)
          .trim()
          .toLowerCase() === key)
    );
  };

  if (categoryLabel) {
    const cats = await prisma.category.findMany({ where: { organizationId: orgId } });
    const cat = cats.find((c) => nameMatch(c, categoryLabel));
    if (cat) {
      categoryId = cat.id;
      categoryLabel = cat.nameEn?.trim() || cat.name;
    }
  }

  const subLabel =
    subcategoryName != null && String(subcategoryName).trim()
      ? String(subcategoryName).trim()
      : null;
  if (subLabel) {
    const subs = await prisma.subcategory.findMany({
      where: {
        organizationId: orgId,
        ...(categoryId ? { categoryId } : {}),
      },
    });
    const sub = subs.find((s) => nameMatch(s, subLabel));
    if (sub) {
      subcategoryId = sub.id;
      if (!categoryId) categoryId = sub.categoryId;
      if (!categoryLabel) {
        const cat = await prisma.category.findFirst({ where: { id: sub.categoryId } });
        categoryLabel = cat?.nameEn?.trim() || cat?.name || categoryLabel;
      }
    }
  }

  if (resolvedSku) {
    const catalog = await prisma.catalogSku.findFirst({
      where: { organizationId: orgId, code: resolvedSku },
    });
    if (catalog?.subcategoryId && !subcategoryId) {
      subcategoryId = catalog.subcategoryId;
      const sub = await prisma.subcategory.findFirst({ where: { id: catalog.subcategoryId } });
      if (sub && !categoryId) {
        categoryId = sub.categoryId;
        const cat = await prisma.category.findFirst({ where: { id: sub.categoryId } });
        categoryLabel = cat?.nameEn?.trim() || cat?.name || categoryLabel;
      }
    }
  }

  return { categoryId, subcategoryId, sku: resolvedSku, category: categoryLabel };
}

/** Shared Excel / confirmed-row product upsert + inventory sync. */
async function runProductImportFromRows({ orgId, userId, branchId, rows, asDraft = false }) {
  const errors = [];
  let created = 0;
  let updated = 0;
  const touchedProductIds = new Set();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const rowNum = Number(r.rowNum) > 0 ? Number(r.rowNum) : i + 2;
    const name = String(r.name ?? "").trim();
    const nameEn = String(r.nameEn ?? "").trim();
    if (!name && !nameEn) continue;
    if (!name || !nameEn) {
      errors.push({ row: rowNum, message: "English and Arabic names are required" });
      continue;
    }

    // NFR-03: whole dirhams; more than two decimals is refused for the row.
    const priceNum = parseMoneyCell(r.price);
    if (priceNum === null) {
      errors.push({ row: rowNum, message: "سعر غير صالح" });
      continue;
    }

    const costRaw = parseMoneyCell(r.cost);
    if (costRaw === null && r.cost != null && String(r.cost).trim() !== "") {
      errors.push({ row: rowNum, message: "تكلفة غير صالحة" });
      continue;
    }
    const sku = r.sku != null && String(r.sku).trim() ? String(r.sku).trim() : null;
    const barcode = r.barcode != null && String(r.barcode).trim() ? String(r.barcode).trim() : null;
    const petType = parsePetType(r.petType);
    const isActive = asDraft ? false : parseYesNo(r.isActive);
    const stockQty = Math.max(0, Math.floor(parseNumber(r.stockQty) ?? 0));
    const minStock = Math.max(0, Math.floor(parseNumber(r.minStock) ?? 5));
    const imageRaw = r.imageUrl != null ? String(r.imageUrl).trim() : "";
    const imageUrl =
      imageRaw && (/^https?:\/\/\S+/i.test(imageRaw) || imageRaw.startsWith("/")) ? imageRaw : null;
    const height = optionalDimension(r.heightCm);
    const width = optionalDimension(r.widthCm);
    const depth = optionalDimension(r.depthCm);
    let piecesPerCarton;
    try {
      // Empty cell: leave it as it is (new products have none).
      piecesPerCarton = r.piecesPerCarton == null || String(r.piecesPerCarton).trim() === "" ? undefined : parsePiecesPerCarton(r.piecesPerCarton);
    } catch (e) {
      errors.push({ row: rowNum, message: e.errorEn || e.message });
      continue;
    }

    const catalog = await resolveCatalogFromExcel(orgId, {
      categoryName: r.category,
      subcategoryName: r.subcategory,
      sku,
    });

    const baseData = {
      name,
      nameEn,
      description: cleanOptionalText(r.description),
      descriptionEn: cleanOptionalText(r.descriptionEn),
      shortTitle: cleanOptionalText(r.shortTitle),
      shortTitleEn: cleanOptionalText(r.shortTitleEn),
      heightCm: height.ok ? height.value : null,
      widthCm: width.ok ? width.value : null,
      depthCm: depth.ok ? depth.value : null,
      features: cleanOptionalText(r.features),
      featuresEn: cleanOptionalText(r.featuresEn),
      sku: catalog.sku,
      barcode,
      price: priceNum,
      cost: costRaw,
      petType,
      category: catalog.category,
      categoryId: catalog.categoryId,
      subcategoryId: catalog.subcategoryId,
      ...(imageUrl ? { imageUrl } : {}),
      ...(piecesPerCarton !== undefined ? { piecesPerCarton } : {}),
      isActive,
    };

    let existing = null;
    const idStr = r.id != null && String(r.id).trim() ? String(r.id).trim() : null;
    if (idStr) {
      existing = await prisma.product.findFirst({
        where: { id: idStr, organizationId: orgId },
      });
    }
    if (!existing && barcode) {
      existing = await prisma.product.findFirst({
        where: { organizationId: orgId, barcode },
      });
    }
    if (!existing && sku) {
      existing = await prisma.product.findFirst({
        where: { organizationId: orgId, sku },
      });
    }

    try {
      if (baseData.barcode) {
        await assertBarcodeAvailable(prisma, orgId, baseData.barcode, existing?.id ?? null);
      }
    } catch (e) {
      errors.push({
        row: rowNum,
        message: e?.message || "باركود مكرر",
      });
      continue;
    }

    let productId;
    try {
      if (existing) {
        const p = await prisma.product.update({
          where: { id: existing.id },
          data: baseData,
        });
        productId = p.id;
        updated += 1;
      } else {
        const p = await prisma.product.create({
          data: {
            organizationId: orgId,
            ...baseData,
          },
        });
        productId = p.id;
        created += 1;
      }

      // Stock from the sheet is a counted quantity: the difference is written as an ADJUSTMENT movement (FR-17).
      const hasVariants = await prisma.productVariant.count({ where: { productId } });
      if (!hasVariants) {
        await prisma.$transaction(async (tx) => {
          await setStockCount(tx, {
            orgId,
            userId,
            productId,
            branchId,
            quantity: stockQty,
            note: "Product import",
            unitCost: costRaw,
          });
          await tx.inventory.update({
            where: { productId_branchId: { productId, branchId } },
            data: { minStockLevel: minStock },
          });
        });
      }
      touchedProductIds.add(productId);
    } catch (e) {
      if (e?.code === "P2002") {
        errors.push({ row: rowNum, message: "تعارض SKU أو بيانات فريدة" });
      } else {
        errors.push({ row: rowNum, message: e?.message || "خطأ حفظ" });
      }
    }
  }

  return { created, updated, errors, touchedProductIds };
}

const isSqlite = () => {
  const u = process.env.DATABASE_URL || "";
  return u.startsWith("file:") || u.includes("sqlite");
};

router.get("/", async (req, res) => {
  const { search, petType, branchId, page, pageSize, includeInactive, status } = req.query;
  const where = { organizationId: req.user.organizationId };
  const statusFilter = String(status || "").trim().toLowerCase();
  if (statusFilter === "draft") where.isActive = false;
  else if (statusFilter === "published") where.isActive = true;
  else if (!(includeInactive === "1" || includeInactive === "true")) where.isActive = true;
  const ins = isSqlite() ? {} : { mode: "insensitive" };
  if (search) {
    const q = String(search);
    where.OR = [
      { name: { contains: q, ...ins } },
      { nameEn: { contains: q, ...ins } },
      { sku: { contains: q, ...ins } },
      { barcode: { contains: q, ...ins } },
    ];
  }
  if (petType && ["CAT", "DOG", "OTHER"].includes(String(petType))) {
    where.petType = String(petType);
  }
  const include = {
    inventories: branchId
      ? { where: { branchId: String(branchId) } }
      : true,
    variants: {
      include: {
        stocks: branchId ? { where: { branchId: String(branchId) } } : true,
        preferredSupplier: { select: { id: true, name: true } },
      },
    },
    petLinks: { include: { petType: true } },
    brand: { select: { id: true, name: true, nameEn: true } },
    productCategory: { select: { id: true, name: true, nameEn: true } },
    productSubcategory: { select: { id: true, name: true, nameEn: true, categoryId: true } },
  };
  const orderBy = { createdAt: "desc" };

  const paginate =
    page !== undefined ||
    pageSize !== undefined ||
    req.query.paginate === "1" ||
    req.query.paginate === "true";
  if (paginate) {
    const p = Math.max(1, parseInt(String(page), 10) || 1);
    const ps = Math.min(100, Math.max(1, parseInt(String(pageSize), 10) || 50));
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip: (p - 1) * ps,
        take: ps,
        include,
      }),
      prisma.product.count({ where }),
    ]);
    return res.json({
      items: items.map(withResolvedImageUrl),
      total,
      page: p,
      pageSize: ps,
    });
  }

  const products = await prisma.product.findMany({
    where,
    orderBy,
    include,
  });
  res.json(products.map(withResolvedImageUrl));
});

/** Upload a product image (max 2 MB): Supabase Storage public URL when configured, else a DB-backed API path. */
router.post("/upload-image", requireModule("products", ["create", "edit"]),
  (req, res, next) => {
    uploadImage.single("file")(req, res, (err) => {
      if (err) {
        const tooLarge = err.code === "LIMIT_FILE_SIZE";
        return res.status(400).json({
          error: tooLarge
            ? "Image must be 2 MB or smaller"
            : err.message || "Upload failed",
          errorAr: tooLarge ? "يجب ألا يتجاوز حجم الصورة 2 ميغابايت" : err.message,
          errorEn: tooLarge ? "Image must be 2 MB or smaller" : err.message || "Upload failed",
        });
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: "Image file is required (field name: file)" });
      }
      if (req.file.buffer.length > PRODUCT_IMAGE_MAX_BYTES) {
        return res.status(400).json({
          error: "Image must be 2 MB or smaller",
          errorAr: "يجب ألا يتجاوز حجم الصورة 2 ميغابايت",
          errorEn: "Image must be 2 MB or smaller",
        });
      }
      // NFR-18: the bytes must really be a JPEG, PNG or WebP image (declared type is not trusted);
      // it is decoded, auto-oriented, stripped of all metadata, resized and re-encoded.
      let normalized;
      try {
        normalized = await normalizeImage(req.file.buffer);
      } catch (err) {
        if (err.status !== 400) throw err;
        return res.status(400).json({ error: err.errorAr || err.message, errorAr: err.errorAr, errorEn: err.errorEn || err.message });
      }
      const imageBytes = normalized.buffer;
      const kind = { mime: normalized.mime };
      const productIdRaw =
        req.body?.productId != null && String(req.body.productId).trim()
          ? String(req.body.productId).trim()
          : null;
      let productId = null;
      if (productIdRaw) {
        const p = await prisma.product.findFirst({
          where: { id: productIdRaw, organizationId: req.user.organizationId },
          select: { id: true },
        });
        if (!p) return res.status(400).json({ error: "Invalid productId" });
        productId = p.id;
      }
      // Agreement 8.1: with Supabase Storage configured the WebP goes to the public bucket and the
      // product keeps its public URL; without it the bytes stay in the database as before.
      if (storageEnabled()) {
        const key = objectKey(req.user.organizationId, normalized.ext);
        await uploadObject(PRODUCT_IMAGES_BUCKET, key, imageBytes, normalized.mime);
        return res.status(201).json({
          url: publicObjectUrl(PRODUCT_IMAGES_BUCKET, key),
          id: null,
          size: imageBytes.length,
          mimeType: normalized.mime,
        });
      }
      const created = await prisma.productImage.create({
        data: {
          organizationId: req.user.organizationId,
          productId,
          fileName: `${String(req.file.originalname || "image").replace(/\.[^.]*$/, "").slice(0, 170) || "image"}.webp`,
          mimeType: kind.mime,
          size: imageBytes.length,
          data: imageBytes,
        },
        select: { id: true, size: true, mimeType: true },
      });
      const url = productImagePublicPath(created.id);
      res.status(201).json({
        url,
        id: created.id,
        size: created.size,
        mimeType: created.mimeType,
      });
    } catch (e) {
      if (e?.status) return res.status(e.status).json({ error: e.errorAr || e.message, errorAr: e.errorAr, errorEn: e.errorEn || e.message });
      next(e);
    }
  }
);

/** توليد باركود رقمي غير مكرر ضمن المؤسسة (للمنتج الجديد أو عند تعبئة باركود لأول مرة) */
router.get("/generate-barcode", requireModule("products", ["create", "edit"]), async (req, res, next) => {
  try {
    const exclude =
      req.query.excludeProductId != null && String(req.query.excludeProductId).trim()
        ? String(req.query.excludeProductId).trim()
        : undefined;
    const barcode = await allocateUniqueBarcode(prisma, req.user.organizationId, {
      excludeProductId: exclude,
    });
    res.json({ barcode });
  } catch (e) {
    next(e);
  }
});

router.get("/import/excel/sample", requireModule("products", "create"), async (_req, res, next) => {
  try {
    const buffer = buildProductSampleExcelBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", 'attachment; filename="products-sample.xlsx"');
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});

router.get("/export/excel", requireModule("products", "export"), async (req, res, next) => {
  try {
    const orgId = req.user.organizationId;
    const branchId = req.query.branchId != null && String(req.query.branchId).trim()
      ? String(req.query.branchId).trim()
      : null;
    if (branchId) {
      const br = await findBranchInOrg(prisma, orgId, branchId);
      if (!br) return res.status(400).json({ error: "فرع غير صالح" });
    }

    const products = await prisma.product.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      include: {
        productCategory: { select: { id: true, name: true, nameEn: true } },
        productSubcategory: { select: { id: true, name: true, nameEn: true } },
        ...(branchId ? { inventories: { where: { branchId } } } : {}),
      },
    });

    const inventoryByProductId = new Map();
    if (branchId) {
      for (const p of products) {
        const inv = p.inventories?.[0];
        if (inv) inventoryByProductId.set(p.id, inv);
      }
    }

    const buffer = buildProductsExcelBuffer(products, inventoryByProductId);
    await writeAudit({
      userId: req.user.sub,
      action: "PRODUCT_EXPORT",
      entityType: "Product",
      branchId: branchId || req.user.branchId || null,
      summary: `Exported ${products.length} products to Excel`,
      meta: { count: products.length, branchId },
    });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", 'attachment; filename="products-export.xlsx"');
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});

router.post("/import/excel/preview", requireModule("products", "create"),
  (req, res, next) => {
    uploadExcel.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "رفع الملف فشل" });
      next();
    });
  },
  async (req, res, next) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: "لم يُرفع ملف" });
      }
      let rawRows;
      try {
        rawRows = readFirstSheetRows(req.file.buffer);
      } catch (e) {
        return res.status(400).json({ error: e?.message || "تعذر قراءة الملف" });
      }
      const rows = normalizeImportPreviewRows(rawRows);
      if (!rows.length) {
        return res.status(400).json({ error: "لا توجد منتجات في الملف" });
      }
      res.json({ ok: true, rows, count: rows.length });
    } catch (e) {
      next(e);
    }
  }
);

router.post("/import/excel/confirm", requireModule("products", "create"), async (req, res, next) => {
  try {
    const orgId = req.user.organizationId;
    const branchId =
      req.query.branchId != null && String(req.query.branchId).trim()
        ? String(req.query.branchId).trim()
        : req.body?.branchId != null && String(req.body.branchId).trim()
          ? String(req.body.branchId).trim()
          : null;
    if (!branchId) {
      return res.status(400).json({ error: "حدّد فرعاً (branchId) لتطبيق المخزون" });
    }
    const br = await findBranchInOrg(prisma, orgId, branchId);
    if (!br) return res.status(400).json({ error: "فرع غير صالح" });

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows?.length) {
      return res.status(400).json({ error: "لا توجد منتجات للاستيراد" });
    }
    if (rows.length > 2000) {
      return res.status(400).json({ error: "الحد الأقصى 2000 منتج في العملية" });
    }

    const { created, updated, errors, touchedProductIds } = await runProductImportFromRows({
      orgId,
      userId: req.user.sub,
      branchId,
      rows,
      asDraft: req.body?.asDraft === true,
    });


    await writeAudit({
      userId: req.user.sub,
      action: "PRODUCT_IMPORT",
      entityType: "Product",
      branchId,
      summary: `Excel import confirm: ${created} created, ${updated} updated, ${errors.length} errors`,
      meta: {
        created,
        updated,
        errorCount: errors.length,
        productIds: [...touchedProductIds].slice(0, 50),
      },
    });

    res.json({ ok: true, created, updated, errors, errorCount: errors.length });
  } catch (e) {
    next(e);
  }
});

router.post("/import/excel", requireModule("products", "create"),
  (req, res, next) => {
    uploadExcel.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "رفع الملف فشل" });
      next();
    });
  },
  async (req, res, next) => {
    try {
      const orgId = req.user.organizationId;
      const branchId =
        req.query.branchId != null && String(req.query.branchId).trim()
          ? String(req.query.branchId).trim()
          : null;
      if (!branchId) {
        return res.status(400).json({ error: "حدّد فرعاً (branchId) لتطبيق المخزون" });
      }
      const br = await findBranchInOrg(prisma, orgId, branchId);
      if (!br) return res.status(400).json({ error: "فرع غير صالح" });
      if (!req.file?.buffer) {
        return res.status(400).json({ error: "لم يُرفع ملف" });
      }

      let rawRows;
      try {
        rawRows = readFirstSheetRows(req.file.buffer);
      } catch (e) {
        return res.status(400).json({ error: e?.message || "تعذر قراءة الملف" });
      }

      const rows = normalizeImportPreviewRows(rawRows);
      const { created, updated, errors, touchedProductIds } = await runProductImportFromRows({
        orgId,
        userId: req.user.sub,
        branchId,
        rows,
      });


      await writeAudit({
        userId: req.user.sub,
        action: "PRODUCT_IMPORT",
        entityType: "Product",
        branchId,
        summary: `Excel import: ${created} created, ${updated} updated, ${errors.length} errors`,
        meta: {
          created,
          updated,
          errorCount: errors.length,
          productIds: [...touchedProductIds].slice(0, 50),
        },
      });

      res.json({ ok: true, created, updated, errors, errorCount: errors.length });
    } catch (e) {
      next(e);
    }
  }
);

router.get("/:id", async (req, res) => {
  const p = await prisma.product.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
    include: {
      inventories: true,
      brand: { select: { id: true, name: true, nameEn: true } },
      productCategory: { select: { id: true, name: true, nameEn: true } },
      productSubcategory: { select: { id: true, name: true, nameEn: true, categoryId: true } },
    },
  });
  if (!p) return res.status(404).json({ error: "المنتج غير موجود" });
  res.json(withResolvedImageUrl(p));
});

function cleanOptionalText(value) {
  const s = value == null ? "" : String(value).trim();
  return s || null;
}

function optionalDimension(value) {
  if (value == null || String(value).trim() === "") return { ok: true, value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, value: new Prisma.Decimal(n) };
}

function catalogFieldsFromBody(body) {
  const fields = {};
  if ("shortTitle" in body) fields.shortTitle = cleanOptionalText(body.shortTitle);
  if ("shortTitleEn" in body) fields.shortTitleEn = cleanOptionalText(body.shortTitleEn);
  if ("description" in body) fields.description = cleanOptionalText(body.description);
  if ("descriptionEn" in body) fields.descriptionEn = cleanOptionalText(body.descriptionEn);
  if ("features" in body) fields.features = cleanOptionalText(body.features);
  if ("featuresEn" in body) fields.featuresEn = cleanOptionalText(body.featuresEn);
  for (const key of ["heightCm", "widthCm", "depthCm"]) {
    if (!(key in body)) continue;
    const dim = optionalDimension(body[key]);
    if (!dim.ok) {
      return { error: "Height, width, and depth must be zero or a positive number" };
    }
    fields[key] = dim.value;
  }
  if ("status" in body) {
    const status = String(body.status || "").trim().toLowerCase();
    if (status === "draft" || status === "published") {
      fields.isActive = status === "published";
    }
  }
  return { fields };
}

router.post("/", requireModule("products", "create"), async (req, res) => {
  const {
    name,
    nameEn,
    description,
    sku,
    barcode,
    price,
    cost,
    petType,
    categoryId,
    subcategoryId,
    imageUrl,
    branchId,
    initialStock,
    minStockLevel,
  } = req.body || {};
  if (!nameEn?.trim()) return res.status(400).json({ error: "English product name is required" });
  if (!name?.trim()) return res.status(400).json({ error: "Arabic product name is required" });
  if (!categoryId) return res.status(400).json({ error: "Category is required" });
  const imageTrim = imageUrl != null ? String(imageUrl).trim() : "";
  const isDraft = String((req.body || {}).status || "").trim().toLowerCase() === "draft";
  if (!imageTrim && !isDraft) return res.status(400).json({ error: "Image URL is required" });
  if (imageTrim && !/^https?:\/\/\S+/i.test(imageTrim) && !imageTrim.startsWith("/")) {
    return res.status(400).json({ error: "Image URL must be http(s) or a path starting with /" });
  }
  const nameLocal = name?.trim() || "";
  const priceNum = formDirhams(price, 0);
  const costNum = formDirhams(cost, null);
  if (priceNum === undefined || costNum === undefined) {
    return res.status(400).json(BAD_PRICE);
  }
  const bid = branchId || req.user.branchId;
  if (!bid) return res.status(400).json({ error: "يجب تحديد الفرع للمخزون الأولي" });
  const br = await findBranchInOrg(prisma, req.user.organizationId, bid);
  if (!br) return res.status(400).json({ error: "فرع غير صالح" });

  let catalog;
  try {
    catalog = await resolveCatalogLinks(req.user.organizationId, {
      categoryId,
      subcategoryId,
      sku,
    });
  } catch (e) {
    if (e?.status === 400) return res.status(400).json({ error: e.message });
    throw e;
  }

  const catalogCopy = catalogFieldsFromBody(req.body || {});
  if (catalogCopy.error) return res.status(400).json({ error: catalogCopy.error });

  const barcodeTrim = barcode?.trim() || null;
  try {
    await assertBarcodeAvailable(prisma, req.user.organizationId, barcodeTrim, null);
  } catch (e) {
    if (e?.status === 400) return res.status(400).json({ error: e.message });
    throw e;
  }

  const stockRaw = initialStock == null || initialStock === "" ? 0 : Number(initialStock);
  if (!Number.isInteger(stockRaw) || stockRaw < 0) {
    return res.status(400).json({
      error: "المخزون الأولي يجب أن يكون عدداً صحيحاً",
      errorAr: "المخزون الأولي يجب أن يكون عدداً صحيحاً",
      errorEn: "Opening stock must be a whole number of zero or more",
    });
  }
  const stockQty = stockRaw;
  // Opening stock and low-stock level per variant, at the location the product is created in (FR-17, FR-92).
  const wholeOrNull = (v) => (v == null || v === "" ? null : Number(v));
  for (const raw of Array.isArray(req.body?.variants) ? req.body.variants : []) {
    for (const key of ["initialStock", "minStockLevel"]) {
      const n = wholeOrNull(raw?.[key]);
      if (n !== null && (!Number.isInteger(n) || n < 0)) {
        return res.status(400).json({
          error: "مخزون الصنف يجب أن يكون عدداً صحيحاً",
          errorAr: "مخزون الصنف يجب أن يكون عدداً صحيحاً",
          errorEn: "Variant stock must be a whole number of zero or more",
        });
      }
    }
  }
  const hasVariantsInBody = Array.isArray(req.body?.variants) && req.body.variants.some((v) => String(v?.label || v?.labelEn || "").trim());
  if (stockQty > 0 && hasVariantsInBody) {
    return res.status(400).json({
      error: "المخزون لكل حجم — استلمه بأمر شراء أو عدّله لكل حجم بعد الحفظ",
      errorAr: "المخزون لكل حجم — استلمه بأمر شراء أو عدّله لكل حجم بعد الحفظ",
      errorEn: "This product keeps stock per variant. Receive or adjust each variant after saving.",
    });
  }
  const openingCost = costNum;
  let product;
  try {
    product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          organizationId: req.user.organizationId,
          name: nameLocal || nameEn.trim(),
          nameEn: nameEn.trim(),
          description: catalogCopy.fields.description,
          descriptionEn: catalogCopy.fields.descriptionEn,
          shortTitle: catalogCopy.fields.shortTitle,
          shortTitleEn: catalogCopy.fields.shortTitleEn,
          heightCm: catalogCopy.fields.heightCm,
          widthCm: catalogCopy.fields.widthCm,
          depthCm: catalogCopy.fields.depthCm,
          features: catalogCopy.fields.features,
          featuresEn: catalogCopy.fields.featuresEn,
          isActive: catalogCopy.fields.isActive !== false,
          sku: catalog.sku,
          barcode: barcodeTrim,
          price: priceNum,
          cost: costNum,
          petType: ["CAT", "DOG", "OTHER"].includes(String(petType))
            ? String(petType)
            : "OTHER",
          category: catalog.category,
          categoryId: catalog.categoryId,
          subcategoryId: catalog.subcategoryId,
          imageUrl: imageTrim || null,
          inventories: {
            create: {
              branchId: bid,
              quantity: 0,
              minStockLevel: Math.max(0, Number(minStockLevel) || 5),
            },
          },
        },
      });
      // FR-17: opening stock is a staff adjustment with a movement, at the product's cost.
      if (stockQty > 0) {
        await setStockCount(tx, {
          orgId: req.user.organizationId,
          userId: req.user.sub,
          productId: created.id,
          branchId: bid,
          quantity: stockQty,
          note: "Opening stock",
          unitCost: openingCost,
        });
      }
      // Variants (and pet types) are created in the same transaction, then their opening stock.
      const { createdVariants } = await syncProductExtras(tx, {
        orgId: req.user.organizationId,
        productId: created.id,
        body: req.body || {},
      });
      for (const { id: variantId, raw } of createdVariants) {
        const opening = wholeOrNull(raw?.initialStock) ?? 0;
        const minLevel = wholeOrNull(raw?.minStockLevel);
        if (opening > 0) {
          await setStockCount(tx, {
            orgId: req.user.organizationId,
            userId: req.user.sub,
            productId: created.id,
            variantId,
            branchId: bid,
            quantity: opening,
            note: "Opening stock",
            unitCost: openingCost,
          });
        }
        if (minLevel !== null) {
          await tx.variantStock.upsert({
            where: { variantId_branchId: { variantId, branchId: bid } },
            create: { variantId, branchId: bid, quantity: 0, minStockLevel: minLevel },
            update: { minStockLevel: minLevel },
          });
        }
      }
      return tx.product.findUnique({ where: { id: created.id }, include: { inventories: true } });
    });
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(400).json({
        error: "تعارض بيانات فريدة (SKU أو باركود أو معرّف خارجي)",
      });
    }
    if (e instanceof Error && e.message === "Preferred supplier was not found") {
      return res.status(400).json({ error: e.message });
    }
    throw e;
  }
  await writeAudit({
    userId: req.user.sub,
    action: "PRODUCT_CREATE",
    entityType: "Product",
    entityId: product.id,
    branchId: bid,
    summary: `Created product "${product.nameEn || product.name}" (SKU: ${product.sku || "—"})`,
    meta: {
      sku: product.sku,
      barcode: product.barcode,
      price: Number(product.price) / 100,
      categoryId: product.categoryId,
      subcategoryId: product.subcategoryId,
      initialStock: stockQty,
      minStockLevel: Math.max(0, Number(minStockLevel) || 5),
    },
  });
  await linkProductImage(req.user.organizationId, product.id, imageTrim);
  res.status(201).json(withResolvedImageUrl(product));
});

router.patch("/:id", requireModule("products", "edit"), async (req, res) => {
  const data = req.body || {};
  const version = requireVersion(req);
  const update = {};
  if (data.nameEn !== undefined) {
    if (!String(data.nameEn || "").trim()) {
      return res.status(400).json({ error: "English product name is required" });
    }
    update.nameEn = String(data.nameEn).trim();
  }
  if (data.name !== undefined) {
    if (!String(data.name || "").trim()) {
      return res.status(400).json({ error: "Arabic product name is required" });
    }
    update.name = String(data.name).trim();
  }
  if (
    data.description !== undefined ||
    data.descriptionEn !== undefined ||
    data.shortTitle !== undefined ||
    data.shortTitleEn !== undefined ||
    data.heightCm !== undefined ||
    data.widthCm !== undefined ||
    data.depthCm !== undefined ||
    data.features !== undefined ||
    data.featuresEn !== undefined ||
    data.status !== undefined
  ) {
    const catalogCopy = catalogFieldsFromBody(data);
    if (catalogCopy.error) return res.status(400).json({ error: catalogCopy.error });
    Object.assign(update, catalogCopy.fields);
  }
  if (data.barcode !== undefined) update.barcode = data.barcode?.trim() || null;
  if (data.price != null) {
    update.price = formDirhams(data.price, 0);
    if (update.price === undefined) return res.status(400).json(BAD_PRICE);
  }
  if (data.cost !== undefined) {
    update.cost = formDirhams(data.cost, null);
    if (update.cost === undefined) return res.status(400).json(BAD_PRICE);
  }
  if (data.petType && ["CAT", "DOG", "OTHER"].includes(String(data.petType))) {
    update.petType = String(data.petType);
  }
  if (data.imageUrl !== undefined) {
    const img = data.imageUrl != null ? String(data.imageUrl).trim() : "";
    const isDraft = String(data.status || "").trim().toLowerCase() === "draft";
    if (!img && !isDraft) return res.status(400).json({ error: "Image URL is required" });
    if (img && !/^https?:\/\/\S+/i.test(img) && !img.startsWith("/")) {
      return res.status(400).json({ error: "Image URL must be http(s) or a path starting with /" });
    }
    update.imageUrl = img || null;
  }
  if (data.externalId !== undefined) update.externalId = data.externalId?.trim() || null;
  if (data.brandId !== undefined) update.brandId = data.brandId || null;
  if (data.isActive !== undefined) update.isActive = Boolean(data.isActive);

  const existing = await prisma.product.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "المنتج غير موجود" });
  assertVersion(existing, version);

  if (
    data.categoryId !== undefined ||
    data.subcategoryId !== undefined ||
    data.sku !== undefined
  ) {
    try {
      const catalog = await resolveCatalogLinks(req.user.organizationId, {
        categoryId:
          data.categoryId !== undefined ? data.categoryId || null : existing.categoryId,
        subcategoryId:
          data.subcategoryId !== undefined
            ? data.subcategoryId || null
            : existing.subcategoryId,
        sku: data.sku !== undefined ? data.sku || null : existing.sku,
        requireCatalogSku: data.sku !== undefined,
      });
      update.categoryId = catalog.categoryId;
      update.subcategoryId = catalog.subcategoryId;
      update.category = catalog.category;
      if (data.sku !== undefined) update.sku = catalog.sku;
    } catch (e) {
      if (e?.status === 400) return res.status(400).json({ error: e.message });
      throw e;
    }
  }

  const nextEn = update.nameEn ?? existing.nameEn;
  if (update.name !== undefined && !update.name) {
    update.name = nextEn || existing.name;
  }

  if (data.barcode !== undefined) {
    try {
      await assertBarcodeAvailable(
        prisma,
        req.user.organizationId,
        update.barcode ?? null,
        existing.id
      );
    } catch (e) {
      if (e?.status === 400) return res.status(400).json({ error: e.message });
      throw e;
    }
  }

  try {
    // NFR-13: one conditional write of the product row (form fields + extras), then its links.
    const p = await prisma.$transaction(async (tx) => {
      const extras = await productExtrasData(tx, { orgId: req.user.organizationId, body: data });
      await versionedUpdate(tx, "product", { id: existing.id, version, data: { ...update, ...extras } });
      await syncProductLinks(tx, { orgId: req.user.organizationId, productId: existing.id, body: data });
      return tx.product.findUnique({ where: { id: existing.id }, include: { inventories: true } });
    });
    if (update.imageUrl !== undefined) {
      await linkProductImage(req.user.organizationId, p.id, update.imageUrl);
    }
    await removeUnusedProductImages(req.user.organizationId, existing, p);
    const onlyActive =
      Object.keys(update).length === 1 && update.isActive !== undefined;
    await writeAudit({
      userId: req.user.sub,
      action: onlyActive
        ? update.isActive
          ? "PRODUCT_ENABLE"
          : "PRODUCT_DISABLE"
        : "PRODUCT_UPDATE",
      entityType: "Product",
      entityId: p.id,
      branchId: req.user.branchId || null,
      summary: onlyActive
        ? `${update.isActive ? "Enabled" : "Disabled"} product "${p.nameEn || p.name}"`
        : `Updated product "${p.nameEn || p.name}" (SKU: ${p.sku || "—"})`,
      meta: {
        changes: Object.keys(update),
        sku: p.sku,
        barcode: p.barcode,
        price: Number(p.price) / 100,
        isActive: p.isActive,
        categoryId: p.categoryId,
        subcategoryId: p.subcategoryId,
      },
    });
    res.json(withResolvedImageUrl(p));
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(400).json({
        error: "تعارض بيانات فريدة (SKU أو باركود أو معرّف خارجي)",
      });
    }
    if (e instanceof Error && e.message === "Preferred supplier was not found") {
      return res.status(400).json({ error: e.message });
    }
    throw e;
  }
});

async function deleteStoredProductImages(tx, orgId, product) {
  const imageId = extractProductImageId(product?.imageUrl);
  await tx.productImage.deleteMany({
    where: {
      organizationId: orgId,
      OR: [
        { productId: product.id },
        ...(imageId ? [{ id: imageId }] : []),
      ],
    },
  });
}

router.delete("/:id", requireModule("products", "delete"), async (req, res) => {
  const existing = await prisma.product.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
    include: { variants: { select: { id: true } } },
  });
  if (!existing) {
    return res.status(404).json({ error: "المنتج غير موجود", errorAr: "المنتج غير موجود", errorEn: "Product not found" });
  }
  const variantIds = existing.variants.map((v) => v.id);
  // Trading history (sales, refunds, purchases, website holds, stock received or moved) is kept:
  // such a product is deactivated instead. Opening stock and stock counts are only adjustments.
  const [sales, refunds, purchases, poLines, holds, movedStock] = await Promise.all([
    prisma.saleItem.count({ where: { productId: existing.id } }),
    prisma.refundItem.count({ where: { productId: existing.id } }),
    prisma.purchaseItem.count({ where: { productId: existing.id } }),
    variantIds.length ? prisma.purchaseOrderLine.count({ where: { variantId: { in: variantIds } } }) : 0,
    prisma.stockHold.count({ where: { productId: existing.id } }),
    prisma.stockMovement.count({ where: { productId: existing.id, reason: { not: "ADJUSTMENT" } } }),
  ]);
  if (sales + refunds + purchases + poLines + holds + movedStock > 0) {
    return res.status(409).json({
      error: "لا يمكن حذف هذا المنتج لأن له مبيعات أو مرتجعات أو مشتريات أو حركة مخزون. أوقفه بدلاً من ذلك.",
      errorAr: "لا يمكن حذف هذا المنتج لأن له مبيعات أو مرتجعات أو مشتريات أو حركة مخزون. أوقفه بدلاً من ذلك.",
      errorEn: "This product has sales, refunds, purchases or stock activity, so it can't be deleted. Deactivate it instead.",
      code: "PRODUCT_HAS_HISTORY",
    });
  }
  let removedAdjustments = 0;
  let stockOnHand = [];
  await prisma.$transaction(async (tx) => {
    stockOnHand = [
      ...(await tx.inventory.findMany({ where: { productId: existing.id, quantity: { not: 0 } }, select: { branchId: true, quantity: true } })),
      ...(variantIds.length
        ? await tx.variantStock.findMany({ where: { variantId: { in: variantIds }, quantity: { not: 0 } }, select: { variantId: true, branchId: true, quantity: true } })
        : []),
    ];
    // Opening stock / count adjustments belong to this product only; the audit row below keeps what was on hand.
    removedAdjustments = (await tx.stockMovement.deleteMany({ where: { productId: existing.id, reason: "ADJUSTMENT" } })).count;
    await tx.purchaseDraftItem.deleteMany({ where: { productId: existing.id } });
    await tx.promoDraftItem.deleteMany({ where: { productId: existing.id } });
    await deleteStoredProductImages(tx, req.user.organizationId, existing);
    await tx.product.delete({ where: { id: existing.id } });
    await writeAudit(
      {
        userId: req.user.sub,
        action: "PRODUCT_DELETE",
        entityType: "Product",
        entityId: existing.id,
        branchId: req.user.branchId || null,
        summary: `Deleted product "${existing.nameEn || existing.name}" (SKU: ${existing.sku || "—"})`,
        meta: {
          sku: existing.sku,
          barcode: existing.barcode,
          price: Number(existing.price) / 100,
          categoryId: existing.categoryId,
          subcategoryId: existing.subcategoryId,
          stockOnHand,
          removedAdjustments,
        },
      },
      tx
    );
  });
  await removeUnusedProductImages(req.user.organizationId, existing, null);
  res.status(204).send();
});

export default router;
