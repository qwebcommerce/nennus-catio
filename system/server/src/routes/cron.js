import crypto from "crypto";
import { Router } from "express";
import { processOutbox } from "../lib/mailer.js";

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

/** Sends due emails from the outbox (NFR-17). */
async function emailCron(req, res) {
  if (!cronAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
  const result = await processOutbox({ limit: Number(req.query.limit) || 50 });
  res.json({ ok: true, ...result });
}

router.get("/email", emailCron);
router.post("/email", emailCron);

export default router;
