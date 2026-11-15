"use client";

import {
  type CustomerRelocationRequest,
  customerRelocationRequestSchema,
  type PaymentAttention,
  RELOCATION_LIMITS,
  type RelocationRequestInput,
  type RelocationSlotStatus,
  type RelocationStatus,
  relocationOptionsSchema,
  relocationRequestListSchema,
  relocationRequestResponseSchema,
} from "@nennus-catio/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { savedPetsKey } from "./account";
import { ApiError, CSRF_HEADER, toApiError } from "./client";
import { useRepositories } from "./DataSourceProvider";
import { orderErrorMessage } from "./orders";

/**
 * Pet relocation requests for customers (15c) over the 15a-15b API: what the form offers, sending a
 * request, the request page with its documents, and My relocation requests. An account is required
 * (D279 answer 1), so there is no guest link. Everything is read with `cache: "no-store"`.
 */

type Text = (en: string, ar: string) => string;

export const relocationOptionsKey = ["relocation", "options"] as const;
export const myRelocationKey = ["relocation", "mine"] as const;
export const relocationKey = (reference: string) => ["relocation", "request", reference] as const;

export function relocationHref(reference: string): string {
  return `/relocation/requests/${reference}`;
}

/** A file's download address: the API sends it as an attachment, to its owner only (plan section 4.3). */
export function relocationFileHref(reference: string, documentId: string): string {
  return `/api/relocation/requests/${reference}/documents/${documentId}/file`;
}

/** The owner's destinations and document types (public, active ones only). */
export function useRelocationOptions(enabled = true) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: relocationOptionsKey,
    queryFn: ({ signal }) => api.get("/relocation/options", relocationOptionsSchema, { signal, cache: "no-store" }),
    enabled,
    staleTime: 0,
  });
}

export function useMyRelocationRequests(enabled: boolean) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: myRelocationKey,
    queryFn: async ({ signal }) => (await api.get("/relocation/requests", relocationRequestListSchema, { signal, cache: "no-store" })).requests,
    enabled,
    staleTime: 0,
  });
}

/** One of the customer's requests; `poll` says how often to ask again (while a payment is being checked). */
export function useRelocationRequest(reference: string, poll?: (request: CustomerRelocationRequest | undefined) => number | false) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: relocationKey(reference),
    queryFn: ({ signal }) => api.get(`/relocation/requests/${reference}`, customerRelocationRequestSchema, { signal, cache: "no-store" }),
    staleTime: 0,
    retry: false,
    refetchInterval: poll ? (query) => poll(query.state.data) : undefined,
  });
}

export function useSubmitRelocation() {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RelocationRequestInput) => api.post("/relocation/requests", input, relocationRequestResponseSchema),
    onSuccess: (result, input) => {
      queryClient.setQueryData(relocationKey(result.request.reference), result.request);
      void queryClient.invalidateQueries({ queryKey: myRelocationKey });
      // "Save this pet" adds it to the account (15a), so the saved pets are read again.
      if (input.pets.some((pet) => pet.saveToAccount && pet.savedPetId === null)) void queryClient.invalidateQueries({ queryKey: savedPetsKey });
    },
  });
}

/** Cancel the request (until it is paid, D279 answer 11). The answer replaces the cached request. */
export function useCancelRelocation(reference: string) {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string): Promise<CustomerRelocationRequest> =>
      api.post(`/relocation/requests/${reference}/cancel`, reason ? { reason } : {}, customerRelocationRequestSchema),
    onSuccess: (request) => {
      queryClient.setQueryData(relocationKey(reference), request);
      void queryClient.invalidateQueries({ queryKey: myRelocationKey });
    },
  });
}

// --- Documents ---------------------------------------------------------------------------------------

/** What the file picker offers; the server checks each file again by its content (plan section 4.3). */
export const RELOCATION_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
const FILE_TYPES: readonly string[] = ["application/pdf", "image/jpeg", "image/png"];

/** Why a chosen file cannot be sent, before sending it; null when it may be. */
export function relocationFileProblem(file: File): "type" | "size" | "empty" | null {
  const named = /\.(pdf|jpe?g|png)$/i.test(file.name);
  if (!(FILE_TYPES.includes(file.type) || (file.type === "" && named))) return "type";
  if (file.size === 0) return "empty";
  if (file.size > RELOCATION_LIMITS.maxFileBytes) return "size";
  return null;
}

