import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { riyals, toDirhams } from "../lib/money.js";
import { authMiddleware, requireModule, requireOwner } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { requireVersion, versionedUpdate } from "../lib/recordVersion.js";

const router = Router();
router.use(authMiddleware);

/** Org ops settings for managers (website, alerts, contact details) */
router.get("/", requireModule("settings", "view"), async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.user.organizationId },
      select: {
        id: true,
        name: true,
        websiteBranchId: true,
        holdMinutes: true,
        bookingCancelHours: true,
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
        version: true,
      },
    });
    if (!org) return res.status(404).json({ error: "Organization not found" });
    res.json({
      name: org.name || "",
      websiteBranchId: org.websiteBranchId,
      holdMinutes: org.holdMinutes,
      bookingCancelHours: org.bookingCancelHours,
      whatsappNumber: org.whatsappNumber || "",
      homeVisitFee: riyals(org.homeVisitFee || 0),
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
      version: org.version,
    });
  } catch (e) {
    next(e);
  }
});

/** FR-09: business settings are reserved for the organisation owner. */
router.patch("/", requireOwner, async (req, res, next) => {
  try {
    const b = req.body || {};
    const version = requireVersion(req);
    const data = {};
    if (b.name !== undefined) {
      const name = String(b.name || "").trim();
      if (!name || name.length > 120) {
        return res.status(400).json({ error: "Enter the business name (up to 120 characters)", errorAr: "أدخل اسم النشاط (حتى 120 حرفاً)", errorEn: "Enter the business name (up to 120 characters)" });
      }
      data.name = name;
    }
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
      const fee = b.homeVisitFee === "" || b.homeVisitFee == null ? 0 : toDirhams(b.homeVisitFee);
      if (fee == null) return res.status(400).json({ error: "Home-visit fee is not valid", errorAr: "رسوم الزيارة المنزلية غير صالحة", errorEn: "Home-visit fee is not valid (at most 2 decimals)" });
      data.homeVisitFee = fee;
    }
    if (b.holdMinutes !== undefined) {
      const minutes = Math.floor(Number(b.holdMinutes) || 0);
      if (minutes < 5 || minutes > 120) return res.status(400).json({ error: "Hold time must be between 5 and 120 minutes" });
      data.holdMinutes = minutes;
    }
    if (b.bookingCancelHours !== undefined) {
      const hours = Number(b.bookingCancelHours);
      if (!Number.isInteger(hours) || hours < 0 || hours > 336) {
        return res.status(400).json({ error: "Cancellation cut-off must be 0 to 336 hours" });
      }
      data.bookingCancelHours = hours;
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
    const keys = Object.keys(data);
    const org = await prisma.$transaction(async (tx) => {
      const before = await tx.organization.findUnique({
        where: { id: req.user.organizationId },
        select: Object.fromEntries(keys.map((k) => [k, true])),
      });
      const row = await versionedUpdate(tx, "organization", {
        id: req.user.organizationId,
        version,
        data,
        select: {
          id: true,
          name: true,
          websiteBranchId: true,
          holdMinutes: true,
          bookingCancelHours: true,
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
          version: true,
        },
      });
      await writeAudit(
        {
          userId: req.user.sub,
          action: "ORG_SETTINGS_UPDATE",
          entityType: "Organization",
          entityId: row.id,
          summary: `Updated ${keys.join(", ")}`,
          meta: { before, after: data },
        },
        tx
      );
      return row;
    });
    res.json({
      name: org.name || "",
      websiteBranchId: org.websiteBranchId,
      holdMinutes: org.holdMinutes,
      bookingCancelHours: org.bookingCancelHours,
      whatsappNumber: org.whatsappNumber || "",
      homeVisitFee: riyals(org.homeVisitFee || 0),
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
      version: org.version,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
