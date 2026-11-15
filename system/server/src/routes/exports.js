import { Router } from "express";
import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

const LISTS = {
  orders: "orders",
  customers: "customers",
  products: "products",
  bookings: "grooming",
  bills: "purchasing",
  payments: "purchasing",
  expenses: "finance",
  cashups: "finance",
  profit: "finance",
};

function pdf(lines) {
  const text = lines.join(" | ").replace(/[^\x20-\x7E]/g, " ");
  const content = `BT /F1 10 Tf 40 800 Td (${text.replace(/[()\\]/g, " ").slice(0, 3500)}) Tj ET`;
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    `4 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += `${object}\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

router.get("/:list", async (req, res, next) => {
  const mod = LISTS[req.params.list];
  if (!mod) return res.status(404).json({ error: "Unknown list" });
  return requireModule(mod, "export")(req, res, async () => {
    try {
      const lang = String(req.query.lang || "en").toLowerCase() === "ar" ? "ar" : "en";
      const orgId = req.user.organizationId;
      let rows = [];
      if (req.params.list === "orders") {
        const sales = await prisma.sale.findMany({
          where: { branch: { organizationId: orgId }, orderChannel: "WEBSITE" },
          include: { customer: true },
          orderBy: { createdAt: "desc" },
          take: 500,
        });
        rows = sales.map((sale) => ({
          id: sale.id,
          customer: sale.customer?.name || "",
          status: sale.webStatus || "",
          total: Number(sale.total),
          date: sale.createdAt.toISOString(),
        }));
      } else if (req.params.list === "customers") {
        const customers = await prisma.customer.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" }, take: 500 });
        rows = customers.map((customer) => ({
          name: customer.name,
          email: customer.email || "",
          phone: customer.phone || "",
          credit: customer.creditApproved ? "yes" : "no",
          balance: Number(customer.accountBalance),
        }));
      } else if (req.params.list === "products") {
        const products = await prisma.product.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" }, take: 500 });
        rows = products.map((product) => ({
          name: lang === "en" ? product.nameEn || product.name : product.name,
          sku: product.sku || "",
          price: Number(product.price),
          active: product.isActive ? "yes" : "no",
        }));
      } else if (req.params.list === "bookings") {
        const bookings = await prisma.appointment.findMany({
          where: { organizationId: orgId },
          include: { customer: true, service: true },
          orderBy: { startAt: "desc" },
          take: 500,
        });
        rows = bookings.map((booking) => ({
          when: booking.startAt.toISOString(),
          customer: booking.customer?.name || "",
          package: lang === "en" ? booking.service?.nameEn || booking.service?.name || "" : booking.service?.name || "",
          status: booking.status,
        }));
      } else if (req.params.list === "bills") {
        const bills = await prisma.supplierBill.findMany({
          where: { organizationId: orgId },
          include: { supplier: true },
          orderBy: { createdAt: "desc" },
          take: 500,
        });
        rows = bills.map((bill) => ({
          supplier: bill.supplier?.name || "",
          amount: Number(bill.amount),
          paid: Number(bill.amountPaid),
          owed: Number(bill.amount) - Number(bill.amountPaid),
          status: bill.status,
          date: bill.createdAt.toISOString(),
        }));
      } else if (req.params.list === "payments") {
        const payments = await prisma.supplierPayment.findMany({
          where: { bill: { organizationId: orgId } },
          include: { bill: { include: { supplier: true } } },
          orderBy: { paidAt: "desc" },
          take: 500,
        });
        rows = payments.map((payment) => ({
          supplier: payment.bill?.supplier?.name || "",
          amount: Number(payment.amount),
          method: payment.method,
          date: payment.paidAt.toISOString(),
        }));
      } else if (req.params.list === "expenses") {
        const expenses = await prisma.expense.findMany({
          where: { organizationId: orgId },
          orderBy: { expenseDate: "desc" },
          take: 500,
        });
        rows = expenses.map((expense) => ({
          category: expense.category,
          amount: Number(expense.amount),
          date: expense.expenseDate.toISOString(),
          note: expense.description || "",
        }));
      } else if (req.params.list === "cashups") {
        const sessions = await prisma.cashSession.findMany({
          where: { branch: { organizationId: orgId } },
          include: { branch: true, sales: { select: { paymentMethod: true, total: true } } },
          orderBy: { openedAt: "desc" },
          take: 500,
        });
        rows = sessions.map((session) => ({
          location: session.branch?.name || "",
          opened: session.openedAt.toISOString(),
          float: Number(session.openingFloat),
          counted: session.closingCountedCash != null ? Number(session.closingCountedCash) : "",
          expected: session.expectedCash != null ? Number(session.expectedCash) : "",
          difference: session.cashVariance != null ? Number(session.cashVariance) : "",
          card: session.sales.filter((sale) => sale.paymentMethod === "CARD").reduce((sum, sale) => sum + Number(sale.total), 0),
        }));
      } else if (req.params.list === "profit") {
        const from = req.query.from ? new Date(String(req.query.from)) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const to = req.query.to ? new Date(String(req.query.to)) : new Date();
        const sales = await prisma.sale.findMany({
          where: {
            branch: { organizationId: orgId },
            createdAt: { gte: from, lte: to },
            ...(req.query.branchId ? { branchId: String(req.query.branchId) } : {}),
            ...(req.query.channel ? { orderChannel: String(req.query.channel) } : {}),
          },
          include: { items: true, refunds: { include: { items: true } } },
        });
        const live = sales.filter((sale) => sale.invoiceStatus !== "CANCELLED" && sale.webStatus !== "CANCELLED" && sale.webStatus !== "PENDING_PAYMENT");
        const revenue = live.reduce((sum, sale) => sum + Number(sale.total), 0);
        const refunds = live.reduce((sum, sale) => sum + sale.refunds.reduce((inner, refund) => inner + Number(refund.total), 0), 0);
        const cogs = live.reduce((sum, sale) => {
          const sold = sale.items.reduce((inner, item) => inner + Number(item.costAmount || 0), 0);
          const back = sale.refunds.reduce((inner, refund) => inner + refund.items.reduce((line, item) => line + Number(item.costAmount || 0), 0), 0);
          return sum + sold - back;
        }, 0);
        const expense = await prisma.expense.aggregate({
          where: { organizationId: orgId, expenseDate: { gte: from, lte: to } },
          _sum: { amount: true },
        });
        rows = [{
          from: from.toISOString(),
          to: to.toISOString(),
          sales: revenue,
          refunds,
          costOfGoods: cogs,
          expenses: Number(expense._sum.amount || 0),
          result: revenue - refunds - cogs - Number(expense._sum.amount || 0),
        }];
      }
      const format = String(req.query.format || "csv").toLowerCase();
      const headers = rows[0] ? Object.keys(rows[0]) : ["empty"];
      if (format === "xlsx") {
        const sheet = XLSX.utils.json_to_sheet(rows);
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, "List");
        const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${req.params.list}.xlsx"`);
        return res.send(buffer);
      }
      if (format === "pdf") {
        const lines = [headers.join(" | "), ...rows.map((row) => headers.map((key) => row[key]).join(" | "))];
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${req.params.list}.pdf"`);
        return res.send(pdf(lines));
      }
      const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${req.params.list}.csv"`);
      res.send(`\uFEFF${csv}`);
    } catch (error) {
      next(error);
    }
  });
});

export default router;
