"use client";

import { UserRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { useCopy } from "@/shared/lib/copy";

/**
 * From an order's or booking's Customer card to the customer's record (10d): the Customers page opens the
 * record with this email. Only for roles that may open Customers (D105).
 */
export function CustomerRecordLink({ email }: { email: string }) {
  const c = useCopy();
  const canOpen = useAdminAccess().canView("customers");
  if (!canOpen) return null;
  return (
    <p>
      <UserRound size={13} aria-hidden="true" />
      <Link className="text-link" href={`/admin/customers?search=${encodeURIComponent(email)}`}>
        {c.text("Open customer record", "فتح سجل العميل")}
      </Link>
    </p>
  );
}
