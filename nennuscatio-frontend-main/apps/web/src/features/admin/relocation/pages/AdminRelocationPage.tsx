"use client";

import { useDataSourceOrNull } from "@/shared/api/DataSourceProvider";
import { useCopy } from "@/shared/lib/copy";
import { AdminPage, Empty } from "@/shared/ui/BusinessUI";
import { AdminRelocationApiPage } from "./AdminRelocationApiPage";

/**
 * The admin Relocation page (15d). Relocation was built against the real server from the start (#15), so
 * the development mock mode has no sample requests: it says so instead of inventing any (D141).
 */
export function AdminRelocationPage() {
  const c = useCopy();
  if (useDataSourceOrNull() === "api") return <AdminRelocationApiPage />;
  return (
    <AdminPage module="relocation" title={c.text("Relocation", "النقل")}>
      <Empty>{c.text("Relocation requests are shown with the real server only.", "تُعرض طلبات النقل مع الخادم الحقيقي فقط.")}</Empty>
    </AdminPage>
  );
}
