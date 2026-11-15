"use client";
import { useState } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { useBusiness, repo } from "@/mocks/MockDataProvider";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { TeamAccessApiPage } from "./TeamAccessApiPage";
import { useCopy } from "@/shared/lib/copy";
import type { Staff } from "@/mocks/data/business";
import {
  AdminPage,
  Modal,
  Field,
  ErrorMessage,
  StatusBadge,
} from "@/shared/ui/BusinessUI";
/** Mock-mode demo (development only, NEXT_PUBLIC_DATA_SOURCE=mock). */
function TeamAccessDemoPage() {
  const c = useCopy(),
    d = useBusiness();
  const [edit, setEdit] = useState<Staff | null>(null),
    [error, setError] = useState("");
  function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      repo.saveStaff(edit!);
      setEdit(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please retry");
    }
  }
  return (
    <AdminPage
      module="team"
      title={c.text("Team & Access", "الفريق والصلاحيات")}
      subtitle={c.text(
        "Owner-only preview. Individual accounts, not a shared employee password.",
        "معاينة للمالك فقط. حسابات فردية وليس كلمة مرور مشتركة.",
      )}
      actions={
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            setError("");
            setEdit({
              id: crypto.randomUUID(),
              name: "",
              email: "",
              role: "core",
              active: true,
            });
          }}
        >
          <Plus size={16} />
          {c.text("Add employee", "أضف موظفاً")}
        </button>
      }
    >
      <p className="note-box row">
        <ShieldCheck size={22} />
        {c.text(
          "No accounts, passwords or emails are created here. Production owner reauthentication and server permissions are required.",
          "لا يتم إنشاء حساب أو كلمة مرور أو إرسال بريد هنا. يلزم تحقق المالك وصلاحيات الخادم في الإنتاج.",
        )}
      </p>
      <div className="panel table-scroll">
        <table>
          <thead>
            <tr>
              {[
                c.text("Employee", "الموظف"),
                c.text("Email", "البريد"),
                c.text("Role", "الدور"),
                c.text("Status", "الحالة"),
                "",
              ].map((h, i) => (
                <th key={h || i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.staff.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>
                  <bdi>{s.email}</bdi>
                </td>
                <td>
                  {c.text(
                    s.role === "core" ? "Core Admin" : "Finance",
                    s.role === "core" ? "الإدارة الأساسية" : "المالية",
                  )}
                </td>
                <td>
                  <StatusBadge value={s.active ? "active" : "inactive"} />
                </td>
                <td>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setError("");
                      setEdit({ ...s });
                    }}
                  >
                    {c.text("Edit access", "عدّل الصلاحية")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal
        open={!!edit}
        onOpenChange={(v) => {
          if (!v) setEdit(null);
        }}
        title={c.text("Employee access", "صلاحية الموظف")}
      >
        {edit && (
          <form className="form-stack" onSubmit={save}>
            <Field label={c.text("Name", "الاسم")}>
              <input
                required
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </Field>
            <Field label={c.text("Email", "البريد")}>
              <input
                type="email"
                required
                value={edit.email}
                onChange={(e) => setEdit({ ...edit, email: e.target.value })}
              />
            </Field>
            <Field label={c.text("Role", "الدور")}>
              <select
                value={edit.role}
                onChange={(e) =>
                  setEdit({ ...edit, role: e.target.value as Staff["role"] })
                }
              >
                <option value="core">
                  {c.text(
                    "Core Admin · operations",
                    "الإدارة الأساسية · العمليات",
                  )}
                </option>
                <option value="finance">
                  {c.text(
                    "Finance · view/export only",
                    "المالية · عرض وتصدير فقط",
                  )}
                </option>
              </select>
            </Field>
            <Field label={c.text("Status", "الحالة")}>
              <select
                value={edit.active ? "active" : "inactive"}
                onChange={(e) =>
                  setEdit({ ...edit, active: e.target.value === "active" })
                }
              >
                <option value="active">{c.text("Active", "نشط")}</option>
                <option value="inactive">
                  {c.text("Inactive", "غير نشط")}
                </option>
              </select>
            </Field>
            <ErrorMessage message={error} />
            <button type="submit" className="button button--primary">
              {c.text("Save demo access", "احفظ الصلاحية التجريبية")}
            </button>
          </form>
        )}
      </Modal>
    </AdminPage>
  );
}

/** API mode: real staff accounts (D95). Mock mode keeps the original demo. */
export function TeamAccessPage() {
  const { source } = useRepositories();
  return source === "api" ? <TeamAccessApiPage /> : <TeamAccessDemoPage />;
}
