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
    limits?: {
        version: number;
        assetLimits: Record<string, AssetLimit>;
    };
}
export interface KeyLimits {
    apiKeyId: string;
    status: string;
    isBot: boolean;
    mode: "legacy" | "limits";
    limits: {
        assetLimits: Record<string, AssetLimit>;
        version: number;
    } | null;
    usage: {
        asset: string;
        period: "day" | "month";
        periodKey: string;
        amount: string;
        operations: number;
    }[];
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
export declare function sendOwnerLoginCode(http: HttpClient, email: string): Promise<void>;
export declare function verifyOwnerLoginCode(http: HttpClient, email: string, code: string): Promise<TokenPair>;
export declare class BusinessApi {
    #private;
    constructor(http: HttpClient, accessToken: string);
    listKeys(): Promise<ApiKeySummary[]>;
    createKey(input: {
        keyName: string;
        isBot?: boolean;
        limits?: Limits;
    }): Promise<CreatedApiKey>;
    revokeKey(id: string): Promise<void>;
    getLimits(id: string): Promise<KeyLimits>;
    requestActionCode(id: string, action: KeyAction): Promise<void>;
    setLimits(id: string, input: {
        expectedVersion: number | null;
        limits: Limits;
        otpCode: string;
    }): Promise<{
        version: number;
    }>;
    audit(id: string, limit?: number): Promise<unknown[]>;
    getCallback(id: string): Promise<unknown>;
    setCallback(id: string, input: {
        expectedVersion: number | null;
        callback: CallbackConfig;
        otpCode: string;
    }): Promise<{
        callback: unknown;
        secret: string | null;
    }>;
    verifyCallback(id: string): Promise<unknown>;
    disableCallback(id: string): Promise<unknown>;
}
