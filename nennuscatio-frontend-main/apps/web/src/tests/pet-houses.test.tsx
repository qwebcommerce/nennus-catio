import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { seedDemo, type Product } from "@/mocks/data/business";
import { seedPetHouses, housePetTypes } from "@/mocks/data/pet-houses";
import { createMockRepository } from "@/mocks/adapters/business-repository";
import { whatsappLink } from "@/features/pet-houses/lib/whatsapp";
import { Photo } from "@/shared/ui/Photo";

const house = () => structuredClone(seedPetHouses()[0]);
describe("Pet Houses PH-2", () => {
  it("keeps 60 reference models in one catalogue, with 59 real local photographs", () => {
    const houses = seedPetHouses(),
      state = seedDemo();
    expect(houses).toHaveLength(60);
    expect(state.products).toHaveLength(70);
    expect(state.products[0].id).toBe("cat-food");
    expect(state.orders).toHaveLength(12);
    expect(
      state.orders.every((o) =>
        o.items.every((l) => !l.productId.startsWith("house-")),
      ),
    ).toBe(true);
    expect(new Set(houses.map((p) => p.image)).size).toBe(59);
    expect(new Set(state.products.map((p) => p.id)).size).toBe(70);
    const skus = state.products.flatMap((p) => p.variants.map((v) => v.sku));
    expect(new Set(skus).size).toBe(skus.length);
    for (const p of houses) {
      expect(p.name.en.trim().length).toBeGreaterThan(0);
      expect(p.name.ar).toMatch(/[\u0600-\u06ff]/);
      expect(p.image).toMatch(/^\/images\/pet-houses\//);
      expect(existsSync(resolve(process.cwd(), "public", `.${p.image}`))).toBe(
        true,
      );
      expect(p.house?.provisional).toBe(true);
      expect(p.house?.leadTime).toBeNull();
      expect(p.house?.deliveryFee).toBeNull();
    }
    for (const pet of housePetTypes)
      expect(houses.some((p) => p.pet === pet.id)).toBe(true);
    expect(
      houses.filter((p) => p.house?.purchaseMode === "inquiry"),
    ).toHaveLength(11);
  });
  it("accepts every reference fixture, including inquiry-only models", () => {
    const r = createMockRepository();
    seedPetHouses().forEach((p) => {
      r.saveProduct(p);
    });
    expect(r.getSnapshot().products).toHaveLength(70);
  });
  it("saves editable details and media without sharing mutable editor references", () => {
    const r = createMockRepository(),
      p = house();
    p.house!.dimensions = { height: 100, width: 80, depth: 60, unit: "cm" };
    p.house!.leadTime = { minDays: 7, maxDays: 14 };
    p.house!.deliveryFee = 25000;
    p.gallery = [
      { id: "gallery-1", src: "/images/pet-houses/cat-rattan-boho.jpg" },
    ];
    r.saveProduct(p);
    p.house!.leadTime.minDays = 999;
    expect(
      r.getSnapshot().products.find((x) => x.id === p.id)?.house?.leadTime
        ?.minDays,
    ).toBe(7);
    expect(
      r.getSnapshot().products.find((x) => x.id === p.id)?.gallery,
    ).toHaveLength(1);
  });
  const invalid: [string, (p: Product) => void][] = [
    [
      "collection assigned to a wrong pet type",
      (p) => {
        p.house!.collection = "rabbits";
      },
    ],
    [
      "zero dimension",
      (p) => {
        p.house!.dimensions = { height: 0, width: 70, depth: 55, unit: "cm" };
      },
    ],
    [
      "invalid dimension",
      (p) => {
        p.house!.dimensions = {
          height: Number.NaN,
          width: 70,
          depth: 55,
          unit: "cm",
        };
      },
    ],
    [
      "reversed lead-time range",
      (p) => {
        p.house!.leadTime = { minDays: 15, maxDays: 7 };
      },
    ],
    [
      "fractional lead time",
      (p) => {
        p.house!.leadTime = { minDays: 1.5, maxDays: 7 };
      },
    ],
    [
      "negative delivery charge",
      (p) => {
        p.house!.deliveryFee = -1;
      },
    ],
    [
      "fractional minor-unit delivery charge",
      (p) => {
        p.house!.deliveryFee = 10.5;
      },
    ],
    [
      "missing feature language",
      (p) => {
        p.house!.features = [{ id: "f", en: "Window", ar: "" }];
      },
    ],
    [
      "missing metadata",
      (p) => {
        delete p.house;
      },
    ],
    [
      "wrong house pet assignment",
      (p) => {
        p.pet = "pets";
      },
    ],
    [
      "unknown fixed price",
      (p) => {
        p.variants[0].price = 0;
      },
    ],
    [
      "unsafe gallery URL",
      (p) => {
        p.gallery = [{ id: "g", src: "javascript:alert(1)" }];
      },
    ],
    [
      "duplicate gallery identity",
      (p) => {
        p.gallery = [
          { id: "g", src: p.image },
          { id: "g", src: p.image },
        ];
      },
    ],
  ];
  it.each(invalid)("rejects %s without a partial save", (_, mutate) => {
    const r = createMockRepository(),
      before = r.getSnapshot(),
      p = house();
    mutate(p);
    expect(() => r.saveProduct(p)).toThrow();
    expect(r.getSnapshot()).toBe(before);
  });
  it("distinguishes a configured free charge from an unconfirmed charge", () => {
    const r = createMockRepository(),
      p = house();
    p.house!.deliveryFee = 0;
    r.saveProduct(p);
    expect(
      r.getSnapshot().products.find((x) => x.id === p.id)?.house?.deliveryFee,
    ).toBe(0);
    p.house!.deliveryFee = null;
    r.saveProduct(p);
    expect(
      r.getSnapshot().products.find((x) => x.id === p.id)?.house?.deliveryFee,
    ).toBeNull();
  });
  it("clears house-only fields after changing product category without mutating caller", () => {
    const r = createMockRepository(),
      p = house();
    p.category = "accessories";
    r.saveProduct(p);
    expect(
      r.getSnapshot().products.find((x) => x.id === p.id)?.house,
    ).toBeUndefined();
    expect(p.house).toBeDefined();
  });
  it("archives/restores houses without deleting historical orders", () => {
    const r = createMockRepository(),
      p = house(),
      orders = r.getSnapshot().orders;
    r.archiveProduct(p.id);
    expect(r.getSnapshot().products.find((x) => x.id === p.id)?.active).toBe(
      false,
    );
    expect(r.getSnapshot().orders).toEqual(orders);
    r.archiveProduct(p.id);
    expect(r.getSnapshot().products.find((x) => x.id === p.id)?.active).toBe(
      true,
    );
  });
  it("blocks fixed, quote-only and mixed house orders before PH-3, even with stock", () => {
    for (const inquiry of [false, true]) {
      const r = createMockRepository(),
        p = house();
      p.variants[0].stock = 5;
      if (inquiry) {
        p.house!.purchaseMode = "inquiry";
        p.variants[0].price = 0;
      }
      r.saveProduct(p);
      const before = r.getSnapshot();
      expect(() =>
        r.checkout({
          key: "house-order",
          guest: {
            name: "Demo",
            email: "demo@example.invalid",
            phone: "+974 0000 0000",
          },
          lines: [
            { productId: "cat-food", variantId: "cf-15", quantity: 1 },
            { productId: p.id, variantId: p.variants[0].id, quantity: 1 },
          ],
          fulfilment: "pickup",
          address: "",
          outcome: "success",
        }),
      ).toThrow(/PH-3/);
      expect(r.getSnapshot()).toBe(before);
    }
  });
  it("builds a WhatsApp model inquiry without copying reference contacts or arbitrary parameters", () => {
    const url = whatsappLink(
      "https://api.whatsapp.com/send?phone=97400000000&token=secret",
      "Custom cat house & size?",
    );
    expect(url).toBe(
      "https://wa.me/97400000000?text=Custom+cat+house+%26+size%3F",
    );
    expect(whatsappLink("https://wa.me/97400000000", "بيت قطط")).toContain(
      "%D8",
    );
    [
      "",
      "http://wa.me/97400000000",
      "https://wa.me.evil.example/97400000000",
      "https://wa.me/+97400000000",
      "https://user:pass@wa.me/97400000000",
      "javascript:alert(1)",
      "https://example.com",
    ].forEach((v) => {
      expect(whatsappLink(v)).toBeNull();
    });
  });
  it("validates the settings-managed destination but permits an empty placeholder", () => {
    const r = createMockRepository(),
      s = structuredClone(r.getSnapshot().settings);
    s.whatsapp = "https://example.com";
    expect(() => r.saveSettings(s)).toThrow(/wa.me/);
    s.whatsapp = "";
    r.saveSettings(s);
    expect(r.getSnapshot().settings.whatsapp).toBe("");
    s.whatsapp = "https://wa.me/97400000000";
    r.saveSettings(s);
    expect(r.getSnapshot().settings.whatsapp).toBe(s.whatsapp);
  });
  it("shows an honest unavailable-photo state rather than a different product image", () => {
    render(
      <Photo
        src=""
        alt="House model"
        unavailableLabel="Model photo unavailable"
      />,
    );
    expect(
      screen.getByRole("img", { name: "Model photo unavailable" }).tagName,
    ).toBe("DIV");
    cleanup();
  });
});
