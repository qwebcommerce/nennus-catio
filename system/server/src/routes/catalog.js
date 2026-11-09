import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/auditLog.js";
import { authMiddleware, requireRole, requirePermission } from "../middleware/auth.js";
import {
  validateCatalogName,
  validateSkuCode,
  validateOptionalLabel,
  normKey,
} from "../lib/catalogValidate.js";

const router = Router();
router.use(authMiddleware);

/** GET /api/catalog — categories + subcategories + skus for product forms */
router.get("/", async (req, res) => {
  const orgId = req.user.organizationId;
  const [categories, subcategories, skus] = await Promise.all([
    prisma.category.findMany({
      where: { organizationId: orgId },
      orderBy: [{ name: "asc" }],
    }),
    prisma.subcategory.findMany({
      where: { organizationId: orgId },
      orderBy: [{ name: "asc" }],
      include: { category: { select: { id: true, name: true, nameEn: true } } },
    }),
    prisma.catalogSku.findMany({
      where: { organizationId: orgId },
      orderBy: [{ code: "asc" }],
      include: {
        subcategory: {
          select: {
            id: true,
            name: true,
            nameEn: true,
            categoryId: true,
          },
        },
      },
    }),
  ]);
  res.json({ categories, subcategories, skus });
});

/* ── Categories ─────────────────────────────────────────── */

router.get("/categories", async (req, res) => {
  const list = await prisma.category.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { name: "asc" },
    include: { _count: { select: { subcategories: true, products: true } } },
  });
  res.json(list);
});

router.post("/categories", requireRole("ADMIN", "MANAGER", "CASHIER"), requirePermission("catalogEdit"), async (req, res) => {
  const { name, nameEn } = req.body || {};
  const checked = validateCatalogName(name, "Category name");
  if (!checked.ok) return res.status(400).json({ error: checked.error });
  const en = nameEn != null && String(nameEn).trim() ? validateCatalogName(nameEn, "English name") : { ok: true, value: null };
  if (!en.ok) return res.status(400).json({ error: en.error });

  const existing = await prisma.category.findMany({
    where: { organizationId: req.user.organizationId },
    select: { name: true, nameEn: true },
  });
  const key = normKey(checked.value);
  if (existing.some((c) => normKey(c.name) === key || (c.nameEn && normKey(c.nameEn) === key))) {
    return res.status(400).json({ error: "A category with this name already exists" });
  }

  const row = await prisma.category.create({
    data: {
      organizationId: req.user.organizationId,
      name: checked.value,
      nameEn: en.value,
    },
  });
  await writeAudit({
    userId: req.user.sub,
    action: "CATEGORY_CREATE",
    entityType: "Category",
    entityId: row.id,
    branchId: req.user.branchId || null,
    summary: `Created category "${row.name}"`,
    meta: { name: row.name, nameEn: row.nameEn },
  });
  res.status(201).json(row);
});

router.patch("/categories/:id", requireRole("ADMIN", "MANAGER", "CASHIER"), requirePermission("catalogEdit"), async (req, res) => {
  const existing = await prisma.category.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "Category not found" });
  const { name, nameEn } = req.body || {};
  const data = {};
  if (name !== undefined) {
    const checked = validateCatalogName(name, "Category name");
    if (!checked.ok) return res.status(400).json({ error: checked.error });
    const key = normKey(checked.value);
    const others = await prisma.category.findMany({
      where: { organizationId: req.user.organizationId, NOT: { id: existing.id } },
      select: { name: true, nameEn: true },
    });
    if (others.some((c) => normKey(c.name) === key || (c.nameEn && normKey(c.nameEn) === key))) {
      return res.status(400).json({ error: "A category with this name already exists" });
    }
    data.name = checked.value;
  }
  if (nameEn !== undefined) {
    if (!String(nameEn || "").trim()) data.nameEn = null;
    else {
      const en = validateCatalogName(nameEn, "English name");
      if (!en.ok) return res.status(400).json({ error: en.error });
      data.nameEn = en.value;
    }
  }
  const row = await prisma.category.update({ where: { id: existing.id }, data });
  await writeAudit({
    userId: req.user.sub,
    action: "CATEGORY_UPDATE",
    entityType: "Category",
    entityId: row.id,
    branchId: req.user.branchId || null,
    summary: `Updated category "${row.name}"`,
    meta: { name: row.name, nameEn: row.nameEn, changes: Object.keys(data) },
  });
  res.json(row);
});

router.delete("/categories/:id", requireRole("ADMIN", "MANAGER", "CASHIER"), requirePermission("catalogEdit"), async (req, res) => {
  const existing = await prisma.category.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "Category not found" });
  await prisma.category.delete({ where: { id: existing.id } });
  await writeAudit({
    userId: req.user.sub,
    action: "CATEGORY_DELETE",
    entityType: "Category",
    entityId: existing.id,
    branchId: req.user.branchId || null,
    summary: `Deleted category "${existing.name}"`,
    meta: { name: existing.name },
  });
  res.json({ ok: true });
});

