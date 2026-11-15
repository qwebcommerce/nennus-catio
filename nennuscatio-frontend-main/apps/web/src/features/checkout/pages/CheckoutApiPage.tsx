"use client";

import {
  ACCOUNT_LIMITS,
  type AddressPin,
  type CheckoutQuote,
  type CheckoutQuoteRequest,
  type CheckoutRequest,
  checkoutRequestSchema,
  type Fulfilment,
  ORDER_LIMITS,
  type SavedAddress,
  savedAddressInputSchema,
} from "@nennus-catio/contracts";
import { useRef, useState } from "react";
import { fieldsFromSaved, SavedAddressChoice } from "@/features/account/components/SavedAddressChoice";
import { cartHouseDays, earliestHouseDay, houseOrderable, madeToOrder, quantityLimit } from "@/features/pet-houses/lib/ordering";
import { OfferPrice } from "@/features/shop/components/OfferPrice";
import { Link, useRouter } from "@/i18n/navigation";
import { accountErrorMessage, useSaveAddress, useSavedAddresses } from "@/shared/api/account";
import { ApiError } from "@/shared/api/client";
import {
  orderErrorMessage,
  orderHref,
  rememberGuestKey,
  useBookableWindows,
  useCheckoutProducts,
  useCheckoutQuote,
  useDeliveryOptions,
  usePlaceOrder,
  useTryCheckoutCode,
} from "@/shared/api/orders";
import { useCustomerSession } from "@/shared/api/sessions";
import { useCart } from "@/shared/cart/CartProvider";
import { useCopy } from "@/shared/lib/copy";
import { customerLoginHref } from "@/shared/lib/customer-login";
import { areasByCity } from "@/shared/lib/delivery-areas";
import { formatQatarDay } from "@/shared/lib/format";
import { ActionLink } from "@/shared/ui/ActionLink";
import { Empty, Field, Notice } from "@/shared/ui/BusinessUI";
import { DiscountRows } from "../components/DiscountRows";
import { PromoCodeBox } from "../components/PromoCodeBox";
import { NumberInput } from "@/shared/ui/NumberInput";
import { ShareLocation } from "@/shared/ui/ShareLocation";
import { SlotPicker, windowsByDay } from "@/shared/ui/SlotPicker";

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  areaId: "",
  windowId: "",
  zone: "",
  street: "",
  building: "",
  floor: "",
  flat: "",
  landmark: "",
  note: "",
  pin: null as AddressPin | null,
};
type Form = typeof EMPTY_FORM;
const EMPTY_ADDRESS = { areaId: "", zone: "", street: "", building: "", floor: "", flat: "", landmark: "", note: "", pin: null };

/**
 * Field messages in the customer's language. The contract and the server describe problems for
 * developers ("Invalid UUID", "Only 2 left."); the raw text is only a last resort.
 */
export function checkoutFieldMessage(
  path: string,
  raw: string | undefined,
  text: (en: string, ar: string) => string,
): string | undefined {
  if (!raw) return undefined;
  if (path === "contact.name") return text("Please enter your name.", "يرجى إدخال اسمك.");
  if (path === "contact.email") return text("Please enter a valid email address.", "يرجى إدخال بريد إلكتروني صالح.");
  if (path === "contact.phone") {
    // The payment company accepts only these (8c): another country's local format fails at payment.
    return text(
      "Use a Qatari number, or add your country code with + (for example +63 912 345 6789).",
      "استخدم رقماً قطرياً، أو أضف رمز الدولة مع + (مثلاً ‎+63 912 345 6789).",
    );
  }
  if (path === "delivery.areaId") {
    return /no longer/.test(raw)
      ? text("We no longer deliver to this area. Please choose another.", "لم نعد نوصّل إلى هذه المنطقة. اختر منطقة أخرى.")
      : text("Choose your area.", "اختر منطقتك.");
  }
  if (path === "delivery.windowId") return text("Choose a delivery time.", "اختر موعد التوصيل.");
  if (/^delivery\.address\.(zone|street|building)$/.test(path)) return text("Numbers only.", "أرقام فقط.");
  if (path === "fulfilment") {
    return /delivered only/.test(raw)
      ? text("A Pet House in your cart is delivered only. Please choose delivery.", "يُوصَّل بيت الحيوان في سلتك فقط. اختر التوصيل.")
      : text("Pickup from the shop is not available at the moment.", "الاستلام من المتجر غير متاح حالياً.");
  }
  if (/^lines\.\d+\.quantity$/.test(path)) {
    return text(
      `You can order up to ${ORDER_LIMITS.maxQuantity} of one item.`,
      `يمكنك طلب ${ORDER_LIMITS.maxQuantity} قطعة كحد أقصى من المنتج الواحد.`,
    );
  }
  if (path.startsWith("lines.")) {
    const left = raw.match(/Only (\d+) left/);
    if (left) return text(`Only ${left[1]} left.`, `المتوفر ${left[1]} فقط.`);
    if (/sold out/.test(raw)) return text("This item has just sold out.", "نفد هذا المنتج للتو.");
    if (/Pet House cannot be ordered online/.test(raw)) {
      return text("This Pet House cannot be ordered online at the moment.", "لا يمكن طلب بيت الحيوان هذا عبر الموقع حالياً.");
    }
    return text("This item is no longer available.", "لم يعد هذا المنتج متوفراً.");
  }
  return raw;
}

