"use client";

import {
  type AdminCategory,
  type VariantOverrideRequest,
  adminCategoryListResponseSchema,
  adminCategorySchema,
  type AdminProduct,
  adminProductListResponseSchema,
  adminProductSchema,
  type Category,
  categoryListResponseSchema,
  mediaUploadResponseSchema,
  type SaveProductRequest,
} from "@nennus-catio/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { MockError } from "@/mocks/adapters/business-repository";
import { categories as mockCategories, type Pet, type Product } from "@/mocks/data/business";
import type { HouseCollection } from "@/mocks/data/pet-houses";
import { repo, useBusiness } from "@/mocks/MockDataProvider";
import { adminPosKey } from "./admin-pos";
import { catalogProductsKey } from "./catalog";
import { ApiError, CSRF_HEADER } from "./client";
import { useRepositories } from "./DataSourceProvider";

/**
 * Admin catalogue (6b). In `api` mode the admin Catalogue reads and saves through the API; in
 * `mock` mode (development only) it keeps editing the in-memory demo exactly as before.
 */
export const adminProductsKey = ["admin", "catalog", "products"] as const;
export const adminCategoriesKey = ["admin", "catalog", "categories"] as const;
export const publicCategoriesKey = ["catalog", "categories"] as const;

export function toWebAdminProduct(product: AdminProduct): Product {
  const [first, ...rest] = product.images;
  return {
    id: product.slug,
    serverId: product.id,
    version: product.version,
    isSample: product.isSample,
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
    active: product.active,
    variants: product.variants.map((variant) => ({
      id: variant.code,
      serverId: variant.id,
      label: variant.label,
      sku: variant.sku,
      unit: variant.weightGrams === null ? "piece" : "weight",
      weightGrams: variant.weightGrams,
      price: variant.price,
      stock: variant.stock,
      lowStock: variant.lowStockThreshold ?? undefined,
      active: variant.active,
      pos: variant.pos,
    })),
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

/** The editor's `Product` → the API request. Packs that existed when editing began keep their code. */
export function toSaveRequest(product: Product, initial: Product | null): SaveProductRequest {
  const existingCodes = new Set(initial?.variants.map((variant) => variant.id) ?? []);
  const alt = { en: product.name.en.slice(0, 200), ar: product.name.ar.slice(0, 200) };
  return {
    ...(product.version !== undefined ? { version: product.version } : {}),
    category: product.category,
    // Houses suit one pet (their design collections depend on it); products may suit several,
    // with the main pet always first.
    petTypes: product.house ? [product.pet] : [...new Set([product.pet, ...(product.pets ?? [])])],
    brand: product.brand ?? "",
    name: product.name,
    description: product.description,
    active: product.active,
    featured: product.featured ?? false,
    bestSeller: product.bestSeller ?? false,
    images: [product.image, ...(product.gallery ?? []).map((photo) => photo.src)]
      .filter((url) => url.trim() !== "")
      .map((url) => ({ url, alt })),
    variants: product.variants.map((variant) => ({
      ...(existingCodes.has(variant.id) ? { code: variant.id } : {}),
      sku: variant.sku,
      label: variant.label,
      weightGrams: variant.unit === "weight" ? (variant.weightGrams ?? null) : null,
      price: variant.price,
      stock: variant.stock,
      lowStockThreshold: variant.lowStock ?? null,
      // The pack's own on/off, unchanged: a pack the POS switched off stays off (#16 part 2c).
      active: variant.active ?? true,
    })),
    house: product.house
      ? {
          collection: product.house.collection,
          purchaseMode: product.house.purchaseMode,
          availability: product.house.availability,
          dimensions: product.house.dimensions
            ? {
                height: product.house.dimensions.height,
                width: product.house.dimensions.width,
                depth: product.house.dimensions.depth,
              }
            : null,
          features: product.house.features,
          leadTime: product.house.leadTime,
          deliveryFee: product.house.deliveryFee,
          fulfilment: product.house.fulfilment,
          provisional: product.house.provisional,
          source: product.house.source ?? null,
        }
      : null,
  };
}

const okSchema = z.object({ status: z.literal("ok") });

/**
 * Uploads one image; the API checks and re-encodes it and returns its address. Grooming package
 * photos use `/api/admin/grooming/media`, which follows the Grooming packages permission (9a).
 */
export async function uploadImage(file: File, path = "/api/admin/media"): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { [CSRF_HEADER]: "1", Accept: "application/json" },
      credentials: "same-origin",
      body: form,
    });
  } catch {
    throw new ApiError("NETWORK", "The server could not be reached.");
  }
  if (response.status === 413) throw new ApiError("VALIDATION_FAILED", "Images must be 5 MB or smaller.", 413);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { message?: string } | null)?.message ?? "The image could not be uploaded.";
    throw new ApiError(response.status === 403 ? "FORBIDDEN" : "VALIDATION_FAILED", message, response.status);
  }
  return mediaUploadResponseSchema.parse(body).url;
}

