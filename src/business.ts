import type { HttpClient } from "./http.ts";
import type { TokenPair } from "./partner.ts";

export interface AssetLimit {
  perTransaction: string;
  daily?: string | null;
  monthly?: string | null;
}

export interface Limits {
  assetLimits: Record<string, AssetLimit>;
}

export interface ApiKeySummary {
  id: string;
  keyName: string;
  keyPrefix: string;
  apiKey: string;
  status: string;
  isBot: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreatedApiKey {
  apiKeyId: string;
  apiKey: string;
  secretKey: string;
  keyName: string;
  isBot?: boolean;
  limits?: { version: number; assetLimits: Record<string, AssetLimit> };
}

export interface KeyLimits {
  apiKeyId: string;
  status: string;
  isBot: boolean;
  mode: "legacy" | "limits";
  limits: { assetLimits: Record<string, AssetLimit>; version: number } | null;
  usage: { asset: string; period: "day" | "month"; periodKey: string; amount: string; operations: number }[];
}

export type KeyAction = "update_limits" | "update_callback" | "rotate_callback_secret";

export interface CallbackConfig {
  name: string;
  url: string;
  allowedAccountIds: (string | number)[];
  allowedDestinationCidrs?: string[] | null;
  timeoutMs?: number;
  maxAttempts?: number;
}

export async function sendOwnerLoginCode(http: HttpClient, email: string): Promise<void> {
  await http.request("/api/v1/auth/otp/send", { method: "POST", auth: { kind: "none" }, body: { email } });
}

export async function verifyOwnerLoginCode(http: HttpClient, email: string, code: string): Promise<TokenPair> {
  const res = await http.request<TokenPair>("/api/v1/auth/otp/verify", {
    method: "POST",
    auth: { kind: "none" },
    body: { email, code },
  });
  return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
}

export class BusinessApi {
  readonly #http: HttpClient;
  readonly #auth: { kind: "bearer"; token: string };

  constructor(http: HttpClient, accessToken: string) {
    this.#http = http;
    this.#auth = { kind: "bearer", token: accessToken };
  }

  #keyPath(id: string, suffix = ""): string {
    return `/api/v1/partner/api-keys/${encodeURIComponent(id)}${suffix}`;
  }

  async listKeys(): Promise<ApiKeySummary[]> {
    const res = await this.#http.request<{ data: { keys: ApiKeySummary[] } }>("/api/v1/partner/api-keys", {
      auth: this.#auth,
    });
    return res.body.data.keys;
  }

  async createKey(input: { keyName: string; isBot?: boolean; limits?: Limits }): Promise<CreatedApiKey> {
    const res = await this.#http.request<CreatedApiKey>("/api/v1/partner/api-keys", {
      method: "POST",
      auth: this.#auth,
      body: input,
    });
    return res.body;
  }

  async revokeKey(id: string): Promise<void> {
    await this.#http.request(this.#keyPath(id), { method: "DELETE", auth: this.#auth });
  }

  async getLimits(id: string): Promise<KeyLimits> {
    const res = await this.#http.request<{ data: KeyLimits }>(this.#keyPath(id, "/limits"), { auth: this.#auth });
    return res.body.data;
  }

  async requestActionCode(id: string, action: KeyAction): Promise<void> {
    await this.#http.request(this.#keyPath(id, "/otp"), { method: "POST", auth: this.#auth, body: { action } });
  }

  async setLimits(id: string, input: { expectedVersion: number | null; limits: Limits; otpCode: string }): Promise<{ version: number }> {
    const res = await this.#http.request<{ data: { version: number } }>(this.#keyPath(id, "/limits"), {
      method: "PUT",
      auth: this.#auth,
      body: input,
    });
    return res.body.data;
  }

  async audit(id: string, limit = 25): Promise<unknown[]> {
    const res = await this.#http.request<{ data: { events: unknown[] } }>(this.#keyPath(id, "/audit"), {
      auth: this.#auth,
      query: { limit },
    });
    return res.body.data.events;
  }

  async getCallback(id: string): Promise<unknown> {
    const res = await this.#http.request<{ data: unknown }>(this.#keyPath(id, "/callback"), { auth: this.#auth });
    return res.body.data;
  }

  async setCallback(
    id: string,
    input: { expectedVersion: number | null; callback: CallbackConfig; otpCode: string },
  ): Promise<{ callback: unknown; secret: string | null }> {
    const res = await this.#http.request<{ data: { callback: unknown; secret: string | null } }>(
      this.#keyPath(id, "/callback"),
      { method: "PUT", auth: this.#auth, body: input },
    );
    return res.body.data;
  }

  async verifyCallback(id: string): Promise<unknown> {
    const res = await this.#http.request<{ data: unknown }>(this.#keyPath(id, "/callback/verify"), {
      method: "POST",
      auth: this.#auth,
      body: {},
    });
    return res.body.data;
  }

  async disableCallback(id: string): Promise<unknown> {
    const res = await this.#http.request<{ data: unknown }>(this.#keyPath(id, "/callback/disable"), {
      method: "POST",
      auth: this.#auth,
      body: {},
    });
    return res.body.data;
  }
}
