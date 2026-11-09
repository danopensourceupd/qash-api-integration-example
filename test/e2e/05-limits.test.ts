import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BusinessApi } from "../../src/business.ts";
import { UserApi, type Account } from "../../src/user.ts";
import { expectApiError, http, skipUnless, state } from "./helpers.ts";

const keyId = process.env.QASH_E2E_KEY_ID;
const ready = state.user && state.business && keyId;

function usedAmounts(usage: { asset: string; period: string; amount: string }[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of usage) totals[`${row.asset}:${row.period}`] = Number(row.amount);
  return Object.fromEntries(Object.entries(totals).filter(([, amount]) => amount !== 0));
}

function hasFunds(account: Account): boolean {
  return [account.credits, account.pendingCredits].some((v) => Number(v) !== 0);
}

describe(
  "API key limits on transfers",
  skipUnless(ready, "needs user and business sessions plus QASH_E2E_KEY_ID (the key the user logged in with)"),
  () => {
    const user = () => new UserApi(http, state.user?.accessToken ?? "");
    const business = () => new BusinessApi(http, state.business?.accessToken ?? "");

    test("refuses transfers that break the key policy before they reach the ledger", async (t) => {
      const limits = await business().getLimits(keyId ?? "");
      const entry = Object.entries(limits.limits?.assetLimits ?? {})[0];
      const accounts = await user().accounts();
      const source = accounts.find((a) => a.asset === entry?.[0]);
      const other = accounts.find((a) => a.asset !== entry?.[0]);
      if (limits.mode !== "limits" || !entry || !source) {
        t.skip("NOT VALIDATED: key has no asset limit matching one of the user's accounts");
        return;
      }
      if (accounts.some(hasFunds)) {
        t.skip("NOT VALIDATED: the user holds funds; this suite only probes empty accounts so nothing can move");
        return;
      }
      const [asset, limit] = entry;
      const base = { fromAccountId: source.id, toAccountId: other?.id ?? source.id, asset, description: "qa limit probe" };
      const over = Number(limit.perTransaction) + 1;

      await expectApiError(user().transfer({ ...base, amount: over }), 403, "PARTNER_KEY_LIMIT_PER_TRANSACTION");
      await expectApiError(user().transfer({ ...base, amount: -1 }), 403, "PARTNER_KEY_INVALID_AMOUNT");
      await expectApiError(user().transfer({ ...base, asset: asset === "COP" ? "USDC" : "COP", amount: 1 }), 403, "PARTNER_KEY_ASSET_MISMATCH");
      if (other) {
        await expectApiError(user().transfer({ ...base, fromAccountId: other.id, asset: other.asset, amount: 1 }), 403, "PARTNER_KEY_LIMIT_NOT_CONFIGURED");
      }

      const before = await business().getLimits(keyId ?? "");
      const error = await expectApiError(user().transfer({ ...base, amount: 0.01 }), 400);
      assert.doesNotMatch(error.code ?? "", /^PARTNER_KEY_/);
      const after = await business().getLimits(keyId ?? "");
      assert.deepEqual(usedAmounts(after.usage), usedAmounts(before.usage), "a refused transfer must release its reservation");
    });
  },
);
