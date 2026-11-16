import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireModule } from "../middleware/auth.js";
import { IMAGE_MIMES, sniffFileType } from "../lib/fileCheck.js";

const router = Router();
router.use(authMiddleware);
router.use(requireModule("products", "view"));

/** Serve product image bytes for the caller's organization */
router.get("/:id", async (req, res, next) => {
  try {
    const row = await prisma.productImage.findFirst({
      where: {
        id: String(req.params.id),
        organizationId: req.user.organizationId,
      },
      select: { mimeType: true, data: true, size: true },
    });
    if (!row) return res.status(404).json({ error: "Image not found" });
    const kind = sniffFileType(Buffer.from(row.data));
    const isImage = kind && IMAGE_MIMES.includes(kind.mime);
    res.setHeader("Content-Type", isImage ? kind.mime : "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    if (!isImage) res.setHeader("Content-Disposition", "attachment");
    res.setHeader("Content-Length", String(row.size || row.data.length));
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(Buffer.from(row.data));
  } catch (e) {
    next(e);
  }
});

export default router;
