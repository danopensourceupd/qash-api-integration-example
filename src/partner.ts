import type { HttpClient } from "./http.ts";

interface PartnerAuth {
  kind: "partner";
  apiKey: string;
  apiSecret: string;
}

export interface PartnerUser {
  id: string;
  email: string;
  status: "pending" | "active" | "suspended" | "banned" | "kyc_required";
  countryCode?: string;
  phone?: string;
  createdAt: string;
}

export interface RegisterUserInput {
  email: string;
  countryCode: string;
  phone?: string;
  preferredLanguage?: string;
}

export interface Subdivision {
  code: string;
  name: string;
}

export interface KycStart {
  inquiryId: string;
  verificationUrl: string | null;
  isExisting: boolean;
  message: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class PartnerApi {
  readonly #http: HttpClient;
  readonly #auth: PartnerAuth;

  constructor(http: HttpClient, credentials: { apiKey: string; apiSecret: string }) {
    this.#http = http;
    this.#auth = { kind: "partner", ...credentials };
  }

  async registerUser(input: RegisterUserInput): Promise<PartnerUser> {
    const res = await this.#http.request<{ data: { user: PartnerUser } }>("/api/v1/partner/users", {
      method: "POST",
      auth: this.#auth,
      body: input,
    });
    return res.body.data.user;
  }

  async listUsers(query: { status?: string; limit?: number; offset?: number } = {}): Promise<PartnerUser[]> {
    const res = await this.#http.request<{ data: { users: PartnerUser[] } }>("/api/v1/partner/users", {
      auth: this.#auth,
      query,
    });
    return res.body.data.users;
  }

  async getUser(userId: string): Promise<PartnerUser> {
    const res = await this.#http.request<{ data: { user: PartnerUser } }>(
      `/api/v1/partner/users/${encodeURIComponent(userId)}`,
      { auth: this.#auth },
    );
    return res.body.data.user;
  }

  async subdivisions(country: string): Promise<Subdivision[]> {
    const res = await this.#http.request<{ data: { subdivisions: Subdivision[] } }>(
      "/api/v1/user/kyc/subdivisions",
      { auth: this.#auth, query: { country } },
    );
    return res.body.data.subdivisions;
  }

  async createProfile(userId: string, profile: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await this.#http.request<{ data: { profile: Record<string, unknown> } }>("/api/v1/user/profile", {
      method: "POST",
      auth: this.#auth,
      body: { ...profile, userId },
    });
    return res.body.data.profile;
  }

  async checkProfileCompletion(userId: string): Promise<{ isComplete: boolean; missingFields: string[] }> {
    const res = await this.#http.request<{ data: { isComplete: boolean; missingFields: string[] } }>(
      "/api/v1/user/profile/check-completion",
      { auth: this.#auth, query: { userId } },
    );
    return res.body.data;
  }

  async startKyc(userId: string, identity: Record<string, unknown>): Promise<KycStart> {
    const res = await this.#http.request<{ data: KycStart }>("/api/v1/user/kyc/start", {
      method: "POST",
      auth: this.#auth,
      body: { ...identity, userId },
    });
    return res.body.data;
  }

  async sendLoginCode(email: string): Promise<void> {
    await this.#http.request("/api/v1/partner/auth/send", { method: "POST", auth: this.#auth, body: { email } });
  }

  async verifyLoginCode(email: string, code: string): Promise<TokenPair> {
    const res = await this.#http.request<TokenPair>("/api/v1/partner/auth/verify", {
      method: "POST",
      auth: this.#auth,
      body: { email, code },
    });
    return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
  }
}
