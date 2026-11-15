"use client";

import { type CustomerRelocationRequest, RELOCATION_LIMITS, type RelocationDocumentSlot, relocationIsOpen } from "@nennus-catio/contracts";
import { useState } from "react";
import {
  RELOCATION_FILE_ACCEPT,
  RELOCATION_SLOT_LABELS,
  relocationFileHref,
  relocationFileProblem,
  relocationFileProblemText,
  type UploadState,
  uploadErrorMessage,
} from "@/shared/api/relocation";
import { useCopy } from "@/shared/lib/copy";
import { Field } from "@/shared/ui/BusinessUI";
import { fileSizeText, whenText } from "../lib/format";

const SLOT_TONE: Readonly<Record<RelocationDocumentSlot["status"], string>> = {
  missing: "pending",
  uploaded: "processing",
  accepted: "completed",
  needs_new_copy: "pending",
};

/**
 * The request's documents (15c; plan section 4.3): each one asked for, whom it is for, its status, the
 * files sent (a download each), and an upload while the request is open. An accepted document takes no
 * new file here; a document waiting for review can be replaced by a new copy.
 */
export function RelocationDocuments({
  request,
  uploads,
  onUpload,
}: {
  request: CustomerRelocationRequest;
  uploads: Readonly<Record<string, UploadState>>;
  onUpload: (slotId: string, file: File) => void;
}) {
  const c = useCopy();
  const open = relocationIsOpen(request.status);
  if (request.documents.length === 0) {
    return (
      <p className="small muted">
        {open
          ? c.text("No documents are needed at the moment. If we need any, we will ask here and by email.", "لا حاجة إلى مستندات حالياً. إذا احتجنا إلى أي منها، فسنطلبها هنا وبالبريد.")
          : c.text("No documents were asked for this request.", "لم تُطلب مستندات لهذا الطلب.")}
      </p>
    );
  }
  return (
    <>
      {open && request.uploadsLeft === 0 && (
        <p className="note-box">
          {c.text(
            `This request holds the most files we accept (${RELOCATION_LIMITS.maxFilesPerRequest}). Please contact us if you need to add more.`,
            `يحتوي هذا الطلب على الحد الأقصى من الملفات (${RELOCATION_LIMITS.maxFilesPerRequest}). يرجى التواصل معنا إذا احتجت إلى إضافة المزيد.`,
          )}
        </p>
      )}
      <ul className="relocation-docs">
        {request.documents.map((slot) => (
          <DocumentSlot
            key={slot.id}
            reference={request.reference}
            slot={slot}
            upload={uploads[slot.id] ?? null}
            canUpload={open && request.uploadsLeft > 0 && slot.status !== "accepted"}
            onUpload={(file) => onUpload(slot.id, file)}
          />
        ))}
      </ul>
    </>
  );
}

function DocumentSlot({
  reference,
  slot,
  upload,
  canUpload,
  onUpload,
}: {
  reference: string;
  slot: RelocationDocumentSlot;
  upload: UploadState | null;
  canUpload: boolean;
  onUpload: (file: File) => void;
}) {
  const c = useCopy();
  const name = c.local(slot.name);
  const busy = upload !== null && upload.status !== "failed";
  // A file refused before sending (its type or size); the server's refusals show as the upload's failure.
  const [problem, setProblem] = useState("");
  const label =
    slot.status === "missing"
      ? c.text("Upload a file", "ارفع ملفاً")
      : slot.status === "needs_new_copy"
        ? c.text("Upload a new copy", "ارفع نسخة جديدة")
        : c.text("Replace with a new copy", "استبدل بنسخة جديدة");
  // Each box is told apart by its spoken name: the document and its pet.
  const spoken = slot.pet ? c.text(`${label}: ${name} for ${slot.pet.name}`, `${label}: ${name} لـ ${slot.pet.name}`) : `${label}: ${name}`;
  return (
    <li className="relocation-doc">
      <div className="row spread">
        <strong>{name}</strong>
        <span className={`status status--${SLOT_TONE[slot.status]}`}>{c.local(RELOCATION_SLOT_LABELS[slot.status])}</span>
      </div>
      <p className="small muted">
        {slot.pet ? c.text(`For ${slot.pet.name}`, `لـ ${slot.pet.name}`) : c.text("For the whole request", "للطلب كاملاً")} ·{" "}
        {slot.required ? c.text("Required", "مطلوب") : c.text("Optional", "اختياري")}
      </p>
      {slot.askedNote && (
        <p className="small">
          {c.text("From our team: ", "من فريقنا: ")}
          {slot.askedNote}
        </p>
      )}
      {slot.status === "needs_new_copy" && (
        <p className="note-box">
          {c.text("Please upload a new copy.", "يرجى رفع نسخة جديدة.")}
          {slot.reviewReason && ` ${slot.reviewReason}`}
        </p>
      )}
      {slot.files.length > 0 && (
        <ul className="relocation-files">
          {[...slot.files]
            .sort((a, b) => b.version - a.version)
            .map((file) => (
              <li key={file.id} className="small">
                {file.deletedAt ? (
                  <span className="muted">
                    <bdi>{file.name}</bdi> · {c.text("no longer kept", "لم يعد محفوظاً")}
                  </span>
                ) : (
                  <a href={relocationFileHref(reference, file.id)} download={file.name} className="text-link">
                    <bdi>{file.name}</bdi>
                  </a>
                )}
                <span className="muted">
                  {" "}
                  · {fileSizeText(file.bytes, c.locale)} · {whenText(file.uploadedAt, c.locale)}
                </span>
              </li>
            ))}
        </ul>
      )}
      {upload?.status === "waiting" && (
        <p className="small muted" role="status">
          {c.text(`Waiting to upload ${upload.fileName}…`, `بانتظار رفع ${upload.fileName}…`)}
        </p>
      )}
      {upload?.status === "uploading" && (
        <p className="small muted" role="status" aria-busy="true">
          {c.text(`Uploading ${upload.fileName}…`, `جارٍ رفع ${upload.fileName}…`)}
        </p>
      )}
      {upload?.status === "failed" && (
        <p className="form-error" role="alert">
          {c.text(`${upload.fileName} was not uploaded: `, `لم يُرفع ${upload.fileName}: `)}
          {uploadErrorMessage(upload.error, c.text)}
        </p>
      )}
      {problem && (
        <p className="form-error" role="alert">
          {problem}
        </p>
      )}
      {canUpload && (
        <Field label={label}>
          <input
            type="file"
            aria-label={spoken}
            accept={RELOCATION_FILE_ACCEPT}
            disabled={busy}
            onChange={(event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              input.value = "";
              if (!file) return;
              const refused = relocationFileProblem(file);
              setProblem(refused ? relocationFileProblemText(refused, c.text) : "");
              if (!refused) onUpload(file);
            }}
          />
        </Field>
      )}
    </li>
  );
}
