"use client";

import {
  type AdminSiteSettings,
  adminSiteSettingsSchema,
  formatPhone,
  type LocalisedText,
} from "@nennus-catio/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { ApiError } from "@/shared/api/client";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { errorMessage } from "@/shared/api/sessions";
import { siteSettingsQueryKey } from "@/shared/api/site-settings";
import { useAdminAccess } from "@/shared/access/AdminAccess";
import { useCopy } from "@/shared/lib/copy";
import { AdminPage, Field } from "@/shared/ui/BusinessUI";
import { Button } from "@/shared/ui/Button";
import { NumberInput } from "@/shared/ui/NumberInput";

export const adminSettingsKey = ["admin", "site-settings"] as const;

type Links = AdminSiteSettings["socialLinks"];
type Numbers = AdminSiteSettings["contact"];
type Draft = Pick<AdminSiteSettings, "headline" | "description" | "hours"> & {
  contact: Record<keyof Numbers, string>;
  socialLinks: Record<keyof Links, string>;
};

function toDraft(settings: AdminSiteSettings): Draft {
  const links = settings.socialLinks;
  const numbers = settings.contact;
  return {
    headline: settings.headline,
    description: settings.description,
    hours: settings.hours,
    // Shown as people read them; the API stores whatever is typed in international form (D232).
    contact: {
      phone: numbers.phone ? formatPhone(numbers.phone) : "",
      whatsapp: numbers.whatsapp ? formatPhone(numbers.whatsapp) : "",
    },
    socialLinks: {
      instagram: links.instagram ?? "",
      instagramGrooming: links.instagramGrooming ?? "",
      instagramProjects: links.instagramProjects ?? "",
      facebook: links.facebook ?? "",
    },
  };
}

/**
 * Real Settings editor (#5). Needs Settings View to open and Settings Create/Edit to save; the
 * version check turns two simultaneous edits into a conflict message instead of an overwrite.
 */
