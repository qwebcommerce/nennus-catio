"use client";
import { useCatalog } from "@/shared/api/catalog";
import { useCopy } from "@/shared/lib/copy";
import { Link } from "@/i18n/navigation";
import { Empty } from "@/shared/ui/BusinessUI";
import { CatalogState } from "@/shared/ui/CatalogState";
import { HouseDetails } from "../components/HouseDetails";

export function PetHousePage({ id }: { id: string }) {
  const c = useCopy();
  const catalog = useCatalog();
  if (catalog.status !== "ready") {
    return (
      <div className="customer-page">
        <CatalogState status={catalog.status} retry={catalog.retry} />
      </div>
    );
  }
  const house = catalog.products.find(
    (product) =>
      product.id === id &&
      product.active &&
      product.category === "pet-houses" &&
      product.house,
  );
  if (!house)
    return (
      <div className="customer-page">
        <Empty>
          {c.text("This house model is unavailable.", "هذا التصميم غير متاح.")}
          <Link href="/pet-houses" className="text-link">
            {c.text("Return to Pet Houses", "العودة إلى بيوت الحيوانات")}
          </Link>
        </Empty>
      </div>
    );
  return <HouseDetails key={house.id} product={house} />;
}
