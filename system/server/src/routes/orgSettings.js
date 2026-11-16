import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole, requireModule } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";

const router = Router();
router.use(authMiddleware);

/** Org ops settings for managers (website, alerts, contact details) */
router.get("/", requireRole("ADMIN", "MANAGER"), requireModule("settings", "view"), async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.user.organizationId },
      select: {
        id: true,
        websiteBranchId: true,
        holdMinutes: true,
        whatsappNumber: true,
        homeVisitFee: true,
        phone: true,
        publicEmail: true,
        publicAddress: true,
        hoursText: true,
        hoursTextEn: true,
        notifyEmail: true,
        alertOrder: true,
        alertBooking: true,
        alertRelocation: true,
        alertLowStock: true,
      },
    });
    if (!org) return res.status(404).json({ error: "Organization not found" });
    res.json({
      websiteBranchId: org.websiteBranchId,
      holdMinutes: org.holdMinutes,
      whatsappNumber: org.whatsappNumber || "",
      homeVisitFee: Number(org.homeVisitFee || 0),
      phone: org.phone || "",
      publicEmail: org.publicEmail || "",
      publicAddress: org.publicAddress || "",
      hoursText: org.hoursText || "",
      hoursTextEn: org.hoursTextEn || "",
      notifyEmail: org.notifyEmail || "",
      alertOrder: org.alertOrder !== false,
      alertBooking: org.alertBooking !== false,
      alertRelocation: org.alertRelocation !== false,
      alertLowStock: org.alertLowStock === true,
    });
  } catch (e) {
    next(e);
  }
});

router.patch("/", requireRole("ADMIN", "MANAGER"), requireModule("settings", "edit"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const data = {};
    if (b.whatsappNumber !== undefined) {
      const digits = String(b.whatsappNumber || "").replace(/[^\d]/g, "");
      data.whatsappNumber = digits || null;
    }
    for (const key of ["phone", "publicEmail", "publicAddress", "hoursText", "hoursTextEn", "notifyEmail"]) {
      if (b[key] !== undefined) data[key] = String(b[key] || "").trim() || null;
    }
    for (const key of ["alertOrder", "alertBooking", "alertRelocation", "alertLowStock"]) {
      if (b[key] !== undefined) data[key] = Boolean(b[key]);
    }
    if (b.homeVisitFee !== undefined) {
      const fee = Number(b.homeVisitFee);
      if (!Number.isFinite(fee) || fee < 0) return res.status(400).json({ error: "Home-visit fee is not valid" });
      data.homeVisitFee = fee;
    }
    if (b.holdMinutes !== undefined) {
      const minutes = Math.floor(Number(b.holdMinutes) || 0);
      if (minutes < 5 || minutes > 120) return res.status(400).json({ error: "Hold time must be between 5 and 120 minutes" });
      data.holdMinutes = minutes;
    }
    if (b.websiteBranchId !== undefined) {
      if (!b.websiteBranchId) {
        data.websiteBranchId = null;
      } else {
        const branch = await prisma.branch.findFirst({
          where: { id: String(b.websiteBranchId), organizationId: req.user.organizationId, isActive: true },
        });
        if (!branch) return res.status(400).json({ error: "Location not found" });
        if (branch.kind === "VAN") return res.status(400).json({ error: "The website cannot sell from a van" });
        data.websiteBranchId = branch.id;
      }
    }
    if (!Object.keys(data).length) {
      return res.status(400).json({ error: "No settings to update" });
    }
    const org = await prisma.organization.update({
      where: { id: req.user.organizationId },
      data,
      select: {
        id: true,
        websiteBranchId: true,
        holdMinutes: true,
        whatsappNumber: true,
        homeVisitFee: true,
        phone: true,
        publicEmail: true,
        publicAddress: true,
        hoursText: true,
        hoursTextEn: true,
        notifyEmail: true,
        alertOrder: true,
        alertBooking: true,
        alertRelocation: true,
        alertLowStock: true,
      },
    });
    await writeAudit({
      userId: req.user.sub,
      action: "ORG_SETTINGS_UPDATE",
      entityType: "Organization",
      entityId: org.id,
      summary: `Updated ${Object.keys(data).join(", ")}`,
    });
    res.json({
      websiteBranchId: org.websiteBranchId,
      holdMinutes: org.holdMinutes,
      whatsappNumber: org.whatsappNumber || "",
      homeVisitFee: Number(org.homeVisitFee || 0),
      phone: org.phone || "",
      publicEmail: org.publicEmail || "",
      publicAddress: org.publicAddress || "",
      hoursText: org.hoursText || "",
      hoursTextEn: org.hoursTextEn || "",
      notifyEmail: org.notifyEmail || "",
      alertOrder: org.alertOrder !== false,
      alertBooking: org.alertBooking !== false,
      alertRelocation: org.alertRelocation !== false,
      alertLowStock: org.alertLowStock === true,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
