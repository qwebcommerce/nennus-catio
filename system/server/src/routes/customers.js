import { Router } from "express";
import { Prisma } from "../lib/prisma-client-bundle.js";
import { prisma } from "../lib/prisma.js";
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
  if (opening > 0 && req.user.role === "CASHIER") {
    return res.status(403).json({ error: "لا يمكن للكاشير تعيين رصيد افتتاحي" });
  }

  const row = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        organizationId: req.user.organizationId,
        name: n,
        phone: phone != null && String(phone).trim() ? String(phone).trim() : null,
        email: email != null && String(email).trim() ? String(email).trim() : null,
        notes: notes != null && String(notes).trim() ? String(notes).trim() : null,
        address: address != null && String(address).trim() ? String(address).trim().slice(0, 500) : null,
        accountBalance: new Prisma.Decimal(opening),
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
    res.json(row);
  } catch {
    res.status(404).json({ error: "العميل غير موجود" });
  }
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
