import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addCustomerNoteRequestSchema,
  adminCustomerQuerySchema,
  adminCustomerSchema,
  adminCustomerSummarySchema,
  CRM_LIMITS,
  saveCrmTagRequestSchema,
  setCustomerTagsRequestSchema,
  updateCrmTagRequestSchema,
} from "../src/index.js";

const id = (n: number) => `0197a000-0000-7000-8000-${String(n).padStart(12, "0")}`;

test("the customer list query has safe defaults and refuses unknown values", () => {
  const parsed = adminCustomerQuerySchema.parse({});
  assert.equal(parsed.sort, "activity");
  assert.equal(parsed.page, 1);
  assert.equal(parsed.pageSize, 25);
  assert.equal(adminCustomerQuerySchema.parse({ page: "3", pageSize: "50" }).page, 3);
  for (const bad of [{ pageSize: "30" }, { kind: "staff" }, { has: "pets" }, { sort: "email" }, { tag: "vip" }, { from: "2026-02-30" }]) {
    assert.equal(adminCustomerQuerySchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
});

test("notes are 1 to 1,000 characters, trimmed", () => {
  assert.equal(addCustomerNoteRequestSchema.parse({ text: "  Prefers mornings  " }).text, "Prefers mornings");
  assert.equal(addCustomerNoteRequestSchema.safeParse({ text: "   " }).success, false);
  assert.equal(addCustomerNoteRequestSchema.safeParse({ text: "x".repeat(CRM_LIMITS.maxNoteLength + 1) }).success, false);
});

test("a customer gets at most 20 tags, each once, and the version is required", () => {
  assert.equal(setCustomerTagsRequestSchema.safeParse({ version: 1, tagIds: [id(1), id(2)] }).success, true);
  assert.equal(setCustomerTagsRequestSchema.safeParse({ version: 1, tagIds: [] }).success, true);
  assert.equal(setCustomerTagsRequestSchema.safeParse({ version: 1, tagIds: [id(1), id(1)] }).success, false);
  assert.equal(setCustomerTagsRequestSchema.safeParse({ tagIds: [id(1)] }).success, false);
  const tooMany = Array.from({ length: CRM_LIMITS.maxTagsPerCustomer + 1 }, (_, n) => id(n + 1));
  assert.equal(setCustomerTagsRequestSchema.safeParse({ version: 1, tagIds: tooMany }).success, false);
});

test("a tag has both names (1 to 40 characters) and one of the six colours; edits carry the version", () => {
  const tag = { name: { en: " VIP ", ar: "مميز" }, colour: "amber" };
  assert.deepEqual(saveCrmTagRequestSchema.parse(tag), { name: { en: "VIP", ar: "مميز" }, colour: "amber", sortOrder: 0 });
  assert.equal(saveCrmTagRequestSchema.safeParse({ ...tag, colour: "pink" }).success, false);
  assert.equal(saveCrmTagRequestSchema.safeParse({ ...tag, name: { en: "VIP", ar: "" } }).success, false);
  assert.equal(saveCrmTagRequestSchema.safeParse({ ...tag, name: { en: "x".repeat(41), ar: "x" } }).success, false);
  assert.equal(updateCrmTagRequestSchema.safeParse(tag).success, false);
  assert.equal(updateCrmTagRequestSchema.safeParse({ ...tag, version: 2 }).success, true);
});

test("a customer record carries no password, token or internal account id", () => {
  const keys = [...Object.keys(adminCustomerSummarySchema.shape), ...Object.keys(adminCustomerSchema.shape)];
  for (const secret of ["passwordHash", "customerId", "token", "accountId"]) assert.equal(keys.includes(secret), false, secret);
});
