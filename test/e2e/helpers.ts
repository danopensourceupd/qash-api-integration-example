import assert from "node:assert/strict";
import { loadConfig } from "../../src/config.ts";
import { HttpClient, QashApiError } from "../../src/http.ts";
import { readState, type State } from "../../src/state.ts";

export const config = loadConfig();
export const http = new HttpClient(config);
export const state: State = await readState(config.stateFile);

export const partnerCredentials =
  config.apiKey && config.apiSecret ? { apiKey: config.apiKey, apiSecret: config.apiSecret } : undefined;

export function skipUnless(condition: unknown, reason: string): { skip: string } | { skip: false } {
  return condition ? { skip: false } : { skip: `NOT VALIDATED: ${reason}` };
}

export async function expectApiError(promise: Promise<unknown>, status: number, code?: string): Promise<QashApiError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof QashApiError, `expected QashApiError, got ${String(error)}`);
    assert.equal(error.status, status, error.message);
    if (code) assert.equal(error.code, code, error.message);
    return error;
  }
  assert.fail(`expected HTTP ${status}${code ? ` ${code}` : ""}, but the call succeeded`);
}

export function uniqueEmail(template: string): string {
  const tag = `qa${Date.now().toString(36)}`;
  assert.ok(template.includes("{tag}"), "QASH_E2E_EMAIL_TEMPLATE must contain {tag}");
  return template.replace("{tag}", tag);
}

export function uniquePhone(country: "co" | "ve" | "us"): string {
  const prefix = { co: "+57300", ve: "+58412", us: "+1512" }[country];
  return `${prefix}${String(Date.now()).slice(-7)}`;
}
