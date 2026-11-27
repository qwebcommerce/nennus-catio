import { Router } from "express";
import { d, riyals, toDirhams } from "../lib/money.js";
import { toApi } from "../lib/moneyFields.js";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/auditLog.js";
import { assertVersion, isStaleEditError, requireVersion, versionedUpdate } from "../lib/recordVersion.js";
import { authMiddleware, hasModule, requireModule } from "../middleware/auth.js";
import { RELOCATION_DOCUMENTS_BUCKET, removeObjects } from "../lib/storage.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("customers", "view"));

/** Staff-facing customer fields — never password or token hashes (NFR-11). */
const CUSTOMER_STAFF_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  phone: true,
  email: true,
  notes: true,
  address: true,
  loyaltyPoints: true,
  lifetimeSpend: true,
  accountBalance: true,
  emailVerifiedAt: true,
  creditApproved: true,
  isBusiness: true,
  companyName: true,
  creditLimit: true,
  locale: true,
  tags: true,
  createdAt: true,
  updatedAt: true,
  version: true,
};

/** A riyal balance from the form → whole dirhams (NFR-03); null when empty, NaN when invalid. */
function parseBalance(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = toDirhams(raw);
  return n == null ? NaN : n;
}

const api = (row) => toApi("Customer", row);

router.get("/", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const where = {
    organizationId: req.user.organizationId,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const list = await prisma.customer.findMany({
    where,
    orderBy: { name: "asc" },
    take: 200,
    select: CUSTOMER_STAFF_SELECT,
  });
  res.json(api(list));
});

router.post("/", requireModule("customers", "create"), async (req, res) => {
  const { name, phone, email, notes, address, accountBalance } = req.body || {};
  const n = String(name || "").trim();
  if (!n) return res.status(400).json({ error: "الاسم مطلوب" });

  const bal = parseBalance(accountBalance);
  if (Number.isNaN(bal)) {
    return res.status(400).json({ error: "رصيد الذمّة غير صالح" });
  }
  const opening = bal != null ? bal : 0;
  const openingLimit = req.body?.creditLimit != null && req.body.creditLimit !== "" ? toDirhams(req.body.creditLimit) : null;
  if (req.body?.creditLimit != null && req.body.creditLimit !== "" && openingLimit == null) {
    return res.status(400).json({ error: "Credit limit is not valid", errorAr: "حد الائتمان غير صالح", errorEn: "Credit limit is not valid (at most 2 decimals)" });
  }
  const emailNorm = email != null && String(email).trim() ? String(email).trim().toLowerCase() : null;
  if (emailNorm) {
    const taken = await prisma.customer.findFirst({
      where: { organizationId: req.user.organizationId, email: { equals: emailNorm, mode: "insensitive" } },
    });
    if (taken) return res.status(409).json({ error: "This email already belongs to a customer" });
  }
  // An opening balance is a finance entry: it needs Finance → create (any role).
  if (opening > 0 && !(await hasModule(req, "finance", "create"))) {
    return res.status(403).json({ error: "لا يمكن للكاشير تعيين رصيد افتتاحي", errorAr: "لا يمكن للكاشير تعيين رصيد افتتاحي", errorEn: "A cashier cannot set an opening balance", code: "FORBIDDEN" });
  }

  const row = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        organizationId: req.user.organizationId,
        name: n,
        phone: phone != null && String(phone).trim() ? String(phone).trim() : null,
        email: emailNorm,
        notes: notes != null && String(notes).trim() ? String(notes).trim() : null,
        address: address != null && String(address).trim() ? String(address).trim().slice(0, 500) : null,
        accountBalance: opening,
        creditApproved: Boolean(req.body?.creditApproved),
        creditLimit: openingLimit,
        // Business (B2B) customer for sales orders.
        isBusiness: req.body?.isBusiness === true || req.body?.isBusiness === "true",
        companyName: req.body?.companyName != null && String(req.body.companyName).trim() ? String(req.body.companyName).trim().slice(0, 200) : null,
      },
      select: CUSTOMER_STAFF_SELECT,
    });
    if (opening > 0) {
      await tx.customerAccountLedger.create({
        data: {
          organizationId: req.user.organizationId,
          customerId: customer.id,
          branchId: req.user.branchId || null,
          entryType: "ADJUSTMENT",
          amount: opening,
          note: "Opening balance",
          createdByUserId: req.user.sub,
        },
      });
    }
    return customer;
  });

  res.status(201).json(api(row));
});

