import { Router } from "express";
import { authMiddleware, hasModule, requireModule } from "../middleware/auth.js";
import { fail } from "../lib/bizError.js";
import { pendingPayments, pendingStock, pendingSummary } from "../lib/pending.js";

const router = Router();
router.use(authMiddleware);

/** GET /api/pending/payments?asOf=YYYY-MM-DD&customerId=&supplierId=&side=tous|byus */
router.get("/payments", requireModule("finance", "view"), async (req, res) => {
  res.json(await pendingPayments(req.user.organizationId, req.query));
});

/** GET /api/pending/stock?branchId= — incoming (purchase orders) and outgoing (sales orders). */
router.get("/stock", async (req, res) => {
  const allowed =
    (await hasModule(req, "warehouses", "view")) || (await hasModule(req, "purchasing", "view")) || (await hasModule(req, "salesOrders", "view"));
  if (!allowed) throw fail(403, "FORBIDDEN", "لا تملك صلاحية هذا الإجراء", "Insufficient permission for this action");
  res.json(await pendingStock(req.user.organizationId, req.query));
});

/** GET /api/pending/summary — dashboard card. */
router.get("/summary", requireModule("finance", "view"), async (req, res) => {
  res.json(await pendingSummary(req.user.organizationId));
});

export default router;
