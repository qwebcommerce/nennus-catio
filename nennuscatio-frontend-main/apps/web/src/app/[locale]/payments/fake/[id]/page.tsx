import { notFound } from "next/navigation";
import { FakePaymentPage } from "@/features/payments/pages/FakePaymentPage";
import "@/styles/account.css";

/**
 * The fake payment company's page (8b): development only. Outside the shop's layout, like a real
 * provider's page; production builds have no fake gateway (8a-2), so this route is not found there.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { id } = await params;
  return <FakePaymentPage id={id} />;
}
