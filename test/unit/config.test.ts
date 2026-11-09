import assert from "node:assert/strict";
import { test } from "node:test";
import { ConfigError, loadConfig, requireMoneyMovement, requirePartnerCredentials, requireWrites } from "../../src/config.ts";

test("defaults to the sandbox with every write disabled", () => {
  const config = loadConfig({});
  assert.equal(config.baseUrl.href, "https://sandbox.qash.ai/");
  assert.equal(config.enableWrites, false);
  assert.equal(config.enableMoneyMovement, false);
  assert.equal(config.stateFile, ".state/session.json");
});

test("refuses production hosts and plain http", () => {
  assert.throws(() => loadConfig({ QASH_BASE_URL: "https://app.qash.ai" }), ConfigError);
  assert.throws(() => loadConfig({ QASH_BASE_URL: "http://sandbox.qash.ai" }), ConfigError);
  assert.throws(() => loadConfig({ QASH_BASE_URL: "not a url" }), ConfigError);
  assert.equal(loadConfig({ QASH_BASE_URL: "http://localhost:8080" }).baseUrl.href, "http://localhost:8080/");
  assert.equal(loadConfig({ QASH_BASE_URL: "http://127.0.0.1:3000" }).baseUrl.port, "3000");
});

test("rejects an out-of-range timeout", () => {
  assert.throws(() => loadConfig({ QASH_TIMEOUT_MS: "10" }), ConfigError);
  assert.throws(() => loadConfig({ QASH_TIMEOUT_MS: "abc" }), ConfigError);
});

test("money movement needs both flags", () => {
  assert.equal(loadConfig({ QASH_ENABLE_MONEY_MOVEMENT: "true" }).enableMoneyMovement, false);
  const config = loadConfig({ QASH_ENABLE_WRITES: "true", QASH_ENABLE_MONEY_MOVEMENT: "TRUE" });
  assert.equal(config.enableMoneyMovement, true);
  assert.doesNotThrow(() => {
    requireMoneyMovement(config, "transfer");
  });
});

test("guards throw clear errors when disabled", () => {
  const config = loadConfig({});
  assert.throws(() => {
    requireWrites(config, "users:register");
  }, /QASH_ENABLE_WRITES=true/);
  assert.throws(() => {
    requireMoneyMovement(config, "user:transfer");
  }, /QASH_ENABLE_MONEY_MOVEMENT=true/);
  assert.throws(() => requirePartnerCredentials(config), /QASH_API_KEY/);
  assert.deepEqual(requirePartnerCredentials(loadConfig({ QASH_API_KEY: " k ", QASH_API_SECRET: "s" })), {
    apiKey: "k",
    apiSecret: "s",
  });
});
