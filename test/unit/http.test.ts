import assert from "node:assert/strict";
import { test } from "node:test";
import { describeError, HttpClient, QashApiError } from "../../src/http.ts";
import { PartnerApi } from "../../src/partner.ts";
import { UserApi } from "../../src/user.ts";

interface Captured {
  url: URL;
  init: RequestInit;
}

function fakeFetch(status: number, body: unknown, captured: Captured[]): typeof fetch {
  return (input: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: new URL(input instanceof Request ? input.url : input), init: init ?? {} });
    return Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { "x-request-id": "req-1" },
      }),
    );
  };
}

const config = { baseUrl: new URL("https://sandbox.qash.ai"), timeoutMs: 5000 };

test("sends partner headers and JSON body", async () => {
  const captured: Captured[] = [];
  const http = new HttpClient(config, fakeFetch(201, { success: true, data: { user: { id: "u1" } } }, captured));
  const user = await new PartnerApi(http, { apiKey: "key", apiSecret: "secret" }).registerUser({
    email: "a@example.com",
    countryCode: "CO",
  });
  assert.equal(user.id, "u1");
  const call = captured[0];
  assert.ok(call);
  assert.equal(call.url.pathname, "/api/v1/partner/users");
  assert.equal(call.init.method, "POST");
  const headers = call.init.headers as Record<string, string>;
  assert.equal(headers["X-Api-Key"], "key");
  assert.equal(headers["X-Api-Secret"], "secret");
  assert.equal(headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(call.init.body as string), { email: "a@example.com", countryCode: "CO" });
});

test("profile and kyc calls carry the userId the gateway checks", async () => {
  const captured: Captured[] = [];
  const http = new HttpClient(config, fakeFetch(200, { data: { isComplete: true, missingFields: [] } }, captured));
  const api = new PartnerApi(http, { apiKey: "k", apiSecret: "s" });
  await api.checkProfileCompletion("user-1");
  assert.equal(captured[0]?.url.searchParams.get("userId"), "user-1");
  const kycCaptured: Captured[] = [];
  const kycHttp = new HttpClient(config, fakeFetch(201, { data: { inquiryId: "inq" } }, kycCaptured));
  await new PartnerApi(kycHttp, { apiKey: "k", apiSecret: "s" }).startKyc("user-2", { firstName: "A" });
  assert.deepEqual(JSON.parse(kycCaptured[0]?.init.body as string), { firstName: "A", userId: "user-2" });
});

test("reads a transaction by uuid through the list endpoint", async () => {
  const captured: Captured[] = [];
  const http = new HttpClient(config, fakeFetch(200, { uuid: "t-1", status: "WAITING_APPROVAL" }, captured));
  const tx = await new UserApi(http, "jwt").transaction("t-1");
  assert.deepEqual(tx, { uuid: "t-1", status: "WAITING_APPROVAL" });
  const call = captured[0];
  assert.ok(call);
  assert.equal(call.url.pathname, "/api/v1/transactions");
  assert.equal(call.url.searchParams.get("id"), "t-1");
  assert.equal((call.init.headers as Record<string, string>).Authorization, "Bearer jwt");
});

test("turns error envelopes into QashApiError", async () => {
  const http = new HttpClient(
    config,
    fakeFetch(403, { error: "Forbidden", code: "PARTNER_KEY_LIMIT_PER_TRANSACTION", message: "not allowed" }, []),
  );
  await assert.rejects(new UserApi(http, "jwt").accounts(), (error: unknown) => {
    assert.ok(error instanceof QashApiError);
    assert.equal(error.status, 403);
    assert.equal(error.code, "PARTNER_KEY_LIMIT_PER_TRANSACTION");
    assert.equal(error.requestId, "req-1");
    return true;
  });
});

test("describes every error envelope Qash returns", () => {
  assert.deepEqual(describeError({ success: false, error: "Invalid partner credentials" }), {
    code: undefined,
    message: "Invalid partner credentials",
  });
  assert.deepEqual(describeError({ statusCode: 422, error: "INVALID_STATE_PROVINCE", code: "INVALID_STATE_PROVINCE", message: "bad" }), {
    code: "INVALID_STATE_PROVINCE",
    message: "bad",
  });
  assert.deepEqual(describeError({ message: "Invalid token", errorCode: "AUTHENTICATION_ERROR" }), {
    code: "AUTHENTICATION_ERROR",
    message: "Invalid token",
  });
  assert.deepEqual(describeError({ success: false, error: "User does not belong", errorCode: "PARTNER_USER_ALREADY_VERIFIED" }).code, "PARTNER_USER_ALREADY_VERIFIED");
  assert.equal(
    describeError({ message: ["amount must be a finite number or a two-decimal string"], error: "Bad Request", statusCode: 400 }).message,
    "amount must be a finite number or a two-decimal string",
  );
  assert.equal(describeError(undefined).message, "Unexpected response");
  assert.equal(describeError("<html>").message, "<html>");
});
