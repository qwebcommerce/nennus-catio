import type { LocalisedText } from "@nennus-catio/contracts";
import type { Product } from "./business";
import reference from "./pet-houses-reference.json";

const bi = (en: string, ar: string): LocalisedText => ({ en, ar });
export const housePetTypes = [
  { id: "cats", name: bi("Cats", "القطط") },
  { id: "dogs", name: bi("Dogs", "الكلاب") },
  { id: "birds", name: bi("Birds", "الطيور") },
  { id: "small-pets", name: bi("Small pets", "الحيوانات الصغيرة") },
  { id: "reptiles", name: bi("Reptiles", "الزواحف") },
  { id: "fish", name: bi("Fish", "الأسماك") },
  {
    id: "deer-goats",
    name: bi("Deer & mini goats", "الغزلان والماعز الصغيرة"),
  },
  { id: "horses", name: bi("Horses", "الخيول") },
] as const;
export const houseCollections = [
  { id: "general", name: bi("Ready models", "تصاميم جاهزة") },
  { id: "indoor", name: bi("Indoor", "داخلي") },
  { id: "outdoor", name: bi("Outdoor", "خارجي") },
  { id: "wall-decor", name: bi("Wall designs", "تصاميم جدارية") },
  { id: "rabbits", name: bi("Rabbits & guinea pigs", "الأرانب وخنازير غينيا") },
  {
    id: "sugar-glider",
    name: bi("Small-pet habitats", "مساكن الحيوانات الصغيرة"),
  },
  { id: "tortoise", name: bi("Tortoises", "السلاحف") },
  { id: "chameleon", name: bi("Chameleons", "الحرباء") },
  { id: "lizard", name: bi("Lizards", "السحالي") },
] as const;
export type HouseCollection = (typeof houseCollections)[number]["id"];
export function collectionsForPet(pet: string): HouseCollection[] {
  if (["cats", "dogs", "birds"].includes(pet))
    return pet === "cats"
      ? ["indoor", "outdoor", "wall-decor"]
      : ["indoor", "outdoor"];
  if (pet === "small-pets") return ["rabbits", "sugar-glider"];
  if (pet === "reptiles") return ["tortoise", "chameleon", "lizard"];
  return ["general"];
}
export interface HouseMetadata {
  collection: HouseCollection;
  purchaseMode: "fixed" | "inquiry";
  availability: "unconfirmed" | "in-stock" | "made-to-order";
  dimensions: {
    height: number;
    width: number;
    depth: number;
    unit: "cm";
  } | null;
  features: (LocalisedText & { id: string })[];
  leadTime: { minDays: number; maxDays: number } | null;
  deliveryFee: number | null;
  fulfilment: "delivery" | "both";
  provisional: boolean;
  source?: string;
}
export function emptyHouseMetadata(): HouseMetadata {
  return {
    collection: "indoor",
    purchaseMode: "fixed",
    availability: "unconfirmed",
    dimensions: null,
    features: [],
    leadTime: null,
    deliveryFee: null,
    fulfilment: "delivery",
    provisional: true,
  };
}
// Draft Arabic names, keyed by model rather than array position. Owner review is required.
const names: Record<string, string> = {
  "Terracotta Roof Cat Villa": "فيلا القطط بسقف قرميدي",
  "Rattan Boho Cat House": "بيت القطط البوهيمي من الروطان",
  "Glass Gable Cat House": "بيت القطط بسقف زجاجي مائل",
  "Porthole Tower Villa": "فيلا البرج بنوافذ دائرية",
  "Sage Flower Cat Cottage": "كوخ القطط الأخضر المزهر",
  "Macramé Premium Catio": "مسكن القطط بتصميم مكرمية",
  "Wooden Cat House Set": "مجموعة بيوت القطط الخشبية",
  "Capsule Cat Villa": "فيلا القطط بتصميم الكبسولات",
  "Black-Frame Catio": "مسكن القطط بإطار أسود",
  "Teal Glass Cabinet": "خزانة زجاجية بلون أزرق مخضر",
  "Twin-Door Catio": "مسكن القطط ببابين",
  "Glass Cat Villa": "فيلا القطط الزجاجية",
  "Walk-in Outdoor Catio": "مسكن قطط خارجي واسع",
  "Wall Shelf Cat System": "نظام رفوف جدارية للقطط",
  "Cat Wall Tree": "شجرة القطط الجدارية",
  "Cat Wall Climbing System": "نظام تسلق جداري للقطط",
  "Blush Cottage & Diner": "كوخ وردي مع ركن طعام",
  "Glass Gable Dog House": "بيت الكلاب بسقف زجاجي مائل",
  "Modern Capsule Kennel": "بيت كلاب عصري بتصميم كبسولة",
  "Sage Flower Dog Cottage": "كوخ الكلاب الأخضر المزهر",
  "Coastal Porch Kennel": "بيت الكلاب بشرفة ساحلية",
  "Oak A-Frame Kennel": "بيت كلاب مثلث من البلوط",
  "Heavy-Duty Dog Kennel": "بيت كلاب بتصميم متين",
  "Cabinet Glass Aviary": "مسكن طيور بخزانة زجاجية",
  "Parrot Play Tower": "برج لعب للببغاء",
  "Hanging Brass Dome": "قبة نحاسية معلقة",
  "Oak Stand Birdhouse": "بيت طيور على حامل بلوط",
  "Arched Brass Aviary": "مسكن طيور بقوس نحاسي",
  "Walk-in Garden Aviary": "مسكن طيور للحديقة",
  "Sage Guinea Pig House": "بيت أخضر لخنزير غينيا",
  "Oak Rabbit Hutch & Run": "بيت أرانب من البلوط مع مساحة حركة",
  "Wall Condo for Small Pets": "مسكن جداري للحيوانات الصغيرة",
  "Rodent Tunnel Tower": "برج أنفاق للقوارض",
  "Glass-Front Pet Cabinet": "خزانة حيوانات بواجهة زجاجية",
  "Small Pet Mansion": "قصر للحيوانات الصغيرة",
  "Oak Tortoise Table": "مسكن سلحفاة من البلوط",
  "Wall-Mounted Vivarium": "حوض زواحف جداري",
  "Tropical Tower Vivarium": "حوض زواحف استوائي مرتفع",
  "Desert Timber Terrarium": "حوض زواحف خشبي صحراوي",
  "Cabinet Vivarium": "حوض زواحف بخزانة",
  "Arched Oak Terrarium": "حوض زواحف بقوس بلوط",
  "Column Tower Aquarium": "حوض أسماك على شكل برج",
  "Oak Pede": "حوض أسماك بقاعدة بلوط",
  "Wall-Recessed Aquarium": "حوض أسماك مدمج بالجدار",
  "Sage Console Aquarium": "حوض أسماك بخزانة خضراء",
  "Oak Rimless Stand": "حوض أسماك بلا إطار على حامل بلوط",
  "Arched Aquarium Cabinet": "خزانة حوض أسماك مقوسة",
  "Oak Pedestal Bowl": "حوض دائري على قاعدة بلوط",
  "Green Roof Shelter": "مأوى بسقف أخضر",
  "Two-Level Goat House": "بيت ماعز بطابقين",
  "Hay Rack Shelter": "مأوى مع رف للتبن",
  "Two-Stall Mini Barn": "حظيرة صغيرة بقسمين",
  "Oak A-Frame Shelter": "مأوى مثلث من البلوط",
  "Sage Field Shelter": "مأوى حقلي أخضر",
  "Portable Skid Shelter": "مأوى قابل للنقل",
  "Arched Window Stable": "إسطبل بنوافذ مقوسة",
  "Open Field Shelter": "مأوى حقلي مفتوح",
  "Navy Clock Stable Block": "إسطبل كحلي مع ساعة",
  "Oak Two-Stall Stable": "إسطبل بلوط بقسمين",
  "Sage Dutch-Door Stable": "إسطبل أخضر بباب هولندي",
};
export function seedPetHouses(): Product[] {
  return reference.map((r, index) => {
    const name = bi(r.name, names[r.name]);
    const featured = r.name === "Terracotta Roof Cat Villa";
    return {
      id: r.id,
      name,
      category: "pet-houses",
      pet: r.pet as Product["pet"],
      image: `/images/pet-houses/${r.image}`,
      gallery: [],
      active: true,
      description: featured
        ? bi(
            "A two-level cat villa with a terracotta-style roof, an upper balcony and an arched entrance. A reference design to explore with the team; materials and pet suitability still need confirmation.",
            "فيلا قطط بطابقين وسقف بتصميم قرميدي وشرفة علوية ومدخل مقوس. تصميم مرجعي للمناقشة مع الفريق؛ الخامات وملاءمته للحيوان بحاجة للتأكيد.",
          )
        : bi(
            `${r.name}. Explore the model pictured here, then confirm its dimensions, materials and suitability with our team. This is reference catalogue content, not an approved product specification.`,
            `${name.ar}. استكشف التصميم المعروض ثم تأكد من الأبعاد والخامات وملاءمته لحيوانك مع الفريق. محتوى مرجعي وليس مواصفات منتج معتمدة.`,
          ),
      variants: [
        {
          id: `${r.id}-standard`,
          label: bi("Reference model · 1 piece", "التصميم المرجعي · قطعة"),
          sku: `FO-HOUSE-${String(index + 1).padStart(3, "0")}`,
          unit: "piece",
          price: r.referencePrice ?? 0,
          stock: 0,
        },
      ],
      house: {
        ...emptyHouseMetadata(),
        collection: r.collection as HouseCollection,
        purchaseMode: r.referencePrice === null ? "inquiry" : "fixed",
        source: r.source,
        dimensions: featured
          ? { height: 95, width: 70, depth: 55, unit: "cm" }
          : null,
        features: featured
          ? [
              { ...bi("Tiled-style roof", "سقف بتصميم قرميدي"), id: "roof" },
              { ...bi("Upper balcony", "شرفة علوية"), id: "balcony" },
              { ...bi("Arched entrance", "مدخل مقوس"), id: "entrance" },
              { ...bi("Two levels", "طابقان"), id: "levels" },
            ]
          : [],
      },
    };
  });
}
