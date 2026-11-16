/** Pictures for pet types. The pet types themselves come from staff (Pet types page) via /api/shop/meta. */
const PICTURES = [
  { words: ["cat", "kitten", "قط", "قطط"], image: "/images/cat-care.png" },
  { words: ["dog", "puppy", "كلب", "كلاب"], image: "/images/reference-refresh/dog-portrait.png" },
  { words: ["bird", "parrot", "طير", "طيور", "ببغ"], image: "/images/bird.png" },
  { words: ["rabbit", "guinea", "أرنب", "ارنب"], image: "/images/reference-refresh/rabbit-portrait.png" },
  { words: ["hamster", "rodent", "small", "هامستر", "قوارض"], image: "/images/reference-refresh/hamster-portrait.png" },
  { words: ["tortoise", "turtle", "reptile", "سلحف", "زواحف", "زاحف"], image: "/images/reference-refresh/tortoise-portrait.png" },
  { words: ["fish", "aquarium", "سمك", "أسماك"], image: "/images/reference-refresh/fish-portrait.png" },
  { words: ["lizard", "exotic", "سحلية", "غريب"], image: "/images/reference-refresh/lizard-portrait.png" },
];
const FALLBACK_IMAGE = "/images/cat-care.png";

export function petImage(type) {
  const blob = `${type?.name || ""} ${type?.nameEn || ""}`.toLowerCase();
  return PICTURES.find((row) => row.words.some((word) => blob.includes(word)))?.image || FALLBACK_IMAGE;
}

/** Staff-defined pet types as filter buttons: { id, en, ar, image }. */
export function petGroups(petTypes) {
  return (petTypes || []).map((type) => ({
    id: type.id,
    en: type.nameEn || type.name,
    ar: type.name || type.nameEn,
    image: petImage(type),
  }));
}
