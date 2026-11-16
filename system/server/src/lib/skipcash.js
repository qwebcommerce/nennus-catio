import crypto from "crypto";
import { fmt } from "./money.js";

const CREATE_FIELDS = [
  "Uid",
  "KeyId",
  "Amount",
  "FirstName",
  "LastName",
  "Phone",
  "Email",
  "Street",
  "City",
  "State",
  "Country",
  "PostalCode",
  "TransactionId",
  "Custom1",
];

const WEBHOOK_FIELDS = ["PaymentId", "Amount", "StatusId", "TransactionId", "Custom1", "VisaId"];

export function skipcashConfigured() {
  return Boolean(process.env.SKIPCASH_KEY_ID?.trim() && process.env.SKIPCASH_SECRET?.trim());
}

function sign(fields, payload, secret) {
  const parts = [];
  for (const key of fields) {
    const value = payload[key];
    if (value == null || value === "") continue;
    parts.push(`${key}=${value}`);
  }
  return crypto.createHmac("sha256", secret).update(parts.join(",")).digest("base64");
}

export function signSkipcashRequest(payload) {
  return sign(CREATE_FIELDS, payload, process.env.SKIPCASH_SECRET.trim());
}

export function skipcashWebhookValid(body, authorization) {
  const secret = (process.env.SKIPCASH_WEBHOOK_KEY || process.env.SKIPCASH_SECRET || "").trim();
  if (!secret || !authorization) return false;
  const expected = sign(WEBHOOK_FIELDS, body || {}, secret);
  const given = String(authorization).trim();
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Opens SkipCash's hosted card page. Card numbers never reach this server.
 * @returns {Promise<{ id: string, payUrl: string }>}
 */
const REFUND_FIELDS = ["Id", "KeyId"];

export async function refundSkipcashPayment({ id, amount }) {
  if (!skipcashConfigured()) {
    const err = new Error("Card refunds need the SkipCash key and secret");
    err.status = 503;
    throw err;
  }
  const payload = {
    Id: id,
    KeyId: process.env.SKIPCASH_KEY_ID.trim(),
    // amount is whole dirhams (NFR-03); SkipCash takes riyals with two decimals.
    ...(amount != null ? { Amount: fmt(amount) } : {}),
  };
  const base = (process.env.SKIPCASH_API_URL || "https://api.skipcash.app/api/v1/payments").replace(/\/$/, "");
  const authorization = sign(REFUND_FIELDS, payload, process.env.SKIPCASH_SECRET.trim());
  const res = await fetch(`${base}/refund`, {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.hasError) {
    const err = new Error(json.errorMessage || json.error || "SkipCash did not refund the payment");
    err.status = 502;
    throw err;
  }
  return { id: json.resultObj?.id || json.resultObj?.refundId || null };
}

export async function createSkipcashPayment(payload) {
  const url = (process.env.SKIPCASH_API_URL || "https://api.skipcash.app/api/v1/payments").trim();
  const authorization = signSkipcashRequest(payload);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.hasError || !json.resultObj?.payUrl) {
    const err = new Error(json.errorMessage || json.error || "SkipCash did not return a payment page");
    err.status = 502;
    throw err;
  }
  return { id: json.resultObj.id, payUrl: json.resultObj.payUrl };
}

const LOOKUP_FIELDS = ["Id", "KeyId"];

function pickField(obj, names) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const name of names) {
    if (obj[name] != null && obj[name] !== "") return obj[name];
  }
  const lower = Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
  for (const name of names) {
    const v = lower[name.toLowerCase()];
    if (v != null && v !== "") return v;
  }
  return undefined;
}

/**
 * Server-side payment status lookup (FR-76): asks SkipCash for the payment's current state.
 * Signed the same way as create and refund (HMAC-SHA256 of "Id=…,KeyId=…" with the client
 * secret in the Authorization header). The answer comes from the gateway over HTTPS, never
 * from the browser. StatusId follows the webhook: 2 = paid, 3/4/5 = cancelled / failed /
 * rejected, 0/1 = new / pending.
 * @returns {Promise<{ id: string, statusId: number, amount: string|null, currency: string, transactionId: string, custom1: string, visaId: string, paidAt: Date|null }>}
 */
export async function lookupSkipcashPayment(id, { timeoutMs = 8000 } = {}) {
  if (!skipcashConfigured()) {
    const err = new Error("Payment lookups need the SkipCash key and secret");
    err.status = 503;
    throw err;
  }
  const paymentId = String(id || "").trim();
  if (!paymentId) {
    const err = new Error("There is no gateway payment to look up");
    err.status = 400;
    throw err;
  }
  const keyId = process.env.SKIPCASH_KEY_ID.trim();
  const payload = { Id: paymentId, KeyId: keyId };
  const authorization = sign(LOOKUP_FIELDS, payload, process.env.SKIPCASH_SECRET.trim());
  const base = (process.env.SKIPCASH_API_URL || "https://api.skipcash.app/api/v1/payments").replace(/\/$/, "");
  let res;
  try {
    res = await fetch(`${base}/${encodeURIComponent(paymentId)}?KeyId=${encodeURIComponent(keyId)}`, {
      method: "GET",
      headers: { Authorization: authorization, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const err = new Error(`SkipCash could not be reached: ${e.message || e}`);
    err.status = 502;
    throw err;
  }
  const json = await res.json().catch(() => ({}));
  const result = json?.resultObj;
  if (!res.ok || json.hasError || !result) {
    const err = new Error(json.errorMessage || json.error || "SkipCash did not return the payment");
    err.status = 502;
    throw err;
  }
  const gotId = String(pickField(result, ["id", "paymentId"]) || "");
  if (gotId !== paymentId) {
    const err = new Error("SkipCash returned a different payment");
    err.status = 502;
    throw err;
  }
  const statusId = Number(pickField(result, ["statusId"]));
  const amount = pickField(result, ["amount"]);
  const rawPaidAt = pickField(result, ["paidAt", "paymentDate", "transactionDate"]);
  const paidAt = rawPaidAt ? new Date(rawPaidAt) : null;
  return {
    id: gotId,
    statusId: Number.isFinite(statusId) ? statusId : -1,
    amount: amount == null ? null : String(amount),
    currency: String(pickField(result, ["currency"]) || "QAR"),
    transactionId: String(pickField(result, ["transactionId"]) || ""),
    custom1: String(pickField(result, ["custom1"]) || ""),
    visaId: String(pickField(result, ["visaId"]) || ""),
    paidAt: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : null,
  };
}
