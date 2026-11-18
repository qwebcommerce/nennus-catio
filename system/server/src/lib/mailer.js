import { prisma } from "./prisma.js";
import { customerLang, renderCustomerEmail, renderStaffAlert } from "./emailTemplates.js";

/**
 * Transactional email (NFR-17). Every email is written to EmailOutbox first, inside the
 * caller's flow, and a sender delivers pending rows with retry and backoff. Nothing here
 * throws to the caller: an email problem never turns a saved action into an error.
 */

const MAX_ATTEMPTS = 8;
const LOCK_MS = 2 * 60 * 1000;

/** 1, 2, 4, 8 … minutes, capped at 6 hours. */
export function backoffMs(attempts) {
  return Math.min(60 * 1000 * 2 ** Math.max(0, attempts - 1), 6 * 60 * 60 * 1000);
}

function mailConfig() {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.SHOP_FROM_EMAIL?.trim() || process.env.ONBOARDING_NOTIFY_FROM_EMAIL?.trim();
  return key && from ? { key, from } : null;
}

export function mailConfigured() {
  return Boolean(mailConfig());
}

/** Sends one email through Resend. Throws on any failure. */
async function deliver(row) {
  const config = mailConfig();
  if (!config) {
    const err = new Error("Email is not configured (RESEND_API_KEY / SHOP_FROM_EMAIL)");
    err.notConfigured = true;
    throw err;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.from, to: [row.toEmail], subject: row.subject, text: row.text, ...(row.html ? { html: row.html } : {}) }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Queues an email. Pass `db` (a transaction client) to write it in the same transaction as the
 * business change. Returns the outbox row, or null when it could not be queued.
 */
export async function enqueueMail({ to, subject, text, html = null, kind = "other", organizationId = null }, { db = prisma, flush = true } = {}) {
  const email = String(to || "").trim();
  if (!email || !subject) return null;
  try {
    const row = await db.emailOutbox.create({
      data: { toEmail: email, subject: String(subject).slice(0, 300), text: String(text || ""), html, kind, organizationId },
    });
    // Opportunistic send right away; the cron sender retries whatever is left.
    if (flush && db === prisma) flushSoon();
    return row;
  } catch (error) {
    console.error("[mail] could not queue email:", error?.message || error);
    return null;
  }
}

let flushing = null;
/** Starts a background send of due rows without making the caller wait. */
export function flushSoon() {
  // The demo-data loader (scripts/demo-data.mjs) queues mail but never sends it, and must not
  // claim other rows of the outbox.
  if (process.env.NC_DEMO_LOADER === "1") return Promise.resolve();
  if (flushing) return flushing;
  flushing = new Promise((resolve) => setImmediate(resolve))
    .then(() => processOutbox({ limit: 10 }))
    .catch((error) => console.error("[mail] flush failed:", error?.message || error))
    .finally(() => {
      flushing = null;
    });
  return flushing;
}

/**
 * Sends due rows: PENDING whose time has come, and SENDING rows whose lock expired (a sender
 * died). Rows are claimed with FOR UPDATE SKIP LOCKED so parallel senders never double-send.
 */
export async function processOutbox({ limit = 25 } = {}) {
  const take = Math.max(1, Math.min(100, Number(limit) || 25));
  const lockUntil = new Date(Date.now() + LOCK_MS);
  const claimed = await prisma.$queryRaw`
    UPDATE "EmailOutbox" SET "status" = 'SENDING', "lockedUntil" = ${lockUntil}, "attempts" = "attempts" + 1, "updatedAt" = NOW()
    WHERE "id" IN (
      SELECT "id" FROM "EmailOutbox"
      WHERE ("status" = 'PENDING' AND "nextAttemptAt" <= NOW())
         OR ("status" = 'SENDING' AND "lockedUntil" < NOW())
      ORDER BY "nextAttemptAt" ASC
      LIMIT ${take}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "toEmail", "subject", "text", "html", "attempts"`;
  const result = { claimed: claimed.length, sent: 0, retry: 0, failed: 0 };
  for (const row of claimed) {
    try {
      await deliver(row);
      await prisma.emailOutbox.update({ where: { id: row.id }, data: { status: "SENT", sentAt: new Date(), lockedUntil: null, lastError: null } });
      result.sent += 1;
    } catch (error) {
      const message = String(error?.message || error).slice(0, 500);
      // Not configured is not the email's fault: keep it, without using up an attempt.
      const attempts = error?.notConfigured ? Math.max(0, row.attempts - 1) : row.attempts;
      const giveUp = !error?.notConfigured && attempts >= MAX_ATTEMPTS;
      await prisma.emailOutbox.update({
        where: { id: row.id },
        data: {
          status: giveUp ? "FAILED" : "PENDING",
          attempts,
          lockedUntil: null,
          lastError: message,
          nextAttemptAt: new Date(Date.now() + (error?.notConfigured ? 15 * 60 * 1000 : backoffMs(attempts))),
        },
      }).catch(() => {});
      if (giveUp) result.failed += 1;
      else result.retry += 1;
    }
  }
  return result;
}

/** Legacy helper: queue a plain email. Returns true when it was queued. */
export async function sendMail({ to, subject, text, kind = "other", organizationId = null }) {
  return Boolean(await enqueueMail({ to, subject, text, kind, organizationId }));
}

/**
 * Queues a customer email in the customer's language (FR-85).
 * `data` is the template data, e.g. { reference, status } (a plain string still works).
 */
export async function mailCustomer(customer, kind, data, options = {}) {
  if (!customer?.email) return null;
  try {
    const { subject, text } = renderCustomerEmail(kind, customerLang(customer), data);
    return await enqueueMail({ to: customer.email, subject, text, kind, organizationId: customer.organizationId || null }, options);
  } catch (error) {
    console.error("[mail] customer email skipped:", error?.message || error);
    return null;
  }
}

/** Queues a staff alert when the owner has switched that alert on (FR-86). */
export async function mailStaff(organizationId, flag, data, options = {}) {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { notifyEmail: true, alertOrder: true, alertBooking: true, alertRelocation: true, alertLowStock: true },
    });
    if (!org?.notifyEmail || !org[flag]) return null;
    const { subject, text } = renderStaffAlert(flag, data);
    return await enqueueMail({ to: org.notifyEmail, subject, text, kind: flag, organizationId }, options);
  } catch (error) {
    console.error("[mail] staff alert skipped:", error?.message || error);
    return null;
  }
}
