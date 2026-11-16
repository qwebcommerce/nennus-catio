import sharp from "sharp";
import { IMAGE_MIMES, sniffFileType } from "./fileCheck.js";

/** Longest side of a stored image (NFR-18). */
export const MAX_IMAGE_SIDE = 1600;
/** Decoded pixel limit: refuses decompression bombs before they are expanded in memory. */
export const MAX_INPUT_PIXELS = 50_000_000;

// Markup inside image bytes means a polyglot (an image that is also HTML / SVG / script).
const MARKUP = /<(?:!doctype|html|head|body|script|svg|iframe|object|embed|meta|link|style|\?xml)[\s>/]/i;

function imageError(en, ar) {
  const err = new Error(en);
  err.status = 400;
  err.errorEn = en;
  err.errorAr = ar;
  return err;
}

/**
 * Checks and normalises an uploaded image (NFR-18): the bytes must be a real JPEG, PNG or WebP
 * (magic bytes, then a full decode), it must not be a markup polyglot or a decompression bomb.
 * The picture is auto-oriented, every metadata block (EXIF incl. GPS, XMP, ICC, comments) is
 * dropped, it is resized to at most MAX_IMAGE_SIDE on the long side and re-encoded as WebP.
 * @returns {Promise<{ buffer: Buffer, mime: string, ext: string, width: number, height: number }>}
 */
export async function normalizeImage(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  const kind = sniffFileType(buf);
  if (!kind || !IMAGE_MIMES.includes(kind.mime)) {
    throw imageError("The file is not a valid JPEG, PNG or WebP image", "الملف ليس صورة JPEG أو PNG أو WebP صالحة");
  }
  if (MARKUP.test(buf.toString("latin1"))) {
    throw imageError("The image contains web page code and was refused", "تحتوي الصورة على شيفرة صفحة ويب وتم رفضها");
  }
  const options = { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", pages: 1 };
  let meta;
  try {
    meta = await sharp(buf, options).metadata();
  } catch (e) {
    if (/pixel limit/i.test(String(e?.message))) throw imageError("The image dimensions are too large", "أبعاد الصورة كبيرة جداً");
    throw imageError("The file is not a valid JPEG, PNG or WebP image", "الملف ليس صورة JPEG أو PNG أو WebP صالحة");
  }
  const format = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }[meta.format];
  if (!format || format !== kind.mime) {
    throw imageError("The file is not a valid JPEG, PNG or WebP image", "الملف ليس صورة JPEG أو PNG أو WebP صالحة");
  }
  if (!meta.width || !meta.height || meta.width * meta.height > MAX_INPUT_PIXELS) {
    throw imageError("The image dimensions are too large", "أبعاد الصورة كبيرة جداً");
  }
  try {
    const { data, info } = await sharp(buf, options)
      .rotate()
      .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, mime: "image/webp", ext: "webp", width: info.width, height: info.height };
  } catch (e) {
    if (/pixel limit/i.test(String(e?.message))) throw imageError("The image dimensions are too large", "أبعاد الصورة كبيرة جداً");
    throw imageError("The file is not a valid JPEG, PNG or WebP image", "الملف ليس صورة JPEG أو PNG أو WebP صالحة");
  }
}
