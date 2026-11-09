import type { Config } from "./config.ts";

export type Auth =
  | { kind: "none" }
  | { kind: "partner"; apiKey: string; apiSecret: string }
  | { kind: "bearer"; token: string };

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  auth: Auth;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface ApiResponse<T> {
  status: number;
  body: T;
  requestId: string | undefined;
}

export class QashApiError extends Error {
  override name = "QashApiError";

  readonly status: number;
  readonly code: string | undefined;
  readonly requestId: string | undefined;
  readonly body: unknown;

  constructor(status: number, body: unknown, requestId: string | undefined) {
    const { code, message } = describeError(body);
    super(`HTTP ${status}${code ? ` ${code}` : ""}: ${message}`);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.body = body;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function describeError(body: unknown): { code: string | undefined; message: string } {
  if (typeof body !== "object" || body === null) {
    return { code: undefined, message: typeof body === "string" && body ? body : "Unexpected response" };
  }
  const record = body as Record<string, unknown>;
  const code = asString(record.code) ?? asString(record.errorCode);
  const details = Array.isArray(record.message) ? record.message.filter((m) => typeof m === "string").join("; ") : undefined;
  const message = asString(details) ?? asString(record.message) ?? asString(record.error) ?? "Request failed";
  return { code, message };
}

export class HttpClient {
  readonly #baseUrl: URL;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(config: Pick<Config, "baseUrl" | "timeoutMs">, fetchImpl: typeof fetch = fetch) {
    this.#baseUrl = config.baseUrl;
    this.#timeoutMs = config.timeoutMs;
    this.#fetch = fetchImpl;
  }

  async request<T>(path: string, options: RequestOptions): Promise<ApiResponse<T>> {
    const url = new URL(path, this.#baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
    if (options.auth.kind === "partner") {
      headers["X-Api-Key"] = options.auth.apiKey;
      headers["X-Api-Secret"] = options.auth.apiSecret;
    } else if (options.auth.kind === "bearer") {
      headers.Authorization = `Bearer ${options.auth.token}`;
    }
    const init: RequestInit = {
      method: options.method ?? "GET",
      headers,
      signal: AbortSignal.timeout(this.#timeoutMs),
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    const response = await this.#fetch(url, init);
    const text = await response.text();
    const body = parseBody(text);
    const requestId = response.headers.get("x-request-id") ?? undefined;
    if (!response.ok) throw new QashApiError(response.status, body, requestId);
    return { status: response.status, body: body as T, requestId };
  }
}

function parseBody(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