/* ── Subcategories ──────────────────────────────────────── */

router.get("/subcategories", async (req, res) => {
  const categoryId = req.query.categoryId ? String(req.query.categoryId) : "";
  const list = await prisma.subcategory.findMany({
    where: {
      organizationId: req.user.organizationId,
      ...(categoryId ? { categoryId } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      category: { select: { id: true, name: true, nameEn: true } },
      _count: { select: { products: true, catalogSkus: true } },
    },
  });
  res.json(list);
});

router.post("/subcategories", requireRole("ADMIN", "MANAGER", "CASHIER"), requirePermission("catalogEdit"), async (req, res) => {
  const { categoryId, name, nameEn } = req.body || {};
  if (!categoryId || !String(categoryId).trim()) {
    return res.status(400).json({ error: "Please select a parent category" });
  }
  const checked = validateCatalogName(name, "Subcategory name");
  if (!checked.ok) return res.status(400).json({ error: checked.error });
  const en = nameEn != null && String(nameEn).trim() ? validateCatalogName(nameEn, "English name") : { ok: true, value: null };
  if (!en.ok) return res.status(400).json({ error: en.error });

  const cat = await prisma.category.findFirst({
    where: { id: String(categoryId), organizationId: req.user.organizationId },
  });
  if (!cat) return res.status(400).json({ error: "Invalid category" });

  const siblings = await prisma.subcategory.findMany({
    where: { categoryId: cat.id },
    select: { name: true },
  });
  if (siblings.some((s) => normKey(s.name) === normKey(checked.value))) {
    return res.status(400).json({ error: "Subcategory already exists in this category" });
  }

  try {
    const row = await prisma.subcategory.create({
      data: {
        organizationId: req.user.organizationId,
        categoryId: cat.id,
        name: checked.value,
        nameEn: en.value,
      },
      include: { category: { select: { id: true, name: true, nameEn: true } } },
    });
    await writeAudit({
      userId: req.user.sub,
      action: "SUBCATEGORY_CREATE",
      entityType: "Subcategory",
      entityId: row.id,
      branchId: req.user.branchId || null,
      summary: `Created subcategory "${row.name}" under "${cat.name}"`,
      meta: { name: row.name, categoryId: cat.id },
    });
    res.status(201).json(row);
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(400).json({ error: "Subcategory already exists in this category" });
    }
    throw e;
  }
});

router.patch("/subcategories/:id", requireRole("ADMIN", "MANAGER", "CASHIER"), requirePermission("catalogEdit"), async (req, res) => {
  const existing = await prisma.subcategory.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "Subcategory not found" });
  const { name, nameEn, categoryId } = req.body || {};
  const data = {};
  if (name !== undefined) {
    const checked = validateCatalogName(name, "Subcategory name");
    if (!checked.ok) return res.status(400).json({ error: checked.error });
    data.name = checked.value;
  }
  if (nameEn !== undefined) {
    if (!String(nameEn || "").trim()) data.nameEn = null;
    else {
      const en = validateCatalogName(nameEn, "English name");
      if (!en.ok) return res.status(400).json({ error: en.error });
      data.nameEn = en.value;
    }
  }
  let nextCategoryId = existing.categoryId;
  if (categoryId !== undefined && categoryId !== existing.categoryId) {
    const cat = await prisma.category.findFirst({
      where: { id: String(categoryId), organizationId: req.user.organizationId },
    });
    if (!cat) return res.status(400).json({ error: "Invalid category" });
    data.categoryId = cat.id;
    nextCategoryId = cat.id;
  }
  if (data.name) {
    const siblings = await prisma.subcategory.findMany({
      where: { categoryId: nextCategoryId, NOT: { id: existing.id } },
      select: { name: true },
    });
    if (siblings.some((s) => normKey(s.name) === normKey(data.name))) {
      return res.status(400).json({ error: "Subcategory already exists in this category" });
    }
  }
  try {
    const row = await prisma.subcategory.update({
      where: { id: existing.id },
      data,
      include: { category: { select: { id: true, name: true, nameEn: true } } },
    });
    await writeAudit({
      userId: req.user.sub,
      action: "SUBCATEGORY_UPDATE",
      entityType: "Subcategory",
      entityId: row.id,
      branchId: req.user.branchId || null,
      summary: `Updated subcategory "${row.name}"`,
      meta: { name: row.name, categoryId: row.categoryId, changes: Object.keys(data) },
    });
    res.json(row);
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(400).json({ error: "Subcategory already exists in this category" });
    }
    throw e;
  }
});

router.delete("/subcategories/:id", requireRole("ADMIN", "MANAGER", "CASHIER"), requirePermission("catalogEdit"), async (req, res) => {
  const existing = await prisma.subcategory.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "Subcategory not found" });
  await prisma.subcategory.delete({ where: { id: existing.id } });
  await writeAudit({
    userId: req.user.sub,
    action: "SUBCATEGORY_DELETE",
    entityType: "Subcategory",
    entityId: existing.id,
    branchId: req.user.branchId || null,
    summary: `Deleted subcategory "${existing.name}"`,
    meta: { name: existing.name, categoryId: existing.categoryId },
  });
  res.json({ ok: true });
});