export function relocationFileProblemText(problem: "type" | "size" | "empty", text: Text): string {
  if (problem === "size") return text("Files must be 10 MB or smaller.", "يجب ألا يزيد حجم الملف على ١٠ ميغابايت.");
  if (problem === "empty") return text("This file is empty. Please choose another.", "هذا الملف فارغ. يرجى اختيار ملف آخر.");
  return text("Please choose a PDF, JPG or PNG file.", "يرجى اختيار ملف PDF أو JPG أو PNG.");
}

/**
 * Sends one file against one of the request's documents (multipart field `file`, as the product photos'
 * upload does). The answer is the whole request.
 */
export async function uploadRelocationDocument(reference: string, slotId: string, file: File): Promise<CustomerRelocationRequest> {
  const form = new FormData();
  form.append("file", file);
  let response: Response;
  try {
    response = await fetch(`/api/relocation/requests/${reference}/documents/${slotId}`, {
      method: "POST",
      headers: { [CSRF_HEADER]: "1", Accept: "application/json" },
      credentials: "same-origin",
      body: form,
    });
  } catch {
    throw new ApiError("NETWORK", "The server could not be reached.");
  }
  if (response.status === 413) throw new ApiError("VALIDATION_FAILED", "Files must be 10 MB or smaller.", 413);
  if (!response.ok) throw await toApiError(response);
  const parsed = relocationRequestResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new ApiError("INVALID_RESPONSE", "The server response did not match the expected contract.", response.status);
  return parsed.data.request;
}

export interface UploadState {
  fileName: string;
  status: "waiting" | "uploading" | "failed";
  error: unknown;
}

/**
 * The request page's uploads, one file at a time: each answer is the whole request, so sending them one
 * after another means the page never shows an older answer over a newer one. A failed file stays listed
 * with its reason until another file is chosen for that document.
 */
export function useDocumentUploads(reference: string) {
  const queryClient = useQueryClient();
  const queue = useRef<{ slotId: string; file: File }[]>([]);
  const running = useRef(false);
  const [states, setStates] = useState<Readonly<Record<string, UploadState>>>({});

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (let next = queue.current.shift(); next; next = queue.current.shift()) {
        const { slotId, file } = next;
        setStates((current) => ({ ...current, [slotId]: { fileName: file.name, status: "uploading", error: null } }));
        try {
          queryClient.setQueryData(relocationKey(reference), await uploadRelocationDocument(reference, slotId, file));
          setStates((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== slotId)));
        } catch (error: unknown) {
          setStates((current) => ({ ...current, [slotId]: { fileName: file.name, status: "failed", error } }));
        }
      }
    } finally {
      running.current = false;
    }
    // A read that started before an upload may have answered after it: read the request once more.
    void queryClient.invalidateQueries({ queryKey: relocationKey(reference) });
    void queryClient.invalidateQueries({ queryKey: myRelocationKey });
  }, [queryClient, reference]);

  const add = useCallback(
    (slotId: string, file: File) => {
      queue.current = [...queue.current.filter((item) => item.slotId !== slotId), { slotId, file }];
      setStates((current) => ({ ...current, [slotId]: { fileName: file.name, status: "waiting", error: null } }));
      void pump();
    },
    [pump],
  );

  return { states, add };
}

/**
 * Files chosen in the form, waiting for the request to exist (15c): the form hands them to the request
 * page, which sends them. Kept only in this tab's memory; after a reload the page asks for them again.
 */
const handedOver = new Map<string, { files: { slotId: string; file: File }[]; unmatched: number }>();

export function handOverDocuments(reference: string, files: { slotId: string; file: File }[], unmatched: number): void {
  if (files.length > 0 || unmatched > 0) handedOver.set(reference, { files, unmatched });
}

export function takeHandedDocuments(reference: string): { files: { slotId: string; file: File }[]; unmatched: number } {
  const handed = handedOver.get(reference) ?? { files: [], unmatched: 0 };
  handedOver.delete(reference);
  return handed;
}

