import crypto from "crypto";

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
    ...(amount != null ? { Amount: Number(amount).toFixed(2) } : {}),
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
