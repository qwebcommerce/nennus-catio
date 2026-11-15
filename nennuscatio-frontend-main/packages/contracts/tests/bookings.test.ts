import assert from "node:assert/strict";
import { test } from "node:test";
import { petDetailsSchema, petLabelSchema } from "../src/index.js";

test("a booked pet is its age, breed and notes; a page from before D246 keeps no name or weight", () => {
  assert.deepEqual(petDetailsSchema.parse({ ageMonths: 27 }), { ageMonths: 27, breed: "", notes: "" });
  assert.deepEqual(petDetailsSchema.parse({ ageMonths: 0, breed: "  Persian ", notes: " Shy with dryers " }), {
    ageMonths: 0,
    breed: "Persian",
    notes: "Shy with dryers",
  });
  assert.deepEqual(petDetailsSchema.parse({ name: "Milo", ageMonths: 24, weightGrams: 4000 }), { ageMonths: 24, breed: "", notes: "" });
  for (const bad of [{}, { ageMonths: -1 }, { ageMonths: 601 }, { ageMonths: 1.5 }, { ageMonths: 24, breed: "x".repeat(61) }, { ageMonths: 24, notes: "x".repeat(501) }]) {
    assert.equal(petDetailsSchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
});

test("lists name a booked pet by its group and breed, never by a name (D246)", () => {
  const label = { group: { en: "Small pet", ar: "حيوان صغير" }, breed: "" };
  assert.deepEqual(petLabelSchema.parse(label), label);
  assert.equal(petLabelSchema.safeParse("Milo").success, false);
});
