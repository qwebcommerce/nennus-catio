import React, { useEffect, useState } from "react";
import { useI18n } from "../context/LanguageContext.jsx";
import { productDisplayName } from "../utils/productName.js";
import { useSafeImageSrc } from "../hooks/useSafeImageSrc.js";
import { ProductImagePlaceholder } from "./ProductImagePlaceholder.jsx";
import { useOrgCurrency } from "../lib/orgCurrency.js";

const PET_KEYS = { CAT: "pet.cat", DOG: "pet.dog", OTHER: "pet.other" };

/**
 * بطاقة منتج لشاشة POS — صورة، اسم، سعر؛ النقر على البطاقة يضيف للسلة
 * @param {boolean} [compact] — بطاقة أصغر وأخف (شبكة 5 أعمدة في POS)
 */
export function ProductCard({
  product,
  onAdd,
  disabled,
  useWholesalePricing = false,
  compact = false,
}) {
  const { t, locale } = useI18n();
  const { label: currencyLabel } = useOrgCurrency();
  const [imgErr, setImgErr] = useState(false);
  const inv = product.inventories?.[0];
  const stock = inv?.quantity ?? 0;
  const out = stock <= 0;
  const rawUrl = product.imageUrl ?? product.image_url;
  const imgUrl = useSafeImageSrc(rawUrl);

  useEffect(() => {
    setImgErr(false);
  }, [product.id, rawUrl]);

  const canAdd = !disabled && !out;

  const retail = Number(product.price);
  const wholesale =
    product.wholesalePrice != null && product.wholesalePrice !== ""
      ? Number(product.wholesalePrice)
      : null;
  const displayPrice =
    useWholesalePricing && wholesale != null && !Number.isNaN(wholesale) ? wholesale : retail;

  const addOne = () => {
    if (!canAdd) return;
    onAdd(product);
  };

  return (
    <div
      className={`card product-card-pos${canAdd ? " product-card-pos--clickable" : ""}${compact ? " product-card-pos--compact" : ""}`}
      role={canAdd ? "button" : undefined}
      tabIndex={canAdd ? 0 : undefined}
      onClick={canAdd ? addOne : undefined}
      onKeyDown={
        canAdd
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                addOne();
              }
            }
          : undefined
      }
      style={{
        display: "flex",
        flexDirection: "column",
        gap: compact ? 4 : 8,
        minHeight: compact ? 0 : 220,
        cursor: canAdd ? "pointer" : "default",
      }}
    >
      <div
        style={{
          aspectRatio: compact ? "1 / 1" : "4/3",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--surface2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          maxHeight: compact ? 72 : undefined,
        }}
      >
        {imgUrl && !imgErr ? (
          <img
            src={imgUrl}
            alt=""
            decoding="async"
            onError={() => setImgErr(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            loading="lazy"
          />
        ) : (
          <ProductImagePlaceholder />
        )}
      </div>
      <div className="product-card-pos__title">{productDisplayName(product, locale)}</div>
      {product.brand?.name && !compact ? (
        <div style={{ fontSize: 11, color: "var(--muted)" }}>{product.brand.name}</div>
      ) : null}
      <div style={{ fontSize: compact ? 10 : 12, color: "var(--accent2)" }}>
        {t(PET_KEYS[product.petType] || "pet.other")}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", gap: 4 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontWeight: 800, fontSize: compact ? 13 : 18 }}>
            {displayPrice.toFixed(2)} {currencyLabel}
          </span>
          {useWholesalePricing && wholesale != null ? (
            <span style={{ fontSize: 10, color: "var(--muted)" }}>
              {t("pos.retailShort")} {retail.toFixed(2)}
            </span>
          ) : wholesale != null ? (
            <span style={{ fontSize: 10, color: "var(--muted)" }}>
              {t("pos.wholesaleShort")} {wholesale.toFixed(2)}
            </span>
          ) : null}
        </div>
        <span style={{ fontSize: compact ? 9 : 11, color: out ? "var(--danger)" : "var(--muted)", whiteSpace: "nowrap" }}>
          {t("productCard.stock")} {stock}
        </span>
      </div>
    </div>
  );
}