/** Turns an API failure into one readable line plus the field problems the API named. */
export function describeSaveError(error: unknown, text: (en: string, ar: string) => string): string {
  if (error instanceof MockError) return error.message;
  if (!(error instanceof ApiError)) return text("Please try again.", "يرجى المحاولة مرة أخرى.");
  if (error.code === "CONFLICT" && Object.keys(error.fields).length === 0) {
    return text(
      "Someone else saved this product while you were editing. Close the editor and open it again to see their changes.",
      "حفظ شخص آخر هذا المنتج أثناء تعديلك. أغلق المحرر وافتحه مجدداً لرؤية التغييرات.",
    );
  }
  // The editor never changes a managed pack's SKU, price or on/off, so this refusal means the POS (or the
  // owner's "Edit anyway") changed one while the editor was open, or linked the pack meanwhile (#16 part 2c).
  if (error.code === "CONFLICT" && Object.values(error.fields).some((message) => message.includes("follows POS item"))) {
    return text(
      "The POS updated a pack of this product while you were editing. Close the editor and open it again to see the latest values from the POS, then make your changes again.",
      "حدّث نظام نقطة البيع عبوة من هذا المنتج أثناء تعديلك. أغلق المحرر وافتحه مجدداً لرؤية أحدث القيم من نظام نقطة البيع، ثم أعد تعديلاتك.",
    );
  }
  const details = Object.entries(error.fields).map(([path, message]) => `${path}: ${message}`);
  return [error.message, ...details].join(" · ");
}

export interface AdminCatalog {
  readonly source: "api" | "mock";
  readonly status: "loading" | "error" | "ready";
  readonly products: Product[];
  retry(): void;
  /** Creates (no serverId) or updates a product; `initial` is the product as editing began. */
  saveProduct(product: Product, initial: Product | null): Promise<void>;
  deleteProduct(product: Product): Promise<void>;
  adjustStock(variantServerId: string, change: number, reason: string): Promise<void>;
  /** The owner's "Edit anyway" on a pack the POS manages (#16 part 2b/2c); answers the product as saved. */
  overridePack(variantServerId: string, change: VariantOverrideRequest): Promise<Product>;
}

