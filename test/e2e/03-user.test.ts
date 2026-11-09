import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import { UserApi } from "../../src/user.ts";
import { expectApiError, http, skipUnless, state } from "./helpers.ts";

describe("end user session", skipUnless(state.user, "no user session in the state file (run user:login)"), () => {
  const token = state.user?.accessToken ?? "";
  const api = () => new UserApi(http, token);

  test("reports an active, KYC-approved user", async () => {
    const status = (await api().kycStatus()) as { status: { kyc: string | null; active: boolean } };
    assert.equal(status.status.active, true);
    assert.equal(status.status.kyc, "approved");
  });

  test("returns the occupation catalog", async () => {
    const entries = await api().occupations();
    const codes = new Set(entries.map((e) => e.code));
    for (const special of ["SELFEMP", "OTHERXX", "UNEMPLO", "STUDENT", "RETIRED"]) assert.ok(codes.has(special), special);
    assert.ok(entries.some((e) => e.kind === "soc" && /^\d{2}-\d{4}$/.test(e.code)));
  });

  test("lists accounts and balances", async () => {
    const accounts = await api().accounts();
    assert.ok(Array.isArray(accounts));
    for (const account of accounts) {
      assert.equal(typeof account.id, "number");
      assert.equal(typeof account.asset, "string");
    }
    assert.deepEqual(
      (await api().balance()).map((a) => a.id).sort(),
      accounts.map((a) => a.id).sort(),
    );
  });

  test("lists transactions and finds none for an unknown id", async () => {
    const page = await api().transactions({ limit: 5 });
    assert.ok(Array.isArray(page.items));
    await expectApiError(api().transaction(randomUUID()), 404);
    const first = page.items[0];
    if (typeof first?.uuid === "string") assert.equal((await api().transaction(first.uuid)).uuid, first.uuid);
  });

  test("cannot call partner-only or key-management routes", async () => {
    await expectApiError(
      http.request("/api/v1/user/kyc/start", { method: "POST", auth: { kind: "bearer", token }, body: {} }),
      401,
    );
    await expectApiError(http.request("/api/v1/partner/api-keys", { auth: { kind: "bearer", token } }), 403);
  });
});
