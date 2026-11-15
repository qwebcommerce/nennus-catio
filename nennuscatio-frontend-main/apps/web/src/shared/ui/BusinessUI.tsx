"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useCopy } from "@/shared/lib/copy";
import type { ModuleId } from "@nennus-catio/contracts";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { useDataSourceOrNull } from "@/shared/api/DataSourceProvider";
import { FeatureFoundation } from "./FeatureFoundation";
export function AdminPage({
  module,
  title,
  subtitle,
  actions,
  children,
}: {
  module: ModuleId;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const access = useAdminAccess();
  if (!access.canView(module))
    return <FeatureFoundation area={module} admin />;
  return (
    <>
      <div className="op-heading">
        <div>
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
        </div>
        <div className="row">{actions}</div>
      </div>
      {children}
    </>
  );
}
export function StatusBadge({ value }: { value: string }) {
  const c = useCopy();
  const labels: Record<string, string> = {
    paid: "مدفوع",
    pending: "قيد الانتظار",
    processing: "قيد التجهيز",
    ready: "جاهز",
    completed: "مكتمل",
    confirmed: "مؤكد",
    cancelled: "ملغي",
    available: "متاح",
    closed: "مغلق",
    active: "نشط",
    inactive: "غير نشط",
  };
  return (
    <span className={`status status--${value}`}>
      {c.ar ? (labels[value] ?? value) : value.replaceAll("-", " ")}
    </span>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  children,
  returnFocusRef,
  placement = "center",
  description,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
  placement?: "center" | "side";
  description?: string;
}) {
  const c = useCopy();
  // The "mock data" note is only true in the development mock mode; real dialogs describe themselves.
  const source = useDataSourceOrNull();
  const text =
    description ??
    (source === "api"
      ? null
      : c.text("Changes apply to mock data in this preview only.", "التغييرات على البيانات التجريبية فقط."));
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={`modal-overlay ${placement === "side" ? "modal-overlay--side" : ""}`}
        />
        <Dialog.Content
          className={`modal-content ${placement === "side" ? "modal-content--side" : ""}`}
          dir={c.ar ? "rtl" : "ltr"}
          {...(text === null ? { "aria-describedby": undefined } : {})}
          onCloseAutoFocus={(event) => {
            if (returnFocusRef?.current?.isConnected) {
              event.preventDefault();
              returnFocusRef.current.focus();
            }
          }}
        >
          <div className="row spread">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="icon-button"
                aria-label={c.text("Close", "إغلاق")}
              >
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>
          {text !== null && <Dialog.Description className="muted small">{text}</Dialog.Description>}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function ErrorMessage({ message }: { message: string }) {
  const c = useCopy();
  return message ? (
    <p className="form-error" role="alert">
      {c.ar ? "لم تتم العملية. تحقق من الحقول والتوفر ثم أعد المحاولة. " : ""}
      {message}
    </p>
  ) : null;
}
export function Notice() {
  const c = useCopy();
  return (
    <p className="small muted">
      {c.text(
        "Demo catalogue, prices and policies — owner approval required. No live payment.",
        "الكتالوج والأسعار والسياسات تجريبية وبانتظار موافقة المالك. لا يوجد دفع فعلي.",
      )}
    </p>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: This shared label wraps its caller-supplied native input/select/textarea; browser checks verify association.
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
