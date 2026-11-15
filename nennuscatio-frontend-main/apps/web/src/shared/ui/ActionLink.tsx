import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

export function ActionLink({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "quiet";
  className?: string;
}) {
  return (
    <Link href={href} className={`button button--${variant} ${className}`}>
      {children}
    </Link>
  );
}
