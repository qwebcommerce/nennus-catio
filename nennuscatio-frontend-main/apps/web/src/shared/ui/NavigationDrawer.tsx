"use client";

import { useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

export function NavigationDrawer({
  children,
  title,
  variant = "public",
}: {
  children: (close: () => void) => ReactNode;
  title: string;
  variant?: "public" | "admin";
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("Common");
  const locale = useLocale();
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="icon-button drawer-trigger"
          aria-label={t("menu")}
        >
          <Menu size={22} strokeWidth={1.6} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay" />
        <Dialog.Content
          className={`drawer-content${variant === "admin" ? " drawer-content--admin" : ""}`}
          dir={locale === "ar" ? "rtl" : "ltr"}
        >
          <div className="drawer-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="icon-button"
                aria-label={t("close")}
              >
                <X size={22} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            {t("navigation")}
          </Dialog.Description>
          {children(() => setOpen(false))}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
