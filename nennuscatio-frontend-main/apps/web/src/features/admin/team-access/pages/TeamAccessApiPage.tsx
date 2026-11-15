"use client";

import {
  type StaffSummary,
  roleListResponseSchema,
  staffListResponseSchema,
  staffSummarySchema,
  TEMPORARY_PASSWORD_MIN_LENGTH,
} from "@nennus-catio/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, ShieldCheck, UserRoundCheck, UserRoundX } from "lucide-react";
import { type FormEvent, useState } from "react";
import { AuthField, formValue } from "@/features/account/components/AuthForm";
import { ReauthModal, useReauthentication } from "@/features/admin/auth/Reauthentication";
import { ApiError } from "@/shared/api/client";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { errorMessage, fieldError } from "@/shared/api/sessions";
import { useCopy } from "@/shared/lib/copy";
import { AdminPage, Field, Modal, StatusBadge } from "@/shared/ui/BusinessUI";
import { ConfirmDialog, type ConfirmRequest } from "@/shared/ui/ConfirmDialog";
import { Button } from "@/shared/ui/Button";
import { RolesPanel } from "../components/RolesPanel";

export const staffListKey = ["admin", "staff"] as const;
export const rolesKey = ["admin", "roles"] as const;

/** 16 characters without look-alikes (0/O, 1/l/I), for the owner to pass on to the new staff member. */
export function generateTemporaryPassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

