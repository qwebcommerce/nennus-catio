"use client";

import type { PromoCodeStatus } from "@nennus-catio/contracts";
import { useState } from "react";
import { useCopy } from "@/shared/lib/copy";
import { promoCodeText } from "@/shared/lib/offers";

interface PromoCodeBoxProps {
  /** For the input's id and its message's id. */
  id: string;
  /** The applied code (sent with every quote and with the order), or null. */
  code: string | null;
  /** The code's answer: the quote's while a code is applied, or why a typed code was not kept. */
  answer: { status: PromoCodeStatus; message?: string } | null;
  /** What the quote takes off, so an applied code that takes nothing off (the QAR 1 floor) says so. */
  discount?: number;
  what: "order" | "booking";
  pending: boolean;
  /** A problem that is not the code's answer, already in the customer's words (for example no connection). */
  problem?: string;
  onApply: (code: string) => void;
  onRemove: () => void;
}

/**
 * The promo code box (11e), for checkout and grooming bookings: type a code and Apply, or Remove the
 * applied one. It sits inside the order form, so Enter applies the code instead of placing the order.
 * Each answer is worded in the customer's language (D207).
 */
export function PromoCodeBox({ id, code, answer, discount, what, pending, problem, onApply, onRemove }: PromoCodeBoxProps) {
  const c = useCopy();
  const [typed, setTyped] = useState("");
  const apply = () => {
    if (typed.trim() && !pending) onApply(typed.trim().toUpperCase());
  };
  const applied = answer?.status === "applied";
  const message = answer ? promoCodeText(answer, c.text, what, discount) : null;
  const messageId = `${id}-message`;
  return (
    <div className="promo-code-box">
      {code ? (
        <div className="promo-code-box__applied">
          <span>
            {c.text("Promo code ", "الرمز الترويجي ")}
            <bdi>
              <strong>{code}</strong>
            </bdi>
          </span>
          <button
            type="button"
            className="text-button"
            aria-label={c.text(`Remove the promo code ${code}`, `أزل الرمز الترويجي ${code}`)}
            onClick={() => {
              setTyped("");
              onRemove();
            }}
          >
            {c.text("Remove", "إزالة")}
          </button>
        </div>
      ) : (
        <>
          <label htmlFor={id}>{c.text("Promo code", "الرمز الترويجي")}</label>
          <div className="promo-code-box__row">
            <input
              id={id}
              dir="ltr"
              value={typed}
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(message && !applied)}
              aria-describedby={message || problem ? messageId : undefined}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                apply();
              }}
            />
            <button type="button" className="button button--secondary" disabled={!typed.trim() || pending} onClick={apply}>
              {pending ? c.text("Checking…", "جارٍ التحقق…") : c.text("Apply", "تطبيق")}
            </button>
          </div>
        </>
      )}
      {problem ? (
        <p className="form-error" id={messageId} role="alert">
          {problem}
        </p>
      ) : message ? (
        <p className={applied ? "promo-code-box__ok" : "form-error"} id={messageId} role={applied ? "status" : "alert"}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
