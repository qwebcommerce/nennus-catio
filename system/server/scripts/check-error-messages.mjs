#!/usr/bin/env node
/**
 * Coverage check for bilingual API error messages.
 *
 * Statically extracts every literal error string the server can send to a client
 * (values of error / errorAr / errorEn, arguments of Error constructors and the
 * error helper functions, fallbacks after e.message, ...) from src/** and fails,
 * listing them, when one is not covered by src/lib/errorMessages.js
 * (exact entry or pattern).
 *
 *   node scripts/check-error-messages.mjs           # check (exit 1 on gaps)
 *   node scripts/check-error-messages.mjs --dump    # print extracted messages as JSON
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { translateErrorMessage, coversTemplate } from "../src/lib/errorMessages.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

/** Files whose literals are never sent to clients (generated / vendored). */
const SKIP_FILES = new Set(["lib/prisma-client-bundle.js"]);

/** Call names whose string arguments are user-facing error messages. */
const ERROR_CALL = /^(Error|RangeError|TypeError|sendError|httpError|statusError|poError|refundError|imageError|docError|stockError|apiErr|storageError|slotError|amountError|err|fail|bad)$/;
/** Object keys / assigned properties whose string values are error messages. */
const ERROR_KEY = /^(error|errorAr|errorEn)$/;
/** Local variables that carry a message into res.json({ error: msg }). */
const MSG_VAR = /^(msg|message|errMsg|reason|why)$/;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

/** Minimal JS tokenizer: identifiers, punctuation, strings, templates (placeholders -> {}). */
export function tokenize(src) {
  const toks = [];
  let i = 0;
  const n = src.length;
  const lastSig = () => toks[toks.length - 1];
  const regexAllowed = () => {
    const t = lastSig();
    if (!t) return true;
    if (t.type === "punct") return !/^[)\]}]$/.test(t.value);
    if (t.type === "ident") return /^(return|typeof|case|in|of|new|delete|void|throw|else|do|instanceof)$/.test(t.value);
    return false;
  };
  function readString(q) {
    let s = "";
    i++;
    while (i < n && src[i] !== q) {
      if (src[i] === "\\") {
        const c = src[i + 1];
        s += c === "n" ? "\n" : c === "t" ? "\t" : c;
        i += 2;
      } else s += src[i++];
    }
    i++;
    return s;
  }
  function skipExpr() {
    // inside ${ ... } — skip balanced braces, strings, templates
    let depth = 1;
    while (i < n && depth > 0) {
      const c = src[i];
      if (c === "'" || c === '"') readString(c);
      else if (c === "`") readTemplate();
      else if (c === "{") { depth++; i++; }
      else if (c === "}") { depth--; i++; }
      else i++;
    }
  }
  function readTemplate() {
    let s = "";
    let hasExpr = false;
    i++;
    while (i < n && src[i] !== "`") {
      if (src[i] === "\\") { s += src[i + 1]; i += 2; }
      else if (src[i] === "$" && src[i + 1] === "{") { i += 2; skipExpr(); s += "{}"; hasExpr = true; }
      else s += src[i++];
    }
    i++;
    return { s, hasExpr };
  }
  let line = 1;
  while (i < n) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const chunk = src.slice(i, end + 2);
      line += (chunk.match(/\n/g) || []).length;
      i = end + 2;
      continue;
    }
    const start = i;
    if (c === "'" || c === '"') {
      const v = readString(c);
      toks.push({ type: "str", value: v, line });
    } else if (c === "`") {
      const { s, hasExpr } = readTemplate();
      toks.push({ type: hasExpr ? "tpl" : "str", value: s, line });
    } else if (c === "/" && regexAllowed()) {
      i++;
      let inClass = false;
      while (i < n) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "[") inClass = true;
        else if (src[i] === "]") inClass = false;
        else if (src[i] === "/" && !inClass) break;
        else if (src[i] === "\n") break;
        i++;
      }
      i++;
      while (/[a-z]/i.test(src[i] || "")) i++;
      toks.push({ type: "regex", value: src.slice(start, i), line });
    } else if (/[A-Za-z_$]/.test(c)) {
      while (i < n && /[\w$]/.test(src[i])) i++;
      toks.push({ type: "ident", value: src.slice(start, i), line });
    } else if (/[0-9]/.test(c)) {
      while (i < n && /[\w.]/.test(src[i])) i++;
      toks.push({ type: "num", value: src.slice(start, i), line });
    } else {
      // multi-char operators that matter: ?? || && => ?.
      const two = src.slice(i, i + 2);
      if (["??", "||", "&&", "=>", "?.", "==", "!=", "<=", ">="].includes(two)) { toks.push({ type: "punct", value: two, line }); i += 2; }
      else { toks.push({ type: "punct", value: c, line }); i++; }
    }
    if (toks.length) toks[toks.length - 1].line = line;
  }
  return toks;
}

