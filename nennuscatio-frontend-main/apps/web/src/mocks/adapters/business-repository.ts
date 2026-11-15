import {
  seedDemo,
  shopCategories,
  cataloguePetTypes,
  type DemoState,
  type Guest,
  type Order,
  type Product,
  type Package,
  type Slot,
  type Staff,
  type Settings,
  type PaymentOutcome,
  type GroomingLocation,
  type Booking,
} from "../data/business";
import {
  houseCollections,
  housePetTypes,
  collectionsForPet,
} from "../data/pet-houses";
import { whatsappLink } from "@/features/pet-houses/lib/whatsapp";
import { mockDispatchRepository } from "./dispatch-repository";
export interface CartLine {
  productId: string;
  variantId: string;
  quantity: number;
}
export class MockError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function remaining(
  state: DemoState,
  slot: Slot,
  now = Date.now(),
  holdId?: string,
) {
  if (!isFutureSlot(slot, now)) return 0;
  const used =
    slot.kind === "delivery"
      ? state.orders.filter(
          (o) => o.slotId === slot.id && o.status !== "cancelled",
        ).length
      : state.bookings.filter(
          (b) => b.slotId === slot.id && b.status !== "cancelled",
        ).length;
  const holds =
    slot.kind === "grooming"
      ? state.holds.filter(
          (h) => h.slotId === slot.id && h.expires > now && h.id !== holdId,
        ).length
      : 0;
  return slot.active ? Math.max(0, slot.capacity - used - holds) : 0;
}
export function safeUrl(value: string, kind: "social" | "image" = "social") {
  if (!value) return true;
  if (
    kind === "image" &&
    (value.startsWith("/images/") ||
      /^data:image\/(png|jpeg|webp);base64,/.test(value))
  )
    return true;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}
