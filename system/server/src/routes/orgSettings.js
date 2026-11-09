import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";

const router = Router();
router.use(authMiddleware);

/** Org ops settings for managers (floor associate payment, etc.) */
router.get("/", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.user.organizationId },
      select: {
        id: true,
        associateCanAcceptPayment: true,
      },
    });
    if (!org) return res.status(404).json({ error: "Organization not found" });
    res.json({
      associateCanAcceptPayment: org.associateCanAcceptPayment !== false,
    });
  } catch (e) {
    next(e);
  }
});

router.patch("/", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const data = {};
    if (b.associateCanAcceptPayment !== undefined) {
      data.associateCanAcceptPayment = Boolean(b.associateCanAcceptPayment);
    }
    if (!Object.keys(data).length) {
      return res.status(400).json({ error: "No settings to update" });
    }
    const org = await prisma.organization.update({
      where: { id: req.user.organizationId },
      data,
      select: {
        id: true,
        associateCanAcceptPayment: true,
      },
    });
    await writeAudit({
      userId: req.user.sub,
      action: "ORG_SETTINGS_UPDATE",
      entityType: "Organization",
      entityId: org.id,
      summary: `associateCanAcceptPayment=${org.associateCanAcceptPayment}`,
    });
    res.json({
      associateCanAcceptPayment: org.associateCanAcceptPayment !== false,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
