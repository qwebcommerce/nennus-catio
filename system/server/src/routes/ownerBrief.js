import { Router } from "express";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { findBranchInOrg } from "../lib/orgScope.js";
import { prisma } from "../lib/prisma.js";
import { httpError, sendError } from "../lib/apiError.js";
import { clampInt } from "../lib/smartInventory.js";
import { buildBriefTeaser, buildDailyBrief } from "../lib/ownerBrief.js";
import {
  dbUnavailableMessage,
  dbUnavailableMessageEn,
  isDbUnavailableError,
} from "../lib/dbErrors.js";

const router = Router();
router.use(authMiddleware);

async function assertBranchAccess(req, branchId) {
  if (!branchId) {
    throw httpError(400, "يجب اختيار الفرع", "Branch is required");
  }
  if (
    req.user.role !== "ADMIN" &&
    req.user.branchId &&
    req.user.branchId !== branchId
  ) {
    throw httpError(403, "لا يمكن الوصول لفرع آخر", "Cannot access another branch");
  }
  const branchOk = await findBranchInOrg(prisma, req.user.organizationId, branchId);
  if (!branchOk) {
    throw httpError(400, "فرع غير صالح", "Invalid branch");
  }
}

/**
 * Full daily owner brief for Command Center.
 * GET /api/intelligence/brief/daily?branchId=&date=YYYY-MM-DD&compareBranches=1
 */
router.get("/daily", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  try {
    const branchId = String(req.query.branchId || req.user.branchId || "");
    await assertBranchAccess(req, branchId);
    const includeBranches =
      req.user.role === "ADMIN" &&
      (String(req.query.compareBranches || "") === "1" ||
        String(req.query.compareBranches || "").toLowerCase() === "true");

    const brief = await buildDailyBrief({
      orgId: req.user.organizationId,
      branchId,
      date: req.query.date ? String(req.query.date) : null,
      includeBranches,
      lookbackDays: clampInt(req.query.lookbackDays, 7, 120, 30),
      targetStockDays: clampInt(req.query.targetStockDays, 7, 90, 21),
      wasteWithinDays: clampInt(req.query.wasteWithinDays, 1, 120, 14),
    });
    res.json(brief);
  } catch (e) {
    if (e?.status) {
      return sendError(res, e.status, e.errorAr || e.message, e.errorEn || e.message);
    }
    if (isDbUnavailableError(e)) {
      return sendError(res, 503, dbUnavailableMessage, dbUnavailableMessageEn, {
        code: "DB_UNAVAILABLE",
      });
    }
    console.error(e);
    return sendError(res, 500, "تعذر بناء الموجز اليومي", "Could not build daily brief");
  }
});

/**
 * Compact teaser for dashboard strip.
 * GET /api/intelligence/brief/teaser?branchId=
 */
router.get("/teaser", requireRole("ADMIN", "MANAGER"), async (req, res) => {
  try {
    const branchId = String(req.query.branchId || req.user.branchId || "");
    await assertBranchAccess(req, branchId);
    const teaser = await buildBriefTeaser({
      orgId: req.user.organizationId,
      branchId,
    });
    res.json(teaser);
  } catch (e) {
    if (e?.status) {
      return sendError(res, e.status, e.errorAr || e.message, e.errorEn || e.message);
    }
    if (isDbUnavailableError(e)) {
      return sendError(res, 503, dbUnavailableMessage, dbUnavailableMessageEn, {
        code: "DB_UNAVAILABLE",
      });
    }
    console.error(e);
    return sendError(res, 500, "تعذر تحميل موجز المالك", "Could not load owner teaser");
  }
});

export default router;
