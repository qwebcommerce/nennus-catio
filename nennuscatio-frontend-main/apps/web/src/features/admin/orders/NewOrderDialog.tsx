"use client";
import { useState } from "react";
import { remaining } from "@/mocks/adapters/business-repository";
import { repo, useBusiness } from "@/mocks/MockDataProvider";
import { useCopy } from "@/shared/lib/copy";
import { ErrorMessage, Field, Modal } from "@/shared/ui/BusinessUI";
import { NumberInput } from "@/shared/ui/NumberInput";
export function NewOrderDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const c = useCopy(),
    d = useBusiness();
  const [customerId, setCustomerId] = useState(""),
    [variantId, setVariantId] = useState(""),
    [quantity, setQuantity] = useState(1),
    [fulfilment, setFulfilment] = useState<"pickup" | "delivery">("pickup"),
    [address, setAddress] = useState(""),
    [slotId, setSlotId] = useState(""),
    [payment, setPayment] = useState<"success" | "pending">("pending"),
    [error, setError] = useState("");
  const variants = d.products
    .filter((p) => p.active && !p.house && p.category !== "pet-houses")
    .flatMap((p) =>
      p.variants
        .filter((v) => v.stock > 0)
        .map((v) => ({ product: p, variant: v })),
    );
  const picked = variants.find((v) => v.variant.id === variantId);
  const availableSlots = d.slots.filter(
    (s) => s.kind === "delivery" && remaining(d, s) > 0,
  );
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={c.text("New Demo Order", "طلب تجريبي جديد")}
    >
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          const guest = d.guests.find((g) => g.id === customerId);
          if (!guest || !picked) {
            setError(
              c.text(
                "Select a customer and available product.",
                "اختر عميلاً ومنتجاً متوفراً.",
              ),
            );
            return;
          }
          try {
            const id = repo.checkout({
              key: crypto.randomUUID(),
              guest,
              lines: [
                {
                  productId: picked.product.id,
                  variantId: picked.variant.id,
                  quantity,
                },
              ],
              fulfilment,
              address,
              slotId,
              outcome: payment,
              channel: "admin",
            });
            onOpenChange(false);
            setError("");
            onCreated(id);
          } catch (err) {
            setError(
              c.ar
                ? "تعذر إنشاء الطلب. تحقق من المخزون والعنوان وموعد التوصيل."
                : err instanceof Error
                  ? err.message
                  : "Please retry.",
            );
          }
        }}
      >
        <p className="small muted">
          {c.text(
            "Synthetic customers only. Payment is simulated. Pet House checkout remains gated; no real invoice or message is created.",
            "عملاء تجريبيون فقط. الدفع محاكاة وطلب البيوت غير مفعّل. لا تُنشأ فاتورة فعلية أو رسالة.",
          )}
        </p>
        <Field label={c.text("Customer", "العميل")}>
          <select
            required
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">{c.text("Choose customer", "اختر عميلاً")}</option>
            {d.guests.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={c.text("Product / SKU", "المنتج / SKU")}>
          <select
            required
            value={variantId}
            onChange={(e) => {
              setVariantId(e.target.value);
              setQuantity(1);
            }}
          >
            <option value="">
              {c.text("Choose available SKU", "اختر رمز منتج متوفراً")}
            </option>
            {variants.map(({ product, variant }) => (
              <option key={variant.id} value={variant.id}>
                {c.local(product.name)} · {variant.sku} ·{" "}
                {c.money(variant.price)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={c.text("Quantity", "الكمية")}>
          <NumberInput
            required
            min={1}
            max={picked?.variant.stock ?? 1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </Field>
        <Field label={c.text("Fulfilment", "التسليم")}>
          <select
            value={fulfilment}
            onChange={(e) =>
              setFulfilment(e.target.value as "pickup" | "delivery")
            }
          >
            <option value="pickup">{c.text("Pickup", "الاستلام")}</option>
            <option value="delivery">{c.text("Delivery", "التوصيل")}</option>
          </select>
        </Field>
        {fulfilment === "delivery" && (
          <>
            <Field label={c.text("Delivery Address", "عنوان التوصيل")}>
              <input
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </Field>
            <Field
              label={c.text("Delivery Slot (Qatar)", "موعد التوصيل (قطر)")}
            >
              <select
                required
                value={slotId}
                onChange={(e) => setSlotId(e.target.value)}
              >
                <option value="">
                  {c.text("Choose available slot", "اختر موعداً متوفراً")}
                </option>
                {availableSlots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.date} · {s.time}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        <Field label={c.text("Simulated Payment", "الدفع التجريبي")}>
          <select
            value={payment}
            onChange={(e) =>
              setPayment(e.target.value as "success" | "pending")
            }
          >
            <option value="pending">{c.text("Pending", "قيد الانتظار")}</option>
            <option value="success">
              {c.text("Paid (demo only)", "مدفوع (تجريبي فقط)")}
            </option>
          </select>
        </Field>
        <ErrorMessage message={error} />
        <button type="submit" className="button button--primary">
          {c.text("Create demo order", "إنشاء طلب تجريبي")}
        </button>
      </form>
    </Modal>
  );
}
