export declare const SIGNATURE_TOLERANCE_SECONDS = 300;
export declare function sign(secret: string, timestamp: string, body: string): string;
export type SignatureCheck = "VALID" | "INVALID_SIGNATURE" | "STALE_TIMESTAMP";
export declare function verify(secret: string, signatureHeader: string | undefined, timestampHeader: string | undefined, body: string, nowMs?: number): SignatureCheck;
