import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/auditLog.js";
import { authMiddleware, requireRole, requirePermission } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);
router.use(requirePermission("customers"));

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function parseBalance(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = roundMoney(Number(String(raw).replace(",", ".")));
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n;
}

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
  });
  res.json(list);
});

router.post("/", async (req, res) => {
  const { name, phone, email, notes, address, accountBalance } = req.body || {};
  const n = String(name || "").trim();
  if (!n) return res.status(400).json({ error: "الاسم مطلوب" });

  const bal = parseBalance(accountBalance);
  if (Number.isNaN(bal)) {
    return res.status(400).json({ error: "رصيد الذمّة غير صالح" });
  }
  const opening = bal != null ? bal : 0;
  const emailNorm = email != null && String(email).trim() ? String(email).trim().toLowerCase() : null;
  if (emailNorm) {
    const taken = await prisma.customer.findFirst({
      where: { organizationId: req.user.organizationId, email: { equals: emailNorm, mode: "insensitive" } },
    });
    if (taken) return res.status(409).json({ error: "This email already belongs to a customer" });
  }
  if (opening > 0 && req.user.role === "CASHIER") {
    return res.status(403).json({ error: "لا يمكن للكاشير تعيين رصيد افتتاحي" });
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
        accountBalance: new Prisma.Decimal(opening),
        creditApproved: Boolean(req.body?.creditApproved),
        creditLimit: req.body?.creditLimit != null && req.body.creditLimit !== "" && Number.isFinite(Number(req.body.creditLimit))
          ? new Prisma.Decimal(Number(req.body.creditLimit).toFixed(2))
          : null,
      },
    });
    if (opening > 0) {
      await tx.customerAccountLedger.create({
        data: {
          organizationId: req.user.organizationId,
          customerId: customer.id,
          branchId: req.user.branchId || null,
          entryType: "ADJUSTMENT",
          amount: new Prisma.Decimal(opening),
          note: "Opening balance",
          createdByUserId: req.user.sub,
        },
      });
    }
    return customer;
  });

  res.status(201).json(row);
});

router.patch("/:id", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  const { name, phone, email, notes, address, accountBalance } = req.body || {};
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
  if (req.body?.creditLimit !== undefined) {
    const limit = req.body.creditLimit === "" || req.body.creditLimit == null ? null : Number(req.body.creditLimit);
    if (limit != null && (!Number.isFinite(limit) || limit < 0)) {
      return res.status(400).json({ error: "Credit limit is not valid" });
    }
    data.creditLimit = limit == null ? null : new Prisma.Decimal(limit.toFixed(2));
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
    data.accountBalance = new Prisma.Decimal(bal);
  }

  const existing = await prisma.customer.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "العميل غير موجود" });

  try {
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({
        where: { id: existing.id },
        data,
      });
      if (nextBalance != null) {
        const prev = roundMoney(Number(existing.accountBalance ?? 0));
        const delta = roundMoney(nextBalance - prev);
        if (Math.abs(delta) > 0.001) {
          await tx.customerAccountLedger.create({
            data: {
              organizationId: req.user.organizationId,
              customerId: existing.id,
              branchId: req.user.branchId || null,
              entryType: "ADJUSTMENT",
              amount: new Prisma.Decimal(delta),
              note: "Balance adjustment",
              createdByUserId: req.user.sub,
            },
          });
        }
      }
      return updated;
    });
    if (req.body?.creditApproved !== undefined || req.body?.creditLimit !== undefined) {
      await writeAudit({
        userId: req.user.sub,
        action: "CREDIT_UPDATE",
        entityType: "Customer",
        entityId: row.id,
        summary: `${row.name} credit=${row.creditApproved}`,
      });
    }
    res.json(row);
  } catch {
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
    tags: customer.tags || "",
    notes: customer.notes || "",
    pets: customer.pets,
    addresses: customer.addresses,
    appointments: customer.appointments,
    relocationRequests: customer.relocationRequests,
    sales: customer.sales,
  });
});

router.post("/:id/pets", requireRole("ADMIN", "MANAGER"), async (req, res) => {
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

router.post("/:id/addresses", requireRole("ADMIN", "MANAGER"), async (req, res) => {
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

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const row = await prisma.customer.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!row) return res.status(404).end();
  try {
    await prisma.customer.delete({ where: { id: row.id } });
    res.status(204).end();
  } catch {
    res.status(400).json({ error: "تعذر الحذف — قد تكون هناك مبيعات مرتبطة" });
  }
});

export default router;
