import type { Config } from "./config.ts";
export type Auth = {
    kind: "none";
} | {
    kind: "partner";
    apiKey: string;
    apiSecret: string;
} | {
    kind: "bearer";
    token: string;
};
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
export declare class QashApiError extends Error {
    name: string;
    readonly status: number;
    readonly code: string | undefined;
    readonly requestId: string | undefined;
    readonly body: unknown;
    constructor(status: number, body: unknown, requestId: string | undefined);
}
export declare function describeError(body: unknown): {
    code: string | undefined;
    message: string;
};
export declare class HttpClient {
    #private;
    constructor(config: Pick<Config, "baseUrl" | "timeoutMs">, fetchImpl?: typeof fetch);
    request<T>(path: string, options: RequestOptions): Promise<ApiResponse<T>>;
}
