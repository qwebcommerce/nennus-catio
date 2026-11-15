/** Browser-safe contracts. These are not database models or authentication claims. */
export type Locale = "en" | "ar";
export type LocalisedText = Readonly<Record<Locale, string>>;
export type DemoRole = "owner" | "core" | "finance";
export type ModuleId =
  | "dashboard" | "products" | "orders" | "deliverySlots"
  | "groomingPackages" | "groomingCalendar" | "bookings"
  | "customers" | "finance" | "settings" | "team"
  | "dispatch" | "promotions" | "relocation"
  /** The owner's Integrations page (#16 part 2c): owner-only like "team", not a permission module. */
  | "integrations";
export type FoundationAreaId = ModuleId | "shop" | "grooming" | "cart";
/** Prototype placeholder content; superseded for the public shell by PublicSiteSettings. */
export interface SiteContent {
  brand: LocalisedText;
  description: LocalisedText;
  currency: "QAR";
  timeZone: "Asia/Qatar";
  socialLinks: Readonly<{ instagram: string | null; facebook: string | null; whatsapp: string | null }>;
}
export interface FoundationArea {
  id: FoundationAreaId;
  readyInPhase: 3 | 4 | 5;
  steps: readonly LocalisedText[];
}
export interface FoundationRepository {
  getSiteContent(signal?: AbortSignal): Promise<SiteContent>;
  getArea(id: FoundationAreaId, signal?: AbortSignal): Promise<FoundationArea>;
}
export type DomainErrorCode = "NOT_FOUND" | "UNAVAILABLE" | "FORBIDDEN";
export interface DomainError { code: DomainErrorCode; message: string }

export * from "./api-error.js";
export * from "./access.js";
export * from "./account.js";
export * from "./admin-bookings.js";
export * from "./admin-customers.js";
export * from "./admin-orders.js";
export * from "./admin-pos.js";
export * from "./auth.js";
export * from "./bookings.js";
export * from "./catalog.js";
export * from "./dashboard.js";
export * from "./delivery.js";
export * from "./downloads.js";
export * from "./finance.js";
export * from "./grooming.js";
export * from "./orders.js";
export * from "./payments.js";
export * from "./pos.js";
export * from "./promotions.js";
export * from "./relocation.js";
export * from "./site-settings.js";