/** An upload's failure in the customer's words (the server's checks are worded in English). */
export function uploadErrorMessage(error: unknown, text: Text): string {
  if (!(error instanceof ApiError)) return relocationErrorMessage(error, text);
  const message = error.fields.file ?? error.message;
  if (error.status === 413 || /10 MB/.test(message)) return relocationFileProblemText("size", text);
  if (error.code === "VALIDATION_FAILED") {
    if (error.fields.slot) {
      return text("This document is no longer on your request. Please reload the page.", "لم يعد هذا المستند ضمن طلبك. يرجى إعادة تحميل الصفحة.");
    }
    if (/cut short|damaged/.test(message)) {
      return text("This PDF seems cut short or damaged. Please export it again and upload it.", "يبدو أن ملف PDF هذا ناقص أو تالف. يرجى تصديره مرة أخرى ثم رفعه.");
    }
    if (/password/.test(message)) {
      return text("This PDF is password-protected. Please upload a copy without a password.", "ملف PDF هذا محمي بكلمة مرور. يرجى رفع نسخة بدون كلمة مرور.");
    }
    if (/scripts|attachments/.test(message)) {
      return text(
        "This PDF contains scripts or attachments, which we cannot accept. Please export it as a plain PDF.",
        "يحتوي ملف PDF هذا على برامج نصية أو مرفقات لا يمكننا قبولها. يرجى تصديره كملف PDF عادي.",
      );
    }
    if (/too small/.test(message)) {
      return text("The image is too small to read (at least 50 × 50 pixels).", "الصورة صغيرة جداً بحيث لا يمكن قراءتها (٥٠ × ٥٠ بكسل على الأقل).");
    }
    if (/could not be processed/.test(message)) return text("This image could not be processed. Try another file.", "تعذّرت معالجة هذه الصورة. جرّب ملفاً آخر.");
    return relocationFileProblemText("type", text);
  }
  if (error.code === "CONFLICT") {
    return /files/.test(error.message)
      ? text(
          `This request already holds ${RELOCATION_LIMITS.maxFilesPerRequest} files. Please contact us if you need to add more.`,
          `يحتوي هذا الطلب بالفعل على ${RELOCATION_LIMITS.maxFilesPerRequest} ملفاً. يرجى التواصل معنا إذا احتجت إلى إضافة المزيد.`,
        )
      : text("This request is over, so no more documents can be added.", "انتهى هذا الطلب، لذا لا يمكن إضافة مستندات أخرى.");
  }
  if (error.code === "RATE_LIMITED") {
    return text(
      "You have sent many files in a short time. Please wait a few minutes and try again.",
      "أرسلت ملفات كثيرة خلال وقت قصير. يرجى الانتظار بضع دقائق ثم المحاولة مرة أخرى.",
    );
  }
  return relocationErrorMessage(error, text);
}

// --- Words -------------------------------------------------------------------------------------------

export const RELOCATION_STATUS_LABELS: Readonly<Record<RelocationStatus, { en: string; ar: string }>> = {
  submitted: { en: "Submitted", ar: "تم الإرسال" },
  documents_requested: { en: "Documents requested", ar: "مطلوب مستندات" },
  documents_received: { en: "Documents received", ar: "تم استلام المستندات" },
  under_review: { en: "Under review", ar: "قيد المراجعة" },
  quote_requested: { en: "Quote awaiting payment", ar: "عرض السعر بانتظار الدفع" },
  paid: { en: "Paid", ar: "مدفوع" },
  in_progress: { en: "In progress", ar: "قيد التنفيذ" },
  completed: { en: "Completed", ar: "مكتمل" },
  cancelled: { en: "Cancelled", ar: "ملغي" },
};

/** The badge colours the site already has: waiting for the customer, with our team, done, or cancelled. */
export const RELOCATION_STATUS_TONE: Readonly<Record<RelocationStatus, string>> = {
  submitted: "submitted",
  documents_requested: "pending",
  documents_received: "processing",
  under_review: "processing",
  quote_requested: "pending",
  paid: "paid",
  in_progress: "processing",
  completed: "completed",
  cancelled: "cancelled",
};

export const RELOCATION_SLOT_LABELS: Readonly<Record<RelocationSlotStatus, { en: string; ar: string }>> = {
  missing: { en: "Not uploaded yet", ar: "لم يُرفع بعد" },
  uploaded: { en: "Waiting for review", ar: "بانتظار المراجعة" },
  accepted: { en: "Accepted", ar: "مقبول" },
  needs_new_copy: { en: "New copy needed", ar: "مطلوب نسخة جديدة" },
};

