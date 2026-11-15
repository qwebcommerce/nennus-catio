import { OrderConfirmationPage } from "@/features/checkout/pages/OrderConfirmationPage";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderConfirmationPage id={id} />;
}
