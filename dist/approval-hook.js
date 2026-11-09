import { createServer } from "node:http";
import { sign, verify } from "./signature.js";
const MAX_BODY_BYTES = 64 * 1024;
function json(status, payload, secret, nowMs = Date.now()) {
    const body = JSON.stringify(payload);
    const headers = { "Content-Type": "application/json" };
    if (secret) {
        const timestamp = String(Math.floor(nowMs / 1000));
        headers["X-Qash-Timestamp"] = timestamp;
        headers["X-Qash-Signature"] = sign(secret, timestamp, body);
    }
    return { status, body, headers };
}
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export async function handleHook(secret, decide, rawBody, headers, nowMs = Date.now()) {
    const check = verify(secret, headers.signature, headers.timestamp, rawBody, nowMs);
    if (check !== "VALID")
        return json(401, { error: check });
    let payload;
    try {
        payload = JSON.parse(rawBody);
    }
    catch {
        return json(400, { error: "INVALID_JSON" });
    }
    if (!isObject(payload))
        return json(400, { error: "INVALID_BODY" });
    if (payload.type === "endpoint.verification") {
        const request = payload;
        return json(200, { type: "endpoint.verification", challenge: request.challenge }, secret, nowMs);
    }
    if (payload.type === "transaction.authorization.requested") {
        const request = payload;
        const outcome = await decide(request);
        return json(200, {
            deliveryId: request.deliveryId,
            authorizationRef: request.authorizationRef,
            transactionUuid: request.transactionUuid,
            intentHash: request.intentHash,
            nonce: request.nonce,
            decision: outcome.decision,
            ...(outcome.reason ? { reason: outcome.reason.slice(0, 200) } : {}),
        }, secret, nowMs);
    }
    return json(400, { error: "UNSUPPORTED_TYPE" });
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error("Body too large"));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => {
            resolve(Buffer.concat(chunks).toString("utf8"));
        });
        req.on("error", reject);
    });
}
function header(req, name) {
    const value = req.headers[name];
    return Array.isArray(value) ? value[0] : value;
}
export function amountCapPolicy(maxAmount, allowedAssets) {
    return (request) => {
        if (!allowedAssets.has(request.asset))
            return { decision: "REJECTED", reason: "Asset not allowed by policy" };
        const amount = Number(request.amount);
        if (!Number.isFinite(amount) || amount > maxAmount)
            return { decision: "REJECTED", reason: "Amount above policy cap" };
        return { decision: "APPROVED" };
    };
}
export function createApprovalHookServer(secret, decide) {
    return createServer((req, res) => {
        void (async () => {
            let result;
            if (req.method !== "POST") {
                result = json(405, { error: "METHOD_NOT_ALLOWED" });
            }
            else {
                try {
                    const raw = await readBody(req);
                    result = await handleHook(secret, decide, raw, {
                        signature: header(req, "x-qash-signature"),
                        timestamp: header(req, "x-qash-timestamp"),
                    });
                }
                catch {
                    result = json(400, { error: "BAD_REQUEST" });
                }
            }
            res.writeHead(result.status, result.headers).end(result.body);
        })();
    });
}
//# sourceMappingURL=approval-hook.js.map