import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clockTimeSchema,
  adminDeliveryWindowQuerySchema,
  createDeliveryWindowRequestSchema,
  deliverySettingsSchema,
  deliveryWindowsQuerySchema,
  HOUSE_MAX_LEAD_DAYS,
  localDateSchema,
  minutesToTime,
  saveDeliveryAreaRequestSchema,
  saveDeliveryCityRequestSchema,
  saveScheduleRuleRequestSchema,
  timeToMinutes,
} from "../src/index.js";

test("clock times are 24-hour HH:MM, with 24:00 allowed as an end of day", () => {
  for (const ok of ["00:00", "09:30", "23:59", "24:00"]) assert.equal(clockTimeSchema.safeParse(ok).success, true, ok);
  for (const bad of ["9:00", "24:01", "25:00", "12:60", "noon", ""]) assert.equal(clockTimeSchema.safeParse(bad).success, false, bad);
  assert.equal(timeToMinutes("18:45"), 1125);
  assert.equal(minutesToTime(1440), "24:00");
  assert.equal(minutesToTime(timeToMinutes("07:05")), "07:05");
});

test("dates must be real calendar dates", () => {
  assert.equal(localDateSchema.safeParse("2026-10-07").success, true);
  for (const bad of ["2026-02-30", "2026-13-01", "07-10-2026", "2026-10-7"]) {
    assert.equal(localDateSchema.safeParse(bad).success, false, bad);
  }
});

test("a schedule rule or extra window must end after it starts", () => {
  const rule = { weekday: 1, start: "09:00", end: "12:00", capacity: 10, active: true };
  assert.equal(saveScheduleRuleRequestSchema.safeParse(rule).success, true);
  const backwards = saveScheduleRuleRequestSchema.safeParse({ ...rule, start: "12:00", end: "09:00" });
  assert.equal(backwards.success, false);
  assert.deepEqual(backwards.error?.issues[0]?.path, ["end"]);
  assert.equal(saveScheduleRuleRequestSchema.safeParse({ ...rule, weekday: 8 }).success, false);
  assert.equal(saveScheduleRuleRequestSchema.safeParse({ ...rule, capacity: -1 }).success, false);
  assert.equal(
    createDeliveryWindowRequestSchema.safeParse({ date: "2026-10-08", start: "18:00", end: "24:00", capacity: 3 }).success,
    true,
  );
});

test("area fees are whole dirhams from free up to QAR 10,000, with both names required", () => {
  const area = {
    name: { en: "West Bay", ar: "الخليج الغربي" },
    cityId: "0199c3a4-5b6e-7f80-9a1b-2c3d4e5f6a7b",
    fee: 0,
    active: true,
    sortOrder: 10,
  };
  assert.equal(saveDeliveryAreaRequestSchema.safeParse(area).success, true);
  assert.equal(saveDeliveryAreaRequestSchema.safeParse({ ...area, fee: 1500 }).success, true);
  for (const fee of [-1, 1_000_001, 12.5]) {
    assert.equal(saveDeliveryAreaRequestSchema.safeParse({ ...area, fee }).success, false, String(fee));
  }
  assert.equal(saveDeliveryAreaRequestSchema.safeParse({ ...area, name: { en: "West Bay", ar: " " } }).success, false);
});

test("an area follows its city's fee (null) or has its own; it always names its city (D135)", () => {
  const area = {
    name: { en: "The Pearl", ar: "اللؤلؤة" },
    cityId: "0199c3a4-5b6e-7f80-9a1b-2c3d4e5f6a7b",
    fee: null,
    active: true,
    sortOrder: 10,
  };
  assert.equal(saveDeliveryAreaRequestSchema.safeParse(area).success, true);
  assert.equal(saveDeliveryAreaRequestSchema.safeParse({ ...area, fee: 2000 }).success, true);
  assert.equal(saveDeliveryAreaRequestSchema.safeParse({ ...area, cityId: "doha" }).success, false);
  const { cityId: _cityId, ...withoutCity } = area;
  assert.equal(saveDeliveryAreaRequestSchema.safeParse(withoutCity).success, false);

  const city = { name: { en: "Doha", ar: "الدوحة" }, fee: 1000, active: true, sortOrder: 10 };
  assert.equal(saveDeliveryCityRequestSchema.safeParse(city).success, true);
  // A city always has a fee (free is 0); only areas may leave it empty.
  assert.equal(saveDeliveryCityRequestSchema.safeParse({ ...city, fee: null }).success, false);
  assert.equal(saveDeliveryCityRequestSchema.safeParse({ ...city, fee: -1 }).success, false);
  assert.equal(saveDeliveryCityRequestSchema.safeParse({ ...city, name: { en: " ", ar: "الدوحة" } }).success, false);
});

test("delivery settings keep hold, lead time and horizon within sensible limits", () => {
  const settings = {
    holdMinutes: 15,
    leadTimeMinutes: 120,
    horizonDays: 14,
    pickupEnabled: true,
    pickupInstructions: { en: "", ar: "" },
    version: 1,
  };
  assert.equal(deliverySettingsSchema.safeParse(settings).success, true);
  for (const patch of [{ holdMinutes: 2 }, { holdMinutes: 121 }, { horizonDays: 0 }, { horizonDays: 61 }, { leadTimeMinutes: -5 }]) {
    assert.equal(deliverySettingsSchema.safeParse({ ...settings, ...patch }).success, false, JSON.stringify(patch));
  }
});

test("a Pet House cart asks for delivery times further ahead; staff may ask for any dates (#14)", () => {
  assert.equal(deliveryWindowsQuerySchema.parse({}).leadDays, 0);
  assert.equal(deliveryWindowsQuerySchema.parse({ leadDays: "10" }).leadDays, 10, "a query string is read as a number");
  assert.equal(deliveryWindowsQuerySchema.safeParse({ leadDays: String(HOUSE_MAX_LEAD_DAYS) }).success, true);
  for (const bad of [String(HOUSE_MAX_LEAD_DAYS + 1), "-1", "1.5", "ten"]) {
    assert.equal(deliveryWindowsQuerySchema.safeParse({ leadDays: bad }).success, false, bad);
  }
  assert.equal(adminDeliveryWindowQuerySchema.safeParse({}).success, true, "no dates: the booking horizon");
  assert.equal(adminDeliveryWindowQuerySchema.safeParse({ from: "2026-11-01", to: "2026-11-30" }).success, true);
  assert.equal(adminDeliveryWindowQuerySchema.safeParse({ from: "2026-11-01" }).success, false, "both dates, or neither");
  assert.equal(adminDeliveryWindowQuerySchema.safeParse({ from: "2026-11-30", to: "2026-11-01" }).success, false, "in order");
});
