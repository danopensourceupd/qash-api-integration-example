import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BusinessApi } from "../../src/business.ts";
import { PartnerApi } from "../../src/partner.ts";
import { config, expectApiError, http, skipUnless, state } from "./helpers.ts";

describe("business owner session", skipUnless(state.business, "no business session in the state file (run owner:login)"), () => {
  const api = () => new BusinessApi(http, state.business?.accessToken ?? "");

  test("lists API keys without exposing secrets", async () => {
    const keys = await api().listKeys();
    for (const key of keys) {
      assert.equal(typeof key.isBot, "boolean");
      assert.equal("secretKey" in key, false);
    }
  });

  test("changing limits requires the emailed confirmation code", async (t) => {
    const key = (await api().listKeys()).find((k) => k.status === "active");
    if (!key) {
      t.skip("NOT VALIDATED: no active key");
      return;
    }
    const current = await api().getLimits(key.id);
    await expectApiError(
      http.request(`/api/v1/partner/api-keys/${key.id}/limits`, {
        method: "PUT",
        auth: { kind: "bearer", token: state.business?.accessToken ?? "" },
        body: { expectedVersion: current.limits?.version ?? null, limits: { assetLimits: { USDC: { perTransaction: "1" } } } },
      }),
      403,
      "OTP_REQUIRED",
    );
  });

  test("rejects malformed limits before asking for a code", async (t) => {
    const key = (await api().listKeys()).find((k) => k.status === "active");
    if (!key) {
      t.skip("NOT VALIDATED: no active key");
      return;
    }
    await expectApiError(
      api().setLimits(key.id, { expectedVersion: null, limits: { assetLimits: { USDC: { perTransaction: "10", daily: "5" } } }, otpCode: "000000" }),
      400,
    );
  });

  test(
    "creates a regular and a bot key, then revokes both",
    skipUnless(config.enableWrites, "QASH_ENABLE_WRITES is not true"),
    async () => {
      const suffix = Date.now().toString(36);
      const regular = await api().createKey({ keyName: `e2e-regular-${suffix}` });
      const bot = await api().createKey({ keyName: `e2e-bot-${suffix}`, isBot: true });
      try {
        assert.match(regular.apiKey, /^qash_key_/);
        assert.ok(regular.secretKey.length > 20);
        assert.equal(bot.isBot, true);

        const listed = await api().listKeys();
        assert.equal(listed.find((k) => k.id === bot.apiKeyId)?.isBot, true);

        const limits = await api().getLimits(regular.apiKeyId);
        assert.equal(limits.isBot, false);
        assert.ok(limits.limits === null || Object.keys(limits.limits.assetLimits).length === 0);

        await new PartnerApi(http, { apiKey: regular.apiKey, apiSecret: regular.secretKey }).listUsers({ limit: 1 });
        await expectApiError(api().createKey({ keyName: `e2e-regular-${suffix}` }), 400);
      } finally {
        await api().revokeKey(regular.apiKeyId);
        await api().revokeKey(bot.apiKeyId);
      }
      await expectApiError(new PartnerApi(http, { apiKey: regular.apiKey, apiSecret: regular.secretKey }).listUsers(), 401);
      assert.equal((await api().listKeys()).find((k) => k.id === regular.apiKeyId)?.status, "revoked");
    },
  );
});