/** Collect string/template tokens of one expression starting at index k (until , ; ) } ] at depth 0). */
function collectExpr(toks, k, stopAtComma = true) {
  const out = [];
  let depth = 0;
  for (; k < toks.length; k++) {
    const t = toks[k];
    if (t.type === "punct") {
      if ("([{".includes(t.value)) depth++;
      else if (")]}".includes(t.value)) { if (depth === 0) break; depth--; }
      else if (depth === 0 && (t.value === ";" || (stopAtComma && t.value === ","))) break;
    }
    if (depth === 0 && (t.type === "str" || t.type === "tpl")) {
      // skip strings used as comparison operands / keys (x === "A" ? ...)
      const prev = toks[k - 1];
      const next = toks[k + 1];
      if (prev && prev.type === "punct" && /^(===|==|!==|!=)$/.test(prev.value)) continue;
      if (next && next.type === "punct" && /^(===|==|!==|!=|=)$/.test(next.value)) continue;
      if (prev && prev.type === "punct" && (prev.value === "[")) continue;
      out.push(t);
    }
  }
  return out;
}

function isMessage(s) {
  const v = s.trim();
  if (!v) return false;
  if (/^[A-Z0-9_]+$/.test(v)) return false; // codes like NOT_FOUND
  if (!/[A-Za-z؀-ۿ]/.test(v)) return false;
  if (/^[a-z][a-zA-Z0-9]*$/.test(v)) return false; // identifiers like "sale"
  return true;
}

export function extractMessages() {
  const found = new Map(); // text -> {kind, where[]}
  const add = (t, file) => {
    if (!isMessage(t.value)) return;
    const key = `${t.type}:${t.value}`;
    if (!found.has(key)) found.set(key, { text: t.value, template: t.type === "tpl", where: [] });
    found.get(key).where.push(`${file}:${t.line}`);
  };
  for (const file of walk(root)) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    if (SKIP_FILES.has(rel)) continue;
    const toks = tokenize(fs.readFileSync(file, "utf8"));
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      const next = toks[k + 1];
      if (t.type !== "ident" || !next) continue;
      // error: "..." / errorAr: ... / errorEn: ...
      if (ERROR_KEY.test(t.value) && next.type === "punct" && next.value === ":" ) {
        const prev = toks[k - 1];
        if (prev && prev.type === "punct" && prev.value === "?") continue; // ternary, not a key
        for (const s of collectExpr(toks, k + 2)) add(s, rel);
      }
      // x.errorAr = "..." / const msg = ... / message = ...
      if (next.type === "punct" && next.value === "=") {
        const prev = toks[k - 1];
        const isProp = prev && prev.type === "punct" && prev.value === "." && ERROR_KEY.test(t.value);
        const isVar = MSG_VAR.test(t.value);
        if (isProp || isVar) for (const s of collectExpr(toks, k + 2)) add(s, rel);
      }
      // new Error("...") / helper("...", ...)
      if (ERROR_CALL.test(t.value) && next.type === "punct" && next.value === "(") {
        const prev = toks[k - 1];
        if (prev && prev.type === "ident" && prev.value === "function") continue; // definition
        let depth = 0;
        for (let j = k + 1; j < toks.length; j++) {
          const u = toks[j];
          if (u.type === "punct" && "([{".includes(u.value)) depth++;
          else if (u.type === "punct" && ")]}".includes(u.value)) { depth--; if (depth === 0) break; }
          else if (depth === 1 && (u.type === "str" || u.type === "tpl")) {
            const p = toks[j - 1];
            const q = toks[j + 1];
            if (p.type === "punct" && /^(===|==|!==|!=)$/.test(p.value)) continue;
            if (q.type === "punct" && /^(===|==|!==|!=)$/.test(q.value)) continue;
            add(u, rel);
          }
        }
      }
      // errors.push({ row, message: "..." }) — row-level messages in import results
      if (t.value === "push" && next.type === "punct" && next.value === "(" && /^errors$/.test(toks[k - 2]?.value || "")) {
        for (let j = k + 2; j < toks.length && !(toks[j].type === "punct" && toks[j].value === ")"); j++) {
          if (toks[j].type === "ident" && toks[j].value === "message" && toks[j + 1]?.value === ":") {
            for (const s of collectExpr(toks, j + 2)) add(s, rel);
          }
        }
      }
      // e.message : "fallback" / err.message || "fallback"
      if (t.value === "message" && next.type === "punct" && (next.value === ":" || next.value === "||" || next.value === "??")) {
        const prev = toks[k - 1];
        if (prev && prev.type === "punct" && prev.value === "." ) {
          const s = toks[k + 2];
          if (s && (s.type === "str" || s.type === "tpl")) add(s, rel);
        }
      }
    }
  }
  return [...found.values()];
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const msgs = extractMessages();
  if (process.argv.includes("--dump")) {
    console.log(JSON.stringify(msgs, null, 1));
    process.exit(0);
  }
  const missing = [];
  for (const m of msgs) {
    const ok = m.template ? coversTemplate(m.text) : !!translateErrorMessage(m.text, { warn: false });
    if (!ok) missing.push(m);
  }
  const exact = msgs.filter((m) => !m.template).length;
  console.log(`Extracted ${msgs.length} error messages (${exact} literal, ${msgs.length - exact} templates).`);
  if (missing.length) {
    console.error(`\n${missing.length} message(s) not covered by src/lib/errorMessages.js:`);
    for (const m of missing) console.error(`  - ${JSON.stringify(m.text)}${m.template ? " [template]" : ""}  (${m.where.slice(0, 2).join(", ")})`);
    process.exit(1);
  }
  console.log("All error messages have Arabic and English translations.");
}
