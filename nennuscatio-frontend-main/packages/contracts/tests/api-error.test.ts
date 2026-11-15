import assert from "node:assert/strict";
import { test } from "node:test";
import { apiErrorSchema } from "../src/index.js";

test("accepts the API error envelope", () => {
  assert.deepEqual(
    apiErrorSchema.parse({ code: "UNAVAILABLE", message: "Site settings are not configured." }),
    { code: "UNAVAILABLE", message: "Site settings are not configured." },
  );
});

test("does not accept framework default error bodies as the envelope", () => {
  // NestJS's default 404 body; the web client must fall back to the HTTP status for these.
  const nestDefault = { statusCode: 404, message: "Cannot GET /x", error: "Not Found" };
  assert.equal(apiErrorSchema.safeParse(nestDefault).success, false);
});

test("rejects unknown codes", () => {
  assert.equal(apiErrorSchema.safeParse({ code: "TEAPOT", message: "" }).success, false);
});
