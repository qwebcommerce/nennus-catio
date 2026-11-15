import { RelocationRequestDetailPage } from "@/features/relocation/pages/RelocationRequestDetailPage";
import "@/styles/account.css";

export default async function Page({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return <RelocationRequestDetailPage reference={reference} />;
}
