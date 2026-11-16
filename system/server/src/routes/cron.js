import crypto from "crypto";
import { Router } from "express";
import { processOutbox } from "../lib/mailer.js";
import { cleanupStaleUploads } from "./relocation.js";

const router = Router();

/** Vercel Cron sends "Authorization: Bearer $CRON_SECRET". No secret configured = refused. */
function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = String(req.headers.authorization || "");
  const given = header.startsWith("Bearer ") ? header.slice(7) : String(req.headers["x-cron-secret"] || "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Daily job (Vercel Hobby allows one): sends due emails from the outbox (NFR-17) and removes
 * direct relocation uploads that were never confirmed/attached within 24 hours.
 */
async function emailCron(req, res) {
  if (!cronAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
  const result = await processOutbox({ limit: Number(req.query.limit) || 50 });
  let uploads;
  try {
    uploads = await cleanupStaleUploads();
  } catch (e) {
    console.error("[cron] upload cleanup:", e?.message || e);
    uploads = { error: "cleanup failed" };
  }
  res.json({ ok: true, ...result, staleUploads: uploads });
}

router.get("/email", emailCron);
router.post("/email", emailCron);

export default router;
