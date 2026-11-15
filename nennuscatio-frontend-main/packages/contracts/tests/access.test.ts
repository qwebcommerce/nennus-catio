import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptyPermissions,
  normalisePermissions,
  ownerPermissions,
  PERMISSION_MODULES,
  permissionMapSchema,
  updateSiteSettingsRequestSchema,
} from "../src/index.js";

test("any action includes View; Refund exists only on Orders and Bookings", () => {
  const map = normalisePermissions({
    orders: { view: false, edit: false, delete: false, export: false, refund: true },
    finance: { view: false, edit: false, delete: false, export: true, refund: true },
  });
  assert.deepEqual(map.orders, { view: true, edit: false, delete: false, export: false, refund: true });
  assert.deepEqual(map.finance, { view: true, edit: false, delete: false, export: true, refund: false });
  assert.deepEqual(map.settings, { view: false, edit: false, delete: false, export: false, refund: false });
});

test("a permission map must list every module", () => {
  assert.equal(permissionMapSchema.safeParse(emptyPermissions()).success, true);
  const { settings: _missing, ...partial } = emptyPermissions();
  assert.equal(permissionMapSchema.safeParse(partial).success, false);
  assert.deepEqual(Object.keys(emptyPermissions()), [...PERMISSION_MODULES]);
});

test("the owner has everything, with Refund only where it applies", () => {
  const owner = ownerPermissions();
  for (const module of PERMISSION_MODULES) {
    assert.equal(owner[module].view && owner[module].edit && owner[module].delete && owner[module].export, true);
  }
  assert.equal(owner.orders.refund, true);
  assert.equal(owner.settings.refund, false);
});

test("settings edits: empty links become null; only https links are accepted", () => {
  const base = {
    version: 3,
    headline: { en: " Hello ", ar: "مرحبا" },
    description: { en: "", ar: "" },
    hours: { en: "", ar: "" },
    contact: { phone: null, whatsapp: "" },
    socialLinks: {
      instagram: "https://www.instagram.com/example",
      instagramGrooming: "",
      instagramProjects: "  ",
      facebook: null,
    },
  };
  const parsed = updateSiteSettingsRequestSchema.parse(base);
  assert.equal(parsed.headline.en, "Hello");
  assert.equal(parsed.socialLinks.instagramGrooming, null);
  assert.equal(parsed.socialLinks.instagramProjects, null);
  assert.equal(
    updateSiteSettingsRequestSchema.safeParse({
      ...base,
      socialLinks: { ...base.socialLinks, facebook: "http://facebook.com/x" },
    }).success,
    false,
  );
  assert.deepEqual(parsed.contact, { phone: null, whatsapp: null });
});

test("settings edits: the phone and WhatsApp numbers are stored in international form (D232)", () => {
  const base = {
    version: 3,
    headline: { en: "", ar: "" },
    description: { en: "", ar: "" },
    hours: { en: "", ar: "" },
    socialLinks: { instagram: null, instagramGrooming: null, instagramProjects: null, facebook: null },
  };
  const parse = (phone: string | null, whatsapp: string | null = null) =>
    updateSiteSettingsRequestSchema.safeParse({ ...base, contact: { phone, whatsapp } });
  for (const [typed, stored] of [
    ["4444 5555", "+97444445555"],
    [" +974 5555-1234 ", "+97455551234"],
    ["00974 6666 7777", "+97466667777"],
    ["97433334444", "+97433334444"],
    ["+63 (912) 345 6789", "+639123456789"],
    ["0063 912 345 6789", "+639123456789"],
  ] as const) {
    const result = parse(typed);
    assert.ok(result.success, typed);
    assert.equal(result.data.contact.phone, stored, typed);
    assert.equal(parse(null, typed).data?.contact.whatsapp, stored, `WhatsApp ${typed}`);
  }
  for (const typed of [
    "1234 5678",
    "0912 345 6789",
    "+974 0000 0000",
    "+974 5555 123",
    "+12345",
    "call us",
    "+0 1234 5678",
    "+1 234 567 890 123 456",
    "+974 5555 1234 5555 5",
  ]) {
    const result = parse(typed);
    assert.equal(result.success, false, typed);
    assert.equal(result.error?.issues[0]?.path.join("."), "contact.phone", typed);
    assert.equal(parse(null, typed).error?.issues[0]?.path.join("."), "contact.whatsapp", `WhatsApp ${typed}`);
  }
});
