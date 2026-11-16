import fs from "fs";
import PDFDocument from "pdfkit";
import * as fontkit from "fontkit";

/**
 * Paginated table PDF with Arabic support.
 * Latin text uses the built-in Helvetica. Arabic runs use the bundled Noto Sans Arabic
 * (shaped by fontkit). Mixed text is split into runs and laid out right to left when the
 * cell starts with Arabic (a small subset of the Unicode bidi algorithm that is enough for
 * names, labels and numbers in operational lists).
 */
const ARABIC_FONT = new URL("../../assets/fonts/NotoSansArabic-Regular.ttf", import.meta.url);
let arabicFontBuffer = null;
let arabicFace = null;
function arabicFont() {
  if (!arabicFontBuffer) arabicFontBuffer = fs.readFileSync(ARABIC_FONT);
  return arabicFontBuffer;
}
/** The Arabic font has no brackets, %, / etc.; those are drawn with Helvetica. */
function arabicHasGlyph(ch) {
  if (!arabicFace) arabicFace = fontkit.create(arabicFont());
  return arabicFace.hasGlyphForCodePoint(ch.codePointAt(0));
}
const MIRROR = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<" };

const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const STRONG_LATIN_RE = /[A-Za-zÀ-ɏ]/;

function isArabicChar(ch) {
  return ARABIC_RE.test(ch);
}
function isNeutral(ch) {
  return !isArabicChar(ch) && !STRONG_LATIN_RE.test(ch) && !/[0-9]/.test(ch);
}

/**
 * Splits a string into runs {text, ar} in logical order. A neutral (space, punctuation) takes the
 * direction of its strong neighbours when they agree, else the cell direction (UAX #9, N1/N2).
 */
export function splitRuns(text, rtl = false) {
  const chars = Array.from(String(text ?? ""));
  const kinds = chars.map((ch) => (isArabicChar(ch) ? "A" : isNeutral(ch) ? "N" : "L"));
  // Resolve neutrals: Arabic if both nearest strong neighbours are Arabic, else Latin.
  for (let i = 0; i < kinds.length; i += 1) {
    if (kinds[i] !== "N") continue;
    let j = i;
    while (j < kinds.length && kinds[j] === "N") j += 1;
    const before = i > 0 ? kinds[i - 1] : null;
    const after = j < kinds.length ? kinds[j] : null;
    const b = before || after || (rtl ? "A" : "L");
    const a = after || before || (rtl ? "A" : "L");
    const resolved = b === a ? b : rtl ? "A" : "L";
    for (let k = i; k < j; k += 1) kinds[k] = resolved;
    i = j - 1;
  }
  const runs = [];
  for (let i = 0; i < chars.length; i += 1) {
    const ar = kinds[i] === "A";
    const last = runs[runs.length - 1];
    if (last && last.ar === ar) last.text += chars[i];
    else runs.push({ text: chars[i], ar });
  }
  return runs;
}

function cellIsRtl(text) {
  for (const ch of String(text ?? "")) {
    if (isArabicChar(ch)) return true;
    if (STRONG_LATIN_RE.test(ch)) return false;
  }
  return false;
}

/** Helvetica only encodes WinAnsi; replace anything else that is not Arabic. */
function latinSafe(text) {
  return text.replace(/[^\x20-\x7E -ÿ–—‘’“”…]/g, "?");
}

function pieceWidth(doc, piece, size) {
  doc.font(piece.ar ? "ar" : "Helvetica").fontSize(size);
  return doc.widthOfString(piece.text);
}

/**
 * Turns logical runs into drawable pieces in visual (left to right) order. pdfkit lays out the
 * words of one call left to right, so each Arabic word is its own piece and the words of an
 * Arabic run are reversed here; fontkit shapes and orders the letters inside each word.
 */
function visualPieces(text) {
  const rtl = cellIsRtl(text);
  const runs = splitRuns(text, rtl);
  const ordered = rtl ? [...runs].reverse() : runs;
  const pieces = [];
  for (const run of ordered) {
    if (!run.ar) {
      pieces.push({ text: latinSafe(run.text), ar: false });
      continue;
    }
    const words = run.text.split(/(\s+)/).filter((w) => w.length);
    for (const word of words.reverse()) {
      if (/^\s+$/.test(word)) {
        pieces.push({ text: " ", ar: false });
        continue;
      }
      // Split the word where the Arabic font lacks a glyph; those parts are mirrored and drawn
      // with Helvetica. Parts are reversed because the word runs right to left.
      const parts = [];
      for (const ch of Array.from(word)) {
        const ar = arabicHasGlyph(ch);
        const text = ar ? ch : MIRROR[ch] || ch;
        const last = parts[parts.length - 1];
        if (last && last.ar === ar) last.text += text;
        else parts.push({ text, ar });
      }
      for (const part of parts.reverse()) pieces.push(part.ar ? part : { text: latinSafe(part.text), ar: false });
    }
  }
  return { rtl, pieces };
}

