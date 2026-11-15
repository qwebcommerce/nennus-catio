import type { LocalisedText } from "@nennus-catio/contracts";

export type DispatchKind = "product" | "house" | "grooming";
export type DispatchStatus = "awaiting" | "assigned" | "en-route" | "completed";
export const dispatchStatuses: { id: DispatchStatus; label: LocalisedText }[] =
  [
    {
      id: "awaiting",
      label: { en: "Awaiting Dispatch", ar: "بانتظار التعيين" },
    },
    { id: "assigned", label: { en: "Assigned", ar: "معين" } },
    { id: "en-route", label: { en: "En Route", ar: "في الطريق" } },
    { id: "completed", label: { en: "Completed", ar: "مكتمل" } },
  ];
export const dispatchKinds: { id: DispatchKind; label: LocalisedText }[] = [
  { id: "product", label: { en: "Product Delivery", ar: "توصيل المنتجات" } },
  { id: "house", label: { en: "House Delivery", ar: "توصيل البيوت" } },
  { id: "grooming", label: { en: "Home Grooming", ar: "العناية المنزلية" } },
];
/** Synthetic assignment targets, not fleet identities or login accounts. */
export const dispatchTeam = [
  {
    id: "driver-01",
    role: "driver",
    name: { en: "Demo Driver 01", ar: "سائق تجريبي 01" },
  },
  {
    id: "driver-02",
    role: "driver",
    name: { en: "Demo Driver 02", ar: "سائق تجريبي 02" },
  },
  {
    id: "groomer-01",
    role: "groomer",
    name: { en: "Demo Groomer 01", ar: "مختص عناية تجريبي 01" },
  },
  {
    id: "groomer-02",
    role: "groomer",
    name: { en: "Demo Groomer 02", ar: "مختص عناية تجريبي 02" },
  },
] as const;
export interface DispatchChange {
  assignedTo: string;
  status: DispatchStatus;
  note: string;
  events: {
    id: string;
    at: string;
    status: DispatchStatus;
    assignedTo: string;
    note: string;
  }[];
}
export type DispatchChanges = Record<string, DispatchChange>;
