const PRODUCTION_HOSTS = new Set(["app.qash.ai", "api.qash.ai"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
export class ConfigError extends Error {
    name = "ConfigError";
}
function flag(value) {
    return value?.trim().toLowerCase() === "true";
}
function optional(value) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}
export function loadConfig(env = process.env) {
    const rawBaseUrl = optional(env.QASH_BASE_URL) ?? "https://sandbox.qash.ai";
    let baseUrl;
    try {
        baseUrl = new URL(rawBaseUrl);
    }
    catch {
        throw new ConfigError(`QASH_BASE_URL is not a valid URL: ${rawBaseUrl}`);
    }
    if (baseUrl.protocol !== "https:" && !LOCAL_HOSTS.has(baseUrl.hostname)) {
        throw new ConfigError("QASH_BASE_URL must use https (plain http is only accepted for localhost)");
    }
    if (PRODUCTION_HOSTS.has(baseUrl.hostname)) {
        throw new ConfigError(`This example refuses to run against production (${baseUrl.hostname}). Use the sandbox.`);
    }
    const timeoutMs = Number(optional(env.QASH_TIMEOUT_MS) ?? "30000");
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
        throw new ConfigError("QASH_TIMEOUT_MS must be an integer between 1000 and 120000");
    }
    const enableWrites = flag(env.QASH_ENABLE_WRITES);
    return {
        baseUrl,
        apiKey: optional(env.QASH_API_KEY),
        apiSecret: optional(env.QASH_API_SECRET),
        enableWrites,
        enableMoneyMovement: enableWrites && flag(env.QASH_ENABLE_MONEY_MOVEMENT),
        timeoutMs,
        stateFile: optional(env.QASH_STATE_FILE) ?? ".state/session.json",
    };
}
export function requirePartnerCredentials(config) {
    if (!config.apiKey || !config.apiSecret) {
        throw new ConfigError("QASH_API_KEY and QASH_API_SECRET are required for partner calls");
    }
    return { apiKey: config.apiKey, apiSecret: config.apiSecret };
}
export function requireWrites(config, action) {
    if (!config.enableWrites) {
        throw new ConfigError(`"${action}" creates or changes resources. Set QASH_ENABLE_WRITES=true to allow it.`);
    }
}
export function requireMoneyMovement(config, action) {
    if (!config.enableMoneyMovement) {
        throw new ConfigError(`"${action}" moves funds. Set QASH_ENABLE_WRITES=true and QASH_ENABLE_MONEY_MOVEMENT=true to allow it.`);
    }
}
//# sourceMappingURL=config.js.map