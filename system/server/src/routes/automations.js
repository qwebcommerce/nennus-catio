import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);
router.use(requireRole("ADMIN", "MANAGER"));

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function renderTemplate(template, customer) {
  const name = customer?.name || "Customer";
  return String(template || "")
    .replaceAll("{{name}}", name)
    .replaceAll("{{phone}}", customer?.phone || "")
    .replaceAll("{{email}}", customer?.email || "");
}

router.get("/", async (req, res) => {
  const rows = await prisma.automationRule.findMany({
    where: { organizationId: req.user.organizationId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(rows);
});

router.post("/", async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  const trigger = String(b.trigger || "").toUpperCase();
  const channel = String(b.channel || "").toUpperCase();
  if (!name) return res.status(400).json({ error: "اسم القاعدة مطلوب" });
  if (!["INACTIVE_CUSTOMERS", "MISSED_APPOINTMENTS"].includes(trigger)) {
    return res.status(400).json({ error: "Trigger غير صالح" });
  }
  if (!["SMS", "EMAIL", "WHATSAPP"].includes(channel)) {
    return res.status(400).json({ error: "Channel غير صالح" });
  }
  const messageTemplate = String(b.messageTemplate || "").trim();
  if (!messageTemplate) return res.status(400).json({ error: "نص الرسالة مطلوب" });
  const row = await prisma.automationRule.create({
    data: {
      organizationId: req.user.organizationId,
      name,
      trigger,
      channel,
      active: b.active !== false,
      delayHours: Math.max(0, Math.min(720, Number(b.delayHours) || 0)),
      cooldownDays: Math.max(1, Math.min(365, Number(b.cooldownDays) || 14)),
      criteriaJson: b.criteriaJson ?? null,
      messageTemplate,
    },
  });
  res.status(201).json(row);
});

router.patch("/:id", async (req, res) => {
  const existing = await prisma.automationRule.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).json({ error: "القاعدة غير موجودة" });
  const b = req.body || {};
  const data = {};
  if (b.name !== undefined) data.name = String(b.name || "").trim();
  if (b.active !== undefined) data.active = Boolean(b.active);
  if (b.delayHours !== undefined) data.delayHours = Math.max(0, Math.min(720, Number(b.delayHours) || 0));
  if (b.cooldownDays !== undefined) data.cooldownDays = Math.max(1, Math.min(365, Number(b.cooldownDays) || 14));
  if (b.messageTemplate !== undefined) data.messageTemplate = String(b.messageTemplate || "").trim();
  if (b.criteriaJson !== undefined) data.criteriaJson = b.criteriaJson;
  const row = await prisma.automationRule.update({ where: { id: existing.id }, data });
  res.json(row);
});

router.delete("/:id", async (req, res) => {
  const existing = await prisma.automationRule.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!existing) return res.status(404).end();
  await prisma.automationRule.delete({ where: { id: existing.id } });
  res.status(204).end();
});

router.get("/logs", async (req, res) => {
  const rows = await prisma.automationLog.findMany({
    where: { organizationId: req.user.organizationId },
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true } },
      rule: { select: { id: true, name: true, trigger: true, channel: true } },
      run: { select: { id: true, startedAt: true, processed: true, sent: true, failed: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  res.json(rows);
});

async function pickTargets(orgId, rule) {
  const trigger = rule.trigger;
  if (trigger === "INACTIVE_CUSTOMERS") {
    const inactiveDays = Math.max(7, Number(rule.criteriaJson?.inactiveDays) || 45);
    const cutoff = daysAgo(inactiveDays);
    const customers = await prisma.customer.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, phone: true, email: true },
      take: 1000,
    });
    const sales = await prisma.sale.findMany({
      where: {
        customerId: { not: null },
        branch: { organizationId: orgId },
      },
      select: { customerId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    const lastByCustomer = new Map();
    for (const s of sales) {
      if (!s.customerId || lastByCustomer.has(s.customerId)) continue;
      lastByCustomer.set(s.customerId, s.createdAt);
    }
    return customers.filter((c) => {
      const last = lastByCustomer.get(c.id);
      return !last || last < cutoff;
    });
  }

  if (trigger === "MISSED_APPOINTMENTS") {
    const missedDays = Math.max(7, Number(rule.criteriaJson?.missedDays) || 7);
    const cutoff = daysAgo(missedDays);
    const appts = await prisma.appointment.findMany({
      where: {
        organizationId: orgId,
        status: "NO_SHOW",
        updatedAt: { gte: cutoff },
        customerId: { not: null },
      },
      include: { customer: { select: { id: true, name: true, phone: true, email: true } } },
      orderBy: { updatedAt: "desc" },
      take: 1000,
    });
    const seen = new Set();
    const out = [];
    for (const a of appts) {
      if (!a.customer || seen.has(a.customer.id)) continue;
      seen.add(a.customer.id);
      out.push(a.customer);
    }
    return out;
  }

  return [];
}

router.post("/:id/run", async (req, res) => {
  const orgId = req.user.organizationId;
  const rule = await prisma.automationRule.findFirst({
    where: { id: req.params.id, organizationId: orgId },
  });
  if (!rule) return res.status(404).json({ error: "القاعدة غير موجودة" });
  if (!rule.active) return res.status(400).json({ error: "القاعدة غير مفعلة" });

  const run = await prisma.automationRun.create({
    data: { organizationId: orgId, ruleId: rule.id },
  });

  const targets = await pickTargets(orgId, rule);
  let processed = 0;
  let sent = 0;
  let failed = 0;
  for (const c of targets) {
    processed += 1;
    const lastSent = await prisma.automationLog.findFirst({
      where: {
        organizationId: orgId,
        ruleId: rule.id,
        customerId: c.id,
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (lastSent && lastSent.createdAt > daysAgo(rule.cooldownDays)) continue;
    const hasReachable =
      (rule.channel === "SMS" || rule.channel === "WHATSAPP")
        ? Boolean(c.phone)
        : Boolean(c.email);
    if (!hasReachable) {
      failed += 1;
      await prisma.automationLog.create({
        data: {
          organizationId: orgId,
          ruleId: rule.id,
          runId: run.id,
          customerId: c.id,
          trigger: rule.trigger,
          channel: rule.channel,
          status: "FAILED",
          message: "",
          error: "لا توجد وسيلة تواصل مناسبة للعميل",
        },
      });
      continue;
    }
    sent += 1;
    await prisma.automationLog.create({
      data: {
        organizationId: orgId,
        ruleId: rule.id,
        runId: run.id,
        customerId: c.id,
        trigger: rule.trigger,
        channel: rule.channel,
        status: "SENT",
        message: renderTemplate(rule.messageTemplate, c),
      },
    });
  }

  const finished = await prisma.automationRun.update({
    where: { id: run.id },
    data: { finishedAt: new Date(), processed, sent, failed },
  });
  res.json({ run: finished, targets: targets.length });
});

export default router;
