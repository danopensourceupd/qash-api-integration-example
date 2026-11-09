import assert from "node:assert/strict";
import { test } from "node:test";
import { PartnerApi } from "../../src/partner.ts";
import { UserApi } from "../../src/user.ts";
import { expectApiError, http } from "./helpers.ts";

const fake = { apiKey: "qash_key_live_invalid", apiSecret: "qash_secret_live_invalid" };

test("partner routes reject a missing secret", async () => {
  const error = await expectApiError(
    http.request("/api/v1/partner/users", { auth: { kind: "none" }, headers: { "X-Api-Key": fake.apiKey } }),
    401,
  );
  assert.equal(error.message, "HTTP 401: Missing partner credentials");
});

test("partner routes reject unknown credentials", async () => {
  const error = await expectApiError(new PartnerApi(http, fake).listUsers(), 401);
  assert.equal(error.message, "HTTP 401: Invalid partner credentials");
});

test("the subdivision catalog requires partner credentials", async () => {
  await expectApiError(new PartnerApi(http, fake).subdivisions("CO"), 401);
  await expectApiError(http.request("/api/v1/user/kyc/subdivisions", { auth: { kind: "bearer", token: "x.y.z" }, query: { country: "CO" } }), 401);
});

test("user routes reject an invalid bearer token", async () => {
  await expectApiError(new UserApi(http, "invalid.token.value").accounts(), 401);
  await expectApiError(new UserApi(http, "invalid.token.value").kycStatus(), 401);
});

test("key management rejects anonymous callers", async () => {
  await expectApiError(http.request("/api/v1/partner/api-keys", { auth: { kind: "none" } }), 401);
});
