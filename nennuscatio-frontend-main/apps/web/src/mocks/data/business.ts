import type { AdminVariantPos, LocalisedText, ProductOffer } from "@nennus-catio/contracts";
import { assets } from "./assets";
import { seedPetHouses, housePetTypes, type HouseMetadata } from "./pet-houses";
export const bi = (en: string, ar: string): LocalisedText => ({ en, ar });
export type Pet =
  | "cats"
  | "birds"
  | "pets"
  | "dogs"
  | "small-pets"
  | "reptiles"
  | "fish"
  | "deer-goats"
  | "horses";
export type PetCategory = "small" | "kitty" | "adult-cat" | "adult-pet";
export type GroomingLocation = "in-store" | "home";
export type Payment = "paid" | "pending";
export type PaymentOutcome = "success" | "pending" | "failed" | "cancelled";
export type Status =
  | "pending"
  | "processing"
  | "ready"
  | "completed"
  | "confirmed"
  | "cancelled";
export interface Variant {
  id: string;
  /** API mode: the pack's database id, used for stock adjustments (6b). */
  serverId?: string;
  label: LocalisedText;
  sku: string;
  unit: "piece" | "weight";
  /** Stated pack weight for "weight" packs (D103). */
  weightGrams?: number | null;
  price: number;
  /**
   * API mode (11e): the price after the offer everyone gets on this pack alone, or null. Only a display:
   * the cart and checkout ask the server for the price.
   */
  salePrice?: number | null;
  stock: number;
  lowStock?: number;
  /** API mode: the pack's own on/off. A save sends it unchanged (#16 part 2c: the POS switches managed packs). */
  active?: boolean;
  /** API mode (#16 part 2b): set when the POS manages the pack; its SKU, price, stock and on/off then follow the POS. */
  pos?: AdminVariantPos | null;
  /**
   * A new pack made from the POS items list (2c): the POS's code and price. Once saved, the pack follows
   * the POS at once, so the editor shows the POS's values instead of asking for them.
   */
  fromPos?: { code: string; price: number };
}
export interface Product {
  id: string;
  /** API mode (6b): database id, edit version and the "not yet reviewed sample" flag (D107). */
  serverId?: string;
  version?: number;
  isSample?: boolean;
  brand?: string;
  featured?: boolean;
  bestSeller?: boolean;
  name: LocalisedText;
  description: LocalisedText;
  category: string;
  pet: Pet;
  /** All pets the product suits (#6: eligibility by pet). Falls back to `pet` when absent. */
  pets?: Pet[];
  image: string;
  active: boolean;
  variants: Variant[];
  gallery?: { id: string; src: string }[];
  house?: HouseMetadata;
  /** API mode (11e): the visible automatic offers on this product, as labels. */
  offers?: ProductOffer[];
}
export interface Package {
  id: string;
  petCategory: PetCategory;
  tier: "basic" | "full";
  name: LocalisedText;
  description: LocalisedText;
  inclusions: LocalisedText[];
  price: number;
  duration: number;
  image: string;
  active: boolean;
}
export interface Slot {
  id: string;
  kind: "delivery" | "grooming";
  date: string;
  time: string;
  capacity: number;
  active: boolean;
}
export interface Guest {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt?: string;
  note?: { text: string; at: string };
}
export interface OrderLine {
  productId: string;
  variantId: string;
  name: LocalisedText;
  label: LocalisedText;
  sku: string;
  price: number;
  quantity: number;
}
export interface Order {
  channel?: "website" | "admin";
  id: string;
  customerId: string;
  date: string;
  items: OrderLine[];
  total: number;
  fee: number;
  payment: Payment;
  status: Status;
  fulfilment: "delivery" | "pickup";
  slotId?: string;
  address: string;
}
export interface Booking {
  internalNotes?: string;
  activity?: { id: string; at: string; text: LocalisedText }[];
  id: string;
  customerId: string;
  packageId: string;
  packageName: LocalisedText;
  price: number;
  duration: number;
  slotId: string;
  date: string;
  petName: string;
  petNotes: string;
  location: GroomingLocation;
  address: string;
  payment: Payment;
  status: Status;
}
export interface Staff {
  id: string;
  name: string;
  email: string;
  role: "core" | "finance";
  active: boolean;
}
export interface Settings {
  headline: LocalisedText;
  description: LocalisedText;
  instagram: string;
  instagramGrooming: string;
  instagramProjects?: string;
  facebook: string;
  whatsapp: string;
  /** The business phone (D232); the demo editor has no field for it, so it is usually unset. */
  phone?: string;
  hours: LocalisedText;
}
export interface Hold {
  id: string;
  slotId: string;
  expires: number;
}
export interface DemoState {
  products: Product[];
  packages: Package[];
  slots: Slot[];
  guests: Guest[];
  orders: Order[];
  bookings: Booking[];
  staff: Staff[];
  settings: Settings;
  holds: Hold[];
  submissions: Record<string, string>;
}
export const shopCategories = [
  { id: "food", name: bi("Food & treats", "الطعام والمكافآت") },
  { id: "care", name: bi("Care & hygiene", "العناية والنظافة") },
  { id: "accessories", name: bi("Toys & accessories", "الألعاب والإكسسوارات") },
];
// Shared Products administration manages both catalogues; public Shop does not.
export const categories = [
  ...shopCategories,
  { id: "pet-houses", name: bi("Pet Houses", "بيوت الحيوانات") },
];
export const shopPetTypes = [
  { id: "cats", name: bi("Cats", "القطط") },
  { id: "birds", name: bi("Birds", "الطيور") },
  { id: "pets", name: bi("Pets", "الحيوانات الأليفة") },
  { id: "dogs", name: bi("Dogs", "الكلاب") },
] as const;
// Historical four-type public list is retained for record compatibility only.
// New public browsing uses the eight groups in public-pets.ts.
export const petCategories = [
  { id: "small", name: bi("Small pet", "حيوان صغير") },
  { id: "kitty", name: bi("Kitty", "قطة صغيرة") },
  { id: "adult-cat", name: bi("Adult cat", "قطة بالغة") },
  { id: "adult-pet", name: bi("Adult pet", "حيوان بالغ") },
];
// Administration filters include both Shop and house-specific animal types.
export const cataloguePetTypes = [
  ...shopPetTypes,
  ...housePetTypes.filter((p) => !shopPetTypes.some((x) => x.id === p.id)),
];
const variant = (
  id: string,
  en: string,
  ar: string,
  price: number,
  stock: number,
  unit: "piece" | "weight" = "piece",
): Variant => ({
  id,
  label: bi(en, ar),
  sku: `FO-${id.toUpperCase()}`,
  price,
  stock,
  unit,
});
const descriptions = bi(
  "Thoughtfully chosen everyday essentials. Example catalogue content; ingredients and product specifications require owner approval.",
  "مستلزمات يومية مختارة بعناية. محتوى تجريبي؛ تحتاج المكونات والمواصفات إلى موافقة المالك.",
);
export function demoDates() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Qatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i + 1);
    return d.toISOString().slice(0, 10);
  });
}
export function seedDemo(): DemoState {
  const products: Product[] = [
    {
      id: "cat-food",
      name: bi("Everyday Cat Nutrition", "تغذية القطط اليومية"),
      category: "food",
      pet: "cats",
      image: assets.catFood,
      variants: [
        variant("cf-15", "1.5 kg pack", "عبوة ١٫٥ كغ", 8500, 32, "weight"),
        variant("cf-3", "3 kg pack", "عبوة ٣ كغ", 15000, 18, "weight"),
      ],
    },
    {
      id: "cat-treats",
      name: bi("Salmon Bites", "مكافآت السلمون"),
      category: "food",
      pet: "cats",
      image: assets.catTreats,
      variants: [
        variant("ct-80", "80 g pouch", "عبوة ٨٠ غ", 2800, 24, "weight"),
      ],
    },
    {
      id: "bird-seed",
      name: bi("Bird Seed Blend", "مزيج بذور الطيور"),
      category: "food",
      pet: "birds",
      image: assets.birdSeed,
      variants: [variant("bs-1", "1 kg pack", "عبوة ١ كغ", 4200, 25, "weight")],
    },
    {
      id: "pet-food",
      name: bi("Adult Pet Kibble", "طعام الحيوان البالغ"),
      category: "food",
      pet: "pets",
      image: assets.essentials,
      variants: [variant("pf-2", "2 kg pack", "عبوة ٢ كغ", 9800, 15, "weight")],
    },
    {
      id: "dog-food",
      name: bi("Everyday Dog Kibble", "طعام الكلاب اليومي"),
      category: "food",
      pet: "dogs",
      image: assets.dogFood,
      variants: [
        variant("df-3", "3 kg pack", "عبوة ٣ كغ", 12000, 22, "weight"),
      ],
    },
    {
      id: "cat-litter",
      name: bi("Gentle Cat Litter", "رمل القطط اللطيف"),
      category: "care",
      pet: "cats",
      image: assets.catLitter,
      variants: [
        variant("cl-5", "5 kg bag", "كيس ٥ كغ", 5500, 20, "weight"),
        variant("cl-10", "10 kg bag", "كيس ١٠ كغ", 9000, 12, "weight"),
      ],
    },
    {
      id: "pet-shampoo",
      name: bi("Gentle Care Shampoo", "شامبو العناية اللطيف"),
      category: "care",
      pet: "pets",
      image: assets.shampoo,
      variants: [variant("ps-1", "250 ml · 1 piece", "٢٥٠ مل · قطعة", 3500, 8)],
    },
    {
      id: "rope-toy",
      name: bi("Cotton Play Rope", "حبل لعب قطني"),
      category: "accessories",
      pet: "pets",
      image: assets.ropeToy,
      variants: [
        variant("rt-s", "Small · 1 piece", "صغير · قطعة", 2200, 10),
        variant("rt-l", "Large · 1 piece", "كبير · قطعة", 3200, 0),
      ],
    },
    {
      id: "cat-bowl",
      name: bi("Everyday Ceramic Bowl", "وعاء سيراميك يومي"),
      category: "accessories",
      pet: "cats",
      image: assets.ceramicBowl,
      variants: [variant("cb-1", "1 piece", "قطعة", 4500, 7)],
    },
    {
      id: "bird-toy",
      name: bi("Natural Bird Perch", "مجثم طبيعي للطيور"),
      category: "accessories",
      pet: "birds",
      image: assets.bird,
      variants: [variant("bt-1", "1 piece", "قطعة", 3800, 0)],
    },
  ].map((p) => ({
    ...p,
    // Synthetic catalogue brands, not the client's approved suppliers.
    brand:
      p.category === "food"
        ? "Oasis Nutrition"
        : p.category === "care"
          ? "Gentle Care"
          : "Natural Essentials",
    pet: p.pet as Pet,
    description: descriptions,
    active: true,
  }));
  const packages: Package[] = petCategories.flatMap((cat, index) =>
    ["basic", "full"].map((tier) => ({
      id: `${cat.id}-${tier}`,
      petCategory: cat.id as PetCategory,
      tier: tier as "basic" | "full",
      name: bi(
        `${cat.name.en} · ${tier === "basic" ? "Basic" : "Full"}`,
        `${cat.name.ar} · ${tier === "basic" ? "أساسي" : "كامل"}`,
      ),
      description: bi(
        "A thoughtful grooming session tailored to your pet. Category limits are provisional.",
        "جلسة عناية مناسبة لحيوانك. حدود الفئات تجريبية.",
      ),
      inclusions: [
        bi("Bath & blow dry", "استحمام وتجفيف"),
        bi("Brush & gentle detangling", "تمشيط وفك التشابك"),
        bi("Nail & ear care", "عناية بالأظافر والأذنين"),
        ...(tier === "full"
          ? [bi("Coat trim & styling", "قص وتصفيف الفرو")]
          : []),
      ],
      price: index * 2000 + 8000 + (tier === "full" ? 5000 : 0),
      duration: tier === "basic" ? 45 : 90,
      image:
        cat.id.includes("cat") || cat.id === "kitty"
          ? assets.cat
          : assets.grooming,
      active: true,
    })),
  );
  const dates = demoDates();
  const slots: Slot[] = dates.flatMap((date) =>
    ["delivery", "grooming"].flatMap((kind) =>
      ["09:00", "11:00", "13:00", "15:00", "17:00"].map((time) => ({
        id: `${kind}-${date}-${time}`,
        kind: kind as Slot["kind"],
        date,
        time,
        capacity: kind === "delivery" ? 4 : 1,
        active: true,
      })),
    ),
  );
  const guests: Guest[] = Array.from({ length: 6 }, (_, i) => ({
    id: `guest-${i + 1}`,
    name: `Demo Customer ${i + 1}`,
    email: `customer${i + 1}@example.invalid`,
    phone: `+974 0000 000${i}`,
  }));
  const orders: Order[] = Array.from({ length: 12 }, (_, i) => {
    const p = products[i % products.length],
      v = p.variants[0],
      quantity = (i % 3) + 1;
    const created = new Date(`${dates[0]}T08:00:00+03:00`);
    created.setUTCDate(created.getUTCDate() - 7 + (i % 7));
    return {
      id: `FO-${1001 + i}`,
      channel: "website" as const,
      customerId: guests[i % 6].id,
      date: created.toISOString(),
      items: [
        {
          productId: p.id,
          variantId: v.id,
          name: p.name,
          label: v.label,
          sku: v.sku,
          price: v.price,
          quantity,
        },
      ],
      fee: 0,
      total: v.price * quantity,
      payment: i === 10 ? "pending" : "paid",
      status:
        i === 11
          ? "cancelled"
          : i === 10
            ? "pending"
            : i < 7
              ? "completed"
              : "processing",
      fulfilment: i % 2 ? "pickup" : "delivery",
      ...(i % 2
        ? {}
        : {
            slotId: `delivery-${dates[0]}-${["09:00", "11:00", "13:00"][Math.floor(i / 4)]}`,
          }),
      address: "Synthetic Doha address",
    };
  });
  // A stable synthetic creation time prevents SSR/client chart mismatches when
  // their mock modules initialise in different hours. Live submissions still use
  // their actual creation time in the repository.
  const bookingCreated = new Date(`${dates[0]}T08:00:00+03:00`);
  bookingCreated.setUTCDate(bookingCreated.getUTCDate() - 1);
  const bookings: Booking[] = Array.from({ length: 8 }, (_, i) => {
    const p = packages[i];
    const slot = slots.filter((s) => s.kind === "grooming")[i];
    return {
      id: `GB-${2001 + i}`,
      customerId: guests[i % 6].id,
      packageId: p.id,
      packageName: p.name,
      price: p.price,
      duration: p.duration,
      slotId: slot.id,
      date: bookingCreated.toISOString(),
      petName: ["Fluffy", "Luna", "Milo", "Coco"][i % 4],
      petNotes: "Synthetic booking notes",
      location: i % 3 === 0 ? "home" : "in-store",
      address: i % 3 === 0 ? "Demo home address · Doha" : "",
      payment: i === 6 ? "pending" : "paid",
      status: i === 7 ? "cancelled" : i === 6 ? "pending" : "confirmed",
    };
  });
  return {
    products: [...products, ...seedPetHouses()],
    packages,
    slots,
    guests,
    orders,
    bookings,
    holds: [],
    submissions: {},
    staff: [
      {
        id: "s1",
        name: "Demo operations",
        email: "operations@example.invalid",
        role: "core",
        active: true,
      },
      {
        id: "s2",
        name: "Demo finance",
        email: "finance@example.invalid",
        role: "finance",
        active: true,
      },
    ],
    settings: {
      headline: bi(
        "A little care for a happier life.",
        "عناية صغيرة لحياة أسعد.",
      ),
      description: bi(
        "Shop quality pet products and book trusted services — everything your pet needs in one place.",
        "تسوق منتجات عالية الجودة واحجز خدمات موثوقة — كل ما يحتاجه حيوانك في مكان واحد.",
      ),
      instagram: "",
      instagramGrooming: "",
      instagramProjects: "",
      facebook: "",
      whatsapp: "",
      hours: bi(
        "Business hours awaiting confirmation",
        "ساعات العمل بانتظار التأكيد",
      ),
    },
  };
}