/**
 * Checkout against the real API (7b-2, D116-D122). The server re-checks everything; this page
 * shows live totals, sends one idempotency key per exact request (a changed request gets a new
 * key, a retry of the same one reuses it) and explains every refusal. Logged in (10b): the name and
 * phone come from the profile, "Deliver to" offers the saved addresses, and a new address can be saved
 * (through the account, before the order is placed; the checkout request itself does not change).
 */
export function CheckoutApiPage() {
  const c = useCopy();
  const router = useRouter();
  const { cart, setCart, ready } = useCart();
  const products = useCheckoutProducts();
  const options = useDeliveryOptions();
  const session = useCustomerSession();
  const savedAddresses = useSavedAddresses(Boolean(session.data));
  const saveAddress = useSaveAddress();
  const place = usePlaceOrder();
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [chosen, setChosen] = useState<Fulfilment | null>(null);
  /** The saved address delivered to, or null for an address typed here. */
  const [addressId, setAddressId] = useState<string | null>(null);
  /** "Save this address": null until the customer changes it (then ticked only when none is saved yet). */
  const [saveChoice, setSaveChoice] = useState<boolean | null>(null);
  const [saveLabel, setSaveLabel] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  /** The customer the form was filled in for, from their profile and default address (once). */
  const [filledFor, setFilledFor] = useState<string | null>(null);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  /** The applied promo code (11e), and why a typed code was not kept (a code we do not know). */
  const [code, setCode] = useState<string | null>(null);
  const [codeNote, setCodeNote] = useState<CheckoutQuote["code"]>(null);
  /** "Price changed" (D207): the server's price for this exact checkout, confirmed by placing the order again. */
  const [confirmed, setConfirmed] = useState<{ key: string; quote: CheckoutQuote } | null>(null);
  const tryCode = useTryCheckoutCode();
  const attempt = useRef<{ body: string; key: string } | null>(null);
  // The cart's Pet Houses (#14), from the catalogue: a "delivery only" one means no pickup for this order.
  const houses = cart.flatMap((line) => {
    const product = products.data?.find((item) => item.id === line.productId);
    return product?.house ? [product] : [];
  });
  const deliveryOnlyHouse = houses.some((product) => product.house?.fulfilment === "delivery");
  const pickupOffered = options.data?.pickup.enabled ?? false;
  const pickupEnabled = pickupOffered && !deliveryOnlyHouse;
  const areas = options.data?.areas ?? [];
  // Delivery unless the customer picked pickup (and pickup is offered), or there is nowhere to deliver.
  const fulfilment: Fulfilment =
    pickupEnabled && (chosen === "pickup" || areas.length === 0) ? "pickup" : "delivery";

  // The server prices the cart (11e): the items, the area's fee, the offers and the code. Until an area is
  // chosen, the first one prices the items and the page shows the total before delivery.
  const area = areas.find((entry) => entry.id === form.areaId) ?? null;
  const pricedArea = fulfilment === "delivery" ? (area ?? areas[0] ?? null) : null;
  const cartOk =
    products.isSuccess &&
    cart.every((line) => {
      const product = products.data.find((item) => item.id === line.productId);
      const variant = product?.variants.find((item) => item.id === line.variantId);
      // A Pet House once ready (#14); a made-to-order one is not limited by stock.
      return variant !== undefined && (!product?.house || houseOrderable(product)) && line.quantity <= quantityLimit(product, variant);
    });
  const quoteFor = (withCode: string | null): CheckoutQuoteRequest | null =>
    ready && cart.length > 0 && cartOk && (fulfilment === "pickup" || pricedArea)
      ? {
          fulfilment,
          delivery: pricedArea ? { areaId: pricedArea.id } : null,
          lines: cart.map((line) => ({ product: line.productId, variant: line.variantId, quantity: line.quantity })),
          code: withCode,
        }
      : null;
  const quoteRequest = quoteFor(code);
  const quote = useCheckoutQuote(quoteRequest);
  const email = session.data ? session.data.email : form.email.trim().toLowerCase();
  // A confirmed price is for this cart, area, code and email only; any change asks the server again.
  const priceKey = quoteRequest ? `${JSON.stringify(quoteRequest)}|${email}` : null;
  const confirmedQuote = confirmed && confirmed.key === priceKey ? confirmed.quote : null;
  /** The price for exactly what is on screen, or null while it is being asked for. */
  const current = confirmedQuote ?? (quote.data && !quote.isPlaceholderData ? quote.data : null);
  /** What the summary shows: the current price, or the last one while the new one loads. */
  const shown = confirmedQuote ?? quote.data ?? null;
  // With a Pet House (#14), delivery times start from the day it can be ready: the server's count once the
  // quote answers, the catalogue's until then. Times are asked for once the catalogue says whether there is one.
  const houseDays = houses.length > 0 ? (shown?.houseLeadDays ?? cartHouseDays(houses)) : null;
  const windows = useBookableWindows(fulfilment === "delivery" && products.isSuccess, houseDays ?? 0);

  // Saved addresses are waited for, but a failure to read them only leaves them out.
  if (!ready || products.isPending || options.isPending || session.isPending || (session.data && savedAddresses.isPending)) {
    return (
      <div className="customer-page">
        <p role="status" aria-busy="true" className="muted">
          {c.text("Loading checkout…", "جارٍ تحميل صفحة الطلب…")}
        </p>
      </div>
    );
  }
  if (products.isError || options.isError) {
    return (
      <Empty>
        {c.text("Checkout could not be loaded.", "تعذّر تحميل صفحة الطلب.")}
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            void products.refetch();
            void options.refetch();
          }}
        >
          {c.text("Retry", "أعد المحاولة")}
        </button>
      </Empty>
    );
  }
  if (!cart.length) {
    return (
      <Empty>
        {c.text("Your cart is empty.", "سلتك فارغة.")}
        <ActionLink href="/shop">{c.text("Go to shop", "اذهب للمتجر")}</ActionLink>
      </Empty>
    );
  }

  const customer = session.data ?? null;
  const rows = cart.map((line) => {
    const product = products.data.find((item) => item.id === line.productId);
    const variant = product?.variants.find((item) => item.id === line.variantId);
    const problem = !product || !variant
      ? c.text("No longer available", "لم يعد متوفراً")
      : product.house && !houseOrderable(product)
        ? c.text("This Pet House cannot be ordered online at the moment", "لا يمكن طلب بيت الحيوان هذا عبر الموقع حالياً")
        : line.quantity > quantityLimit(product, variant)
          ? c.text(`Only ${variant.stock} left`, `المتوفر ${variant.stock} فقط`)
          : null;
    return { line, product, variant, problem };
  });
  if (rows.some((row) => row.problem)) {
    return (
      <Empty>
        {c.text("Some items in your cart need your attention before checkout.", "بعض المنتجات في سلتك تحتاج مراجعة قبل الطلب.")}
        <ActionLink href="/cart">{c.text("Review cart", "راجع السلة")}</ActionLink>
      </Empty>
    );
  }

  // Saved addresses (10b): one we deliver to now can be chosen; the others stay listed with the reason.
  const saved = customer ? (savedAddresses.data ?? []) : [];
  const deliverable = (address: SavedAddress) => address.delivery && areas.some((entry) => entry.id === address.area?.id);
  if (customer && filledFor !== customer.id) {
    // Once, when the page has what it needs: the profile's name and phone, and the default address.
    const first = saved.find((address) => address.isDefault && deliverable(address)) ?? saved.find(deliverable) ?? null;
    setFilledFor(customer.id);
    setAddressId(first?.id ?? null);
    setForm((current) => ({
      ...current,
      name: current.name || (customer.name ?? ""),
      phone: current.phone || (customer.phone ?? ""),
      ...(first ? fieldsFromSaved(first) : {}),
    }));
  }
  // Saving is offered only once the saved addresses were read: otherwise it is unknown whether there is room.
  const offerSave = customer !== null && savedAddresses.isSuccess && addressId === null && saved.length < ACCOUNT_LIMITS.maxAddresses;
  const saveChecked = offerSave && (saveChoice ?? saved.length === 0);
  const label = saveLabel ?? (saved.length === 0 ? c.text("Home", "المنزل") : "");
  const chooseAddress = (address: SavedAddress | null) => {
    setAddressId(address?.id ?? null);
    setSaveError("");
    setForm((current) => ({ ...current, ...(address ? fieldsFromSaved(address) : EMPTY_ADDRESS) }));
  };

  const subtotal = shown?.subtotal ?? rows.reduce((sum, row) => sum + (row.variant?.price ?? 0) * row.line.quantity, 0);
  const discount = shown?.discount ?? 0;
  const fee = fulfilment === "pickup" || !area ? 0 : (shown?.deliveryFee ?? area.fee);
  // The houses' own charges (#14, D268), shown on their own line; the area's part is the rest.
  const houseFee = fulfilment === "pickup" || !area ? 0 : (shown?.houseDeliveryFee ?? 0);
  const houseCount = rows.reduce((sum, row) => sum + (row.product?.house ? row.line.quantity : 0), 0);
  // Before an area is chosen, the total before delivery.
  const total = shown ? (fulfilment === "pickup" || area ? shown.total : shown.subtotal - shown.discount) : subtotal + fee;
  const quoteLine = (row: (typeof rows)[number]) =>
    shown?.lines.find((line) => line.product === row.line.productId && line.variant === row.line.variantId) ?? null;
  const serverError = place.error instanceof ApiError ? place.error : null;
  const codeRefused = serverError?.code === "PROMO_CODE_INVALID" ? serverError : null;

  function applyCode(typed: string) {
    const request = quoteFor(typed);
    if (!request) return;
    setCodeNote(null);
    tryCode.mutate(request, {
      onSuccess: (result) => {
        // A code we do not know is not kept, so later quotes do not count it as another guess (D207).
        if (result.code?.status === "unknown") {
          setCodeNote(result.code);
          return;
        }
        setCode(typed);
        place.reset();
      },
    });
  }
  function removeCode() {
    setCode(null);
    setCodeNote(null);
    tryCode.reset();
    place.reset();
  }
  const fieldMessage = (path: string) =>
    checkoutFieldMessage(path, localErrors[path] ?? serverError?.fields[path], c.text);
  // A line's problem may be about the line or its quantity (`lines.0.quantity`, review L12).
  const lineMessage = (index: number) => fieldMessage(`lines.${index}`) ?? fieldMessage(`lines.${index}.quantity`);
  const update = (field: keyof Form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (place.isPending || saveAddress.isPending) return;
    const request: Omit<CheckoutRequest, "idempotencyKey"> = {
      locale: c.locale,
      contact: { name: form.name, email: customer ? customer.email : form.email, phone: form.phone },
      fulfilment,
      delivery:
        fulfilment === "delivery"
          ? {
              areaId: form.areaId,
              windowId: form.windowId,
              address: {
                zone: form.zone,
                street: form.street,
                building: form.building,
                floor: form.floor,
                flat: form.flat,
                landmark: form.landmark,
                note: form.note,
                pin: form.pin,
              },
            }
          : null,
      // Same order as the page, so a server message about `lines.N` points at the right row.
      lines: cart.map((line) => ({ product: line.productId, variant: line.variantId, quantity: line.quantity })),
      code,
      // The server's price for what is on screen (11e); a different total stops checkout (PRICE_CHANGED).
      expectedTotal: current?.total ?? total,
    };
    const body = JSON.stringify(request);
    if (attempt.current?.body !== body) attempt.current = { body, key: crypto.randomUUID() };
    const parsed = checkoutRequestSchema.safeParse({ ...request, idempotencyKey: attempt.current.key });
    if (!parsed.success) {
      setLocalErrors(Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])));
      place.reset();
      return;
    }
    // Only a price for exactly this checkout is sent; a code that gives nothing is removed first.
    if (!current) {
      setLocalErrors({ price: "pending" });
      place.reset();
      return;
    }
    if (code && current.code && current.code.status !== "applied") {
      setLocalErrors({ code: "refused" });
      place.reset();
      return;
    }
    const sentKey = priceKey;
    setLocalErrors({});
    setSaveError("");
    if (fulfilment === "delivery" && saveChecked && request.delivery) {
      // Saved first, through the account (plan section 4); if the order then fails, the address stays saved.
      const input = savedAddressInputSchema.safeParse({ label, areaId: form.areaId, address: request.delivery.address, makeDefault: false });
      if (!input.success) {
        setLocalErrors({ saveLabel: c.text("Give the address a name, for example Home.", "سمِّ العنوان، مثلاً المنزل.") });
        place.reset();
        return;
      }
      try {
        const before = new Set(saved.map((address) => address.id));
        const list = await saveAddress.mutateAsync({ address: null, input: input.data });
        // From now on it is a saved address: trying again does not save it twice.
        setAddressId(list.find((address) => !before.has(address.id))?.id ?? null);
        setSaveChoice(false);
      } catch (error) {
        setSaveError(accountErrorMessage(error, c.text, "address"));
        return;
      }
    }
    place.mutate(parsed.data, {
      onSuccess: (result) => {
        setCart([]);
        if (result.guestKey) rememberGuestKey(result.order.reference, result.guestKey);
        router.push(orderHref(result.order.reference, result.guestKey));
      },
      onError: (error) => {
        if (!(error instanceof ApiError)) return;
        if (error.code === "SLOT_UNAVAILABLE") {
          setForm((current) => ({ ...current, windowId: "" }));
          void windows.refetch();
        }
        // The price for this checkout, worked out with the customer's email: shown, and confirmed by placing
        // the order again. Never asked for again without the email, or a returning guest would loop (D207).
        if (error.code === "PRICE_CHANGED" && error.quote && sentKey) setConfirmed({ key: sentKey, quote: error.quote });
        if (error.code === "PRICE_CHANGED" || error.code === "OUT_OF_STOCK" || error.code === "ITEM_UNAVAILABLE") {
          void products.refetch();
          void options.refetch();
        }
      },
    });
  }

  // The delivery times as the shared date and time picker shows them (D249), with the places left.
  const delivery = windowsByDay(windows.data ?? [], (window) => c.text(`${window.seatsLeft} left`, `متبقي ${window.seatsLeft}`));
  const chosenWindow = windows.data?.find((window) => window.id === form.windowId) ?? null;
  const error = (path: string) => {
    const message = fieldMessage(path);
    return message ? (
      <p className="form-error" id={`error-${path}`}>
        {message}
      </p>
    ) : null;
  };
  const describedBy = (path: string) => (fieldMessage(path) ? `error-${path}` : undefined);

  return (
    <div className="customer-page">
      <header className="customer-heading">
        <h1>{c.text("A little closer to happy.", "خطوة أقرب للسعادة.")}</h1>
        <p>
          {customer
            ? c.text(`Ordering as ${customer.email}`, `الطلب باسم ${customer.email}`)
            : c.text("Guest checkout · no account needed", "اطلب كضيف · لا تحتاج حساباً")}
        </p>
      </header>
      <form onSubmit={(event) => void submit(event)} className="checkout-grid" noValidate>
        <div className="panel form-stack">
          <h2>{c.text("Your details", "بياناتك")}</h2>
          <Field label={c.text("Name", "الاسم")}>
            <input
              value={form.name}
              onChange={update("name")}
              autoComplete="name"
              maxLength={100}
              aria-invalid={Boolean(fieldMessage("contact.name"))}
              aria-describedby={describedBy("contact.name")}
            />
          </Field>
          {error("contact.name")}
          <Field label={c.text("Email", "البريد الإلكتروني")}>
            <input
              type="email"
              dir="ltr"
              value={customer ? customer.email : form.email}
              onChange={update("email")}
              readOnly={Boolean(customer)}
              autoComplete="email"
              maxLength={254}
              aria-invalid={Boolean(fieldMessage("contact.email"))}
              aria-describedby={describedBy("contact.email")}
            />
          </Field>
          {error("contact.email")}
          <Field label={c.text("Phone", "الهاتف")}>
            <NumberInput
              kind="phone"
              dir="ltr"
              value={form.phone}
              onChange={update("phone")}
              autoComplete="tel"
              maxLength={20}
              aria-invalid={Boolean(fieldMessage("contact.phone"))}
              aria-describedby={describedBy("contact.phone")}
            />
          </Field>
          {error("contact.phone")}

          <h2>{c.text("Delivery or pickup", "التوصيل أو الاستلام")}</h2>
          <fieldset className="chips chips--fieldset">
            <legend className="sr-only">{c.text("Delivery or pickup", "التوصيل أو الاستلام")}</legend>
            {areas.length > 0 && (
              <button
                type="button"
                aria-pressed={fulfilment === "delivery"}
                className={fulfilment === "delivery" ? "selected" : ""}
                onClick={() => setChosen("delivery")}
              >
                {c.text("Delivery", "توصيل")}
              </button>
            )}
            {pickupEnabled && (
              <button
                type="button"
                aria-pressed={fulfilment === "pickup"}
                className={fulfilment === "pickup" ? "selected" : ""}
                onClick={() => setChosen("pickup")}
              >
                {c.text("Pick up from the shop", "الاستلام من المتجر")}
              </button>
            )}
          </fieldset>
          {error("fulfilment")}
          {pickupOffered && deliveryOnlyHouse && (
            <p className="small muted">
              {c.text(
                "The Pet House in your cart is delivered, so pickup is not available for this order.",
                "يُوصَّل بيت الحيوان في سلتك، لذا لا يتوفر الاستلام لهذا الطلب.",
              )}
            </p>
          )}
          {!areas.length && !pickupEnabled && (
            <p role="status" className="form-error">
              {c.text("Ordering is paused at the moment. Please try again later.", "الطلب متوقف حالياً. حاول لاحقاً.")}
            </p>
          )}

          {fulfilment === "delivery" ? (
            <>
              {saved.length > 0 && (
                <SavedAddressChoice
                  legend={c.text("Deliver to", "التوصيل إلى")}
                  addresses={saved}
                  usable={deliverable}
                  unusableNote={c.text("We do not deliver to this area at the moment.", "لا نوصّل إلى هذه المنطقة حالياً.")}
                  chosenId={addressId}
                  newLabel={c.text("A new address", "عنوان جديد")}
                  onChoose={chooseAddress}
                />
              )}
              {error("delivery.areaId")}
              {addressId === null && (
                <>
                  <Field label={c.text("Area", "المنطقة")}>
                    <select
                      value={form.areaId}
                      onChange={update("areaId")}
                      aria-invalid={Boolean(fieldMessage("delivery.areaId"))}
                      aria-describedby={describedBy("delivery.areaId")}
                    >
                      <option value="" disabled>
                        {c.text("Choose your area", "اختر منطقتك")}
                      </option>
                      {/* Neighbourhoods under their city headings (D135); a city alone cannot be chosen. */}
                      {areasByCity(areas).map((group) => (
                        <optgroup key={group.cityId} label={c.local(group.city)}>
                          {group.areas.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {c.local(entry.name)} · {entry.fee === 0 ? c.text("Free delivery", "توصيل مجاني") : c.money(entry.fee)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </Field>
                  <div className="checkout-address">
                    {(
                      [
                        ["zone", c.text("Zone", "المنطقة (رقم)"), 3],
                        ["street", c.text("Street", "الشارع"), 4],
                        ["building", c.text("Building", "المبنى"), 4],
                      ] as const
                    ).map(([key, label, max]) => (
                      <div key={key}>
                        <Field label={label}>
                          <NumberInput
                            dir="ltr"
                            value={form[key]}
                            onChange={update(key)}
                            maxLength={max}
                            aria-invalid={Boolean(fieldMessage(`delivery.address.${key}`))}
                            aria-describedby={describedBy(`delivery.address.${key}`)}
                          />
                        </Field>
                        {error(`delivery.address.${key}`)}
                      </div>
                    ))}
                  </div>
                  <div className="checkout-address">
                    <Field label={c.text("Floor (optional)", "الطابق (اختياري)")}>
                      <input value={form.floor} onChange={update("floor")} maxLength={20} />
                    </Field>
                    <Field label={c.text("Flat (optional)", "الشقة (اختياري)")}>
                      <input value={form.flat} onChange={update("flat")} maxLength={20} />
                    </Field>
                  </div>
                  <Field label={c.text("Landmark (optional)", "علامة مميزة (اختياري)")}>
                    <input value={form.landmark} onChange={update("landmark")} maxLength={120} />
                  </Field>
                  <Field label={c.text("Note for the driver (optional)", "ملاحظة للسائق (اختياري)")}>
                    <textarea value={form.note} onChange={update("note")} maxLength={300} />
                  </Field>
                  {offerSave && (
                    <>
                      <label className="row">
                        <input type="checkbox" checked={saveChecked} onChange={(event) => setSaveChoice(event.target.checked)} />
                        {c.text("Save this address for next time", "احفظ هذا العنوان للمرة القادمة")}
                      </label>
                      {saveChecked && (
                        <>
                          <Field label={c.text("Name for this address (for example Home)", "اسم لهذا العنوان (مثلاً المنزل)")}>
                            <input
                              value={label}
                              onChange={(event) => setSaveLabel(event.target.value)}
                              maxLength={30}
                              aria-invalid={Boolean(fieldMessage("saveLabel"))}
                              aria-describedby={describedBy("saveLabel")}
                            />
                          </Field>
                          {error("saveLabel")}
                        </>
                      )}
                    </>
                  )}
                  {customer && savedAddresses.isSuccess && saved.length >= ACCOUNT_LIMITS.maxAddresses && (
                    <p className="small muted">
                      {c.text(
                        `You have ${ACCOUNT_LIMITS.maxAddresses} saved addresses, the most you can save.`,
                        `لديك ${ACCOUNT_LIMITS.maxAddresses} عناوين محفوظة، وهو الحد الأقصى.`,
                      )}
                    </p>
                  )}
                </>
              )}
              {/* The delivery's own point (D263): a saved address brings its own; a change is for this order only. */}
              <ShareLocation value={form.pin} onChange={(pin) => setForm((current) => ({ ...current, pin }))} purpose="delivery" />
              <div className={`slot-field${fieldMessage("delivery.windowId") ? " is-invalid" : ""}`}>
                <h3>{c.text("Delivery time · Qatar time", "موعد التوصيل · بتوقيت قطر")}</h3>
                {houseDays !== null && (
                  <p className="note-box">
                    {c.text(
                      `Your Pet House can be delivered from ${formatQatarDay(earliestHouseDay(houseDays), c.locale)}.`,
                      `يمكن توصيل بيت الحيوان ابتداءً من ${formatQatarDay(earliestHouseDay(houseDays), c.locale)}.`,
                    )}
                    {houses.length < rows.length &&
                      c.text(" Everything in this order arrives with it.", " ويصل كل ما في هذا الطلب معه.")}
                  </p>
                )}
                {windows.isPending && (
                  <p className="small muted" role="status">
                    {c.text("Loading times…", "جارٍ تحميل المواعيد…")}
                  </p>
                )}
                {delivery && (
                  <SlotPicker
                    days={delivery.days}
                    from={delivery.from}
                    to={delivery.to}
                    value={chosenWindow ? { date: chosenWindow.date, slotId: chosenWindow.id } : null}
                    onChange={(picked) => setForm((current) => ({ ...current, windowId: picked?.slot.id ?? "" }))}
                    clock="12h"
                    show="range"
                    summaryLabel={c.text("Selected delivery time", "موعد التوصيل المختار")}
                    errorId={describedBy("delivery.windowId")}
                  />
                )}
              </div>
              {error("delivery.windowId")}
              {windows.isError && (
                <p className="form-error" role="alert">
                  {c.text("Delivery times could not be loaded.", "تعذّر تحميل مواعيد التوصيل.")}{" "}
                  <button type="button" className="text-button" onClick={() => void windows.refetch()}>
                    {c.text("Retry", "أعد المحاولة")}
                  </button>
                </p>
              )}
              {windows.isSuccess && !windows.data.length && (
                <p role="status">
                  {pickupEnabled
                    ? c.text("No delivery times are free right now. You can pick up from the shop instead.", "لا توجد مواعيد توصيل متاحة الآن. يمكنك الاستلام من المتجر.")
                    : c.text("No delivery times are free right now. Please try again later.", "لا توجد مواعيد توصيل متاحة الآن. حاول لاحقاً.")}
                </p>
              )}
            </>
          ) : (
            <p className="note-box">
              {c.local(options.data.pickup.instructions) ||
                c.text("Pick up from the shop: we will email you when your order is ready.", "الاستلام من المتجر: سنرسل لك بريداً عندما يصبح طلبك جاهزاً.")}
            </p>
          )}
        </div>

        <aside className="panel form-stack">
          <h2>{c.text("Review your order", "راجع طلبك")}</h2>
          {rows.map((row, index) => (
            <div className="row spread" key={`${row.line.productId}/${row.line.variantId}`}>
              <span>
                {row.product ? c.local(row.product.name) : row.line.productId}
                {row.variant ? ` · ${c.local(row.variant.label)}` : ""} × {row.line.quantity}
                {row.product?.house?.leadTime && (
                  <span className="house-line-note">
                    {madeToOrder(row.product)
                      ? c.text(
                          `Pet House · made to order, ready in about ${row.product.house.leadTime.minDays}–${row.product.house.leadTime.maxDays} days`,
                          `بيت حيوان · يُصنع عند الطلب، جاهز خلال ${row.product.house.leadTime.minDays}–${row.product.house.leadTime.maxDays} يوماً تقريباً`,
                        )
                      : c.text(
                          `Pet House · ready in about ${row.product.house.leadTime.minDays}–${row.product.house.leadTime.maxDays} days`,
                          `بيت حيوان · جاهز خلال ${row.product.house.leadTime.minDays}–${row.product.house.leadTime.maxDays} يوماً تقريباً`,
                        )}
                  </span>
                )}
                {lineMessage(index) && <span className="form-error"> — {lineMessage(index)}</span>}
              </span>
              {quoteLine(row) ? (
                <OfferPrice price={(quoteLine(row)?.unitPrice ?? 0) * row.line.quantity} salePrice={quoteLine(row)?.lineTotal} />
              ) : (
                <strong>{c.money((row.variant?.price ?? 0) * row.line.quantity)}</strong>
              )}
            </div>
          ))}
          <PromoCodeBox
            id="checkout-promo-code"
            code={code}
            answer={
              codeRefused?.codeStatus
                ? { status: codeRefused.codeStatus, message: codeRefused.message }
                : code
                  ? (shown?.code ?? null)
                  : codeNote
            }
            discount={discount}
            what="order"
            pending={tryCode.isPending}
            problem={tryCode.isError ? orderErrorMessage(tryCode.error, c.text) : undefined}
            onApply={applyCode}
            onRemove={removeCode}
          />
          <div className="row spread">
            <span>{c.text("Subtotal", "المجموع الفرعي")}</span>
            <strong>{c.money(subtotal)}</strong>
          </div>
          <DiscountRows promotions={shown?.promotions ?? []} />
          <div className="row spread">
            <span>{c.text("Delivery", "التوصيل")}</span>
            <strong>
              {fulfilment === "pickup"
                ? c.text("Pickup · free", "استلام · مجاني")
                : area
                  ? fee - houseFee === 0
                    ? c.text("Free", "مجاني")
                    : c.money(fee - houseFee)
                  : c.text("Choose an area", "اختر المنطقة")}
            </strong>
          </div>
          {houseFee > 0 && (
            <div className="row spread">
              <span>
                {c.text(
                  `Pet House delivery (${houseCount} ${houseCount === 1 ? "house" : "houses"})`,
                  `توصيل بيوت الحيوانات (${houseCount})`,
                )}
              </span>
              <strong>{c.money(houseFee)}</strong>
            </div>
          )}
          <div className="row spread order-total" aria-busy={quote.isFetching}>
            <span>{fulfilment === "delivery" && !area ? c.text("Total before delivery", "الإجمالي قبل التوصيل") : c.text("Total", "الإجمالي")}</span>
            <strong>{c.money(total)}</strong>
          </div>
          {discount > 0 && <p className="saved-note">{c.text(`You save ${c.money(discount)}`, `توفّر ${c.money(discount)}`)}</p>}
          {quote.isFetching && !confirmedQuote && (
            <p className="small muted" role="status">
              {c.text("Checking prices and offers…", "جارٍ التحقق من الأسعار والعروض…")}
            </p>
          )}
          {quote.isError && !quote.isFetching && (
            <p className="form-error" role="alert">
              {orderErrorMessage(quote.error, c.text)}{" "}
              <button type="button" className="text-button" onClick={() => void quote.refetch()}>
                {c.text("Retry", "أعد المحاولة")}
              </button>
            </p>
          )}
          <p className="small muted">
            {c.text(
              "Your items and delivery time are held for a few minutes while you pay on the next page.",
              "نحجز منتجاتك وموعد التوصيل لبضع دقائق أثناء الدفع في الصفحة التالية.",
            )}
          </p>
          {(place.isError || Object.keys(localErrors).length > 0) && (
            <p className="form-error" role="alert">
              {codeRefused || localErrors.code
                ? c.text(
                    "Your promo code cannot be used for this order (see the message at the code). Remove it to place the order without it.",
                    "لا يمكن استخدام رمزك الترويجي لهذا الطلب (راجع الرسالة عند الرمز). أزله لإرسال الطلب بدونه.",
                  )
                : place.isError
                  ? orderErrorMessage(place.error, c.text)
                  : localErrors.price
                    ? c.text("We are still checking the prices. Please try again in a moment.", "ما زلنا نتحقق من الأسعار. حاول مرة أخرى بعد لحظة.")
                    : c.text("Please check the highlighted fields.", "يرجى مراجعة الحقول المحددة.")}
            </p>
          )}
          {saveError && (
            <p className="form-error" role="alert">
              {c.text("The address could not be saved, so the order was not placed: ", "تعذّر حفظ العنوان، فلم يُرسل الطلب: ")}
              {saveError}
            </p>
          )}
          <button
            type="submit"
            className="button button--primary"
            disabled={place.isPending || saveAddress.isPending || (!areas.length && !pickupEnabled)}
          >
            {place.isPending || saveAddress.isPending ? c.text("Placing your order…", "جارٍ إرسال طلبك…") : c.text("Place order", "أرسل الطلب")}
          </button>
          {!customer && (
            <p className="small muted">
              {c.text("Have an account? ", "لديك حساب؟ ")}
              <Link href={customerLoginHref("/checkout")} className="text-link">
                {c.text("Log in", "سجّل الدخول")}
              </Link>
              {c.text(" to see this order under My orders.", " لترى هذا الطلب في طلباتي.")}
            </p>
          )}
          <Notice />
        </aside>
      </form>
    </div>
  );
}
