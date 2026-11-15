"use client";
import { useState } from "react";
import { ArrowLeft, Check, ShoppingBag } from "lucide-react";
import { useCart } from "@/mocks/MockDataProvider";
import { useCatalog } from "@/shared/api/catalog";
import { useCopy } from "@/shared/lib/copy";
import { Link } from "@/i18n/navigation";
import { Photo } from "@/shared/ui/Photo";
import { Notice, Empty, Field } from "@/shared/ui/BusinessUI";
import { CatalogState } from "@/shared/ui/CatalogState";
import { OfferList, OfferPrice } from "../components/OfferPrice";
import { isShopProduct, packPrice } from "../lib/catalogue";
import { NumberInput } from "@/shared/ui/NumberInput";
export function ProductPage({ id }: { id: string }) {
  const c = useCopy(),
    catalog = useCatalog(),
    { cart, setCart } = useCart(),
    p = catalog.products.find((p) => p.id === id && p.active && isShopProduct(p));
  const [variant, setVariant] = useState(""),
    [quantity, setQuantity] = useState(1),
    [added, setAdded] = useState(false),
    [selectedImage, setSelectedImage] = useState("");
  if (catalog.status !== "ready")
    return (
      <div className="customer-page">
        <CatalogState status={catalog.status} retry={catalog.retry} />
      </div>
    );
  const legacyHouse = catalog.products.find(
    (p) => p.id === id && p.active && p.category === "pet-houses" && p.house,
  );
  if (legacyHouse)
    return (
      <div className="customer-page">
        <Empty>
          {c.text(
            "This model is available on the separate Pet Houses page.",
            "هذا التصميم متاح في صفحة بيوت الحيوانات المستقلة.",
          )}
          <Link href={`/pet-houses/${legacyHouse.id}`} className="text-link">
            {c.text("View pet house", "عرض بيت الحيوان")}
          </Link>
        </Empty>
      </div>
    );
  if (!p)
    return (
      <Empty>
        {c.text("This product is no longer available.", "هذا المنتج غير متاح.")}
        <Link href="/shop">{c.text("Return to shop", "العودة للمتجر")}</Link>
      </Empty>
    );
  const v = p.variants.find((v) => v.id === variant) ?? p.variants[0],
    inCart = cart.find((l) => l.variantId === v.id)?.quantity ?? 0;
  // Main photo first, then the gallery photos added in the admin editor (2026-10-07).
  const images = [{ id: "primary", src: p.image }, ...(p.gallery ?? [])],
    image = images.find((x) => x.id === selectedImage) ?? images[0];
  function add() {
    if (quantity + inCart > v.stock) return;
    setCart(
      cart.some((l) => l.variantId === v.id)
        ? cart.map((l) =>
            l.variantId === v.id
              ? { ...l, quantity: l.quantity + quantity }
              : l,
          )
        : [...cart, { productId: p!.id, variantId: v.id, quantity }],
    );
    setAdded(true);
  }
  return (
    <div className="customer-page">
      <Link href="/shop" className="text-link">
        <ArrowLeft size={16} className="directional" />
        {c.text("Back to shop", "العودة للمتجر")}
      </Link>
      <div className="product-detail">
        <div className="product-gallery">
          <Photo src={image.src} alt={c.local(p.name)} className="detail-photo" />
          {images.length > 1 && (
            <div className="house-thumbnails">
              {images.map((photo, i) => (
                <button
                  type="button"
                  key={photo.id}
                  aria-label={c.text(
                    `Show photo ${i + 1}`,
                    `عرض الصورة ${i + 1}`,
                  )}
                  aria-pressed={photo.id === image.id}
                  onClick={() => setSelectedImage(photo.id)}
                >
                  <Photo src={photo.src} alt="" sizes="85px" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="eyebrow">
            {p.category} · {p.pet}
          </p>
          <h1>{c.local(p.name)}</h1>
          <p className="muted">{c.local(p.description)}</p>
          <p className="product-price">
            <OfferPrice price={v.price} salePrice={v.salePrice} />
          </p>
          <Field
            label={c.text("Size / weight / variant", "الحجم / الوزن / الخيار")}
          >
            <select
              value={v.id}
              onChange={(e) => {
                setVariant(e.target.value);
                setQuantity(1);
                setAdded(false);
              }}
            >
              {p.variants.map((x) => (
                <option value={x.id} key={x.id}>
                  {c.local(x.label)} · {c.money(packPrice(x))}
                  {packPrice(x) < x.price ? c.text(` (was ${c.money(x.price)})`, ` (بدلاً من ${c.money(x.price)})`) : ""}
                </option>
              ))}
            </select>
          </Field>
          <p className="small muted">
            <bdi>{v.sku}</bdi> ·{" "}
            {c.text(
              v.unit === "weight" ? "Fixed-weight pack" : "Piece",
              v.unit === "weight" ? "عبوة بوزن ثابت" : "قطعة",
            )}{" "}
            · {v.stock} {c.text("available", "متوفر")}
          </p>
          <Field label={c.text("Quantity", "الكمية")}>
            <NumberInput
              min={1}
              max={Math.max(1, v.stock - inCart)}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </Field>
          <button
            type="button"
            className="button button--primary"
            onClick={add}
            disabled={
              !Number.isInteger(quantity) ||
              quantity < 1 ||
              quantity + inCart > v.stock
            }
          >
            <ShoppingBag size={17} />
            {c.text(
              v.stock ? "Add to cart" : "Out of stock",
              v.stock ? "أضف للسلة" : "غير متوفر",
            )}
          </button>
          {added && (
            <p role="status" className="row added-message">
              <Check size={17} />
              {c.text("Added to your cart.", "تمت الإضافة للسلة.")}
              <Link className="text-link" href="/cart">
                {c.text("View cart", "عرض السلة")}
              </Link>
            </p>
          )}
          <OfferList
            offers={p.offers}
            packName={(product, pack) => {
              const item = catalog.products.find((entry) => entry.id === product);
              const variant = item?.variants.find((entry) => entry.id === pack);
              return item && variant ? `${c.local(item.name)} (${c.local(variant.label)})` : null;
            }}
          />
          <Notice />
        </div>
      </div>
    </div>
  );
}