/** Drops pieces from the logical end until the cell fits; adds an ellipsis. */
function fitPieces(doc, pieces, rtl, size, maxWidth) {
  const widths = pieces.map((piece) => pieceWidth(doc, piece, size));
  let total = widths.reduce((a, b) => a + b, 0);
  if (total <= maxWidth) return { pieces, widths, total };
  const dots = { text: "...", ar: false };
  const dotsW = pieceWidth(doc, dots, size);
  const list = [...pieces];
  const ws = [...widths];
  while (list.length && total + dotsW > maxWidth) {
    // The logical end is on the left for RTL cells and on the right for LTR cells.
    const index = rtl ? 0 : list.length - 1;
    const piece = list[index];
    if (!piece.ar && piece.text.length > 1) {
      const shorter = { text: piece.text.slice(0, -1), ar: false };
      total -= ws[index];
      ws[index] = pieceWidth(doc, shorter, size);
      total += ws[index];
      list[index] = shorter;
    } else {
      total -= ws[index];
      list.splice(index, 1);
      ws.splice(index, 1);
    }
  }
  if (rtl) {
    list.unshift(dots);
    ws.unshift(dotsW);
  } else {
    list.push(dots);
    ws.push(dotsW);
  }
  return { pieces: list, widths: ws, total: total + dotsW };
}

function drawCell(doc, text, x, y, width, size, align, tableRtl = false) {
  const { rtl, pieces: all } = visualPieces(text);
  const { pieces, widths, total } = fitPieces(doc, all, rtl, size, width);
  const effectiveAlign = align || (rtl || tableRtl ? "right" : "left");
  let cursor = effectiveAlign === "right" ? x + width - total : x;
  const baseline = y + size;
  pieces.forEach((piece, i) => {
    doc.font(piece.ar ? "ar" : "Helvetica").fontSize(size);
    doc.text(piece.text, cursor, baseline, { lineBreak: false, baseline: "alphabetic" });
    cursor += widths[i];
  });
}

/**
 * @param {{title: string, headers: string[], rows: (string|number)[][], rtl?: boolean, numeric?: boolean[]}} opts
 * @returns {Promise<Buffer>}
 */
export function tablePdf({ title, subtitle, headers, rows, rtl = false, numeric = [] }) {
  return new Promise((resolve, reject) => {
    const cols = headers.length || 1;
    const layout = cols > 6 ? "landscape" : "portrait";
    const doc = new PDFDocument({ size: "A4", layout, margin: 36, bufferPages: true, info: { Title: title } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont("ar", arabicFont());

    const size = 8.5;
    const rowH = 15;
    const left = doc.page.margins.left;
    const top = doc.page.margins.top;
    const usable = doc.page.width - left - doc.page.margins.right;
    const bottom = doc.page.height - doc.page.margins.bottom - 14;

    // Column widths from content length, capped so one long column cannot squeeze the others.
    const sample = [headers, ...rows.slice(0, 200)];
    const weights = headers.map((_, c) => {
      const longest = Math.max(4, ...sample.map((row) => Array.from(String(row[c] ?? "")).length));
      return Math.min(longest, 40);
    });
    const sum = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / sum) * usable);
    // Column x positions; in RTL the first column is on the right.
    const xs = [];
    let acc = 0;
    for (let c = 0; c < cols; c += 1) {
      xs.push(rtl ? left + usable - acc - widths[c] : left + acc);
      acc += widths[c];
    }

    let y = top;
    const drawHeader = () => {
      drawCell(doc, title, left, y, usable, 13, rtl ? "right" : "left");
      y += 20;
      if (subtitle) {
        drawCell(doc, subtitle, left, y, usable, 9, rtl ? "right" : "left");
        y += 14;
      }
      doc.rect(left, y - 2, usable, rowH).fill("#e8ece9");
      doc.fillColor("#000");
      headers.forEach((h, c) => drawCell(doc, String(h), xs[c] + 3, y + 2, widths[c] - 6, size, numeric[c] ? (rtl ? "left" : "right") : undefined, rtl));
      y += rowH;
    };
    drawHeader();
    rows.forEach((row, index) => {
      if (y + rowH > bottom) {
        doc.addPage();
        y = top;
        drawHeader();
      }
      if (index % 2 === 1) {
        doc.rect(left, y - 2, usable, rowH).fill("#f6f7f6");
        doc.fillColor("#000");
      }
      row.forEach((value, c) => drawCell(doc, String(value ?? ""), xs[c] + 3, y + 2, widths[c] - 6, size, numeric[c] ? (rtl ? "left" : "right") : undefined, rtl));
      y += rowH;
    });
    if (!rows.length) {
      drawCell(doc, rtl ? "لا توجد بيانات" : "No rows", left, y + 2, usable, size, rtl ? "right" : "left");
    }
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const label = `${i + 1} / ${range.count}`;
      doc.font("Helvetica").fontSize(8);
      const old = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.text(label, left, doc.page.height - 28, { width: usable, align: "center", lineBreak: false });
      doc.page.margins.bottom = old;
    }
    doc.end();
  });
}
