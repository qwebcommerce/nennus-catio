import { OrderPage } from "@/features/orders/pages/OrderPage";
import "@/styles/account.css";

export default async function Page({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return <OrderPage reference={reference} />;
}