export function normaliseGuest(state: DemoState, guest: Omit<Guest, "id">) {
  const digits = guest.phone.replace(/\D/g, "");
  if (
    !guest.name.trim() ||
    !/^\S+@\S+\.\S+$/.test(guest.email) ||
    !/^\+?[\d\s()-]{8,20}$/.test(guest.phone) ||
    digits.length < 8 ||
    digits.length > 15
  )
    throw new MockError("CONTACT", "Please check the required contact fields.");
  const email = guest.email.trim().toLowerCase(),
    phone = guest.phone.replace(/\D/g, "");
  const match = state.guests.find(
    (g) =>
      g.email.toLowerCase() === email && g.phone.replace(/\D/g, "") === phone,
  );
  if (match) return match.id;
  const id = `guest-${crypto.randomUUID()}`;
  state.guests.push({
    name: guest.name.trim(),
    email,
    phone: guest.phone.trim(),
    id,
    createdAt: new Date().toISOString(),
  });
  return id;
}
export function createMockRepository(initial = seedDemo()) {
  let state = structuredClone(initial);
  const listeners = new Set<() => void>();
  const update = (fn: (draft: DemoState) => void) => {
    const draft = structuredClone(state);
    fn(draft);
    state = draft;
    listeners.forEach((f) => {
      f();
    });
  };
  return {
    getSnapshot: () => state,
    subscribe: (f: () => void) => {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    reset: () => {
      mockDispatchRepository.reset();
      update((d) => Object.assign(d, seedDemo()));
    },
    saveCustomer(input: Pick<Guest, "name" | "email" | "phone">, id?: string) {
      let result = "";
      update((d) => {
        const existing = id ? d.guests.find((g) => g.id === id) : undefined;
        if (id && !existing)
          throw new MockError("MISSING", "Customer not found.");
        const validation: DemoState = { ...d, guests: [] };
        normaliseGuest(validation, input);
        const clean = validation.guests[0];
        if (clean.name.length > 100 || clean.email.length > 254)
          throw new MockError("CONTACT", "Contact fields are too long.");
        if (
          d.guests.some(
            (g) =>
              g.id !== id &&
              (g.email.trim().toLowerCase() === clean.email ||
                g.phone.replace(/\D/g, "") === clean.phone.replace(/\D/g, "")),
          )
        )
          throw new MockError(
            "CONFLICT",
            "Email or phone matches another contact. Review it first; contacts are not merged.",
          );
        if (existing) {
          Object.assign(existing, {
            name: clean.name,
            email: clean.email,
            phone: clean.phone,
          });
          result = existing.id;
        } else {
          d.guests.push(clean);
          result = clean.id;
        }
      });
      return result;
    },
    saveCustomerNote(id: string, text: string) {
      update((d) => {
        const guest = d.guests.find((g) => g.id === id);
        if (!guest) throw new MockError("MISSING", "Customer not found.");
        if (text.length > 2000)
          throw new MockError(
            "NOTES",
            "Notes must be at most 2000 characters.",
          );
        const clean = text.trim();
        if (clean === (guest.note?.text ?? "")) return;
        guest.note = clean
          ? { text: clean, at: new Date().toISOString() }
          : undefined;
      });
    },
    hold(slotId: string, id: string) {
      update((d) => {
        const slot = d.slots.find(
          (s) => s.id === slotId && s.kind === "grooming",
        );
        if (!slot || remaining(d, slot, Date.now(), id) < 1)
          throw new MockError("CONFLICT", "This slot is no longer available.");
        d.holds = d.holds.filter((h) => h.id !== id && h.expires > Date.now());
        d.holds.push({ id, slotId, expires: Date.now() + 5 * 60_000 });
      });
    },
    release(id: string) {
      update((d) => {
        d.holds = d.holds.filter((h) => h.id !== id);
      });
    },
    checkout(input: {
      key: string;
      guest: Omit<Guest, "id">;
      lines: CartLine[];
      fulfilment: "delivery" | "pickup";
      slotId?: string;
      address: string;
      outcome: PaymentOutcome;
      channel?: "website" | "admin";
    }) {
      if (state.submissions[input.key]) return state.submissions[input.key];
      if (input.outcome === "failed" || input.outcome === "cancelled")
        throw new MockError(
          "PAYMENT",
          "The simulated payment did not complete. Nothing was ordered.",
        );
      let ref = "";
      update((d) => {
        if (!input.lines.length)
          throw new MockError("EMPTY", "Your cart is empty.");
        const items = input.lines.map((line) => {
          const p = d.products.find((p) => p.id === line.productId && p.active),
            v = p?.variants.find((v) => v.id === line.variantId);
          if (p?.category === "pet-houses")
            throw new MockError(
              "HOUSE_PHASE",
              "Pet House ordering is not enabled until delivery rules are implemented in PH-3.",
            );
          if (
            !p ||
            !v ||
            !Number.isInteger(line.quantity) ||
            line.quantity < 1 ||
            line.quantity > v.stock
          )
            throw new MockError(
              "STOCK",
              "A selected item is unavailable. Review your cart.",
            );
          v.stock -= line.quantity;
          return {
            ...line,
            name: p.name,
            label: v.label,
            sku: v.sku,
            price: v.price,
          };
        });
        if (input.fulfilment === "delivery") {
          const slot = d.slots.find(
            (s) => s.id === input.slotId && s.kind === "delivery",
          );
          if (!input.address.trim() || !slot || remaining(d, slot) < 1)
            throw new MockError(
              "DELIVERY",
              "Choose an available delivery slot and enter the address.",
            );
        }
        const customerId = normaliseGuest(d, input.guest);
        ref = `FO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        const total = items.reduce((a, b) => a + b.price * b.quantity, 0);
        d.orders.unshift({
          channel: input.channel ?? "website",
          id: ref,
          customerId,
          date: new Date().toISOString(),
          items,
          total,
          fee: 0,
          payment: input.outcome === "pending" ? "pending" : "paid",
          status: input.outcome === "pending" ? "pending" : "processing",
          fulfilment: input.fulfilment,
          slotId: input.fulfilment === "delivery" ? input.slotId : undefined,
          address: input.address,
        });
        d.submissions[input.key] = ref;
      });
      return ref;
    },
    book(input: {
      key: string;
      holdId: string;
      packageId: string;
      slotId: string;
      guest: Omit<Guest, "id">;
      petName: string;
      petNotes: string;
      location?: GroomingLocation;
      address?: string;
      outcome: PaymentOutcome;
    }) {
      if (state.submissions[input.key]) return state.submissions[input.key];
      if (input.outcome === "failed" || input.outcome === "cancelled") {
        this.release(input.holdId);
        throw new MockError(
          "PAYMENT",
          "The simulated payment did not complete. Please select a slot again.",
        );
      }
      let ref = "";
      update((d) => {
        const p = d.packages.find((p) => p.id === input.packageId && p.active),
          slot = d.slots.find(
            (s) => s.id === input.slotId && s.kind === "grooming",
          ),
          hold = d.holds.find(
            (h) =>
              h.id === input.holdId &&
              h.slotId === input.slotId &&
              h.expires > Date.now(),
          );
        if (
          !p ||
          !slot ||
          !hold ||
          remaining(d, slot, Date.now(), input.holdId) < 1 ||
          p.duration > 120
        )
          throw new MockError(
            "CONFLICT",
            "The reservation expired or the slot is unavailable. Select again.",
          );
        if (!input.petName.trim())
          throw new MockError("PET", "Enter your pet's name.");
        const location = input.location ?? "in-store";
        const address = input.address?.trim() ?? "";
        if (location === "home" && address.length < 8)
          throw new MockError(
            "ADDRESS",
            "Enter the home-grooming address before confirming.",
          );
        const customerId = normaliseGuest(d, input.guest);
        ref = `GB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        d.bookings.unshift({
          id: ref,
          customerId,
          packageId: p.id,
          packageName: p.name,
          price: p.price,
          duration: p.duration,
          slotId: slot.id,
          date: new Date().toISOString(),
          petName: input.petName,
          petNotes: input.petNotes,
          location,
          address: location === "home" ? address : "",
          payment: input.outcome === "pending" ? "pending" : "paid",
          status: input.outcome === "pending" ? "pending" : "confirmed",
        });
        d.holds = d.holds.filter((h) => h.id !== input.holdId);
        d.submissions[input.key] = ref;
      });
      return ref;
    },
    status(kind: "orders" | "bookings", id: string, next: Order["status"]) {
      update((d) => {
        const record = d[kind].find((r) => r.id === id);
        if (
          !record ||
          record.status === "cancelled" ||
          record.status === "completed"
        )
          throw new MockError("STATUS", "This record is closed.");
        if (next === "cancelled" && kind === "orders") {
          (record as Order).items.forEach((line) => {
            const v = d.products
              .find((p) => p.id === line.productId)
              ?.variants.find((v) => v.id === line.variantId);
            if (v) v.stock += line.quantity;
          });
        }
        if (next !== "cancelled" && record.payment !== "paid")
          throw new MockError("PAYMENT", "Pending payments cannot progress.");
        if (kind === "bookings" && next !== record.status) {
          const booking = record as Booking;
          booking.activity ??= [];
          booking.activity.push({
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            text: {
              en: `Status changed to ${next === "processing" ? "In Progress" : next}`,
              ar: `تغيّرت الحالة إلى ${{ confirmed: "مؤكد", pending: "قيد الانتظار", processing: "قيد التنفيذ", completed: "مكتمل", cancelled: "ملغي", ready: "جاهز" }[next]}`,
            },
          });
        }
        record.status = next;
      });
    },
    rescheduleBooking(id: string, slotId: string) {
      update((d) => {
        const booking = d.bookings.find((b) => b.id === id);
        if (!booking || ["completed", "cancelled"].includes(booking.status))
          throw new MockError("STATUS", "This booking is closed.");
        if (booking.slotId === slotId) return;
        const slot = d.slots.find(
          (s) => s.id === slotId && s.kind === "grooming",
        );
        if (!slot || remaining(d, slot) < 1 || booking.duration > 120)
          throw new MockError(
            "CONFLICT",
            "This grooming slot is no longer available.",
          );
        booking.slotId = slotId;
        booking.activity ??= [];
        booking.activity.push({
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          text: {
            en: `Rescheduled to ${slot.date} ${slot.time} (Qatar)`,
            ar: `تم تغيير الموعد إلى ${slot.date} ${slot.time} (قطر)`,
          },
        });
      });
    },
    saveBookingNotes(
      id: string,
      notes: { petNotes: string; internalNotes: string },
    ) {
      if (notes.petNotes.length > 2000 || notes.internalNotes.length > 2000)
        throw new MockError(
          "VALIDATION",
          "Notes must be at most 2,000 characters.",
        );
      update((d) => {
        const booking = d.bookings.find((b) => b.id === id);
        if (!booking) throw new MockError("MISSING", "Booking unavailable.");
        if (
          booking.petNotes === notes.petNotes.trim() &&
          (booking.internalNotes ?? "") === notes.internalNotes.trim()
        )
          return;
        booking.petNotes = notes.petNotes.trim();
        booking.internalNotes = notes.internalNotes.trim();
        booking.activity ??= [];
        booking.activity.push({
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          text: { en: "Booking notes updated", ar: "تم تحديث ملاحظات الحجز" },
        });
      });
    },
    saveProduct(product: Product) {
      product = structuredClone(product);
      if (
        product.brand !== undefined &&
        (typeof product.brand !== "string" || product.brand.trim().length > 80)
      ) {
        throw new MockError(
          "VALIDATION",
          "Brand must be at most 80 characters.",
        );
      }
      product.brand = product.brand?.trim().replace(/\s+/g, " ") || undefined;
      update((d) => {
        if (product.category !== "pet-houses") {
          delete product.house;
          if (
            !shopCategories.some(
              (category) => category.id === product.category,
            ) ||
            !cataloguePetTypes.some((pet) => pet.id === product.pet)
          )
            throw new MockError(
              "VALIDATION",
              "Choose a Shop category and a supported pet type.",
            );
        }
        if (product.category === "pet-houses") {
          const h = product.house;
          if (
            !h ||
            !housePetTypes.some((p) => p.id === product.pet) ||
            !houseCollections.some((x) => x.id === h.collection) ||
            !collectionsForPet(product.pet).includes(h.collection) ||
            !["fixed", "inquiry"].includes(h.purchaseMode) ||
            !["unconfirmed", "in-stock", "made-to-order"].includes(
              h.availability,
            ) ||
            !["delivery", "both"].includes(h.fulfilment) ||
            (h.dimensions !== null &&
              (h.dimensions.unit !== "cm" ||
                [
                  h.dimensions.height,
                  h.dimensions.width,
                  h.dimensions.depth,
                ].some((n) => !Number.isFinite(n) || n <= 0))) ||
            (h.leadTime !== null &&
              (!Number.isSafeInteger(h.leadTime.minDays) ||
                !Number.isSafeInteger(h.leadTime.maxDays) ||
                h.leadTime.minDays < 0 ||
                h.leadTime.maxDays < h.leadTime.minDays)) ||
            (h.deliveryFee !== null &&
              (!Number.isSafeInteger(h.deliveryFee) || h.deliveryFee < 0)) ||
            h.features.some((f) => !f.id || !f.en.trim() || !f.ar.trim()) ||
            new Set(h.features.map((f) => f.id)).size !== h.features.length ||
            (h.purchaseMode === "fixed" &&
              product.variants.some((v) => v.price <= 0))
          )
            throw new MockError(
              "HOUSE",
              "Check house type, positive dimensions, bilingual features, price, estimate range and delivery charge.",
            );
        }
        if (
          !product.name.en.trim() ||
          !product.name.ar.trim() ||
          !product.description.en.trim() ||
          !product.description.ar.trim() ||
          !product.variants.length ||
          !product.image.trim() ||
          !safeUrl(product.image, "image") ||
          (product.gallery?.length ?? 0) > 8 ||
          new Set((product.gallery ?? []).map((photo) => photo.id)).size !==
            (product.gallery?.length ?? 0) ||
          (product.gallery ?? []).some(
            (photo) =>
              !photo.id ||
              photo.id === "primary" ||
              !photo.src.trim() ||
              !safeUrl(photo.src, "image"),
          )
        )
          throw new MockError(
            "VALIDATION",
            "Complete both languages and provide a valid image.",
          );
        const skuSet = new Set(
          d.products
            .filter((p) => p.id !== product.id)
            .flatMap((p) => p.variants.map((v) => v.sku.toUpperCase())),
        );
        product.variants.forEach((v) => {
          if (
            !v.sku.trim() ||
            skuSet.has(v.sku.toUpperCase()) ||
            !v.label.en.trim() ||
            !v.label.ar.trim() ||
            !Number.isSafeInteger(v.price) ||
            v.price < 0 ||
            !Number.isSafeInteger(v.stock) ||
            v.stock < 0 ||
            (v.lowStock !== undefined &&
              (!Number.isSafeInteger(v.lowStock) || v.lowStock < 0))
          )
            throw new MockError(
              "VALIDATION",
              "Check variant labels, unique SKUs, price and stock.",
            );
          skuSet.add(v.sku.toUpperCase());
        });
        const i = d.products.findIndex((p) => p.id === product.id);
        if (i < 0) d.products.push(structuredClone(product));
        else d.products[i] = structuredClone(product);
      });
    },
    archiveProduct(id: string) {
      update((d) => {
        const p = d.products.find((p) => p.id === id);
        if (p) p.active = !p.active;
      });
    },
    savePackage(p: Package) {
      update((d) => {
        if (
          !p.name.en.trim() ||
          !p.name.ar.trim() ||
          !p.description.en.trim() ||
          !p.description.ar.trim() ||
          !Number.isSafeInteger(p.price) ||
          p.price < 0 ||
          !Number.isInteger(p.duration) ||
          p.duration < 15 ||
          p.duration > 120 ||
          !p.image.trim() ||
          !safeUrl(p.image, "image")
        )
          throw new MockError(
            "VALIDATION",
            "Check bilingual content, image, price and duration (15–120 minutes).",
          );
        const i = d.packages.findIndex((x) => x.id === p.id);
        if (i < 0)
          throw new MockError(
            "CONFIG",
            "Only the eight approved combinations are available.",
          );
        d.packages[i] = p;
      });
    },
    saveSlot(s: Slot) {
      update((d) => {
        if (
          !isFutureSlot(s) ||
          !Number.isInteger(s.capacity) ||
          s.capacity < 1 ||
          s.capacity > 50 ||
          (s.kind === "grooming" && s.capacity !== 1)
        )
          throw new MockError(
            "VALIDATION",
            "Enter a future date/time and valid capacity. Grooming uses one demo resource.",
          );
        if (
          d.slots.some(
            (x) =>
              x.id !== s.id &&
              x.kind === s.kind &&
              x.date === s.date &&
              (x.time === s.time ||
                (s.kind === "grooming" &&
                  Math.abs(timeMinutes(x.time) - timeMinutes(s.time)) < 120)),
          )
        )
          throw new MockError(
            "DUPLICATE",
            "This slot duplicates or overlaps an existing slot.",
          );
        const old = d.slots.find((x) => x.id === s.id);
        if (
          old &&
          (old.date !== s.date ||
            old.time !== s.time ||
            !s.active ||
            s.capacity < old.capacity) &&
          remaining(d, old) < old.capacity
        )
          throw new MockError(
            "BOOKED",
            "A booked or held slot cannot be moved, reduced or closed.",
          );
        const i = d.slots.findIndex((x) => x.id === s.id);
        if (i < 0) d.slots.push(s);
        else d.slots[i] = s;
      });
    },
    saveSettings(s: Settings) {
      update((d) => {
        if (s.whatsapp && !whatsappLink(s.whatsapp))
          throw new MockError(
            "WHATSAPP",
            "Use https://wa.me/<international-number> or https://api.whatsapp.com/send?phone=<international-number>.",
          );
        if (
          !s.headline.en.trim() ||
          !s.headline.ar.trim() ||
          Object.values({
            instagram: s.instagram,
            instagramGrooming: s.instagramGrooming,
            instagramProjects: s.instagramProjects ?? "",
            facebook: s.facebook,
            whatsapp: s.whatsapp,
          }).some((url) => !safeUrl(url))
        )
          throw new MockError(
            "URL",
            "Use complete bilingual titles and HTTPS social links only.",
          );
        d.settings = s;
      });
    },
    saveStaff(s: Staff) {
      update((d) => {
        if (
          !s.name.trim() ||
          !/^\S+@\S+\.\S+$/.test(s.email) ||
          d.staff.some(
            (x) =>
              x.id !== s.id && x.email.toLowerCase() === s.email.toLowerCase(),
          )
        )
          throw new MockError("STAFF", "Enter a name and unique valid email.");
        const i = d.staff.findIndex((x) => x.id === s.id);
        if (i < 0) d.staff.push(s);
        else d.staff[i] = s;
      });
    },
  };
}
function timeMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function isFutureSlot(slot: Slot, now = Date.now()) {
  const instant = Date.parse(`${slot.date}T${slot.time}:00+03:00`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(slot.date) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(slot.time) &&
    Number.isFinite(instant) &&
    instant > now &&
    new Date(`${slot.date}T12:00:00Z`).toISOString().slice(0, 10) === slot.date
  );
}
export const mockBusinessRepository = createMockRepository();
export function financialRows(state: DemoState) {
  return [
    ...state.orders
      .filter((o) => o.status !== "cancelled")
      .map((o) => ({
        id: o.id,
        date: o.date,
        source: "Shop",
        payment: o.payment,
        amount: o.total,
      })),
    ...state.bookings
      .filter((b) => b.status !== "cancelled")
      .map((b) => ({
        id: b.id,
        date: b.date,
        source: "Grooming",
        payment: b.payment,
        amount: b.price,
      })),
  ];
}
export function csvCell(value: string | number) {
  const raw = String(value);
  return `"${/^[=+\-@\t\r]/.test(raw) ? "'" : ""}${raw.replaceAll('"', '""')}"`;
}

export function financeCsv(rows: ReturnType<typeof financialRows>) {
  const content = [
    ["Reference", "Date (UTC)", "Source", "Payment", "Amount (QAR)"],
    ...rows.map((row) => [
      row.id,
      row.date,
      row.source,
      row.payment,
      (row.amount / 100).toFixed(2),
    ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  return `\ufeff${content}`;
}