/** Real Team & Access (owner only, D95): create staff with a temporary password, deactivate, reset. */
export function TeamAccessApiPage() {
  const c = useCopy();
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: staffListKey,
    queryFn: ({ signal }) => api.get("/admin/staff", staffListResponseSchema, { signal }),
  });
  const reauth = useReauthentication();
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<StaffSummary | null>(null);
  const [handOver, setHandOver] = useState<{ name: string; email: string; password: string } | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const roles = useQuery({
    queryKey: rolesKey,
    queryFn: ({ signal }) => api.get("/admin/roles", roleListResponseSchema, { signal }),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: staffListKey });
  const refreshAll = () =>
    Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: rolesKey })]);
  const assignRole = useMutation({
    mutationFn: ({ staff, roleId }: { staff: StaffSummary; roleId: string | null }) =>
      reauth.run(async () => {
        await api.post(`/admin/staff/${staff.id}/role`, { roleId }, staffSummarySchema);
        await refreshAll();
      }),
    onMutate: () => setActionError(null),
    onError: (error) => setActionError(error),
  });

  const create = useMutation({
    mutationFn: (body: { email: string; displayName: string; temporaryPassword: string }) =>
      reauth.run(async () => {
        const created = await api.post("/admin/staff", body, staffSummarySchema);
        setCreating(false);
        setHandOver({ name: created.displayName, email: created.email, password: body.temporaryPassword });
        await refresh();
        return created;
      }),
  });
  const resetPassword = useMutation({
    mutationFn: ({ staff, temporaryPassword }: { staff: StaffSummary; temporaryPassword: string }) =>
      reauth.run(async () => {
        await api.post(`/admin/staff/${staff.id}/reset-password`, { temporaryPassword }, staffSummarySchema);
        setResetting(null);
        setHandOver({ name: staff.displayName, email: staff.email, password: temporaryPassword });
        await refresh();
      }),
  });
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);
  const setActive = useMutation({
    mutationFn: ({ staff, active }: { staff: StaffSummary; active: boolean }) =>
      reauth.run(async () => {
        await api.post(`/admin/staff/${staff.id}/${active ? "reactivate" : "deactivate"}`, {}, staffSummarySchema);
        await refresh();
      }),
    onMutate: () => setActionError(null),
    onError: (error) => setActionError(error),
  });

  return (
    <AdminPage
      module="team"
      title={c.text("Team & Access", "الفريق والصلاحيات")}
      subtitle={c.text(
        "Only you, the owner, can add staff. Each person gets their own account and chooses their own password.",
        "أنت فقط، بصفتك المالك، يمكنك إضافة الموظفين. لكل شخص حسابه ويختار كلمة مروره بنفسه.",
      )}
      actions={
        <button type="button" className="button button--primary" onClick={() => { create.reset(); setCreating(true); }}>
          <Plus size={16} />
          {c.text("Add staff member", "أضف موظفاً")}
        </button>
      }
    >
      <p className="note-box row">
        <ShieldCheck size={22} aria-hidden="true" />
        {c.text(
          "To give someone a role, choose it in their Role column below. Each person sees only the admin pages their role allows; staff without a role see an 'access is being set up' page.",
          "لإعطاء شخص دوراً، اختره من عمود الدور في الجدول أدناه. يرى كل شخص صفحات الإدارة التي يسمح بها دوره فقط؛ الموظفون بدون دور يرون صفحة 'يجري إعداد صلاحياتك'.",
        )}
      </p>
      {actionError !== null && (
        <p className="form-error" role="alert">
          {errorMessage(actionError, c.text)}
        </p>
      )}
      <div className="panel table-scroll">
        {list.isPending ? (
          <p role="status" aria-busy="true" className="muted">
            {c.text("Loading staff…", "جارٍ تحميل الموظفين…")}
          </p>
        ) : list.isError ? (
          <div className="form-error" role="alert">
            <p>{errorMessage(list.error, c.text)}</p>
            <Button variant="secondary" onClick={() => void list.refetch()}>
              {c.text("Retry", "أعد المحاولة")}
            </Button>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{c.text("Name", "الاسم")}</th>
                <th>{c.text("Email", "البريد")}</th>
                <th>{c.text("Role", "الدور")}</th>
                <th>{c.text("Status", "الحالة")}</th>
                <th>{c.text("Last login", "آخر دخول")}</th>
                <th>
                  <span className="sr-only">{c.text("Actions", "الإجراءات")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.data.staff.map((member) => (
                <tr key={member.id}>
                  <td>{member.displayName}</td>
                  <td>
                    <bdi dir="ltr">{member.email}</bdi>
                  </td>
                  <td>
                    {member.isOwner ? (
                      c.text("Owner · everything", "المالك · كل شيء")
                    ) : (
                      <select
                        className="role-select"
                        aria-label={c.text(`Role for ${member.displayName}`, `دور ${member.displayName}`)}
                        value={member.roleId ?? ""}
                        disabled={assignRole.isPending || roles.isPending}
                        onChange={(event) =>
                          assignRole.mutate({ staff: member, roleId: event.target.value || null })
                        }
                      >
                        <option value="">{c.text("No role (no access)", "بدون دور (لا صلاحيات)")}</option>
                        {(roles.data?.roles ?? []).map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    <StatusBadge value={member.isActive ? "active" : "inactive"} />
                    {member.isActive && member.mustChangePassword && (
                      <span className="small muted"> · {c.text("temporary password", "كلمة مرور مؤقتة")}</span>
                    )}
                  </td>
                  <td>
                    {member.lastLoginAt
                      ? new Intl.DateTimeFormat(c.locale === "ar" ? "ar-QA" : "en-GB", {
                          timeZone: "Asia/Qatar",
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(member.lastLoginAt))
                      : c.text("Never", "لم يدخل بعد")}
                  </td>
                  <td>
                    {!member.isOwner && (
                      <div className="row">
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => { resetPassword.reset(); setResetting(member); }}
                        >
                          <KeyRound size={15} aria-hidden="true" />
                          {c.text("New temporary password", "كلمة مرور مؤقتة جديدة")}
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          disabled={setActive.isPending}
                          aria-label={`${member.isActive ? c.text("Deactivate", "إيقاف") : c.text("Reactivate", "إعادة تفعيل")} ${member.displayName}`}
                          onClick={() =>
                            setConfirming(
                              member.isActive
                                ? {
                                    title: c.text(`Deactivate ${member.displayName}?`, `إيقاف ${member.displayName}؟`),
                                    message: c.text(
                                      "They are logged out at once and can no longer log in until you reactivate them.",
                                      "يُسجَّل خروجه فوراً ولن يتمكن من الدخول حتى تعيد تفعيله.",
                                    ),
                                    confirmLabel: c.text("Deactivate", "إيقاف"),
                                    run: () => setActive.mutate({ staff: member, active: false }),
                                  }
                                : {
                                    title: c.text(`Reactivate ${member.displayName}?`, `إعادة تفعيل ${member.displayName}؟`),
                                    message: c.text(
                                      "They will be able to log in again with the access their role gives.",
                                      "سيتمكن من الدخول مجدداً بالصلاحيات التي يمنحها دوره.",
                                    ),
                                    confirmLabel: c.text("Reactivate", "إعادة تفعيل"),
                                    run: () => setActive.mutate({ staff: member, active: true }),
                                  },
                            )
                          }
                        >
                          {member.isActive ? (
                            <UserRoundX size={15} aria-hidden="true" />
                          ) : (
                            <UserRoundCheck size={15} aria-hidden="true" />
                          )}
                          {member.isActive ? c.text("Deactivate", "إيقاف") : c.text("Reactivate", "إعادة تفعيل")}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {roles.isError ? (
        <div className="form-error" role="alert">
          <p>{errorMessage(roles.error, c.text)}</p>
          <Button variant="secondary" onClick={() => void roles.refetch()}>
            {c.text("Retry", "أعد المحاولة")}
          </Button>
        </div>
      ) : (
        <RolesPanel roles={roles.data?.roles ?? []} run={reauth.run} onChanged={refreshAll} />
      )}

      <Modal
        open={creating}
        onOpenChange={setCreating}
        title={c.text("Add staff member", "أضف موظفاً")}
        description={c.text(
          "Give them the temporary password yourself (in person or by phone). They must change it at first login; it expires after 72 hours.",
          "أعطِ الموظف كلمة المرور المؤقتة بنفسك (شخصياً أو هاتفياً). يجب تغييرها عند أول دخول، وتنتهي بعد 72 ساعة.",
        )}
      >
        <StaffForm
          withIdentity
          pending={create.isPending}
          error={create.error}
          submitLabel={c.text("Create account", "أنشئ الحساب")}
          onSubmit={(values) => create.mutate(values)}
        />
      </Modal>

      <Modal
        open={resetting !== null}
        onOpenChange={(open) => !open && setResetting(null)}
        title={c.text("New temporary password", "كلمة مرور مؤقتة جديدة")}
        description={c.text(
          `${resetting?.displayName ?? ""} will be logged out everywhere and must choose a new password at next login.`,
          `سيتم تسجيل خروج ${resetting?.displayName ?? ""} من كل الأجهزة، وعليه اختيار كلمة مرور جديدة عند الدخول التالي.`,
        )}
      >
        {resetting && (
          <StaffForm
            pending={resetPassword.isPending}
            error={resetPassword.error}
            submitLabel={c.text("Set temporary password", "عيّن كلمة المرور المؤقتة")}
            onSubmit={(values) => resetPassword.mutate({ staff: resetting, temporaryPassword: values.temporaryPassword })}
          />
        )}
      </Modal>

      <Modal
        open={handOver !== null}
        onOpenChange={(open) => !open && setHandOver(null)}
        title={c.text("Pass this on", "سلّم هذه البيانات")}
        description={c.text(
          "This password is shown only now. It works once and expires after 72 hours.",
          "تظهر كلمة المرور هذه الآن فقط. تعمل مرة واحدة وتنتهي بعد 72 ساعة.",
        )}
      >
        {handOver && (
          <div className="form-stack">
            <p>
              <strong>{handOver.name}</strong> · <bdi dir="ltr">{handOver.email}</bdi>
            </p>
            <Field label={c.text("Temporary password", "كلمة المرور المؤقتة")}>
              <input readOnly value={handOver.password} dir="ltr" onFocus={(event) => event.currentTarget.select()} />
            </Field>
            <p className="small muted">
              {c.text("Staff log in at /admin/login.", "يسجّل الموظفون الدخول من /admin/login.")}
            </p>
            <Button onClick={() => setHandOver(null)}>{c.text("Done", "تم")}</Button>
          </div>
        )}
      </Modal>

      <ReauthModal
        description={c.text(
          "For your security, enter your password again to change staff accounts.",
          "لحمايتك، أدخل كلمة المرور مرة أخرى لتعديل حسابات الموظفين.",
        )}
        open={reauth.pending}
        onCancel={reauth.cancel}
        error={reauth.reauth.error}
        pending={reauth.reauth.isPending}
        onConfirm={(password) => {
          void reauth.confirm(password).catch((error: unknown) => {
            if (!(error instanceof ApiError && error.code === "INVALID_CREDENTIALS")) setActionError(error);
          });
        }}
      />
      <ConfirmDialog request={confirming} onClose={() => setConfirming(null)} />
    </AdminPage>
  );
}

function StaffForm({
  withIdentity = false,
  pending,
  error,
  submitLabel,
  onSubmit,
}: {
  withIdentity?: boolean;
  pending: boolean;
  error: unknown;
  submitLabel: string;
  onSubmit: (values: { email: string; displayName: string; temporaryPassword: string }) => void;
}) {
  const c = useCopy();
  const [password, setPassword] = useState(() => generateTemporaryPassword());
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    onSubmit({
      email: withIdentity ? formValue(form, "email") : "",
      displayName: withIdentity ? formValue(form, "displayName") : "",
      temporaryPassword: password,
    });
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      {withIdentity && (
        <>
          <AuthField label={c.text("Name", "الاسم")} name="displayName" maxLength={120} autoComplete="off" error={fieldError(error, "displayName", c.text)} />
          <AuthField label={c.text("Email", "البريد الإلكتروني")} name="email" type="email" maxLength={254} autoComplete="off" error={fieldError(error, "email", c.text)} />
        </>
      )}
      <div className="temporary-password">
        <AuthField
          label={c.text("Temporary password", "كلمة المرور المؤقتة")}
          name="temporaryPassword"
          minLength={TEMPORARY_PASSWORD_MIN_LENGTH}
          maxLength={128}
          autoComplete="off"
          value={password}
          onChange={setPassword}
          hint={c.text(`At least ${TEMPORARY_PASSWORD_MIN_LENGTH} characters. A random one is suggested.`, `${TEMPORARY_PASSWORD_MIN_LENGTH} حرفاً على الأقل. نقترح كلمة عشوائية.`)}
          error={fieldError(error, "temporaryPassword", c.text)}
        />
        <Button variant="secondary" onClick={() => setPassword(generateTemporaryPassword())}>
          {c.text("New suggestion", "اقتراح جديد")}
        </Button>
      </div>
      {error !== null && !(error instanceof ApiError && Object.keys(error.fields).length > 0) && (
        <p className="form-error" role="alert">
          {errorMessage(error, c.text)}
        </p>
      )}
      <button type="submit" className="button button--primary" disabled={pending}>
        {submitLabel}
      </button>
    </form>
  );
}
