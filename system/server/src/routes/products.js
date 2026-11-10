import { Router } from "express";
import multer from "multer";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { resolveStoredImageUrl } from "../lib/productImageUrl.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { normalizeProductModifiers } from "../lib/productModifiers.js";
import {
  buildProductsExcelBuffer,
  buildProductSampleExcelBuffer,
  readFirstSheetRows,
  normalizeImportPreviewRows,
  parseYesNo,
  parsePetType,
  parseNumber,
  parseExpiryCell,
} from "../lib/productsExcel.js";
import {
  allocateUniqueBarcode,
  assertBarcodeAvailable,
} from "../lib/productBarcode.js";
import { scheduleInventoryWebhook } from "../lib/inventoryWebhook.js";
import { writeAudit } from "../lib/auditLog.js";
import { authMiddleware, requireRole, requirePermission } from "../middleware/auth.js";
import {
  PRODUCT_IMAGE_MAX_BYTES,
  extractProductImageId,
  productImagePublicPath,
} from "../lib/productImageDb.js";

const router = Router();
router.use(authMiddleware);

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
    if (/^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, WebP, or GIF images are allowed"));
  },
});

function withResolvedImageUrl(product) {
  if (!product) return product;
  return {
    ...product,
    imageUrl: resolveStoredImageUrl(product.imageUrl),
  };
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
async function runProductImportFromRows({ orgId, branchId, rows, asDraft = false }) {
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

    const priceNum = parseNumber(r.price);
    if (priceNum === null || priceNum < 0) {
      errors.push({ row: rowNum, message: "سعر غير صالح" });
      continue;
    }

    const costRaw = parseNumber(r.cost);
    const wholesaleRaw = parseNumber(r.wholesalePrice);
    const sku = r.sku != null && String(r.sku).trim() ? String(r.sku).trim() : null;
    const barcode = r.barcode != null && String(r.barcode).trim() ? String(r.barcode).trim() : null;
    const petType = parsePetType(r.petType);
    const isActive = asDraft ? false : parseYesNo(r.isActive);
    const stockQty = Math.max(0, Math.floor(parseNumber(r.stockQty) ?? 0));
    const minStock = Math.max(0, Math.floor(parseNumber(r.minStock) ?? 5));
    const expDate = parseExpiryCell(r.expiryDate);
    const imageRaw = r.imageUrl != null ? String(r.imageUrl).trim() : "";
    const imageUrl =
      imageRaw && (/^https?:\/\/\S+/i.test(imageRaw) || imageRaw.startsWith("/")) ? imageRaw : null;
    const height = optionalDimension(r.heightCm);
    const width = optionalDimension(r.widthCm);
    const depth = optionalDimension(r.depthCm);

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
      price: new Prisma.Decimal(priceNum),
      wholesalePrice:
        wholesaleRaw != null && wholesaleRaw >= 0 ? new Prisma.Decimal(wholesaleRaw) : null,
      cost: costRaw != null && costRaw >= 0 ? new Prisma.Decimal(costRaw) : null,
      petType,
      category: catalog.category,
      categoryId: catalog.categoryId,
      subcategoryId: catalog.subcategoryId,
      ...(imageUrl ? { imageUrl } : {}),
      isActive,
      expiryDate: expDate,
      expiryAlertDaysBefore: null,
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

      await prisma.inventory.upsert({
        where: {
          productId_branchId: { productId, branchId },
        },
        create: {
          productId,
          branchId,
          quantity: stockQty,
          minStockLevel: minStock,
        },
        update: {
          quantity: stockQty,
          minStockLevel: minStock,
        },
      });
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

/** Upload product image into the database (max 2 MB) → returns path for imageUrl */
router.post(
  "/upload-image",
  requireRole("ADMIN", "MANAGER", "CASHIER"),
  requirePermission("productsEdit"),
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
      const created = await prisma.productImage.create({
        data: {
          organizationId: req.user.organizationId,
          productId,
          fileName: String(req.file.originalname || "image").slice(0, 180),
          mimeType: String(req.file.mimetype || "image/jpeg").slice(0, 80),
          size: req.file.buffer.length,
          data: req.file.buffer,
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
      if (e?.status) return res.status(e.status).json({ error: e.message });
      next(e);
    }
  }
);

/** توليد باركود رقمي غير مكرر ضمن المؤسسة (للمنتج الجديد أو عند تعبئة باركود لأول مرة) */
router.get("/generate-barcode", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
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

router.get("/import/excel/sample", requireRole("ADMIN", "MANAGER"), async (_req, res, next) => {
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

router.get("/export/excel", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
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

router.post(
  "/import/excel/preview",
  requireRole("ADMIN", "MANAGER"),
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

router.post("/import/excel/confirm", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
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
      branchId,
      rows,
      asDraft: req.body?.asDraft === true,
    });

    if (touchedProductIds.size > 0) {
      scheduleInventoryWebhook(orgId, {
        event: "products.import",
        meta: { branchId, created, updated },
        lines: [...touchedProductIds].map((productId) => ({
          branchId,
          productId,
          quantityDelta: 0,
        })),
      });
    }

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

router.post(
  "/import/excel",
  requireRole("ADMIN", "MANAGER"),
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
        branchId,
        rows,
      });

      if (touchedProductIds.size > 0) {
        scheduleInventoryWebhook(orgId, {
          event: "products.import",
          meta: { branchId, created, updated },
          lines: [...touchedProductIds].map((productId) => ({
            branchId,
            productId,
            quantityDelta: 0,
          })),
        });
      }

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

router.get("/:id/lots", async (req, res) => {
  const branchId =
    req.query.branchId != null && String(req.query.branchId).trim()
      ? String(req.query.branchId).trim()
      : req.user.branchId;
  if (!branchId) return res.status(400).json({ error: "يجب تحديد الفرع" });
  if (req.user.role !== "ADMIN" && req.user.branchId && req.user.branchId !== branchId) {
    return res.status(403).json({ error: "لا يمكن الوصول لفرع آخر" });
  }
  const orgId = req.user.organizationId;
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, organizationId: orgId },
    select: { id: true, name: true },
  });
  if (!product) return res.status(404).json({ error: "المنتج غير موجود" });
  const branchOk = await findBranchInOrg(prisma, orgId, branchId);
  if (!branchOk) return res.status(400).json({ error: "فرع غير صالح" });

  const lots = await prisma.inventoryLot.findMany({
    where: {
      organizationId: orgId,
      productId: product.id,
      branchId,
    },
    orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }],
    select: {
      id: true,
      receivedAt: true,
      expiryDate: true,
      quantityReceived: true,
      quantityOnHand: true,
      unitCost: true,
      note: true,
    },
  });
  res.json({ product, branchId, lots });
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

router.post("/", requireRole("ADMIN", "MANAGER", "CASHIER"), requirePermission("productsEdit"), async (req, res) => {
  const {
    name,
    nameEn,
    description,
    sku,
    barcode,
    price,
    wholesalePrice,
    cost,
    petType,
    categoryId,
    subcategoryId,
    imageUrl,
    branchId,
    initialStock,
    minStockLevel,
    expiryDate: expiryDateRaw,
    modifiers: modifiersRaw,
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
  const priceNum = Number(price);
  if (Number.isNaN(priceNum) || priceNum < 0) {
    return res.status(400).json({ error: "سعر غير صالح" });
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

  let expiryDate = null;
  if (expiryDateRaw != null && String(expiryDateRaw).trim()) {
    const d = new Date(String(expiryDateRaw));
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ error: "تاريخ انتهاء الصلاحية غير صالح" });
    }
    expiryDate = d;
  }

  const modifiers = normalizeProductModifiers(modifiersRaw);
  const catalogCopy = catalogFieldsFromBody(req.body || {});
  if (catalogCopy.error) return res.status(400).json({ error: catalogCopy.error });

  const barcodeTrim = barcode?.trim() || null;
  try {
    await assertBarcodeAvailable(prisma, req.user.organizationId, barcodeTrim, null);
  } catch (e) {
    if (e?.status === 400) return res.status(400).json({ error: e.message });
    throw e;
  }

  const stockQty = Math.max(0, Math.floor(Number(initialStock) || 0));
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
          price: new Prisma.Decimal(priceNum),
          wholesalePrice:
            wholesalePrice != null && wholesalePrice !== ""
              ? new Prisma.Decimal(Number(wholesalePrice))
              : null,
          cost:
            cost != null && cost !== ""
              ? new Prisma.Decimal(Number(cost))
              : null,
          petType: ["CAT", "DOG", "OTHER"].includes(String(petType))
            ? String(petType)
            : "OTHER",
          category: catalog.category,
          categoryId: catalog.categoryId,
          subcategoryId: catalog.subcategoryId,
          imageUrl: imageTrim || null,
          expiryDate,
          expiryAlertDaysBefore: null,
          ...(modifiers ? { modifiers } : {}),
          inventories: {
            create: {
              branchId: bid,
              quantity: stockQty,
              minStockLevel: Math.max(0, Number(minStockLevel) || 5),
            },
          },
        },
        include: { inventories: true },
      });
      // Keep aggregate stock and expiry lots aligned from day one.
      if (stockQty > 0) {
        await tx.inventoryLot.create({
          data: {
            organizationId: req.user.organizationId,
            productId: created.id,
            branchId: bid,
            receivedAt: new Date(),
            expiryDate,
            quantityReceived: stockQty,
            quantityOnHand: stockQty,
            unitCost:
              cost != null && cost !== "" ? new Prisma.Decimal(Number(cost)) : null,
            note: "initial-stock",
          },
        });
      }
      return created;
    });
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(400).json({
        error: "تعارض بيانات فريدة (SKU أو باركود أو معرّف خارجي)",
      });
    }
    throw e;
  }
  scheduleInventoryWebhook(req.user.organizationId, {
    event: "product.created",
    meta: { productId: product.id, branchId: bid },
    lines: [
      {
        branchId: bid,
        productId: product.id,
        quantityDelta: stockQty,
      },
    ],
  });
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
      price: Number(product.price),
      categoryId: product.categoryId,
      subcategoryId: product.subcategoryId,
      initialStock: Math.max(0, Number(initialStock) || 0),
      minStockLevel: Math.max(0, Number(minStockLevel) || 5),
    },
  });
  await linkProductImage(req.user.organizationId, product.id, imageTrim);
  res.status(201).json(withResolvedImageUrl(product));
});

