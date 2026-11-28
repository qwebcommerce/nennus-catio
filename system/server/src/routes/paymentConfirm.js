/**
 * fix-rd — the accountant's confirmation queue (module `paymentConfirm`).
 * GET  /api/payment-confirmations?status=&kind=&method=&collectedById=&from=&to=&q=&via=driver
 * GET  /api/payment-confirmations/count          (sidebar badge, Dashboard card)
 * GET  /api/payment-confirmations/:key            (key = KIND:id)
 * POST /api/payment-confirmations/:key/confirm    { version }
 * POST /api/payment-confirmations/:key/reject     { version, reason }
 * Rules: lib/paymentConfirm.js, docs/testing/payment-confirmation.md.
 */
import { Router } from "express";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { requireVersion } from "../lib/recordVersion.js";
import { decide, listConfirmations, loadConfirmation, pendingCount } from "../lib/paymentConfirm.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("paymentConfirm", "view"));

router.get("/", async (req, res) => {
  res.json(await listConfirmations(req.user.organizationId, req.query));
});

router.get("/count", async (req, res) => {
  res.json(await pendingCount(req.user.organizationId));
});

router.get("/:key", async (req, res) => {
  res.json(await loadConfirmation(req.user.organizationId, req.params.key));
});

router.post("/:key/confirm", requireModule("paymentConfirm", "edit"), async (req, res) => {
  const version = requireVersion(req);
  res.json(await decide({ user: req.user, key: req.params.key, version, decision: "CONFIRM" }));
});

router.post("/:key/reject", requireModule("paymentConfirm", "edit"), async (req, res) => {
  const version = requireVersion(req);
  res.json(await decide({ user: req.user, key: req.params.key, version, decision: "REJECT", reason: req.body?.reason }));
});

export default router;
