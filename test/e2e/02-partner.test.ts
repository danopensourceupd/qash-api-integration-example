import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import { PartnerApi } from "../../src/partner.ts";
import { config, expectApiError, http, partnerCredentials, skipUnless, uniqueEmail, uniquePhone } from "./helpers.ts";

const emailTemplate = process.env.QASH_E2E_EMAIL_TEMPLATE ?? "qash-example+{tag}@example.com";
const canWrite = partnerCredentials && config.enableWrites;

async function example(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(new URL(`../../examples/${name}`, import.meta.url), "utf8")) as Record<string, unknown>;
}

describe("partner key: read-only", skipUnless(partnerCredentials, "QASH_API_KEY / QASH_API_SECRET not set"), () => {
  const api = () => new PartnerApi(http, partnerCredentials ?? { apiKey: "", apiSecret: "" });

  test("lists the 33 Colombian departments", async () => {
    const subdivisions = await api().subdivisions("CO");
    assert.equal(subdivisions.length, 33);
    assert.deepEqual(subdivisions.find((s) => s.code === "CO-ANT"), { code: "CO-ANT", name: "Antioquia" });
    assert.ok(subdivisions.some((s) => s.name === "Bogotá D.C."));
  });

  test("has no subdivision catalog for Venezuela or the United States", async () => {
    await expectApiError(api().subdivisions("VE"), 404, "NOT_FOUND");
    await expectApiError(api().subdivisions("US"), 404, "NOT_FOUND");
    await expectApiError(api().subdivisions("C0"), 400, "VALIDATION_ERROR");
  });

  test("lists only this partner's users", async () => {
    assert.ok(Array.isArray(await api().listUsers({ limit: 5 })));
  });

  test("hides users that do not belong to the partner", async () => {
    await expectApiError(api().getUser(randomUUID()), 404);
    const error = await expectApiError(api().createProfile(randomUUID(), { firstName: "A", lastName: "B" }), 403);
    assert.match(error.message, /does not belong to this partner/);
    await expectApiError(api().checkProfileCompletion(""), 400);
  });

  test("rejects login codes that were never issued", async () => {
    await expectApiError(api().verifyLoginCode(uniqueEmail(emailTemplate), "000000"), 401);
  });
});

describe("partner key: onboarding writes", skipUnless(canWrite, "needs partner credentials and QASH_ENABLE_WRITES=true"), () => {
  const api = () => new PartnerApi(http, partnerCredentials ?? { apiKey: "", apiSecret: "" });

  for (const country of ["co", "ve", "us"] as const) {
    test(`onboards a ${country.toUpperCase()} user up to the hosted verification link`, async () => {
      const email = uniqueEmail(emailTemplate);
      const kyc: Record<string, unknown> = { ...(await example(`kyc-${country}.json`)), email, phone: uniquePhone(country) };
      const user = await api().registerUser({ email, countryCode: country.toUpperCase(), phone: String(kyc.phone) });
      assert.equal(user.status, "pending");

      await expectApiError(api().registerUser({ email, countryCode: country.toUpperCase() }), 400);

      const profile = await api().createProfile(user.id, await example(`profile-${country}.json`));
      assert.equal(profile.userId, user.id);
      const completion = await api().checkProfileCompletion(user.id);
      assert.deepEqual(completion, { isComplete: true, missingFields: [] });

      if (country === "co") {
        const error = await expectApiError(api().startKyc(user.id, { ...kyc, stateProvince: "Medellín" }), 422, "INVALID_STATE_PROVINCE");
        assert.match(error.message, /valid Colombian department/);
      }

      const started = await api().startKyc(user.id, kyc);
      assert.ok(started.inquiryId);
      assert.equal(started.isExisting, false);
      assert.match(started.verificationUrl ?? "", /^https:\/\/[^/]+\/.*inquiry-id=/);

      const again = await api().startKyc(user.id, kyc);
      assert.equal(again.inquiryId, started.inquiryId);
      assert.equal(again.isExisting, true);

      const fetched = await api().getUser(user.id);
      assert.notEqual(fetched.status, "active");
    });
  }

  test("rejects an invalid registration payload", async () => {
    await expectApiError(api().registerUser({ email: "not-an-email", countryCode: "CO" }), 400);
    await expectApiError(api().registerUser({ email: uniqueEmail(emailTemplate), countryCode: "COL" }), 400);
  });
});
