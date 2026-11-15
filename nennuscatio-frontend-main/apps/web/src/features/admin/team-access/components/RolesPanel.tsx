"use client";

import {
  emptyPermissions,
  isRefundModule,
  normalisePermissions,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type PermissionAction,
  type PermissionMap,
  type PermissionModule,
  type Role,
  roleSchema,
} from "@nennus-catio/contracts";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { AuthField } from "@/features/account/components/AuthForm";
import { ApiError } from "@/shared/api/client";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { errorMessage, fieldError } from "@/shared/api/sessions";
import { useCopy } from "@/shared/lib/copy";
import { Modal } from "@/shared/ui/BusinessUI";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { Button } from "@/shared/ui/Button";
import { z } from "zod";

type RunWithReauth = <T>(action: () => Promise<T>) => Promise<T | undefined>;

const okSchema = z.object({ status: z.literal("ok") });

/**
 * Applies one checkbox change and keeps the grid consistent: any action includes View, and
 * removing View removes everything else for that module (D100).
 */
export function toggle(
  map: PermissionMap,
  module: PermissionModule,
  action: PermissionAction,
  checked: boolean,
): PermissionMap {
  const next = { ...map, [module]: { ...map[module], [action]: checked } };
  if (action === "view" && !checked) {
    next[module] = { view: false, edit: false, delete: false, export: false, refund: false };
  }
  return normalisePermissions(next);
}

