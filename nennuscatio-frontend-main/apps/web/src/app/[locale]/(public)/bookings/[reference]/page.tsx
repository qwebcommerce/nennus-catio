import { GroomingBookingPage } from "@/features/grooming/pages/GroomingBookingPage";
import "@/styles/account.css";

export default async function Page({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return <GroomingBookingPage reference={reference} />;
}
