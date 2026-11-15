import type { ReactNode } from "react";
import { AdminLayout } from "@/layouts/admin/AdminLayout";
import "@/styles/admin-reference.css";
import "@/styles/orders-reference.css";
import "@/styles/bookings-reference.css";
import "@/styles/customers-reference.css";
import "@/styles/promotions-reference.css";
import "@/styles/catalogue-reference.css";
import "@/styles/dispatch-reference.css";
import "@/styles/account.css";

export default function Layout({ children }: { children: ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
