import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../context/LanguageContext.jsx";

export function useCopy() {
  const { locale, setLocale } = useI18n();
  const text = (en, ar) => (locale === "ar" ? ar : en);
  const local = (value) => {
    if (!value) return "";
    if (typeof value === "string") return value;
    return locale === "ar" ? value.ar || value.en || "" : value.en || value.ar || "";
  };
  return { locale, setLocale, text, local };
}

export function pickName(row, locale) {
  if (!row) return "";
  return locale === "en" ? row.nameEn || row.name || "" : row.name || row.nameEn || "";
}

export function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return `QAR ${amount.toFixed(2)}`;
}

export function productPrice(product) {
  const prices = (product?.variants || []).map((row) => Number(row.price)).filter((n) => Number.isFinite(n));
  if (prices.length) return Math.min(...prices);
  return Number(product?.price) || 0;
}

export function productImage(product) {
  return product?.images?.[0] || "";
}

export function waLink(raw, message) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${query}`;
}

export function useShopMeta() {
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    let live = true;
    api("/api/shop/meta")
      .then((row) => {
        if (!live) return;
        setMeta(row);
        setStatus("ready");
      })
      .catch(() => {
        if (!live) return;
        setStatus("error");
      });
    return () => {
      live = false;
    };
  }, []);
  return { meta, status, business: meta?.business || null };
}

export function useCatalog(query = "") {
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    let live = true;
    setStatus("loading");
    api(`/api/shop/catalog${query}`)
      .then((rows) => {
        if (!live) return;
        setProducts(Array.isArray(rows) ? rows : []);
        setStatus("ready");
      })
      .catch(() => {
        if (!live) return;
        setProducts([]);
        setStatus("error");
      });
    return () => {
      live = false;
    };
  }, [query]);
  return { products, status };
}

const PET_WORDS = {
  cats: ["cat", "kitten", "قط"],
  dogs: ["dog", "puppy", "كلب"],
  birds: ["bird", "parrot", "طير", "طيور", "ببغ"],
  "small-pets": ["rabbit", "hamster", "guinea", "rodent", "small", "أرنب", "هامستر"],
  "other-pets": ["horse", "goat", "deer", "حصان", "ماعز", "غزال"],
  reptiles: ["reptile", "lizard", "tortoise", "turtle", "snake", "زاحف", "سلح"],
  fish: ["fish", "aquarium", "سمك"],
  "exotic-pets": ["exotic", "lizard", "سحلية"],
};

export function matchesPet(product, petId) {
  if (!petId) return true;
  const words = PET_WORDS[petId] || [];
  const types = product?.petTypes || [];
  if (!types.length) return false;
  const blob = types.map((row) => `${row.name || ""} ${row.nameEn || ""}`).join(" ").toLowerCase();
  return words.some((word) => blob.includes(word));
}

export function matchesCategory(product, categoryParam, categories) {
  if (!categoryParam) return true;
  const byId = (categories || []).find((row) => row.id === categoryParam);
  if (byId) return product.categoryId === byId.id || product.category?.id === byId.id;
  const blob = `${product.category?.name || ""} ${product.category?.nameEn || ""}`.toLowerCase();
  if (categoryParam === "food") return /food|طعام|اغذية|أغذية|أكل/.test(blob);
  return blob.includes(String(categoryParam).toLowerCase());
}
