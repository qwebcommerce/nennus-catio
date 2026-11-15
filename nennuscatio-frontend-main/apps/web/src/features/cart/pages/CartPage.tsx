"use client";
import { Trash2 } from "lucide-react";
import { useCart } from "@/mocks/MockDataProvider";
import { DiscountRows } from "@/features/checkout/components/DiscountRows";
import { useCatalog } from "@/shared/api/catalog";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { cartQuotePlace, useCheckoutQuote, useDeliveryOptions } from "@/shared/api/orders";
import { useCopy } from "@/shared/lib/copy";
import { Photo } from "@/shared/ui/Photo";
import { ActionLink } from "@/shared/ui/ActionLink";
import { Empty, Notice } from "@/shared/ui/BusinessUI";
import { CatalogState } from "@/shared/ui/CatalogState";
import { NumberInput } from "@/shared/ui/NumberInput";
import { houseOrderable, madeToOrder, quantityLimit } from "@/features/pet-houses/lib/ordering";
/**
 * The cart (kept in this browser since 7b-2) against the current catalogue: API or mock. In API mode
 * (11e) the server prices the items, so each discount and the total saved are the ones checkout gives.
 * A Pet House (#14) can be in it once ready to order online; a made-to-order one is not limited by stock.
 */
export function CartPage() {
  const c = useCopy(),
    catalog = useCatalog(),
    { source } = useRepositories(),
    { cart, setCart, ready } = useCart();
  const rows = cart.map((l) => {
    const p = catalog.products.find((p) => p.id === l.productId),
      v = p?.variants.find((v) => v.id === l.variantId);
    return { ...l, p, v };
  });
  // A house only once it can be ordered online, and only against the real API (the demo keeps houses out).
  const houseOk = (r: (typeof rows)[number]) => !r.p?.house || (source === "api" && houseOrderable(r.p));
  const valid = rows.every((r) => r.p?.active && r.v && houseOk(r) && r.quantity <= quantityLimit(r.p, r.v));
  const houses = rows.filter((r) => r.p?.house && houseOk(r));
  const options = useDeliveryOptions(source === "api" && cart.length > 0);
  const place = cartQuotePlace(options.data, houses.some((r) => r.p?.house?.fulfilment === "delivery"));
  // Only a cart checkout would take is priced; the items keep the page's order.
  const quote = useCheckoutQuote(
    ready && catalog.status === "ready" && rows.length && valid && place
      ? { ...place, lines: cart.map((l) => ({ product: l.productId, variant: l.variantId, quantity: l.quantity })), code: null }
      : null,
  );
  const priced = quote.data && !quote.isPlaceholderData ? quote.data : null;
  if (!ready)
    return (
      <div className="customer-page">
        <p role="status" aria-busy="true" className="muted">
          {c.text("Loading your cart…", "جارٍ تحميل سلتك…")}
        </p>
      </div>
    );
  if (catalog.status !== "ready")
    return (
      <div className="customer-page">
        <CatalogState status={catalog.status} retry={catalog.retry} />
      </div>
    );
  const subtotal = rows.reduce((a, b) => a + (b.v?.price ?? 0) * b.quantity, 0);
  const lineDiscount = (r: (typeof rows)[number]) =>
    priced?.lines.find((line) => line.product === r.productId && line.variant === r.variantId)?.discount ?? 0;
  return (
    <div className="customer-page">
      <header className="customer-heading">
        <h1>{c.text("Your cart", "سلتك")}</h1>
        <p>
          {c.text(
            "A few good things for your companion.",
            "بعض الأشياء اللطيفة لرفيقك.",
          )}
        </p>
      </header>
      {!rows.length ? (
        <Empty>
          {c.text(
            "Your cart is waiting for a little something.",
            "سلتك بانتظار شيء لطيف.",
          )}
          <ActionLink href="/shop">
            {c.text("Explore the shop", "اكتشف المتجر")}
          </ActionLink>
        </Empty>
      ) : (
        <div className="checkout-grid">
          <section className="panel">
            {rows.map((r) => (
              <article className="cart-row" key={r.variantId}>
                <Photo
                  src={r.p?.image ?? "/images/essentials.png"}
                  alt={r.p ? c.local(r.p.name) : ""}
                />
                <div>
                  <h2>
                    {r.p
                      ? c.local(r.p.name)
                      : c.text("Unavailable product", "منتج غير متاح")}
                  </h2>
                  <p className="muted">
                    {r.v ? c.local(r.v.label) : r.variantId}
                  </p>
                  <strong>{c.money(r.v?.price ?? 0)}</strong>
                  {lineDiscount(r) > 0 && (
                    <p className="saved-note">
                      {c.text("Offer", "عرض")} {c.discount(lineDiscount(r))}
                    </p>
                  )}
                  {r.p?.house && houseOk(r) && r.p.house.leadTime && (
                    <span className="house-line-note">
                      {madeToOrder(r.p)
                        ? c.text(
                            `Pet House · made to order, ready in about ${r.p.house.leadTime.minDays}–${r.p.house.leadTime.maxDays} days`,
                            `بيت حيوان · يُصنع عند الطلب، جاهز خلال ${r.p.house.leadTime.minDays}–${r.p.house.leadTime.maxDays} يوماً تقريباً`,
                          )
                        : c.text(
                            `Pet House · ready in about ${r.p.house.leadTime.minDays}–${r.p.house.leadTime.maxDays} days`,
                            `بيت حيوان · جاهز خلال ${r.p.house.leadTime.minDays}–${r.p.house.leadTime.maxDays} يوماً تقريباً`,
                          )}
                    </span>
                  )}
                  {r.p?.house && !houseOk(r) ? (
                    <p className="form-error">
                      {c.text(
                        "This Pet House cannot be ordered online at the moment. Please remove it, or ask us about it on WhatsApp.",
                        "لا يمكن طلب بيت الحيوان هذا عبر الموقع حالياً. أزله، أو استفسر عنه عبر واتساب.",
                      )}
                    </p>
                  ) : (
                    (!r.p?.active || !r.v || r.quantity > quantityLimit(r.p, r.v)) && (
                      <p className="form-error">
                        {r.v && r.v.stock > 0
                          ? c.text(
                              `Only ${r.v.stock} left. Lower the quantity or remove this item.`,
                              `المتوفر ${r.v.stock} فقط. قلّل الكمية أو أزل المنتج.`,
                            )
                          : c.text(
                              "No longer available. Please remove this item.",
                              "لم يعد متوفراً. أزل هذا المنتج.",
                            )}
                      </p>
                    )
                  )}
                </div>
                <label className="field">
                  <span>{c.text("Quantity", "الكمية")}</span>
                  <NumberInput
                    min={1}
                    max={Math.max(1, quantityLimit(r.p, r.v))}
                    value={r.quantity}
                    onChange={(e) =>
                      setCart(
                        cart.map((l) =>
                          l.variantId === r.variantId
                            ? {
                                ...l,
                                quantity: Math.max(
                                  1,
                                  Math.floor(Number(e.target.value) || 1),
                                ),
                              }
                            : l,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={c.text(
                    `Remove ${r.p?.name.en ?? "item"}`,
                    `إزالة ${r.p?.name.ar ?? "المنتج"}`,
                  )}
                  onClick={() =>
                    setCart(cart.filter((l) => l.variantId !== r.variantId))
                  }
                >
                  <Trash2 size={18} />
                </button>
              </article>
            ))}
          </section>
          <aside className="panel order-summary">
            <h2>{c.text("Order summary", "ملخص الطلب")}</h2>
            <div className="row spread">
              <span>{c.text("Subtotal", "المجموع")}</span>
              <strong>{c.money(priced?.subtotal ?? subtotal)}</strong>
            </div>
            {priced && priced.discount > 0 && (
              <>
                <DiscountRows promotions={priced.promotions} />
                <div className="row spread order-total">
                  <span>{c.text("Items total", "إجمالي المنتجات")}</span>
                  <strong>{c.money(priced.subtotal - priced.discount)}</strong>
                </div>
                <p className="saved-note">
                  {c.text(`You save ${c.money(priced.discount)}`, `توفّر ${c.money(priced.discount)}`)}
                </p>
              </>
            )}
            {quote.isFetching && (
              <p className="muted small" role="status">
                {c.text("Checking offers…", "جارٍ التحقق من العروض…")}
              </p>
            )}
            {houses.length > 0 && (
              <div className="note-box">
                <p>
                  {c.text(
                    "Each Pet House adds its own delivery charge at checkout, on top of your area's usual fee.",
                    "يضيف كل بيت حيوان رسوم توصيله عند إتمام الطلب، إضافة إلى الرسوم المعتادة لمنطقتك.",
                  )}
                </p>
                {houses.length < rows.length && (
                  <p>
                    {c.text(
                      "Everything in this order arrives with your Pet House. Need the other items sooner? Order them separately.",
                      "يصل كل ما في هذا الطلب مع بيت الحيوان. تحتاج المنتجات الأخرى أسرع؟ اطلبها في طلب منفصل.",
                    )}
                  </p>
                )}
              </div>
            )}
            <p className="muted small">
              {source === "api"
                ? c.text(
                    "Delivery is added at checkout, where you can also enter a promo code. Guest checkout is available.",
                    "يُضاف التوصيل عند إتمام الطلب، حيث يمكنك أيضاً إدخال رمز ترويجي. الطلب متاح بدون حساب.",
                  )
                : c.text(
                    "Delivery fees and policies are provisional. Guest checkout is available.",
                    "رسوم وسياسات التوصيل تجريبية. الطلب متاح بدون حساب.",
                  )}
            </p>
            {valid ? (
              <ActionLink href="/checkout">
                {c.text("Continue to checkout", "المتابعة للدفع")}
              </ActionLink>
            ) : (
              <p className="form-error">
                {c.text(
                  "Please review unavailable items first.",
                  "راجع المنتجات غير المتاحة أولاً.",
                )}
              </p>
            )}
            <Notice />
          </aside>
        </div>
      )}
    </div>
  );
}
