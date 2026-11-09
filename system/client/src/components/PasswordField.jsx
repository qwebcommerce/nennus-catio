import React, { useId, useState } from "react";
import { useI18n } from "../context/LanguageContext.jsx";

/**
 * Password input with show/hide toggle for auth forms.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  required,
  minLength,
  autoComplete,
  placeholder,
  name,
}) {
  const { t } = useI18n();
  const autoId = useId();
  const inputId = id || autoId;
  const [visible, setVisible] = useState(false);

  return (
    <div className="mkt-field">
      {label ? <label htmlFor={inputId}>{label}</label> : null}
      <div className="mkt-password-wrap">
        <input
          id={inputId}
          name={name}
          value={value}
          onChange={onChange}
          type={visible ? "text" : "password"}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="mkt-password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
          aria-pressed={visible}
          title={visible ? t("auth.hidePassword") : t("auth.showPassword")}
        >
          {visible ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
