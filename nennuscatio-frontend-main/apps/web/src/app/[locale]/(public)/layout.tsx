import type { ReactNode } from "react";
import { PublicLayout } from "@/layouts/public/PublicLayout";

export default function Layout({ children }: { children: ReactNode }) {
  return <PublicLayout>{children}</PublicLayout>;
}
