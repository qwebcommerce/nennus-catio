import { useEffect, useRef } from "react";

/**
 * قارئ الباركود يتصرف كلوحة مفاتيح: أرقام سريعة تنتهي بـ Enter
 * @param {(code: string) => void} onScan
 */
export function useBarcodeScanner(onScan, enabled = true) {
  const buf = useRef("");
  const t = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    const onKey = (e) => {
      if (e.target && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) {
        return;
      }
      if (t.current) clearTimeout(t.current);
      if (e.key === "Enter") {
        if (buf.current.length >= 3) {
          onScan(buf.current.trim());
        }
        buf.current = "";
        return;
      }
      if (e.key.length === 1) {
        buf.current += e.key;
        t.current = setTimeout(() => {
          buf.current = "";
        }, 280);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onScan, enabled]);
}
