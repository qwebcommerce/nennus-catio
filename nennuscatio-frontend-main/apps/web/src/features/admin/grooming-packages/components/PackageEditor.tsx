"use client";
import { useState, type FormEvent } from "react";
import { repo } from "@/mocks/MockDataProvider";
import { bi, type Package } from "@/mocks/data/business";
import { useCopy } from "@/shared/lib/copy";
import { Photo } from "@/shared/ui/Photo";
import { ImagePicker } from "@/shared/ui/ImagePicker";
import { Modal, Field, ErrorMessage } from "@/shared/ui/BusinessUI";
import { NumberInput } from "@/shared/ui/NumberInput";
export function PackageEditor({
  initial,
  onClose,
}: {
  initial: Package;
  onClose: () => void;
}) {
  const c = useCopy(),
    [edit, setEdit] = useState(() => structuredClone(initial)),
    [error, setError] = useState("");
  function save(event: FormEvent) {
    event.preventDefault();
    try {
      repo.savePackage(edit);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please retry");
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={c.text("Package editor", "محرر الباقة")}
    >
      <form className="form-stack" onSubmit={save}>
        <div className="form-two">
          {(["en", "ar"] as const).map((lang) => (
            <div key={lang}>
              <Field label={`${c.text("Name", "الاسم")} · ${lang}`}>
                <input
                  required
                  value={edit.name[lang]}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      name: { ...edit.name, [lang]: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label={`${c.text("Description", "الوصف")} · ${lang}`}>
                <textarea
                  required
                  value={edit.description[lang]}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      description: {
                        ...edit.description,
                        [lang]: e.target.value,
                      },
                    })
                  }
                />
              </Field>
              <Field
                label={`${c.text("Included care (one per line)", "العناية المشمولة (كل عنصر بسطر)")} · ${lang}`}
              >
                <textarea
                  value={edit.inclusions.map((x) => x[lang]).join("\n")}
                  onChange={(e) => {
                    const lines = e.target.value.split("\n");
                    setEdit({
                      ...edit,
                      inclusions: lines.map((line, i) => ({
                        ...(edit.inclusions[i] ?? bi("", "")),
                        [lang]: line,
                      })),
                    });
                  }}
                />
              </Field>
            </div>
          ))}
        </div>
        <div className="form-two">
          <Field label={c.text("Price · QAR", "السعر · ر.ق")}>
            <NumberInput
              kind="decimal"
              min={0}
              required
              value={edit.price / 100}
              onChange={(e) =>
                setEdit({
                  ...edit,
                  price: Math.round(Number(e.target.value) * 100),
                })
              }
            />
          </Field>
          <Field
            label={c.text(
              "Duration · minutes (15–120)",
              "المدة · دقائق (١٥–١٢٠)",
            )}
          >
            <NumberInput
              min={15}
              max={120}
              required
              value={edit.duration}
              onChange={(e) =>
                setEdit({ ...edit, duration: Number(e.target.value) })
              }
            />
          </Field>
        </div>
        <Photo src={edit.image} alt="" className="editor-photo" />
        <ImagePicker
          value={edit.image}
          onChange={(image) => setEdit({ ...edit, image })}
          onError={setError}
        />
        <Field label={c.text("Availability", "الإتاحة")}>
          <select
            value={edit.active ? "active" : "inactive"}
            onChange={(e) =>
              setEdit({ ...edit, active: e.target.value === "active" })
            }
          >
            <option value="active">{c.text("Active", "نشط")}</option>
            <option value="inactive">{c.text("Inactive", "غير نشط")}</option>
          </select>
        </Field>
        <ErrorMessage message={error} />
        <button type="submit" className="button button--primary">
          {c.text("Save package", "احفظ الباقة")}
        </button>
      </form>
    </Modal>
  );
}
