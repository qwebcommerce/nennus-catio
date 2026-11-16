/**
 * Content sniffing for uploads (NFR-18): trust the bytes, never the declared mimetype.
 */
export function sniffFileType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return { mime: "image/png", ext: "png" };
  }
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return { mime: "image/webp", ext: "webp" };
  }
  if (buf.toString("ascii", 0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  return null;
}

export const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];
export const DOCUMENT_MIMES = ["application/pdf", "image/jpeg", "image/png"];

/** Safe file name for Content-Disposition (ASCII fallback + RFC 5987 UTF-8). */
export function contentDisposition(fileName, ext) {
  let base = String(fileName || "document").replace(/[\r\n"\\/]/g, "_").slice(0, 120) || "document";
  if (ext && !base.toLowerCase().endsWith(`.${ext}`)) base = `${base.replace(/\.[^.]*$/, "")}.${ext}`;
  const ascii = base.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(base)}`;
}

/**
 * Normalise an uploaded image without a native image library: drop metadata segments
 * (EXIF/XMP/comments in JPEG, text/EXIF chunks in PNG). Returns the original bytes if the
 * structure is not what we expect.
 */
export function stripImageMetadata(buf, mime) {
  try {
    if (mime === "image/jpeg") return stripJpeg(buf);
    if (mime === "image/png") return stripPng(buf);
  } catch {
    /* fall through */
  }
  return buf;
}

function stripJpeg(buf) {
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return buf;
    const marker = buf[i + 1];
    if (marker === 0xda) {
      out.push(buf.subarray(i));
      return Buffer.concat(out);
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return buf;
    // APP1..APP15 (EXIF, XMP, …) and COM are dropped; APP0 (JFIF) and APP2 ICC kept.
    const drop = (marker >= 0xe1 && marker <= 0xef && marker !== 0xe2) || marker === 0xfe;
    if (!drop) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return buf;
}

function stripPng(buf) {
  const out = [buf.subarray(0, 8)];
  let i = 8;
  const dropTypes = new Set(["tEXt", "iTXt", "zTXt", "eXIf", "tIME"]);
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("ascii", i + 4, i + 8);
    const end = i + 12 + len;
    if (end > buf.length) return buf;
    if (!dropTypes.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === "IEND") return Buffer.concat(out);
  }
  return buf;
}
