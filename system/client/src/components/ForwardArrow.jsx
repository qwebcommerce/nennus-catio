import React from "react";
import { useI18n } from "../context/LanguageContext.jsx";

/** "Go on" / "becomes" arrow that points the reading direction: → in English, ← in Arabic (RTL). */
export function ForwardArrow() {
  const { locale } = useI18n();
  return <span aria-hidden className="fwd-arrow">{locale === "ar" ? "←" : "→"}</span>;
}

/** The same arrow as text (inside strings). */
export const forwardArrowText = (locale) => (locale === "ar" ? "←" : "→");