router.patch("/:id", requireModule("customers", "edit"), async (req, res) => {
  const { name, phone, email, notes, address, accountBalance } = req.body || {};
  const version = requireVersion(req);
  const data = {};
  if (name != null) {
    const n = String(name).trim();
    if (!n) return res.status(400).json({ error: "الاسم مطلوب" });
    data.name = n;
  }
  if (phone !== undefined) data.phone = phone != null && String(phone).trim() ? String(phone).trim() : null;
  if (email !== undefined) data.email = email != null && String(email).trim() ? String(email).trim() : null;
  if (notes !== undefined) data.notes = notes != null && String(notes).trim() ? String(notes).trim() : null;
  if (req.body?.tags !== undefined) data.tags = req.body.tags != null && String(req.body.tags).trim() ? String(req.body.tags).trim().slice(0, 300) : null;
  if (req.body?.creditApproved !== undefined) {
    data.creditApproved = Boolean(req.body.creditApproved);
  }
  if (req.body?.isBusiness !== undefined) data.isBusiness = req.body.isBusiness === true || req.body.isBusiness === "true";
  if (req.body?.companyName !== undefined) {
    data.companyName = req.body.companyName != null && String(req.body.companyName).trim() ? String(req.body.companyName).trim().slice(0, 200) : null;
  }
  if (req.body?.creditLimit !== undefined) {
    const limit = req.body.creditLimit === "" || req.body.creditLimit == null ? null : toDirhams(req.body.creditLimit);
    if (limit == null && !(req.body.creditLimit === "" || req.body.creditLimit == null)) {
      return res.status(400).json({ error: "Credit limit is not valid", errorAr: "حد الائتمان غير صالح", errorEn: "Credit limit is not valid (at most 2 decimals)" });
    }
    data.creditLimit = limit;
  }
  if (address !== undefined) {
    data.address = address != null && String(address).trim() ? String(address).trim().slice(0, 500) : null;
  }

  let nextBalance = null;
  if (accountBalance !== undefined) {
    const bal = parseBalance(accountBalance);
    if (Number.isNaN(bal) || bal == null) {
      return res.status(400).json({ error: "رصيد الذمّة غير صالح" });
    }
    nextBalance = bal;
    data.accountBalance = bal;
  }

  const existing = await prisma.customer.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "العميل غير موجود" });
  assertVersion(existing, version);

  try {
    const row = await prisma.$transaction(async (tx) => {
      const updated = await versionedUpdate(tx, "customer", {
        id: existing.id,
        version,
        data,
        select: CUSTOMER_STAFF_SELECT,
      });
      if (nextBalance != null) {
        const prev = d(existing.accountBalance);
        const delta = nextBalance - prev;
        if (delta !== 0) {
          await tx.customerAccountLedger.create({
            data: {
              organizationId: req.user.organizationId,
              customerId: existing.id,
              branchId: req.user.branchId || null,
              entryType: "ADJUSTMENT",
              amount: delta,
              note: "Balance adjustment",
              createdByUserId: req.user.sub,
            },
          });
        }
      }
      if (req.body?.creditApproved !== undefined || req.body?.creditLimit !== undefined || nextBalance != null) {
        await writeAudit(
          {
            userId: req.user.sub,
            action: nextBalance != null ? "CUSTOMER_BALANCE_UPDATE" : "CREDIT_UPDATE",
            entityType: "Customer",
            entityId: updated.id,
            summary: `${updated.name} credit=${updated.creditApproved}`,
            meta: {
              before: {
                creditApproved: existing.creditApproved,
                creditLimit: riyals(existing.creditLimit),
                accountBalance: riyals(existing.accountBalance ?? 0),
              },
              after: {
                creditApproved: updated.creditApproved,
                creditLimit: riyals(updated.creditLimit),
                accountBalance: riyals(updated.accountBalance ?? 0),
              },
            },
          },
          tx
        );
      }
      return updated;
    });
    res.json(api(row));
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(409).json({
        error: "هذا البريد مستخدم لعميل آخر",
        errorAr: "هذا البريد مستخدم لعميل آخر",
        errorEn: "This email already belongs to a customer",
        code: "EMAIL_TAKEN",
      });
    }
    if (isStaleEditError(e)) throw e;
    res.status(404).json({ error: "العميل غير موجود" });
  }
});