/** Products and Pet Houses for the admin Catalogue, from the API or (mock mode) the demo store. */
export function useAdminCatalog(): AdminCatalog {
  const { source, api } = useRepositories();
  const queryClient = useQueryClient();
  const demo = useBusiness();
  const query = useQuery({
    queryKey: adminProductsKey,
    queryFn: async ({ signal }) =>
      (await api.get("/admin/catalog/products", adminProductListResponseSchema, { signal })).products.map(toWebAdminProduct),
    enabled: source === "api",
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminProductsKey }),
      queryClient.invalidateQueries({ queryKey: catalogProductsKey }),
      // A pack saved with a POS code follows it at once: the POS items list changes (#16 part 2c).
      queryClient.invalidateQueries({ queryKey: adminPosKey }),
    ]);
  };
  if (source === "mock") {
    return {
      source,
      status: "ready",
      products: demo.products,
      retry: () => undefined,
      saveProduct: async (product) => repo.saveProduct(product),
      deleteProduct: async (product) => repo.archiveProduct(product.id),
      adjustStock: async () => undefined,
      overridePack: async () => {
        throw new MockError("VALIDATION", "The POS is connected in API mode only.");
      },
    };
  }
  return {
    source,
    status: query.isPending ? "loading" : query.isError ? "error" : "ready",
    products: query.data ?? [],
    retry: () => void query.refetch(),
    async saveProduct(product, initial) {
      const body = toSaveRequest(product, initial);
      if (product.serverId) await api.put(`/admin/catalog/products/${product.serverId}`, body, adminProductSchema);
      else await api.post("/admin/catalog/products", body, adminProductSchema);
      await refresh();
    },
    async deleteProduct(product) {
      if (!product.serverId) return;
      await api.delete(`/admin/catalog/products/${product.serverId}`, okSchema);
      await refresh();
    },
    async adjustStock(variantServerId, change, reason) {
      await api.post(`/admin/catalog/variants/${variantServerId}/stock`, { change, reason }, adminProductSchema);
      await refresh();
    },
    async overridePack(variantServerId, change) {
      const saved = await api.post(`/admin/catalog/variants/${variantServerId}/override`, change, adminProductSchema);
      await refresh();
      return toWebAdminProduct(saved);
    },
  };
}

/** Admin category list (api mode) — includes hidden categories and product counts. */
export function useAdminCategories() {
  const { source, api } = useRepositories();
  return useQuery({
    queryKey: adminCategoriesKey,
    queryFn: async ({ signal }) =>
      (await api.get("/admin/catalog/categories", adminCategoryListResponseSchema, { signal })).categories,
    enabled: source === "api",
  });
}

/**
 * Category choices for the admin: every category from the API (hidden ones too) in api mode, the
 * demo's fixed list in mock mode. Shaped like the prototype's `{ id, name }` entries.
 */
export function useCategoryOptions(): { id: string; name: { en: string; ar: string } }[] {
  const { source } = useRepositories();
  const query = useAdminCategories();
  if (source === "mock") return mockCategories;
  return (query.data ?? []).map((category) => ({ id: category.slug, name: category.name }));
}

export function useSaveCategory() {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ category, name, sortOrder, active }: {
      category: AdminCategory | null;
      name: { en: string; ar: string };
      sortOrder: number;
      active: boolean;
    }) => {
      const body = { name, sortOrder, active };
      // The answer is checked against the contract like every other admin save (review L13).
      if (category) await api.put(`/admin/catalog/categories/${category.id}`, body, adminCategorySchema);
      else await api.post("/admin/catalog/categories", body, adminCategorySchema);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminCategoriesKey }),
        queryClient.invalidateQueries({ queryKey: publicCategoriesKey }),
        queryClient.invalidateQueries({ queryKey: catalogProductsKey }),
      ]);
    },
  });
}

export function useDeleteCategory() {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (category: AdminCategory) => api.delete(`/admin/catalog/categories/${category.id}`, okSchema),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminCategoriesKey }),
        queryClient.invalidateQueries({ queryKey: publicCategoriesKey }),
      ]);
    },
  });
}

/**
 * Category options: the API's list in api mode (so new categories appear), the demo list in mock
 * mode. Shaped like the prototype's `{ id, name }` entries.
 */
export function usePublicCategories(): { id: string; name: { en: string; ar: string } }[] {
  const { source, api } = useRepositories();
  const query = useQuery({
    queryKey: publicCategoriesKey,
    queryFn: async ({ signal }) =>
      (await api.get("/catalog/categories", categoryListResponseSchema, { signal })).categories,
    enabled: source === "api",
  });
  if (source === "mock") return mockCategories;
  return (query.data ?? ([] as Category[])).map((category) => ({ id: category.slug, name: category.name }));
}
