"use client";

import type { ReactNode } from "react";
import { Field } from "@/shared/ui/BusinessUI";

/** A labelled input with an optional hint and field-level error, shared by the account forms. */
export function AuthField({
  label,
  name,
  type = "text",
  autoComplete,
  hint,
  error,
  required = true,
  minLength,
  maxLength,
  value,
  onChange,
}: {
  label: string;
  name: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  // Hint and error sit outside the <label> so they are announced as descriptions, not as the name.
  return (
    <div className="auth-field">
      <Field label={label}>
        <input
          name={name}
          type={type}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          dir={type === "email" ? "ltr" : undefined}
          {...(onChange ? { value: value ?? "", onChange: (event) => onChange(event.target.value) } : {})}
        />
      </Field>
      {hint && (
        <span id={hintId} className="field-hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}

export function AuthCard({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <h1 id="auth-title">{title}</h1>
        {intro && <p className="muted">{intro}</p>}
        {children}
      </section>
    </div>
  );
}

/** Reads a field from a submitted form without controlled state. */
export function formValue(form: HTMLFormElement, name: string): string {
  const field = form.elements.namedItem(name);
  return field instanceof HTMLInputElement ? field.value : "";
}
