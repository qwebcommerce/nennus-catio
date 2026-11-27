import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, hasModule } from "../middleware/auth.js";
import { fail } from "../lib/bizError.js";
import {
  BUSINESS_FILE_MAX_BYTES,
  FILE_SELECT,
  fileAccess,
  fileLinkValid,
  saveBusinessFile,
  sendBusinessFile,
  signedFileLink,
  uploadError,
} from "../lib/businessFiles.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: BUSINESS_FILE_MAX_BYTES, files: 1 } });

/** One file in the "file" field; multer errors become bilingual API errors. */
export function singleFile(req, res, next) {
  upload.single("file")(req, res, (e) => (e ? next(uploadError(e)) : next()));
}

/** Rights that let a person record a payment (and so upload its proof). */
const PROOF_UPLOADERS = [
  ["purchasing", "create"],
  ["salesOrders", "create"],
  ["finance", "create"],
  ["b2b", "edit"],
];

async function anyModule(req, rules) {
  for (const [mod, action] of rules) if (await hasModule(req, mod, action)) return true;
  return false;
}

async function canReadFile(req, file) {
  if (file.organizationId !== req.user.organizationId) return false;
  const { rules, unattached } = await fileAccess(file);
  if (unattached) return file.uploadedByUserId === req.user.sub || req.user.role === "ADMIN";
  return anyModule(req, rules);
}

const router = Router();
router.use(authMiddleware);

/** POST /api/files (multipart "file") — a payment proof, attached afterwards with proofFileId. */
router.post("/", singleFile, async (req, res) => {
  if (!(await anyModule(req, PROOF_UPLOADERS))) {
    throw fail(403, "FORBIDDEN", "لا تملك صلاحية هذا الإجراء", "Insufficient permission for this action");
  }
  const file = await saveBusinessFile({
    orgId: req.user.organizationId,
    userId: req.user.sub,
    purpose: "PAYMENT_PROOF",
    buffer: req.file?.buffer,
    originalName: req.file?.originalname,
  });
  res.status(201).json(file);
});

/** GET /api/files/:id/link — a 5-minute download link (permission checked again on download). */
router.get("/:id/link", async (req, res) => {
  const file = await prisma.businessFile.findFirst({
    where: { id: String(req.params.id), organizationId: req.user.organizationId },
    select: { ...FILE_SELECT, organizationId: true },
  });
  if (!file) throw fail(404, "FILE_NOT_FOUND", "الملف غير موجود", "File not found");
  if (!(await canReadFile(req, file))) {
    throw fail(403, "FORBIDDEN", "لا تملك صلاحية هذا الإجراء", "Insufficient permission for this action");
  }
  res.json({ ...signedFileLink(file.id, req.user.sub), fileName: file.fileName, mime: file.mime });
});

export default router;

/** GET /api/business-files/:id?p&exp&sig — signed download, bound to the staff user. */
export const businessFileDownloads = Router();

businessFileDownloads.get("/:id", async (req, res, next) => {
  const { p, exp, sig } = req.query;
  if (!fileLinkValid(req.params.id, String(p || ""), exp, sig)) {
    return res.status(403).json({
      error: "This download link is not valid or has expired",
      errorAr: "رابط التنزيل غير صالح أو انتهت صلاحيته",
      errorEn: "This download link is not valid or has expired",
      code: "LINK_INVALID",
    });
  }
  return authMiddleware(req, res, async () => {
    try {
      if (`s:${req.user.sub}` !== String(p)) throw fail(403, "FORBIDDEN", "لا تملك صلاحية هذا الإجراء", "Insufficient permission for this action");
      const file = await prisma.businessFile.findUnique({ where: { id: String(req.params.id) } });
      if (!file) throw fail(404, "FILE_NOT_FOUND", "الملف غير موجود", "File not found");
      if (!(await canReadFile(req, file))) throw fail(403, "FORBIDDEN", "لا تملك صلاحية هذا الإجراء", "Insufficient permission for this action");
      await sendBusinessFile(res, file);
    } catch (e) {
      next(e);
    }
  });
});
