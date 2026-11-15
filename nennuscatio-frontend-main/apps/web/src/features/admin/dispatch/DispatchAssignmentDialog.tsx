"use client";
import { useState, type RefObject } from "react";
import type { DispatchJob } from "@/mocks/adapters/dispatch-repository";
import { mockDispatchRepository } from "@/mocks/adapters/dispatch-repository";
import { dispatchTeam } from "@/mocks/data/dispatch";
import { repo } from "@/mocks/MockDataProvider";
import { useCopy } from "@/shared/lib/copy";
import { Field, Modal } from "@/shared/ui/BusinessUI";
export function DispatchAssignmentDialog({
  jobs,
  onClose,
  onSaved,
  returnFocusRef,
}: {
  jobs: DispatchJob[];
  onClose: () => void;
  onSaved: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const c = useCopy(),
    [member, setMember] = useState(jobs.length === 1 ? jobs[0].assignedTo : ""),
    [note, setNote] = useState(jobs.length === 1 ? jobs[0].note : ""),
    [error, setError] = useState(false);
  const grooming = jobs.every((j) => j.kind === "grooming"),
    delivery = jobs.every((j) => j.kind !== "grooming"),
    eligible = dispatchTeam.filter(
      (m) =>
        (grooming && m.role === "groomer") || (delivery && m.role === "driver"),
    );
  return (
    <Modal
      open
      title={c.text("Assign dispatch", "تعيين التوصيل")}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      returnFocusRef={returnFocusRef}
      description={c.text(
        "Local simulation only. No job is sent to FleetWiz or an employee.",
        "محاكاة محلية فقط. لا ترسل مهمة إلى FleetWiz أو موظف.",
      )}
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const result = mockDispatchRepository.assign(
            repo.getSnapshot(),
            jobs.map((j) => j.id),
            member,
            note,
          );
          if (result) setError(true);
          else onSaved();
        }}
      >
        <p>
          {jobs.length} {c.text("selected dispatches", "مهام مختارة")}
        </p>
        {!eligible.length && (
          <p role="alert">
            {c.text(
              "Select deliveries or Home Grooming separately. They need different assignment teams.",
              "اختر التوصيل أو العناية المنزلية منفصلين لاختلاف فريق التعيين.",
            )}
          </p>
        )}
        <Field label={c.text("Assigned To", "معين إلى")}>
          <select
            required
            value={member}
            onChange={(e) => setMember(e.target.value)}
          >
            <option value="">
              {c.text("Choose demo team member", "اختر عضو الفريق التجريبي")}
            </option>
            {eligible.map((m) => (
              <option key={m.id} value={m.id}>
                {c.local(m.name)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={c.text("Dispatch note", "ملاحظة التوصيل")}>
          <textarea
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="form-error">
            {c.text(
              "Assignment could not be saved. Check the slot, source status and selected team.",
              "تعذر حفظ التعيين. تحقق من الموعد وحالة المصدر والفريق المختار.",
            )}
          </p>
        )}
        <button type="submit" className="button" disabled={!eligible.length}>
          {c.text("Save mock assignment", "حفظ التعيين التجريبي")}
        </button>
      </form>
    </Modal>
  );
}
