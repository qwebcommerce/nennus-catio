"use client";

import {
  ACCOUNT_LIMITS,
  accountAreasResponseSchema,
  customerProfileSchema,
  petTypeListResponseSchema,
  type ProfileUpdate,
  type SavedAddress,
  type SavedAddressInput,
  savedAddressListSchema,
  type SavedPet,
  type SavedPetInput,
  savedPetListSchema,
} from "@nennus-catio/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";
import { useRepositories } from "./DataSourceProvider";
import { customerSessionKey, errorMessage } from "./sessions";

/**
 * The customer's own account data (10a; plan BRANCH_10, D186) over `/api/account/*`: the profile, saved
 * addresses and saved pets. Each change answers with the whole list, which replaces the cached one.
 */
export const accountAreasKey = ["account", "areas"] as const;
export const savedAddressesKey = ["account", "addresses"] as const;
export const savedPetsKey = ["account", "pets"] as const;
export const petTypesKey = ["catalog", "pet-types"] as const;

export function useAccountAreas(enabled = true) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: accountAreasKey,
    queryFn: async ({ signal }) => (await api.get("/account/areas", accountAreasResponseSchema, { signal, cache: "no-store" })).areas,
    enabled,
    staleTime: 0,
  });
}

/** The shop's pet types (the catalogue's public list). */
export function usePetTypes() {
  const { api } = useRepositories();
  return useQuery({
    queryKey: petTypesKey,
    queryFn: async ({ signal }) => (await api.get("/catalog/pet-types", petTypeListResponseSchema, { signal })).petTypes,
  });
}

export function useSavedAddresses(enabled = true) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: savedAddressesKey,
    queryFn: async ({ signal }) => (await api.get("/account/addresses", savedAddressListSchema, { signal, cache: "no-store" })).addresses,
    enabled,
    staleTime: 0,
  });
}

export function useSavedPets(enabled = true) {
  const { api } = useRepositories();
  return useQuery({
    queryKey: savedPetsKey,
    queryFn: async ({ signal }) => (await api.get("/account/pets", savedPetListSchema, { signal, cache: "no-store" })).pets,
    enabled,
    staleTime: 0,
  });
}

/** Name and phone; the answer replaces the logged-in customer everywhere on the page. */
export function useUpdateProfile() {
  const { api } = useRepositories();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (update: ProfileUpdate) => api.put("/account/profile", update, customerProfileSchema),
    onSuccess: (profile) => queryClient.setQueryData(customerSessionKey, profile),
  });
}

function useAddressChange<Input>(send: (input: Input) => Promise<SavedAddress[]>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: (addresses) => queryClient.setQueryData(savedAddressesKey, addresses),
    onError: () => queryClient.invalidateQueries({ queryKey: savedAddressesKey }),
  });
}

export function useSaveAddress() {
  const { api } = useRepositories();
  return useAddressChange(async ({ address, input }: { address: SavedAddress | null; input: SavedAddressInput }) => {
    const answer = address
      ? await api.put(`/account/addresses/${address.id}`, { ...input, version: address.version }, savedAddressListSchema)
      : await api.post("/account/addresses", input, savedAddressListSchema);
    return answer.addresses;
  });
}

export function useMakeDefaultAddress() {
  const { api } = useRepositories();
  return useAddressChange(async (address: SavedAddress) => (await api.post(`/account/addresses/${address.id}/default`, {}, savedAddressListSchema)).addresses);
}

export function useDeleteAddress() {
  const { api } = useRepositories();
  return useAddressChange(async (address: SavedAddress) => (await api.delete(`/account/addresses/${address.id}`, savedAddressListSchema)).addresses);
}

function usePetChange<Input>(send: (input: Input) => Promise<SavedPet[]>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: (pets) => queryClient.setQueryData(savedPetsKey, pets),
    onError: () => queryClient.invalidateQueries({ queryKey: savedPetsKey }),
  });
}

export function useSavePet() {
  const { api } = useRepositories();
  return usePetChange(async ({ pet, input }: { pet: SavedPet | null; input: SavedPetInput }) => {
    const answer = pet
      ? await api.put(`/account/pets/${pet.id}`, { ...input, version: pet.version }, savedPetListSchema)
      : await api.post("/account/pets", input, savedPetListSchema);
    return answer.pets;
  });
}

export function useDeletePet() {
  const { api } = useRepositories();
  return usePetChange(async (pet: SavedPet) => (await api.delete(`/account/pets/${pet.id}`, savedPetListSchema)).pets);
}

/** This month in Qatar, "YYYY-MM". */
function qatarMonth(today: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar", year: "numeric", month: "2-digit" }).format(today);
}

/** Whole months from a born month ("YYYY-MM") to this month in Qatar; null when unknown or in the future. */
export function monthsSinceBorn(bornMonth: string | null, today = new Date()): number | null {
  if (!bornMonth) return null;
  const now = qatarMonth(today);
  const months = (Number(now.slice(0, 4)) - Number(bornMonth.slice(0, 4))) * 12 + (Number(now.slice(5, 7)) - Number(bornMonth.slice(5, 7)));
  return months < 0 ? null : months;
}

/** "2 years 3 months" from a born month ("YYYY-MM") to this month; null when unknown. */
export function ageFromBornMonth(bornMonth: string | null, text: (en: string, ar: string) => string, today = new Date()): string | null {
  const months = monthsSinceBorn(bornMonth, today);
  if (months === null) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [
    years > 0 ? text(`${years} year${years === 1 ? "" : "s"}`, `${years} سنة`) : "",
    rest > 0 || years === 0 ? text(`${rest} month${rest === 1 ? "" : "s"}`, `${rest} شهراً`) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** One readable line for a failed account change; `kind` names the list a limit is about. */
export function accountErrorMessage(error: unknown, text: (en: string, ar: string) => string, kind: "address" | "pet" | "profile" = "profile"): string {
  if (!(error instanceof ApiError)) return errorMessage(error, text);
  switch (error.code) {
    case "LIMIT_REACHED":
      return kind === "pet"
        ? text(`You can save up to ${ACCOUNT_LIMITS.maxPets} pets. Delete one to add another.`, `يمكنك حفظ ${ACCOUNT_LIMITS.maxPets} حيوانات كحد أقصى. احذف واحداً لإضافة آخر.`)
        : text(`You can save up to ${ACCOUNT_LIMITS.maxAddresses} addresses. Delete one to add another.`, `يمكنك حفظ ${ACCOUNT_LIMITS.maxAddresses} عناوين كحد أقصى. احذف واحداً لإضافة آخر.`);
    case "CONFLICT":
      return text("This was changed in another window. It has been reloaded: please check it and try again.", "تم تغيير هذا في نافذة أخرى. أُعيد تحميله: راجعه ثم حاول مرة أخرى.");
    case "NOT_FOUND":
      return text("This was already deleted.", "تم حذف هذا بالفعل.");
    default:
      return errorMessage(error, text);
  }
}
