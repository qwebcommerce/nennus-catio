import React, { useEffect, useState } from "react";
import { useI18n } from "../context/LanguageContext.jsx";

function evaluate(expr) {
  const cleaned = String(expr || "")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/\s+/g, "");
  if (!cleaned) return "0";
  if (!/^[0-9+\-*/().]+$/.test(cleaned)) throw new Error("bad");

  let i = 0;
  function peek() {
    return cleaned[i];
  }
  function get() {
    return cleaned[i++];
  }
  function parseExpr() {
    let v = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = get();
      const r = parseTerm();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  function parseTerm() {
    let v = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = get();
      const r = parseFactor();
      if (op === "*") v *= r;
      else {
        if (r === 0) throw new Error("div0");
        v /= r;
      }
    }
    return v;
  }
  function parseFactor() {
    if (peek() === "+") {
      get();
      return parseFactor();
    }
    if (peek() === "-") {
      get();
      return -parseFactor();
    }
    if (peek() === "(") {
      get();
      const v = parseExpr();
      if (peek() !== ")") throw new Error("paren");
      get();
      return v;
    }
    let start = i;
    while ((peek() >= "0" && peek() <= "9") || peek() === ".") get();
    if (start === i) throw new Error("num");
    const n = Number(cleaned.slice(start, i));
    if (!Number.isFinite(n)) throw new Error("num");
    return n;
  }

  const val = parseExpr();
  if (i !== cleaned.length) throw new Error("trail");
  const rounded = Math.round(val * 1e8) / 1e8;
  return String(rounded);
}

export function FloatingCalculator() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState("0");
  const [expr, setExpr] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function push(token) {
    setExpr((prev) => {
      const next = prev === "0" && /\d/.test(token) ? token : prev + token;
      setDisplay(next || "0");
      return next;
    });
  }

  function clearAll() {
    setExpr("");
    setDisplay("0");
  }

  function backspace() {
    setExpr((prev) => {
      const next = prev.slice(0, -1);
      setDisplay(next || "0");
      return next;
    });
  }

  function equals() {
    try {
      const result = evaluate(expr || display);
      setExpr(result);
      setDisplay(result);
    } catch {
      setDisplay("Err");
      setExpr("");
    }
  }

  const keys = [
    ["C", "⌫", "÷", "×"],
    ["7", "8", "9", "-"],
    ["4", "5", "6", "+"],
    ["1", "2", "3", "="],
    ["0", ".", "(", ")"],
  ];

  function onKeyPress(k) {
    if (k === "C") return clearAll();
    if (k === "⌫") return backspace();
    if (k === "=") return equals();
    return push(k);
  }

  return (
    <div className="pos-calc">
      <button
        type="button"
        className="pos-calc__fab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={t("calc.open")}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <rect x="4" y="3" width="16" height="18" rx="2.5" />
          <path d="M8 7h8" />
          <path d="M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
        </svg>
        <span className="pos-calc__fab-label">{t("calc.open")}</span>
      </button>

      {open ? (
        <div className="pos-calc__panel" role="dialog" aria-label={t("calc.title")}>
          <div className="pos-calc__head">
            <strong>{t("calc.title")}</strong>
            <button type="button" className="pos-calc__close" onClick={() => setOpen(false)}>
              {t("calc.close")}
            </button>
          </div>
          <div className="pos-calc__display" aria-live="polite">
            {display}
          </div>
          <div className="pos-calc__keys">
            {keys.flat().map((k) => (
              <button
                key={k}
                type="button"
                className={`pos-calc__key${k === "=" ? " is-eq" : ""}${k === "C" ? " is-clear" : ""}`}
                onClick={() => onKeyPress(k)}
              >
                {k === "C" ? t("calc.clear") : k}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
