"use client";

import { productListResponseSchema, type PublicProduct } from "@nennus-catio/contracts";
import { useQuery } from "@tanstack/react-query";
import type { Pet, Product } from "@/mocks/data/business";
import type { HouseCollection } from "@/mocks/data/pet-houses";
import type { ApiClient } from "./client";
import { useRepositories } from "./DataSourceProvider";

/**
 * Catalogue repository (#6). Pages keep using the existing `Product` shape; the HTTP version maps
 * the public API contract onto it. Seeded items keep their prototype ids (slug → id, pack code →
 * variant id), so the sample cart and checkout keep working until #7 (D107).
 */
export interface CatalogRepository {
  listProducts(signal?: AbortSignal): Promise<Product[]>;
}

export const catalogProductsKey = ["catalog", "products"] as const;

export function toWebProduct(product: PublicProduct): Product {
  const [first, ...rest] = product.images;
  return {
    id: product.slug,
    brand: product.brand ?? undefined,
    featured: product.featured,
    bestSeller: product.bestSeller,
    name: product.name,
    description: product.description,
    category: product.category,
    pet: (product.petTypes[0] ?? "pets") as Pet,
    pets: product.petTypes as Pet[],
    image: first?.url ?? "",
    gallery: rest.map((image, index) => ({ id: `${product.slug}-${index + 1}`, src: image.url })),
    active: true,
    variants: product.variants.map((variant) => ({
      id: variant.code,
      label: variant.label,
      sku: variant.sku,
      unit: variant.weightGrams === null ? "piece" : "weight",
      price: variant.price,
      salePrice: variant.salePrice,
      stock: variant.stock,
    })),
    offers: product.offers,
    house: product.house
      ? {
          collection: product.house.collection as HouseCollection,
          purchaseMode: product.house.purchaseMode,
          availability: product.house.availability,
          dimensions: product.house.dimensions ? { ...product.house.dimensions, unit: "cm" } : null,
          features: product.house.features,
          leadTime: product.house.leadTime,
          deliveryFee: product.house.deliveryFee,
          fulfilment: product.house.fulfilment,
          provisional: product.house.provisional,
          source: product.house.source ?? undefined,
        }
      : undefined,
  };
}

export function createHttpCatalogRepository(client: ApiClient): CatalogRepository {
  return {
    async listProducts(signal) {
      const { products } = await client.get("/catalog/products", productListResponseSchema, { signal });
      return products.map(toWebProduct);
    },
  };
}

export type CatalogStatus = "loading" | "error" | "ready";

/** The public catalogue. While loading or failed, `products` is empty and `status` says why. */
export function useCatalog(): { status: CatalogStatus; products: Product[]; retry: () => void } {
  const { catalog } = useRepositories();
  const query = useQuery({
    queryKey: catalogProductsKey,
    queryFn: ({ signal }) => catalog.listProducts(signal),
  });
  return {
    status: query.isPending ? "loading" : query.isError ? "error" : "ready",
    products: query.data ?? [],
    retry: () => void query.refetch(),
  };
}