/** What happens next when staff must handle a payment we received (as bookings, D136, D146). */
export const RELOCATION_ATTENTION_MESSAGE: Readonly<Record<PaymentAttention, { en: string; ar: string }>> = {
  // A quote holds nothing and does not expire (15b), so this one is not expected; worded for safety.
  paid_after_expiry: {
    en: "We received your payment and will contact you about it.",
    ar: "استلمنا دفعتك وسنتواصل معك بشأنها.",
  },
  paid_after_cancel: {
    en: "We received your payment after this request was cancelled. We will refund it and let you know when it is done.",
    ar: "استلمنا دفعتك بعد إلغاء هذا الطلب. سنعيد المبلغ ونخبرك عند إتمام ذلك.",
  },
  duplicate_payment: {
    en: "We received a payment for this request that was not for its current quote. We will refund it and let you know when it is done.",
    ar: "استلمنا دفعة لهذا الطلب لا تخص عرض السعر الحالي. سنعيدها ونخبرك عند إتمام ذلك.",
  },
  amount_mismatch: {
    en: "We received a payment for this request with a different amount than expected. We will refund it and let you know when it is done.",
    ar: "استلمنا دفعة لهذا الطلب بمبلغ مختلف عن المتوقع. سنعيدها ونخبرك عند إتمام ذلك.",
  },
};

/** Relocation failures in words the customer can act on; anything shared with orders reads as it does there. */
export function relocationErrorMessage(error: unknown, text: Text): string {
  if (!(error instanceof ApiError)) return orderErrorMessage(error, text);
  switch (error.code) {
    case "RATE_LIMITED":
      // Without a waiting time this is the "3 open requests" rule, not too many attempts.
      return error.retryAfterSeconds === null
        ? text(
            `You already have ${RELOCATION_LIMITS.maxOpenPerCustomer} open relocation requests. Cancel one, or wait until one is completed.`,
            `لديك بالفعل ${RELOCATION_LIMITS.maxOpenPerCustomer} طلبات نقل مفتوحة. ألغِ أحدها، أو انتظر حتى يكتمل أحدها.`,
          )
        : orderErrorMessage(error, text);
    case "CONFLICT":
      return text("This form was already used for a different request. Please reload the page and try again.", "تم استخدام هذا النموذج لطلب آخر. أعد تحميل الصفحة وحاول مرة أخرى.");
    case "NOT_CANCELLABLE":
      if (/already cancelled/.test(error.message)) return text("This request is already cancelled.", "هذا الطلب ملغي بالفعل.");
      if (/completed/.test(error.message)) return text("This relocation is completed.", "اكتمل هذا النقل.");
      return text("This request is already paid, so only our team can cancel it. Please contact us.", "هذا الطلب مدفوع بالفعل، لذا يمكن لفريقنا فقط إلغاؤه. يرجى التواصل معنا.");
    case "NOT_FOUND":
      return text("We could not find this relocation request.", "لم نعثر على طلب النقل هذا.");
    case "UNAUTHENTICATED":
      return text("Please log in again to continue.", "يرجى تسجيل الدخول مرة أخرى للمتابعة.");
    case "PAYMENTS_UNAVAILABLE":
      return text("Online payment is not available at the moment. Please contact us to pay your quote.", "الدفع الإلكتروني غير متاح حالياً. يرجى التواصل معنا لدفع عرض السعر.");
    case "PAYMENT_ATTEMPTS_EXCEEDED":
      return text("This quote has reached the limit of 3 payment attempts. Please contact us.", "وصل عرض السعر هذا إلى الحد الأقصى وهو ٣ محاولات دفع. يرجى التواصل معنا.");
    case "PAYMENT_IN_PROGRESS":
      return text("We have received your payment and are confirming it. This page updates by itself.", "استلمنا دفعتك ونقوم بتأكيدها. تتحدث هذه الصفحة تلقائياً.");
    case "ORDER_NOT_PAYABLE":
      return text(
        "This quote cannot be paid: it is already paid, or it was withdrawn or cancelled.",
        "لا يمكن دفع عرض السعر هذا: إنه مدفوع بالفعل، أو تم سحبه أو إلغاؤه.",
      );
    default:
      return orderErrorMessage(error, text);
  }
}