/* ── Catalog SKUs ───────────────────────────────────────── */

router.get("/skus", async (req, res) => {
  const subcategoryId = req.query.subcategoryId ? String(req.query.subcategoryId) : "";
  const list = await prisma.catalogSku.findMany({
    where: {
      organizationId: req.user.organizationId,
      ...(subcategoryId ? { subcategoryId } : {}),
    },
    orderBy: { code: "asc" },
    include: {
      subcategory: {
        select: { id: true, name: true, nameEn: true, categoryId: true },
      },
    },
  });
  res.json(list);
});

router.post("/skus", requireRole("ADMIN", "MANAGER", "CASHIER"), requirePermission("catalogEdit"), async (req, res) => {
  const { code, name, subcategoryId } = req.body || {};
  const checked = validateSkuCode(code);
  if (!checked.ok) return res.status(400).json({ error: checked.error });
  const label = validateOptionalLabel(name);
  if (!label.ok) return res.status(400).json({ error: label.error });

  let subId = null;
  if (subcategoryId) {
    const sub = await prisma.subcategory.findFirst({
      where: { id: String(subcategoryId), organizationId: req.user.organizationId },
    });
    if (!sub) return res.status(400).json({ error: "Invalid subcategory" });
    subId = sub.id;
  }

  const dup = await prisma.catalogSku.findFirst({
    where: {
      organizationId: req.user.organizationId,
      code: { equals: checked.value, mode: "insensitive" },
    },
  });
  if (dup) return res.status(400).json({ error: "SKU code already exists" });

  try {
    const row = await prisma.catalogSku.create({
      data: {
        organizationId: req.user.organizationId,
        code: checked.value,
        name: label.value,
        subcategoryId: subId,
      },
      include: {
        subcategory: {
          select: { id: true, name: true, nameEn: true, categoryId: true },
        },
      },
    });
    await writeAudit({
      userId: req.user.sub,
      action: "CATALOG_SKU_CREATE",
      entityType: "CatalogSku",
      entityId: row.id,
      branchId: req.user.branchId || null,
      summary: `Created catalog SKU "${row.code}"`,
      meta: { code: row.code, name: row.name, subcategoryId: row.subcategoryId },
    });
    res.status(201).json(row);
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(400).json({ error: "SKU code already exists" });
    }
    throw e;
  }
});

router.patch("/skus/:id", requireRole("ADMIN", "MANAGER", "CASHIER"), requirePermission("catalogEdit"), async (req, res) => {
  const existing = await prisma.catalogSku.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "SKU not found" });
  const { code, name, subcategoryId } = req.body || {};
  const data = {};
  if (code !== undefined) {
    const checked = validateSkuCode(code);
    if (!checked.ok) return res.status(400).json({ error: checked.error });
    const dup = await prisma.catalogSku.findFirst({
      where: {
        organizationId: req.user.organizationId,
        NOT: { id: existing.id },
        code: { equals: checked.value, mode: "insensitive" },
      },
    });
    if (dup) return res.status(400).json({ error: "SKU code already exists" });
    data.code = checked.value;
  }
  if (name !== undefined) {
    const label = validateOptionalLabel(name);
    if (!label.ok) return res.status(400).json({ error: label.error });
    data.name = label.value;
  }
  if (subcategoryId !== undefined) {
    if (!subcategoryId) {
      data.subcategoryId = null;
    } else {
      const sub = await prisma.subcategory.findFirst({
        where: { id: String(subcategoryId), organizationId: req.user.organizationId },
      });
      if (!sub) return res.status(400).json({ error: "Invalid subcategory" });
      data.subcategoryId = sub.id;
    }
  }
  try {
    const row = await prisma.catalogSku.update({
      where: { id: existing.id },
      data,
      include: {
        subcategory: {
          select: { id: true, name: true, nameEn: true, categoryId: true },
        },
      },
    });
    await writeAudit({
      userId: req.user.sub,
      action: "CATALOG_SKU_UPDATE",
      entityType: "CatalogSku",
      entityId: row.id,
      branchId: req.user.branchId || null,
      summary: `Updated catalog SKU "${row.code}"`,
      meta: { code: row.code, changes: Object.keys(data) },
    });
    res.json(row);
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(400).json({ error: "SKU code already exists" });
    }
    throw e;
  }
});

router.delete("/skus/:id", requireRole("ADMIN", "MANAGER", "CASHIER"), requirePermission("catalogEdit"), async (req, res) => {
  const existing = await prisma.catalogSku.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "SKU not found" });
  await prisma.catalogSku.delete({ where: { id: existing.id } });
  await writeAudit({
    userId: req.user.sub,
    action: "CATALOG_SKU_DELETE",
    entityType: "CatalogSku",
    entityId: existing.id,
    branchId: req.user.branchId || null,
    summary: `Deleted catalog SKU "${existing.code}"`,
    meta: { code: existing.code },
  });
  res.json({ ok: true });
});

export default router;
