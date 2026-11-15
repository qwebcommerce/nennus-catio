import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPhone, publicSiteSettingsSchema } from "../src/index.js";

const valid = {
  brand: { en: "Nennus Catio", ar: "Nennus Catio" },
  description: {
    en: "Pet care, shop and grooming in Qatar.",
    ar: "رعاية الحيوانات الأليفة والتسوق والعناية في قطر.",
  },
  headline: { en: "", ar: "" },
  hours: { en: "", ar: "" },
  currency: "QAR",
  timeZone: "Asia/Qatar",
  phone: "+97444445555",
  socialLinks: {
    instagram: "https://www.instagram.com/example",
    instagramGrooming: null,
    instagramProjects: null,
    facebook: null,
    whatsapp: "https://wa.me/97400000000",
  },
};

test("accepts the public site settings shape, including unset links", () => {
  assert.deepEqual(publicSiteSettingsSchema.parse(valid), valid);
});

test("drops fields that are not part of the public contract", () => {
  const parsed = publicSiteSettingsSchema.parse({
    ...valid,
    version: 7,
    updatedAt: "2026-10-07T00:00:00.000Z",
  });
  assert.equal("version" in parsed, false);
  assert.equal("updatedAt" in parsed, false);
});

for (const link of [
  "http://www.instagram.com/example",
  "javascript:alert(1)",
  "wa.me/97400000000",
  "",
]) {
  test(`rejects a social link that is not an absolute https URL: ${JSON.stringify(link)}`, () => {
    assert.equal(
      publicSiteSettingsSchema.safeParse({
        ...valid,
        socialLinks: { ...valid.socialLinks, instagram: link },
      }).success,
      false,
    );
  });
}

test("rejects a currency that is not a three-letter ISO code", () => {
  for (const currency of ["qar", "QA", "QARS", ""]) {
    assert.equal(
      publicSiteSettingsSchema.safeParse({ ...valid, currency }).success,
      false,
    );
  }
});

test("requires both languages for every text", () => {
  assert.equal(
    publicSiteSettingsSchema.safeParse({ ...valid, headline: { en: "Only English" } })
      .success,
    false,
  );
});

test("the business phone is international or null (D232)", () => {
  assert.equal(publicSiteSettingsSchema.parse({ ...valid, phone: null }).phone, null);
  for (const phone of ["44445555", "+974 4444 5555", "+0123456789", "+1234567", ""]) {
    assert.equal(publicSiteSettingsSchema.safeParse({ ...valid, phone }).success, false, phone);
  }
});

test("formatPhone groups a Qatari number and leaves others as stored", () => {
  assert.equal(formatPhone("+97444445555"), "+974 4444 5555");
  assert.equal(formatPhone("+639123456789"), "+639123456789");
});
