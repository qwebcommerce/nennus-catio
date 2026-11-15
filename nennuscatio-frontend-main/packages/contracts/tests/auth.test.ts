import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createStaffRequestSchema,
  customerLoginRequestSchema,
  customerRegisterRequestSchema,
  oneTimeTokenSchema,
} from "../src/index.js";

test("emails are trimmed and lower-cased; Gmail addresses are accepted as written", () => {
  const parsed = customerRegisterRequestSchema.parse({
    email: "  First.Last+pets@Gmail.com ",
    password: "a long enough passphrase",
    locale: "en",
  });
  assert.equal(parsed.email, "first.last+pets@gmail.com");
});

test("registration needs at least 10 characters, at most 128, and not the email itself", () => {
  const base = { email: "someone@example.invalid", locale: "ar" as const };
  assert.equal(customerRegisterRequestSchema.safeParse({ ...base, password: "123456789" }).success, false);
  assert.equal(customerRegisterRequestSchema.safeParse({ ...base, password: "1234567890" }).success, true);
  assert.equal(customerRegisterRequestSchema.safeParse({ ...base, password: "x".repeat(129) }).success, false);
  const same = customerRegisterRequestSchema.safeParse({ ...base, password: " Someone@Example.invalid " });
  assert.equal(same.success, false);
  assert.deepEqual(same.error?.issues.map((issue) => issue.path.join(".")), ["password"]);
});

test("login does not apply the password policy (older passwords still work)", () => {
  assert.equal(customerLoginRequestSchema.safeParse({ email: "a@example.invalid", password: "short" }).success, true);
  assert.equal(customerLoginRequestSchema.safeParse({ email: "a@example.invalid", password: "" }).success, false);
});

test("staff temporary passwords need at least 12 characters", () => {
  const base = { email: "staff@example.invalid", displayName: " Sara " };
  assert.equal(createStaffRequestSchema.safeParse({ ...base, temporaryPassword: "12345678901" }).success, false);
  const parsed = createStaffRequestSchema.parse({ ...base, temporaryPassword: "123456789012" });
  assert.equal(parsed.displayName, "Sara");
});

test("one-time tokens are base64url only", () => {
  assert.equal(oneTimeTokenSchema.safeParse("A".repeat(43)).success, true);
  assert.equal(oneTimeTokenSchema.safeParse("short").success, false);
  assert.equal(oneTimeTokenSchema.safeParse(`${"A".repeat(40)}%2F`).success, false);
});
