import { PetHousePage } from "@/features/pet-houses/pages/PetHousePage";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PetHousePage id={id} />;
}
