"use client";
import { useRef, useState } from "react";
import { useBusiness, useCart, repo } from "@/mocks/MockDataProvider";
import { remaining } from "@/mocks/adapters/business-repository";
import type { PaymentOutcome } from "@/mocks/data/business";
import { useCopy } from "@/shared/lib/copy";
import { useRouter } from "@/i18n/navigation";
import { Field, ErrorMessage, Notice, Empty } from "@/shared/ui/BusinessUI";
import { ActionLink } from "@/shared/ui/ActionLink";
import { useRepositories } from "@/shared/api/DataSourceProvider";
import { CheckoutApiPage } from "./CheckoutApiPage";
import { NumberInput } from "@/shared/ui/NumberInput";
/** API mode: the real checkout (7b-2). Mock mode (development only): the original demo checkout. */
export function CheckoutPage() {
  const { source } = useRepositories();
  return source === "api" ? <CheckoutApiPage /> : <MockCheckout />;
}
function MockCheckout() {
  const c = useCopy(),
    data = useBusiness(),
    { cart, setCart, ready } = useCart(),
    router = useRouter();
  const [fulfilment, setFulfilment] = useState<"delivery" | "pickup">(
      "delivery",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const key = useRef("");
  const slots = data.slots.filter(
    (s) => s.kind === "delivery" && remaining(data, s) > 0,
  );
  if (!ready)
    return (
      <p role="status" aria-busy="true" className="muted">
        {c.text("Loading your cart…", "جارٍ تحميل سلتك…")}
      </p>
    );
  if (!cart.length)
    return (
      <Empty>
        {c.text("Your cart is empty.", "سلتك فارغة.")}
        <ActionLink href="/shop">
          {c.text("Go to shop", "اذهب للمتجر")}
        </ActionLink>
      </Empty>
    );
  if (
    cart.some(
      (l) =>
        data.products.find((p) => p.id === l.productId)?.category ===
        "pet-houses",
    )
  )
    return (
      <Empty>
        {c.text(
          "Pet House ordering awaits delivery rules in the next phase. Remove house items before checking out other products.",
          "طلب البيوت بانتظار قواعد التوصيل في المرحلة التالية. أزل البيوت لطلب المنتجات الأخرى.",
        )}
        <ActionLink href="/cart">
          {c.text("Review cart", "راجع السلة")}
        </ActionLink>
      </Empty>
    );
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    if (!key.current) key.current = crypto.randomUUID();
    try {
      const ref = repo.checkout({
        key: key.current,
        guest: {
          name: String(f.get("name")),
          email: String(f.get("email")),
          phone: String(f.get("phone")),
        },
        lines: cart,
        fulfilment,
        address: String(f.get("address") ?? ""),
        slotId: String(f.get("slot") ?? ""),
        outcome: String(f.get("outcome")) as PaymentOutcome,
      });
      setCart([]);
      router.push(`/orders/confirmation/${ref}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please retry");
      setBusy(false);
    }
  }
  const total = cart.reduce(
    (a, l) =>
      a +
      (data.products
        .find((p) => p.id === l.productId)
        ?.variants.find((v) => v.id === l.variantId)?.price ?? 0) *
        l.quantity,
    0,
  );
  return (
    <div className="customer-page">
      <header className="customer-heading">
        <h1>{c.text("A little closer to happy.", "خطوة أقرب للسعادة.")}</h1>
        <p>
          {c.text(
            "Guest checkout · no account needed",
            "اطلب كضيف · لا تحتاج حساباً",
          )}
        </p>
      </header>
      <form onSubmit={submit} className="checkout-grid">
        <div className="panel form-stack">
          <h2>{c.text("Your details", "بياناتك")}</h2>
          <GuestFields />
          <h2>{c.text("Delivery or pickup", "التوصيل أو الاستلام")}</h2>
          <div className="chips">
            {(["delivery", "pickup"] as const).map((x) => (
              <button
                type="button"
                key={x}
                className={fulfilment === x ? "selected" : ""}
                onClick={() => setFulfilment(x)}
              >
                {c.text(
                  x === "delivery" ? "Delivery" : "Pickup",
                  x === "delivery" ? "توصيل" : "استلام",
                )}
              </button>
            ))}
          </div>
          {fulfilment === "delivery" ? (
            <>
              <Field
                label={c.text(
                  "Address · zone, street, building, unit",
                  "العنوان · المنطقة والشارع والمبنى والوحدة",
                )}
              >
                <textarea name="address" required maxLength={500} />
              </Field>
              <Field
                label={c.text(
                  "Delivery date & time · Qatar",
                  "تاريخ ووقت التوصيل · قطر",
                )}
              >
                <select name="slot" required defaultValue="">
                  <option value="" disabled>
                    {c.text("Choose an available slot", "اختر موعداً متاحاً")}
                  </option>
                  {slots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.date} · {s.time} · {remaining(data, s)}{" "}
                      {c.text("remaining", "متبقي")}
                    </option>
                  ))}
                </select>
              </Field>
              {!slots.length && (
                <p role="status">
                  {c.text(
                    "No delivery slots. Choose pickup or try later.",
                    "لا مواعيد توصيل. اختر الاستلام أو حاول لاحقاً.",
                  )}
                </p>
              )}
            </>
          ) : (
            <p className="note-box">
              {c.text(
                "Pickup verification: present your name and order reference. Location, opening hours and verification policy require owner approval.",
                "الاستلام: قدم الاسم ورقم الطلب. الموقع والساعات والسياسة بانتظار موافقة المالك.",
              )}
            </p>
          )}
        </div>
        <aside className="panel form-stack">
          <h2>{c.text("Review your order", "راجع طلبك")}</h2>
          {cart.map((l) => {
            const p = data.products.find((p) => p.id === l.productId),
              v = p?.variants.find((v) => v.id === l.variantId);
            return (
              <div className="row spread" key={l.variantId}>
                <span>
                  {p ? c.local(p.name) : "—"} × {l.quantity}
                </span>
                <strong>{c.money((v?.price ?? 0) * l.quantity)}</strong>
              </div>
            );
          })}
          <div className="row spread">
            <span>
              {c.text(
                "Total (delivery fee not configured)",
                "المجموع (رسوم التوصيل غير محددة)",
              )}
            </span>
            <strong>{c.money(total)}</strong>
          </div>
          <PaymentFields />
          <Notice />
          <ErrorMessage message={error} />
          <button
            type="submit"
            className="button button--primary"
            disabled={busy || (fulfilment === "delivery" && !slots.length)}
          >
            {c.text(
              busy ? "Submitting…" : "Place demo order",
              busy ? "جارٍ الإرسال…" : "أرسل الطلب التجريبي",
            )}
          </button>
        </aside>
      </form>
    </div>
  );
}
export function GuestFields() {
  const c = useCopy();
  return (
    <>
      <Field label={c.text("Name", "الاسم")}>
        <input name="name" autoComplete="name" required maxLength={100} />
      </Field>
      <Field label={c.text("Email", "البريد الإلكتروني")}>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={150}
          dir="ltr"
        />
      </Field>
      <Field label={c.text("Phone", "الهاتف")}>
        <NumberInput
          kind="phone"
          name="phone"
          autoComplete="tel"
          required
          pattern="\\+?[0-9 ()-]{8,20}"
          maxLength={20}
          dir="ltr"
        />
      </Field>
    </>
  );
}
export function PaymentFields() {
  const c = useCopy();
  return (
    <Field
      label={c.text(
        "Simulated payment result (no real charge)",
        "نتيجة الدفع التجريبي (لا رسوم فعلية)",
      )}
    >
      <select name="outcome" defaultValue="success">
        <option value="success">{c.text("Success", "ناجح")}</option>
        <option value="pending">{c.text("Pending", "قيد الانتظار")}</option>
        <option value="failed">{c.text("Failed", "فشل")}</option>
        <option value="cancelled">{c.text("Cancelled", "ملغي")}</option>
      </select>
    </Field>
  );
}