export function AdminSettingsApiPage() {
  const c = useCopy();
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  const access = useAdminAccess();
  const canEdit = access.can("settings", "edit");
  const settings = useQuery({
    queryKey: adminSettingsKey,
    queryFn: ({ signal }) => api.get("/admin/site-settings", adminSiteSettingsSchema, { signal }),
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    if (settings.data && draft === null) setDraft(toDraft(settings.data));
  }, [settings.data, draft]);

  const save = useMutation({
    mutationFn: (value: Draft) =>
      api.put("/admin/site-settings", { ...value, version: settings.data?.version }, adminSiteSettingsSchema),
    onSuccess: (saved) => {
      queryClient.setQueryData(adminSettingsKey, saved);
      setDraft(toDraft(saved));
      void queryClient.invalidateQueries({ queryKey: siteSettingsQueryKey });
    },
  });
  const conflict = save.error instanceof ApiError && save.error.code === "CONFLICT";

  function reload() {
    save.reset();
    setDraft(null);
    void settings.refetch();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft) save.mutate(draft);
  }

  const text = (key: "headline" | "description" | "hours", lang: "en" | "ar", label: string, multiline = false) => {
    if (!draft) return null;
    const value = (draft[key] as LocalisedText)[lang];
    const onChange = (next: string) => setDraft({ ...draft, [key]: { ...draft[key], [lang]: next } });
    return (
      <Field label={`${label} · ${lang === "en" ? "English" : "العربية"}`}>
        {multiline ? (
          <textarea value={value} readOnly={!canEdit} maxLength={500} dir={lang === "ar" ? "rtl" : "ltr"} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input value={value} readOnly={!canEdit} maxLength={200} dir={lang === "ar" ? "rtl" : "ltr"} onChange={(e) => onChange(e.target.value)} />
        )}
      </Field>
    );
  };

  const invalid = (path: string) =>
    save.error instanceof ApiError && save.error.code === "VALIDATION_FAILED" && path in save.error.fields ? true : undefined;

  const numberFields: { key: keyof Numbers; label: string }[] = [
    { key: "phone", label: c.text("Phone number", "رقم الهاتف") },
    { key: "whatsapp", label: c.text("WhatsApp number", "رقم واتساب") },
  ];

  const linkFields: { key: keyof Links; label: string }[] = [
    { key: "instagram", label: c.text("Shop Instagram", "إنستغرام المتجر") },
    { key: "instagramGrooming", label: c.text("Grooming Instagram", "إنستغرام العناية") },
    { key: "instagramProjects", label: c.text("Pet Houses & Projects Instagram", "إنستغرام بيوت الحيوانات والمشاريع") },
    { key: "facebook", label: "Facebook" },
  ];

  return (
    <AdminPage
      module="settings"
      title={c.text("Settings & Content", "الإعدادات والمحتوى")}
      subtitle={c.text(
        "Text and links shown on the public website. Saved changes appear on the site within about a minute.",
        "النصوص والروابط المعروضة على الموقع. تظهر التغييرات المحفوظة على الموقع خلال دقيقة تقريباً.",
      )}
    >
      {settings.isPending || !draft ? (
        settings.isError ? (
          <div className="form-error" role="alert">
            <p>{errorMessage(settings.error, c.text)}</p>
            <Button variant="secondary" onClick={() => void settings.refetch()}>
              {c.text("Retry", "أعد المحاولة")}
            </Button>
          </div>
        ) : (
          <p role="status" aria-busy="true" className="muted">
            {c.text("Loading settings…", "جارٍ تحميل الإعدادات…")}
          </p>
        )
      ) : (
        <form className="panel form-stack settings-form" onSubmit={submit}>
          {!canEdit && (
            <p className="note-box">
              {c.text("Your role can view these settings but not change them.", "يمكن لدورك عرض هذه الإعدادات دون تعديلها.")}
            </p>
          )}
          <div className="admin-setting-heading">
            <h2>{c.text("Business content", "محتوى النشاط")}</h2>
          </div>
          <div className="form-two">
            {(["en", "ar"] as const).map((lang) => (
              <div key={lang}>
                {text("headline", lang, c.text("Homepage headline", "عنوان الصفحة الرئيسية"))}
                {text("description", lang, c.text("Description", "الوصف"), true)}
                {text("hours", lang, c.text("Opening hours", "ساعات العمل"))}
              </div>
            ))}
          </div>
          <div className="admin-setting-heading">
            <h2>{c.text("Phone & WhatsApp", "الهاتف وواتساب")}</h2>
            <p className="small muted" id="settings-numbers-hint">
              {c.text(
                "Shown on the Contact page. A Qatari number (4444 5555), or another country's with + and its code. Leave a field empty to hide it. WhatsApp also receives custom Pet House inquiries.",
                "تظهر في صفحة التواصل. رقم قطري (4444 5555)، أو رقم دولة أخرى مع + ورمزها. اترك الحقل فارغاً لإخفائه. يستقبل واتساب أيضاً طلبات بيوت الحيوانات المخصصة.",
              )}
            </p>
          </div>
          <div className="form-two">
            {numberFields.map((field) => (
              <Field key={field.key} label={field.label}>
                <NumberInput
                  kind="phone"
                  dir="ltr"
                  autoComplete="off"
                  placeholder="+974 4444 5555"
                  readOnly={!canEdit}
                  maxLength={20}
                  aria-describedby="settings-numbers-hint"
                  aria-invalid={invalid(`contact.${field.key}`)}
                  value={draft.contact[field.key]}
                  onChange={(e) => setDraft({ ...draft, contact: { ...draft.contact, [field.key]: e.target.value } })}
                />
              </Field>
            ))}
          </div>
          <div className="admin-setting-heading">
            <h2>{c.text("Social links", "روابط التواصل الاجتماعي")}</h2>
            <p className="small muted">
              {c.text(
                "Full https:// links. Leave a field empty to hide that link on the website.",
                "روابط كاملة تبدأ بـ https://. اترك الحقل فارغاً لإخفاء الرابط من الموقع.",
              )}
            </p>
          </div>
          {linkFields.map((field) => (
            <Field key={field.key} label={`${field.label} · HTTPS`}>
              <input
                type="url"
                dir="ltr"
                placeholder="https://"
                readOnly={!canEdit}
                maxLength={500}
                aria-invalid={invalid(`socialLinks.${field.key}`)}
                value={draft.socialLinks[field.key]}
                onChange={(e) => setDraft({ ...draft, socialLinks: { ...draft.socialLinks, [field.key]: e.target.value } })}
              />
            </Field>
          ))}
          {save.isError && (
            <div className="form-error" role="alert">
              <p>
                {conflict
                  ? c.text(
                      "Someone else saved the settings while you were editing. Reload to see their changes, then make yours again.",
                      "حفظ شخص آخر الإعدادات أثناء تعديلك. أعد التحميل لرؤية تغييراته ثم أعد تعديلاتك.",
                    )
                  : save.error instanceof ApiError && save.error.code === "VALIDATION_FAILED"
                    ? Object.keys(save.error.fields).some((path) => path.startsWith("contact."))
                      ? c.text(
                          "Please check the highlighted numbers: a Qatari number, or + and the country code (for example +63 912 345 6789).",
                          "يرجى التحقق من الأرقام المحددة: رقم قطري، أو علامة + ثم رمز الدولة والرقم.",
                        )
                      : c.text("Please use full https:// links for the highlighted fields.", "يرجى استخدام روابط https:// كاملة للحقول المحددة.")
                    : errorMessage(save.error, c.text)}
              </p>
              {conflict && (
                <Button variant="secondary" onClick={reload}>
                  {c.text("Reload settings", "أعد تحميل الإعدادات")}
                </Button>
              )}
            </div>
          )}
          {save.isSuccess && (
            <p role="status">{c.text("Saved.", "تم الحفظ.")}</p>
          )}
          {canEdit && (
            <div>
              <button type="submit" className="button button--primary" disabled={save.isPending}>
                {c.text("Save settings", "احفظ الإعدادات")}
              </button>
            </div>
          )}
        </form>
      )}
    </AdminPage>
  );
}