router.patch("/:id", requireRole("ADMIN", "MANAGER", "CASHIER"), requirePermission("productsEdit"), async (req, res) => {
  const data = req.body || {};
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
  if (data.price != null) update.price = new Prisma.Decimal(Number(data.price));
  if (data.cost !== undefined) {
    update.cost =
      data.cost != null && data.cost !== ""
        ? new Prisma.Decimal(Number(data.cost))
        : null;
  }
  if (data.wholesalePrice !== undefined) {
    update.wholesalePrice =
      data.wholesalePrice != null && data.wholesalePrice !== ""
        ? new Prisma.Decimal(Number(data.wholesalePrice))
        : null;
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

  if (data.expiryDate !== undefined) {
    if (data.expiryDate === null || data.expiryDate === "") {
      update.expiryDate = null;
      update.expiryAlertDaysBefore = null;
    } else {
      const d = new Date(String(data.expiryDate));
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: "تاريخ انتهاء الصلاحية غير صالح" });
      }
      update.expiryDate = d;
      update.expiryAlertDaysBefore = null;
    }
  }

  if (data.modifiers !== undefined) {
    update.modifiers = normalizeProductModifiers(data.modifiers);
  }

  try {
    const p = await prisma.product.update({
      where: { id: existing.id },
      data: update,
      include: { inventories: true },
    });
    if (update.imageUrl !== undefined) {
      await linkProductImage(req.user.organizationId, p.id, update.imageUrl);
    }
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
        price: Number(p.price),
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

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, organizationId: req.user.organizationId },
    });
    if (!existing) return res.status(404).json({ error: "المنتج غير موجود" });
    await prisma.$transaction(async (tx) => {
      await deleteStoredProductImages(tx, req.user.organizationId, existing);
      await tx.product.delete({ where: { id: existing.id } });
    });
    await writeAudit({
      userId: req.user.sub,
      action: "PRODUCT_DELETE",
      entityType: "Product",
      entityId: existing.id,
      branchId: req.user.branchId || null,
      summary: `Deleted product "${existing.nameEn || existing.name}" (SKU: ${existing.sku || "—"})`,
      meta: {
        sku: existing.sku,
        barcode: existing.barcode,
        price: Number(existing.price),
        categoryId: existing.categoryId,
        subcategoryId: existing.subcategoryId,
      },
    });
    res.status(204).send();
  } catch (e) {
    if (e?.code === "P2003") {
      return res.status(400).json({
        error: "لا يمكن حذف المنتج لأنه مرتبط بمبيعات/مرتجعات/مشتريات",
      });
    }
    throw e;
  }
});

export default router;
