import { createHmac, timingSafeEqual } from "node:crypto";
export const SIGNATURE_TOLERANCE_SECONDS = 300;
const SIGNATURE_PATTERN = /^v1=([0-9a-f]{64})$/;
const TIMESTAMP_PATTERN = /^\d{1,12}$/;
function digest(secret, timestamp, body) {
    return createHmac("sha256", secret).update(`v1:${timestamp}:${body}`).digest();
}
export function sign(secret, timestamp, body) {
    return `v1=${digest(secret, timestamp, body).toString("hex")}`;
}
export function verify(secret, signatureHeader, timestampHeader, body, nowMs = Date.now()) {
    const match = signatureHeader ? SIGNATURE_PATTERN.exec(signatureHeader.trim()) : null;
    const timestamp = timestampHeader?.trim() ?? "";
    const hex = match?.[1];
    if (!hex || !TIMESTAMP_PATTERN.test(timestamp))
        return "INVALID_SIGNATURE";
    const expected = digest(secret, timestamp, body);
    const received = Buffer.from(hex, "hex");
    if (received.length !== expected.length || !timingSafeEqual(received, expected))
        return "INVALID_SIGNATURE";
    const skew = Math.abs(Math.floor(nowMs / 1000) - Number(timestamp));
    return skew > SIGNATURE_TOLERANCE_SECONDS ? "STALE_TIMESTAMP" : "VALID";
}
//# sourceMappingURL=signature.js.map