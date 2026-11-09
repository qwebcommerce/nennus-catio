import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
router.use(authMiddleware);

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
    res.setHeader("Content-Type", row.mimeType || "application/octet-stream");
    res.setHeader("Content-Length", String(row.size || row.data.length));
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(Buffer.from(row.data));
  } catch (e) {
    next(e);
  }
});

export default router;
