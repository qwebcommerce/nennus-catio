import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import {
  TAX_PACKS,
  getOrCreateTaxSettings,
  packForCountry,
  summarizeTaxSettings,
} from "../lib/taxPacks.js";

const router = Router();
router.use(authMiddleware);

async function loadOrg(orgId) {
  return prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, vatNumber: true, taxNumber: true, country: true },
  });
}

/** POS / all roles — default rate + currency for checkout & receipts */
router.get("/status", async (req, res, next) => {
  try {
    const row = await getOrCreateTaxSettings(prisma, req.user.organizationId);
    const org = await loadOrg(req.user.organizationId);
    res.json(summarizeTaxSettings(row, org));
  } catch (e) {
    next(e);
  }
});

router.get("/", requireRole("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const row = await getOrCreateTaxSettings(prisma, req.user.organizationId);
    const org = await loadOrg(req.user.organizationId);
    res.json({
      ...summarizeTaxSettings(row, org),
      id: row.id,
      updatedAt: row.updatedAt,
    });
  } catch (e) {
    next(e);
  }
});

router.put("/", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const orgId = req.user.organizationId;
    await getOrCreateTaxSettings(prisma, orgId);
    const b = req.body || {};

    const data = {};
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    if (b.pricesIncludeTax !== undefined) data.pricesIncludeTax = Boolean(b.pricesIncludeTax);

    if (b.countryCode != null && String(b.countryCode).trim()) {
      const pack = packForCountry(b.countryCode);
      data.countryCode = pack.countryCode;
      if (b.applyPackDefaults === true || b.currency == null) {
        data.currency = pack.currency;
      }
      if (b.applyPackDefaults === true || b.standardRate == null) {
        data.standardRate = pack.standardRate;
      }
    }

    if (b.currency != null && String(b.currency).trim()) {
      data.currency = String(b.currency).trim().toUpperCase().slice(0, 8);
    }
    if (b.standardRate != null && b.standardRate !== "") {
      const n = Number(b.standardRate);
      if (!Number.isNaN(n) && n >= 0 && n <= 100) data.standardRate = n;
    }

    const row = await prisma.organizationTaxSettings.update({
      where: { organizationId: orgId },
      data,
    });

    if (data.countryCode) {
      await prisma.organization.update({
        where: { id: orgId },
        data: { country: data.countryCode },
      });
    }

    const org = await loadOrg(orgId);
    res.json({
      ...summarizeTaxSettings(row, org),
      id: row.id,
      updatedAt: row.updatedAt,
      packs: Object.values(TAX_PACKS),
    });
  } catch (e) {
    next(e);
  }
});

export default router;
