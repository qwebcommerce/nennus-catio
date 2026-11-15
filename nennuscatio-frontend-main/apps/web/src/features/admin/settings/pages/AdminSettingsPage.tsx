"use client";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useDemoIdentity } from "@/layouts/global/GlobalProviders";
import { useBusiness, repo, useCart } from "@/mocks/MockDataProvider";
import { useCopy } from "@/shared/lib/copy";
import type { Settings } from "@/mocks/data/business";
import { MockError } from "@/mocks/adapters/business-repository";
import { AdminPage, Field, ErrorMessage, Modal } from "@/shared/ui/BusinessUI";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { AdminSettingsApiPage } from "./AdminSettingsApiPage";
/** Mock-mode demo (development only, NEXT_PUBLIC_DATA_SOURCE=mock). */
function AdminSettingsDemoPage() {
  const c = useCopy(),
    d = useBusiness(),
    { setCart } = useCart();
  const { role } = useDemoIdentity();
  const [draft, setDraft] = useState<Settings>(structuredClone(d.settings)),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [reset, setReset] = useState(false);
  function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      repo.saveSettings(draft);
      setError("");
      setMessage(
        c.text(
          "Saved. The public site now uses these mock content settings.",
          "تم الحفظ. يستخدم الموقع العام هذه الإعدادات التجريبية.",
        ),
      );
    } catch (err) {
      setError(
        c.ar && err instanceof MockError && err.code === "WHATSAPP"
          ? "استخدم رابط https://wa.me/ بالرقم الدولي للعمل، أو رابط api.whatsapp.com/send مع رقم الهاتف."
          : err instanceof Error
            ? err.message
            : "Please retry",
      );
    }
  }
  return (
    <AdminPage
      module="settings"
      title={c.text("Settings & Content", "الإعدادات والمحتوى")}
      subtitle={c.text(
        "Edit public copy and social links in administration only.",
        "عدّل المحتوى والروابط الاجتماعية من الإدارة فقط.",
      )}
    >
      <nav
        className="admin-tabs"
        aria-label={c.text("Settings sections", "أقسام الإعدادات")}
      >
        <a href="#public-content" aria-current="page">
          {c.text("General & content", "العامة والمحتوى")}
        </a>
        <a href="#social-links">
          {c.text("Social links", "الروابط الاجتماعية")}
        </a>
        {role === "owner" && (
          <Link href="/admin/team">
            {c.text("Team & access", "الفريق والصلاحيات")}
          </Link>
        )}
        <a href="#integrations">{c.text("Integrations", "التكاملات")}</a>
      </nav>
      <form className="panel form-stack settings-form" onSubmit={save}>
        <div id="public-content" className="admin-setting-heading">
          <h2>{c.text("Business content", "محتوى النشاط")}</h2>
          <p className="small muted">
            {c.text(
              "Homepage text and opening-hours copy shown to customers. Confirm final business details before launch.",
              "نص الصفحة الرئيسية وساعات العمل المعروضة للعملاء. أكد التفاصيل النهائية قبل الإطلاق.",
            )}
          </p>
        </div>
        <div className="form-two">
          {(["en", "ar"] as const).map((lang) => (
            <div key={lang}>
              <Field
                label={`${c.text("Homepage headline", "عنوان الصفحة الرئيسية")} · ${lang}`}
              >
                <input
                  required
                  value={draft.headline[lang]}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      headline: { ...draft.headline, [lang]: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label={`${c.text("Description", "الوصف")} · ${lang}`}>
                <textarea
                  required
                  value={draft.description[lang]}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      description: {
                        ...draft.description,
                        [lang]: e.target.value,
                      },
                    })
                  }
                />
              </Field>
              <Field
                label={`${c.text("Opening hours", "ساعات العمل")} · ${lang}`}
              >
                <input
                  value={draft.hours[lang]}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      hours: { ...draft.hours, [lang]: e.target.value },
                    })
                  }
                />
              </Field>
            </div>
          ))}
        </div>
        <div id="social-links" className="admin-setting-heading">
          <h2>{c.text("Social & contact links", "روابط التواصل")}</h2>
          <p className="small muted">
            {c.text(
              "These links can be changed here without editing the website code.",
              "يمكن تغيير هذه الروابط هنا دون تعديل كود الموقع.",
            )}
          </p>
        </div>
        {[
          { key: "instagram", label: "Instagram" },
          {
            key: "instagramGrooming",
            label: c.text("Grooming Instagram", "إنستغرام العناية"),
          },
          { key: "facebook", label: "Facebook" },
          { key: "instagramProjects", label: c.text("Pet Houses & Projects Instagram", "إنستغرام بيوت الحيوانات والمشاريع") },
          { key: "whatsapp", label: "WhatsApp" },
        ].map((f) => (
          <Field key={f.key} label={`${f.label} · HTTPS`}>
            <input
              type="url"
              dir="ltr"
              placeholder="https://"
              value={draft[f.key as "instagram"] ?? ""}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            />
          </Field>
        ))}
        <p className="small muted">
          {c.text(
            "WhatsApp also controls custom Pet House inquiries. Use a wa.me link with the business international number; no messages are sent automatically. ",
            "يتحكم واتساب أيضاً في استفسارات بيوت الحيوانات المخصصة. استخدم رابط wa.me بالرقم الدولي للعمل؛ لا تُرسل رسائل تلقائياً. ",
          )}
          {c.text(
            "Leave empty to keep the public placeholder inactive. No newsletter or messaging integration.",
            "اتركه فارغاً لإبقاء الرابط غير نشط. لا تكامل رسائل أو نشرات.",
          )}
        </p>
        <ErrorMessage message={error} />
        <p role="status">{message}</p>
        <div>
          <button type="submit" className="button button--primary">
            {c.text("Save settings", "احفظ الإعدادات")}
          </button>
        </div>
      </form>
      <section id="integrations" className="panel admin-settings-integration">
        <h2>{c.text("Integrations", "التكاملات")}</h2>
        <p>
          {c.text(
            "No live payment gateway, POS, external calendar or messaging integration is connected to this frontend prototype. Technical requirements and access must be reviewed before implementing any of them.",
            "لا توجد بوابة دفع أو نقطة بيع أو تقويم خارجي أو تكامل رسائل متصل بهذه المعاينة. يجب مراجعة المتطلبات والصلاحيات التقنية قبل تنفيذ أي منها.",
          )}
        </p>
      </section>
      <section className="panel reset-panel">
        <h2>{c.text("Reset demo data", "إعادة البيانات التجريبية")}</h2>
        <p className="muted">
          {c.text(
            "Restores all synthetic records and clears your cart. A full browser refresh also resets this in-memory demo.",
            "يعيد جميع السجلات التجريبية ويفرغ السلة. تحديث المتصفح يعيد النسخة أيضاً.",
          )}
        </p>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => setReset(true)}
        >
          {c.text("Reset demo", "إعادة النسخة")}
        </button>
      </section>
      <Modal
        open={reset}
        onOpenChange={setReset}
        title={c.text("Reset this demo?", "إعادة هذه النسخة؟")}
      >
        <p>
          {c.text(
            "All mock edits, orders and bookings in this browser session will be replaced with the seed data.",
            "ستُستبدل جميع تعديلات وطلبات وحجوزات الجلسة بالبيانات الأولية.",
          )}
        </p>
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            repo.reset();
            setCart([]);
            setDraft(structuredClone(repo.getSnapshot().settings));
            setReset(false);
            setMessage(c.text("Demo reset.", "تمت الإعادة."));
          }}
        >
          {c.text("Confirm reset", "أكد الإعادة")}
        </button>
      </Modal>
    </AdminPage>
  );
}

/** API mode: the real editor (#5). Mock mode keeps the original demo with its reset button. */
export function AdminSettingsPage() {
  const { source } = useRepositories();
  return source === "api" ? <AdminSettingsApiPage /> : <AdminSettingsDemoPage />;
}