router.get("/:id/record", async (req, res) => {
  const customer = await prisma.customer.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
    include: {
      pets: { include: { petType: true } },
      addresses: true,
      appointments: {
        orderBy: { startAt: "desc" },
        take: 20,
        include: { service: { select: { name: true, nameEn: true } } },
      },
      relocationRequests: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, reference: true, destination: true, status: true, quoteAmount: true, createdAt: true },
      },
      sales: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, reference: true, total: true, createdAt: true, orderChannel: true, webStatus: true, invoiceNumber: true },
      },
    },
  });
  if (!customer) return res.status(404).json({ error: "العميل غير موجود" });
  res.json({
    version: customer.version,
    tags: customer.tags || "",
    notes: customer.notes || "",
    pets: customer.pets,
    addresses: customer.addresses,
    appointments: toApi("Appointment", customer.appointments),
    relocationRequests: toApi("RelocationRequest", customer.relocationRequests),
    sales: toApi("Sale", customer.sales),
  });
});

router.post("/:id/pets", requireModule("customers", "edit"), async (req, res) => {
  const customer = await prisma.customer.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!customer) return res.status(404).json({ error: "العميل غير موجود" });
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Pet name is required" });
  const pet = await prisma.customerPet.create({
    data: {
      organizationId: req.user.organizationId,
      customerId: customer.id,
      name,
      breed: req.body?.breed ? String(req.body.breed).trim() : null,
      ageText: req.body?.ageText ? String(req.body.ageText).trim() : null,
      notes: req.body?.notes ? String(req.body.notes).trim() : null,
      petTypeId: req.body?.petTypeId ? String(req.body.petTypeId) : null,
    },
  });
  res.status(201).json(pet);
});

router.post("/:id/addresses", requireModule("customers", "edit"), async (req, res) => {
  const customer = await prisma.customer.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!customer) return res.status(404).json({ error: "العميل غير موجود" });
  const line1 = String(req.body?.line1 || "").trim();
  if (!line1) return res.status(400).json({ error: "Address is required" });
  const address = await prisma.customerAddress.create({
    data: {
      customerId: customer.id,
      label: req.body?.label ? String(req.body.label).trim() : null,
      line1,
      area: req.body?.area ? String(req.body.area).trim() : null,
      city: req.body?.city ? String(req.body.city).trim() : null,
      isDefault: Boolean(req.body?.isDefault),
    },
  });
  res.status(201).json(address);
});

router.delete("/:id", requireModule("customers", "delete"), async (req, res) => {
  const row = await prisma.customer.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!row) return res.status(404).end();
  // Relocation documents cascade with the customer; their bucket objects are removed afterwards.
  const stored = await prisma.relocationDocument.findMany({
    where: { request: { customerId: row.id }, storagePath: { not: null } },
    select: { storagePath: true },
  });
  try {
    await prisma.customer.delete({ where: { id: row.id } });
    await removeObjects(RELOCATION_DOCUMENTS_BUCKET, stored.map((d) => d.storagePath));
    res.status(204).end();
  } catch {
    res.status(400).json({ error: "تعذر الحذف — قد تكون هناك مبيعات مرتبطة" });
  }
});

export default router;
