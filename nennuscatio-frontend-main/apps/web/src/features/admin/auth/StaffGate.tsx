"use client";

import { okResponseSchema, type StaffProfile } from "@nennus-catio/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { errorMessage, staffSessionKey, useStaffSession } from "@/shared/api/sessions";
import { useCopy } from "@/shared/lib/copy";
import { Brand } from "@/shared/ui/Brand";
import { Button } from "@/shared/ui/Button";

/** Admin pages that must work without a staff session (they live outside the admin shell). */
export const STAFF_PUBLIC_PATHS = ["/admin/login", "/admin/forgot-password", "/admin/reset-password"] as const;
export const STAFF_CHANGE_PASSWORD_PATH = "/admin/change-password";

export function useStaffLogout() {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => api.post("/admin/auth/logout", {}, okResponseSchema),
    onSuccess: () => {
      queryClient.setQueryData(staffSessionKey, null);
      queryClient.removeQueries({ queryKey: ["admin"] });
      router.replace("/admin/login");
    },
  });
}

function GateMessage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="auth-page auth-page--staff">
      <section className="auth-card" aria-labelledby="gate-title">
        <Brand compact />
        <h1 id="gate-title">{title}</h1>
        {children}
      </section>
    </div>
  );
}

/**
 * API mode: the admin requires a staff session (D95). Not logged in → login page; temporary
 * password → choose your own; staff whose role grants no page → "access being set up" (D100).
 */
export function StaffGate({ children }: { children: (staff: StaffProfile) => ReactNode }) {
  const c = useCopy();
  const session = useStaffSession();
  const pathname = usePathname();
  const router = useRouter();
  const logout = useStaffLogout();
  const staff = session.data;

  useEffect(() => {
    if (session.isPending || session.isError) return;
    if (!staff) {
      router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
    } else if (staff.mustChangePassword && pathname !== STAFF_CHANGE_PASSWORD_PATH) {
      router.replace(STAFF_CHANGE_PASSWORD_PATH);
    }
  }, [session.isPending, session.isError, staff, pathname, router]);

  if (session.isPending || (!session.isError && (!staff || staff.mustChangePassword))) {
    return (
      <GateMessage title={c.text("Staff workspace", "مساحة الموظفين")}>
        <p role="status" aria-busy="true" className="muted">
          {c.text("Checking your session…", "جارٍ التحقق من جلستك…")}
        </p>
      </GateMessage>
    );
  }
  if (session.isError) {
    return (
      <GateMessage title={c.text("Staff workspace", "مساحة الموظفين")}>
        <div className="form-error" role="alert">
          <p>{errorMessage(session.error, c.text)}</p>
          <Button variant="secondary" onClick={() => void session.refetch()}>
            {c.text("Retry", "أعد المحاولة")}
          </Button>
        </div>
      </GateMessage>
    );
  }
  if (!staff) return null;
  // Staff without a role, or whose role shows no page, wait for the owner (D100).
  if (!staff.isOwner && !Object.values(staff.permissions).some((module) => module.view)) {
    return (
      <GateMessage title={c.text("Your access is being set up", "يجري إعداد صلاحياتك")}>
        <p className="note-box row">
          <ShieldCheck size={22} aria-hidden="true" />
          {c.text(
            `Hello ${staff.displayName}. The owner chooses which parts of the workspace you can use. Once they do, they will appear here.`,
            `مرحباً ${staff.displayName}. يختار المالك أقسام مساحة العمل التي يمكنك استخدامها، وستظهر هنا بعد ذلك.`,
          )}
        </p>
        <Button variant="secondary" onClick={() => logout.mutate()} disabled={logout.isPending}>
          {c.text("Log out", "تسجيل الخروج")}
        </Button>
      </GateMessage>
    );
  }
  return <>{children(staff)}</>;
}
