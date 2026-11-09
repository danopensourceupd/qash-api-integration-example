export class QashApiError extends Error {
    name = "QashApiError";
    status;
    code;
    requestId;
    body;
    constructor(status, body, requestId) {
        const { code, message } = describeError(body);
        super(`HTTP ${status}${code ? ` ${code}` : ""}: ${message}`);
        this.status = status;
        this.code = code;
        this.requestId = requestId;
        this.body = body;
    }
}
function asString(value) {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}
export function describeError(body) {
    if (typeof body !== "object" || body === null) {
        return { code: undefined, message: typeof body === "string" && body ? body : "Unexpected response" };
    }
    const record = body;
    const code = asString(record.code) ?? asString(record.errorCode);
    const details = Array.isArray(record.message) ? record.message.filter((m) => typeof m === "string").join("; ") : undefined;
    const message = asString(details) ?? asString(record.message) ?? asString(record.error) ?? "Request failed";
    return { code, message };
}
export class HttpClient {
    #baseUrl;
    #timeoutMs;
    #fetch;
    constructor(config, fetchImpl = fetch) {
        this.#baseUrl = config.baseUrl;
        this.#timeoutMs = config.timeoutMs;
        this.#fetch = fetchImpl;
    }
    async request(path, options) {
        const url = new URL(path, this.#baseUrl);
        for (const [key, value] of Object.entries(options.query ?? {})) {
            if (value !== undefined)
                url.searchParams.set(key, String(value));
        }
        const headers = { Accept: "application/json", ...options.headers };
        if (options.auth.kind === "partner") {
            headers["X-Api-Key"] = options.auth.apiKey;
            headers["X-Api-Secret"] = options.auth.apiSecret;
        }
        else if (options.auth.kind === "bearer") {
            headers.Authorization = `Bearer ${options.auth.token}`;
        }
        const init = {
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
        if (!response.ok)
            throw new QashApiError(response.status, body, requestId);
        return { status: response.status, body: body, requestId };
    }
}
function parseBody(text) {
    if (!text)
        return undefined;
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
//# sourceMappingURL=http.js.map