export function PermissionGrid({
  value,
  onChange,
}: {
  value: PermissionMap;
  onChange: (next: PermissionMap) => void;
}) {
  const a = useTranslations("Admin");
  const c = useCopy();
  const actionLabel: Record<PermissionAction, string> = {
    view: c.text("View", "عرض"),
    edit: c.text("Create / Edit", "إنشاء / تعديل"),
    delete: c.text("Delete", "حذف"),
    export: c.text("Export", "تصدير"),
    refund: c.text("Refund", "استرداد"),
  };
  return (
    <div className="table-scroll">
      <table className="permission-grid">
        <caption className="sr-only">{c.text("Permissions per admin page", "الصلاحيات لكل صفحة")}</caption>
        <thead>
          <tr>
            <th scope="col">{c.text("Admin page", "صفحة الإدارة")}</th>
            {PERMISSION_ACTIONS.map((action) => (
              <th key={action} scope="col">
                {actionLabel[action]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSION_MODULES.map((module) => (
            <tr key={module}>
              <th scope="row">{a(module === "customers" ? "customersNavigation" : module === "finance" ? "financeDashboard" : module)}</th>
              {PERMISSION_ACTIONS.map((action) => (
                <td key={action}>
                  {action === "refund" && !isRefundModule(module) ? (
                    <span className="muted" aria-hidden="true">
                      —
                    </span>
                  ) : (
                    <input
                      type="checkbox"
                      checked={value[module][action]}
                      aria-label={`${a(module === "customers" ? "customersNavigation" : module === "finance" ? "financeDashboard" : module)} · ${actionLabel[action]}`}
                      onChange={(event) => onChange(toggle(value, module, action, event.target.checked))}
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Owner-only roles list and editor (D100). Every change goes through `run` for reauthentication. */
export function RolesPanel({
  roles,
  run,
  onChanged,
}: {
  roles: readonly Role[];
  run: RunWithReauth;
  onChanged: () => Promise<unknown>;
}) {
  const c = useCopy();
  const { api } = useRepositories();
  const [editing, setEditing] = useState<{ role: Role | null; name: string; description: string; permissions: PermissionMap } | null>(null);
  const [deleteError, setDeleteError] = useState<unknown>(null);
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);

  const save = useMutation({
    mutationFn: (draft: NonNullable<typeof editing>) =>
      run(async () => {
        const body = { name: draft.name, description: draft.description, permissions: draft.permissions };
        if (draft.role) {
          await api.put(`/admin/roles/${draft.role.id}`, { ...body, version: draft.role.version }, roleSchema);
        } else {
          await api.post("/admin/roles", body, roleSchema);
        }
        setEditing(null);
        await onChanged();
      }),
  });
  const remove = useMutation({
    mutationFn: (role: Role) =>
      run(async () => {
        await api.delete(`/admin/roles/${role.id}`, okSchema);
        await onChanged();
      }),
    onMutate: () => setDeleteError(null),
    onError: (error) => setDeleteError(error),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editing) save.mutate(editing);
  }

  return (
    <section className="panel" aria-labelledby="roles-title">
      <div className="row spread">
        <div>
          <h2 id="roles-title">{c.text("Roles", "الأدوار")}</h2>
          <p className="small muted">
            {c.text(
              "A role decides which admin pages a person sees and what they can do there. Give each staff member one role.",
              "يحدد الدور صفحات الإدارة التي يراها الشخص وما يمكنه فعله فيها. أعطِ كل موظف دوراً واحداً.",
            )}
          </p>
        </div>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            save.reset();
            setEditing({ role: null, name: "", description: "", permissions: emptyPermissions() });
          }}
        >
          <Plus size={16} />
          {c.text("New role", "دور جديد")}
        </button>
      </div>
      {deleteError !== null && (
        <p className="form-error" role="alert">
          {deleteError instanceof ApiError && deleteError.code === "CONFLICT"
            ? c.text(
                "This role is still given to staff. Give them another role first.",
                "هذا الدور ما زال مُعطى لموظفين. أعطهم دوراً آخر أولاً.",
              )
            : errorMessage(deleteError, c.text)}
        </p>
      )}
      <ul className="role-list">
        {roles.map((role) => (
          <li key={role.id}>
            <div>
              <strong>{role.name}</strong>
              <span className="small muted">
                {" · "}
                {c.text(`${role.staffCount} staff`, `${role.staffCount} موظف`)}
                {" · "}
                {c.text(
                  `${PERMISSION_MODULES.filter((m) => role.permissions[m].view).length} pages`,
                  `${PERMISSION_MODULES.filter((m) => role.permissions[m].view).length} صفحات`,
                )}
              </span>
              {role.description && <p className="small muted">{role.description}</p>}
            </div>
            <div className="row">
              <button
                type="button"
                className="text-button"
                aria-label={`${c.text("Edit", "تعديل")} ${role.name}`}
                onClick={() => {
                  save.reset();
                  setEditing({ role, name: role.name, description: role.description, permissions: role.permissions });
                }}
              >
                <Pencil size={15} aria-hidden="true" />
                {c.text("Edit", "تعديل")}
              </button>
              <button
                type="button"
                className="text-button"
                aria-label={`${c.text("Delete", "حذف")} ${role.name}`}
                disabled={remove.isPending}
                onClick={() =>
                  setConfirming({
                    title: c.text(`Delete the role "${role.name}"?`, `حذف الدور «${role.name}»؟`),
                    message: c.text(
                      "This cannot be undone. A role that is still given to staff cannot be deleted; give them another role first.",
                      "لا يمكن التراجع عن ذلك. لا يمكن حذف دور ما زال مُسنداً لموظفين؛ أسند لهم دوراً آخر أولاً.",
                    ),
                    confirmLabel: c.text("Delete role", "حذف الدور"),
                    run: () => remove.mutate(role),
                  })
                }
              >
                <Trash2 size={15} aria-hidden="true" />
                {c.text("Delete", "حذف")}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Modal
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing?.role ? c.text("Edit role", "تعديل الدور") : c.text("New role", "دور جديد")}
        description={c.text(
          "Ticking Create / Edit, Delete, Export or Refund also ticks View. Changes apply to everyone with this role straight away.",
          "اختيار إنشاء/تعديل أو حذف أو تصدير أو استرداد يختار العرض تلقائياً. تُطبق التغييرات فوراً على كل من لديه هذا الدور.",
        )}
        placement="side"
      >
        {editing && (
          <form className="form-stack" onSubmit={submit}>
            <AuthField
              label={c.text("Role name", "اسم الدور")}
              name="roleName"
              maxLength={60}
              autoComplete="off"
              value={editing.name}
              onChange={(name) => setEditing({ ...editing, name })}
              error={fieldError(save.error, "name", c.text) && c.text("A role with this name already exists.", "يوجد دور بهذا الاسم بالفعل.")}
            />
            <AuthField
              label={c.text("Description (optional)", "الوصف (اختياري)")}
              name="roleDescription"
              required={false}
              maxLength={200}
              autoComplete="off"
              value={editing.description}
              onChange={(description) => setEditing({ ...editing, description })}
            />
            <PermissionGrid value={editing.permissions} onChange={(permissions) => setEditing({ ...editing, permissions })} />
            {save.isError && !fieldError(save.error, "name", c.text) && (
              <p className="form-error" role="alert">
                {save.error instanceof ApiError && save.error.code === "CONFLICT"
                  ? c.text(
                      "Someone else changed this role. Close and open it again to see the latest version.",
                      "عدّل شخص آخر هذا الدور. أغلقه وافتحه مجدداً لرؤية أحدث نسخة.",
                    )
                  : errorMessage(save.error, c.text)}
              </p>
            )}
            <Button type="submit" disabled={save.isPending}>
              {c.text("Save role", "احفظ الدور")}
            </Button>
          </form>
        )}
      </Modal>
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </section>
  );
}
