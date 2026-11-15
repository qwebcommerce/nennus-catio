"use client";
import { Info } from "lucide-react";
import { useCopy } from "@/shared/lib/copy";

/** Shown at the top of every admin page that still runs on sample data in API mode (D141). */
export function SampleDataBanner({ branch, what }: { branch: number; what: { en: string; ar: string } }) {
  const c = useCopy();
  return (
    <div className="note-box sample-data-banner" role="note">
      <Info size={16} aria-hidden="true" />
      <p>
        <strong>{c.text("Sample data.", "بيانات تجريبية.")}</strong>{" "}
        {c.text(
          `This page shows demonstration figures until branch #${branch} (${what.en}) is built. Nothing shown here is real.`,
          `تعرض هذه الصفحة أرقاماً توضيحية إلى أن يُبنى الفرع #${branch} (${what.ar}). لا شيء هنا حقيقي.`,
        )}
      </p>
    </div>
  );
}
