"use client";

import {
  type CustomerProfile,
  customerProfileSchema,
  type StaffProfile,
  staffProfileSchema,
} from "@nennus-catio/contracts";
import { useQuery } from "@tanstack/react-query";
import type { ApiClient } from "./client";
import { ApiError } from "./client";
import { useRepositories } from "./DataSourceProvider";

export const customerSessionKey = ["session", "customer"] as const;
export const staffSessionKey = ["session", "staff"] as const;

/** "Not logged in" is a normal answer, not an error. */
async function orNull<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (error: unknown) {
    if (error instanceof ApiError && error.code === "UNAUTHENTICATED") return null;
    throw error;
  }
}

export function fetchCustomer(api: ApiClient, signal?: AbortSignal): Promise<CustomerProfile | null> {
  return orNull(api.get("/auth/me", customerProfileSchema, { signal }));
}

export function fetchStaff(api: ApiClient, signal?: AbortSignal): Promise<StaffProfile | null> {
  return orNull(api.get("/admin/auth/me", staffProfileSchema, { signal }));
}

/** The logged-in customer, or null. Never cached across a login/logout: callers invalidate it. */
export function useCustomerSession() {
  const { api } = useRepositories();
  return useQuery({
    queryKey: customerSessionKey,
    queryFn: ({ signal }) => fetchCustomer(api, signal),
    staleTime: 0,
  });
}

export function useStaffSession(enabled = true) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: staffSessionKey,
    queryFn: ({ signal }) => fetchStaff(api, signal),
    staleTime: 0,
    enabled,
  });
}

/** A short, honest message for an API failure in a form. Field errors are shown next to fields. */
export function errorMessage(error: unknown, text: (en: string, ar: string) => string): string {
  if (!(error instanceof ApiError)) return text("Something went wrong. Please try again.", "حدث خطأ. يرجى المحاولة مرة أخرى.");
  switch (error.code) {
    case "INVALID_CREDENTIALS":
      return text("The email or password is incorrect.", "البريد الإلكتروني أو كلمة المرور غير صحيحة.");
    case "RATE_LIMITED":
      return text(
        `Too many attempts. Please wait ${Math.ceil((error.retryAfterSeconds ?? 900) / 60)} minutes and try again.`,
        `محاولات كثيرة. يرجى الانتظار ${Math.ceil((error.retryAfterSeconds ?? 900) / 60)} دقيقة ثم المحاولة مرة أخرى.`,
      );
    case "TOKEN_INVALID":
      return text("This link is invalid or has expired. Please request a new one.", "هذا الرابط غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً.");
    case "VALIDATION_FAILED":
      return text("Please check the highlighted fields.", "يرجى مراجعة الحقول المحددة.");
    case "CONFLICT":
      return text("This already exists.", "هذا موجود بالفعل.");
    case "TEMPORARY_PASSWORD_EXPIRED":
      return text(
        "This temporary password has expired. Please ask the owner for a new one.",
        "انتهت صلاحية كلمة المرور المؤقتة. اطلب كلمة جديدة من المالك.",
      );
    case "EMAIL_NOT_VERIFIED":
      return text("Please confirm your email address first.", "يرجى تأكيد بريدك الإلكتروني أولاً.");
    case "CSRF_REJECTED":
      return text("Please reload the page and try again.", "يرجى إعادة تحميل الصفحة والمحاولة مرة أخرى.");
    case "NETWORK":
    case "UNAVAILABLE":
      return text("The server could not be reached. Please try again.", "تعذّر الوصول إلى الخادم. يرجى المحاولة مرة أخرى.");
    default:
      return text("Something went wrong. Please try again.", "حدث خطأ. يرجى المحاولة مرة أخرى.");
  }
}

/** Field message from the API, translated for the known password rule. */
export function fieldError(error: unknown, path: string, text: (en: string, ar: string) => string): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const message = error.fields[path];
  if (!message) return undefined;
  if (/email address/.test(message) && /must not/.test(message)) {
    return text("The password must not be your email address.", "يجب ألا تكون كلمة المرور هي بريدك الإلكتروني.");
  }
  if (/at least|>=|too small/i.test(message)) {
    return text("Too short.", "قصيرة جداً.");
  }
  if (/already exists/.test(message)) {
    return text("A staff member with this email already exists.", "يوجد موظف بهذا البريد بالفعل.");
  }
  if (path === "email") return text("Please enter a valid email address.", "يرجى إدخال بريد إلكتروني صالح.");
  return message;
}
