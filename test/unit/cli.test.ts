import assert from "node:assert/strict";
import { test } from "node:test";
import { decimalAmount, run } from "../../src/cli.ts";
import { ConfigError, loadConfig } from "../../src/config.ts";

test("accepts transfer amounts as positive numbers with up to six decimals", () => {
  assert.equal(decimalAmount("1.50"), 1.5);
  assert.equal(decimalAmount("50"), 50);
  assert.equal(decimalAmount("0.000001"), 0.000001);
  for (const bad of [undefined, "", "0", "-1", "1.1234567", "1e3", "abc", "1,50"]) {
    assert.throws(() => decimalAmount(bad), ConfigError, String(bad));
  }
});

test("refuses writes and money movement before touching the network", async () => {
  const config = loadConfig({ QASH_API_KEY: "k", QASH_API_SECRET: "s" });
  await assert.rejects(run(["users:register", "--email", "a@example.com", "--country", "CO"], config), /QASH_ENABLE_WRITES=true/);
  await assert.rejects(run(["keys:create", "--name", "x"], config), /QASH_ENABLE_WRITES=true/);
  await assert.rejects(
    run(["user:transfer", "--from", "1", "--to", "2", "--amount", "1", "--asset", "USDC", "--description", "x"], config),
    /QASH_ENABLE_MONEY_MOVEMENT=true/,
  );
  const writesOnly = loadConfig({ QASH_ENABLE_WRITES: "true" });
  await assert.rejects(run(["user:approve", "grt_x"], writesOnly), /QASH_ENABLE_MONEY_MOVEMENT=true/);
});
