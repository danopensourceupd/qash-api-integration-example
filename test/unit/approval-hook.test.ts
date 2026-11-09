import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { amountCapPolicy, createApprovalHookServer, handleHook, type AuthorizationRequest } from "../../src/approval-hook.ts";
import { sign, verify } from "../../src/signature.ts";

const SECRET = "qcb_secret_unit_test_only";
const NOW = 1_800_000_000_000;
const TS = String(NOW / 1000);

const delivery: AuthorizationRequest = {
  type: "transaction.authorization.requested",
  version: 1,
  deliveryId: "d-1",
  authorizationRef: "grt_0123456789abcdef0123456789abcdef",
  transactionUuid: "6f1c1a52-0000-4000-8000-000000000001",
  intentHash: "hash",
  nonce: "nonce",
  sourceAccountId: "10",
  destinationAccountId: "11",
  asset: "USDC",
  amountMinor: "500000",
  amount: "5",
  initiatorUserId: "u-1",
  approverUserId: "owner-1",
  expiresAt: "2027-01-01T00:00:00.000Z",
};

function signed(body: string) {
  return { signature: sign(SECRET, TS, body), timestamp: TS };
}

test("signature matches the v1:{ts}:{body} scheme and rejects tampering and stale timestamps", () => {
  const body = '{"a":1}';
  const header = sign(SECRET, TS, body);
  assert.match(header, /^v1=[0-9a-f]{64}$/);
  assert.equal(verify(SECRET, header, TS, body, NOW), "VALID");
  assert.equal(verify(SECRET, header, TS, '{"a":2}', NOW), "INVALID_SIGNATURE");
  assert.equal(verify("other", header, TS, body, NOW), "INVALID_SIGNATURE");
  assert.equal(verify(SECRET, header, TS, body, NOW + 301_000), "STALE_TIMESTAMP");
  assert.equal(verify(SECRET, undefined, TS, body, NOW), "INVALID_SIGNATURE");
  assert.equal(verify(SECRET, header, "abc", body, NOW), "INVALID_SIGNATURE");
});

test("answers the endpoint verification challenge with exactly two signed keys", async () => {
  const body = JSON.stringify({ type: "endpoint.verification", version: 1, callbackId: "cb", challenge: "xyz" });
  const result = await handleHook(SECRET, () => ({ decision: "APPROVED" }), body, signed(body), NOW);
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(result.body), { type: "endpoint.verification", challenge: "xyz" });
  assert.equal(verify(SECRET, result.headers["X-Qash-Signature"], result.headers["X-Qash-Timestamp"], result.body, NOW), "VALID");
});

test("echoes the binding fields and signs the decision", async () => {
  const body = JSON.stringify(delivery);
  const result = await handleHook(SECRET, amountCapPolicy(10, new Set(["USDC"])), body, signed(body), NOW);
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(result.body), {
    deliveryId: "d-1",
    authorizationRef: delivery.authorizationRef,
    transactionUuid: delivery.transactionUuid,
    intentHash: "hash",
    nonce: "nonce",
    decision: "APPROVED",
  });
  assert.equal(verify(SECRET, result.headers["X-Qash-Signature"], result.headers["X-Qash-Timestamp"], result.body, NOW), "VALID");
});

test("policy rejects other assets and amounts above the cap", async () => {
  const policy = amountCapPolicy(1, new Set(["USDC"]));
  assert.deepEqual(await policy(delivery), { decision: "REJECTED", reason: "Amount above policy cap" });
  assert.equal((await policy({ ...delivery, asset: "COP", amount: "0.5" })).decision, "REJECTED");
  assert.equal((await policy({ ...delivery, amount: "0.5" })).decision, "APPROVED");
  assert.equal((await policy({ ...delivery, amount: "NaN" })).decision, "REJECTED");
});

test("refuses unsigned, malformed or unknown requests without signing the reply", async () => {
  const body = JSON.stringify(delivery);
  const unsigned = await handleHook(SECRET, () => ({ decision: "APPROVED" }), body, { signature: undefined, timestamp: TS }, NOW);
  assert.equal(unsigned.status, 401);
  assert.equal(unsigned.headers["X-Qash-Signature"], undefined);
  const notJson = await handleHook(SECRET, () => ({ decision: "APPROVED" }), "nope", signed("nope"), NOW);
  assert.equal(notJson.status, 400);
  const other = JSON.stringify({ type: "other" });
  assert.equal((await handleHook(SECRET, () => ({ decision: "APPROVED" }), other, signed(other), NOW)).status, 400);
});

test("serves over HTTP and rejects non-POST methods", async () => {
  const server = createApprovalHookServer(SECRET, amountCapPolicy(10, new Set(["USDC"])));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const body = JSON.stringify(delivery);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: { "X-Qash-Signature": sign(SECRET, timestamp, body), "X-Qash-Timestamp": timestamp, "X-Qash-Delivery-Id": "d-1" },
      body,
    });
    const text = await res.text();
    assert.equal(res.status, 200);
    assert.equal(verify(SECRET, res.headers.get("x-qash-signature") ?? undefined, res.headers.get("x-qash-timestamp") ?? undefined, text), "VALID");
    assert.equal((JSON.parse(text) as { decision: string }).decision, "APPROVED");
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 405);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
