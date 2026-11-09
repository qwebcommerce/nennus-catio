import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

const ToastContext = createContext(null);

let toastId = 0;

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const showToast = useCallback(
    (message, type = "info", opts = {}) => {
      const id = ++toastId;
      const duration = opts.duration ?? (type === "error" ? 4800 : 3400);
      setToasts((prev) => [...prev.slice(-4), { id, message: String(message), type, duration }]);
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss]
  );

  const value = useMemo(() => ({ showToast, dismiss }), [showToast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || ICONS.info;
          return (
            <div key={t.id} className={`toast toast--${t.type}`} role="status">
              <span className="toast__icon" aria-hidden="true">
                <Icon size={18} strokeWidth={2.25} />
              </span>
              <span className="toast__msg">{t.message}</span>
              <button
                type="button"
                className="toast__close"
                onClick={() => dismiss(t.id)}
                aria-label="Close"
              >
                <X size={15} strokeWidth={2.25} />
              </button>
              <span
                className="toast__timer"
                style={{ animationDuration: `${t.duration}ms` }}
                aria-hidden="true"
              />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
