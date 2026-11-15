import {
  type AdminGroomingGroup,
  type AdminGroomingPackage,
  type SaveGroomingGroupRequest,
  type SaveGroomingPackageRequest,
  skuSchema,
} from "@nennus-catio/contracts";
import { parseQar, qarInput } from "@/features/admin/orders/lib/payment-labels";

/**
 * The pet group form (9a): texts, the optional age range (months), order and on/off. The weight range
 * (kg) is no longer shown (D246); it is kept from the stored group and saved back unchanged.
 */
export type GroupDraft = {
  group: AdminGroomingGroup | null;
  nameEn: string;
  nameAr: string;
  audienceEn: string;
  audienceAr: string;
  minAge: string;
  maxAge: string;
  minKg: string;
  maxKg: string;
  sortOrder: number;
  active: boolean;
};

/**
 * The package form: texts, what is included (one per line), price in QAR, length, photo, the POS
 * item code (#16 part 2a, empty = none), order, on/off.
 */
export type PackageDraft = {
  item: AdminGroomingPackage | null;
  groupId: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  includedEn: string;
  includedAr: string;
  priceQar: string;
  minutes: string;
  image: string;
  code: string;
  sortOrder: number;
  active: boolean;
};

const text = (value: number | null) => (value === null ? "" : String(value));
/** Grams as the kg staff type: 2500 → "2.5". */
const kgText = (grams: number | null) => (grams === null ? "" : String(grams / 1000));

export function groupDraft(group: AdminGroomingGroup | null, nextOrder: number): GroupDraft {
  return group
    ? {
        group,
        nameEn: group.name.en,
        nameAr: group.name.ar,
        audienceEn: group.audience.en,
        audienceAr: group.audience.ar,
        minAge: text(group.ageMonths.min),
        maxAge: text(group.ageMonths.max),
        minKg: kgText(group.weightGrams.min),
        maxKg: kgText(group.weightGrams.max),
        sortOrder: group.sortOrder,
        active: group.active,
      }
    : { group: null, nameEn: "", nameAr: "", audienceEn: "", audienceAr: "", minAge: "", maxAge: "", minKg: "", maxKg: "", sortOrder: nextOrder, active: true };
}

export function packageDraft(item: AdminGroomingPackage | null, groupId: string, nextOrder: number): PackageDraft {
  return item
    ? {
        item,
        groupId: item.groupId,
        nameEn: item.name.en,
        nameAr: item.name.ar,
        descriptionEn: item.description.en,
        descriptionAr: item.description.ar,
        includedEn: item.included.en.join("\n"),
        includedAr: item.included.ar.join("\n"),
        priceQar: qarInput(item.price),
        minutes: String(item.durationMinutes),
        image: item.image ?? "",
        code: item.code ?? "",
        sortOrder: item.sortOrder,
        active: item.active,
      }
    : {
        item: null,
        groupId,
        nameEn: "",
        nameAr: "",
        descriptionEn: "",
        descriptionAr: "",
        includedEn: "",
        includedAr: "",
        priceQar: "",
        minutes: "60",
        image: "",
        code: "",
        sortOrder: nextOrder,
        active: true,
      };
}

/** Empty is "no limit" (null); otherwise a whole number of months. Undefined when it is not one. */
export function parseMonths(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return /^\d{1,3}$/.test(trimmed) ? Number(trimmed) : undefined;
}

/** Empty is "no limit" (null); otherwise kg with up to 3 decimals, as grams. Undefined when it is not one. */
export function parseKg(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const match = /^(\d{1,3})(?:\.(\d{1,3}))?$/.exec(trimmed);
  if (!match) return undefined;
  return Number(match[1]) * 1000 + Number((match[2] ?? "").padEnd(3, "0"));
}

const lines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** The request, or the name of the first field that cannot be read. */
export function groupRequest(draft: GroupDraft): SaveGroomingGroupRequest | { invalid: "age" | "weight" } {
  const minAge = parseMonths(draft.minAge);
  const maxAge = parseMonths(draft.maxAge);
  if (minAge === undefined || maxAge === undefined) return { invalid: "age" };
  const minWeight = parseKg(draft.minKg);
  const maxWeight = parseKg(draft.maxKg);
  if (minWeight === undefined || maxWeight === undefined || minWeight === 0 || maxWeight === 0) return { invalid: "weight" };
  return {
    name: { en: draft.nameEn, ar: draft.nameAr },
    audience: { en: draft.audienceEn, ar: draft.audienceAr },
    ageMonths: { min: minAge, max: maxAge },
    weightGrams: { min: minWeight, max: maxWeight },
    sortOrder: draft.sortOrder,
    active: draft.active,
  };
}

export function packageRequest(draft: PackageDraft): SaveGroomingPackageRequest | { invalid: "price" | "minutes" | "code" } {
  const price = parseQar(draft.priceQar);
  if (price === null || price <= 0) return { invalid: "price" };
  const minutes = /^\d{1,3}$/.test(draft.minutes.trim()) ? Number(draft.minutes.trim()) : Number.NaN;
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 240) return { invalid: "minutes" };
  // Written like a pack's SKU (the shared rule); empty means the package has none.
  const code = draft.code.trim();
  if (code !== "" && !skuSchema.safeParse(code).success) return { invalid: "code" };
  return {
    groupId: draft.groupId,
    name: { en: draft.nameEn, ar: draft.nameAr },
    description: { en: draft.descriptionEn, ar: draft.descriptionAr },
    included: { en: lines(draft.includedEn), ar: lines(draft.includedAr) },
    price,
    durationMinutes: minutes,
    image: draft.image.trim() || null,
    code: code || null,
    sortOrder: draft.sortOrder,
    active: draft.active,
  };
}

/** "From 12 months", "Up to 8 kg", "12-24 months"... for staff and customers; null when there is no limit. */
export function rangeText(
  range: { min: number | null; max: number | null },
  unit: "months" | "kg",
  t: (en: string, ar: string) => string,
): string | null {
  const show = (value: number) => (unit === "kg" ? String(value / 1000) : String(value));
  const label = unit === "kg" ? t("kg", "كغ") : t("months", "شهراً");
  if (range.min !== null && range.max !== null) return `${show(range.min)}–${show(range.max)} ${label}`;
  if (range.min !== null) return t(`From ${show(range.min)} ${label}`, `من ${show(range.min)} ${label}`);
  if (range.max !== null) return t(`Up to ${show(range.max)} ${label}`, `حتى ${show(range.max)} ${label}`);
  return null;
}
