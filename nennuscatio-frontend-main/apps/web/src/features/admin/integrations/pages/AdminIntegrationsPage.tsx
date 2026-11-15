"use client";

import { useRepositories } from "@/shared/api/DataSourceProvider";
import { useCopy } from "@/shared/lib/copy";
import { AdminPage } from "@/shared/ui/BusinessUI";
import { AdminIntegrationsApiPage } from "./AdminIntegrationsApiPage";

/** API mode: the owner's POS connection (#16 part 2c). Mock mode has no server to connect to. */
export function AdminIntegrationsPage() {
  const c = useCopy();
  const { source } = useRepositories();
  if (source === "api") return <AdminIntegrationsApiPage />;
  return (
    <AdminPage module="integrations" title={c.text("Integrations", "الربط مع الأنظمة")}>
      <p className="note-box">
        {c.text(
          "The POS connection works with the server only. This sample-data preview has none.",
          "يعمل الربط مع نظام نقطة البيع عبر الخادم فقط. لا يوجد خادم في هذه المعاينة ببيانات تجريبية.",
        )}
      </p>
    </AdminPage>
  );
}
