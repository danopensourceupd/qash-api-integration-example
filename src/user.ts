import type { HttpClient } from "./http.ts";
import type { TokenPair } from "./partner.ts";

export interface Account {
  id: number;
  number: string;
  asset: string;
  type: string;
  description: string;
  credits: string;
  debits: string;
  pendingCredits: string;
  pendingDebits: string;
  locked: string;
}

export interface TransferInput {
  fromAccountId: number;
  toAccountId: number;
  amount: number;
  asset: string;
  description: string;
  clientReference?: string;
}

export interface TransferResult {
  transactionId: string;
  status: string;
  message: string;
  authorizationRef?: string;
}

export interface Page<T> {
  items: T[];
}

export class UserApi {
  readonly #http: HttpClient;
  readonly #auth: { kind: "bearer"; token: string };

  constructor(http: HttpClient, accessToken: string) {
    this.#http = http;
    this.#auth = { kind: "bearer", token: accessToken };
  }

  async kycStatus(): Promise<Record<string, unknown>> {
    const res = await this.#http.request<{ data: Record<string, unknown> }>("/api/v1/user/kyc/status", {
      auth: this.#auth,
    });
    return res.body.data;
  }

  async occupations(): Promise<{ code: string; kind: string }[]> {
    const res = await this.#http.request<{ data: { entries: { code: string; kind: string }[] } }>(
      "/api/v1/user/kyc/occupations",
      { auth: this.#auth },
    );
    return res.body.data.entries;
  }

  async accounts(): Promise<Account[]> {
    const res = await this.#http.request<Page<Account>>("/api/v1/user/accounts", { auth: this.#auth });
    return res.body.items;
  }

  async balance(): Promise<Account[]> {
    const res = await this.#http.request<Page<Account>>("/api/v1/user/balance", { auth: this.#auth });
    return res.body.items;
  }

  async transactions(query: { accountId?: number; page?: number; limit?: number } = {}): Promise<Page<Record<string, unknown>>> {
    const res = await this.#http.request<Page<Record<string, unknown>>>("/api/v1/transactions", {
      auth: this.#auth,
      query,
    });
    return res.body;
  }

  async transaction(uuid: string): Promise<Record<string, unknown>> {
    const res = await this.#http.request<Record<string, unknown>>("/api/v1/transactions", {
      auth: this.#auth,
      query: { id: uuid },
    });
    return res.body;
  }

  async transfer(input: TransferInput): Promise<TransferResult> {
    const res = await this.#http.request<TransferResult>("/api/v1/transactions/transfer", {
      method: "POST",
      auth: this.#auth,
      body: input,
    });
    return res.body;
  }

  async pendingAuthorizations(): Promise<unknown> {
    const res = await this.#http.request<unknown>("/api/v1/authorizations/pending", { auth: this.#auth });
    return res.body;
  }

  async requestApprovalCode(ref: string): Promise<void> {
    await this.#http.request(`/api/v1/authorizations/ref/${encodeURIComponent(ref)}/challenge`, {
      method: "POST",
      auth: this.#auth,
    });
  }

  async approve(ref: string, otpCode: string): Promise<unknown> {
    const res = await this.#http.request<unknown>(`/api/v1/authorizations/ref/${encodeURIComponent(ref)}/approve`, {
      method: "POST",
      auth: this.#auth,
      body: { otpCode },
    });
    return res.body;
  }

  async reject(ref: string, reason?: string): Promise<unknown> {
    const res = await this.#http.request<unknown>(`/api/v1/authorizations/ref/${encodeURIComponent(ref)}/reject`, {
      method: "POST",
      auth: this.#auth,
      body: reason ? { reason } : {},
    });
    return res.body;
  }
}

export async function refreshSession(http: HttpClient, refreshToken: string): Promise<TokenPair> {
  const res = await http.request<TokenPair>("/api/v1/auth/refresh", {
    method: "POST",
    auth: { kind: "none" },
    body: { refreshToken },
  });
  return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
}
