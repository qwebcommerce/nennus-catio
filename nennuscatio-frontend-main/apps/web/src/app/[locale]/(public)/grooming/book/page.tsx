import { redirect } from "@/i18n/navigation";

/** Old links ("Book a Service", bookmarks): booking happens in the steps on the grooming page (9e). */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: "/grooming#grooming-steps", locale });
}
