import { type Server } from "node:http";
export interface AuthorizationRequest {
    type: "transaction.authorization.requested";
    version: number;
    deliveryId: string;
    authorizationRef: string;
    transactionUuid: string;
    intentHash: string;
    nonce: string;
    sourceAccountId: string;
    destinationAccountId: string;
    asset: string;
    amountMinor: string;
    amount: string;
    initiatorUserId: string | null;
    approverUserId: string;
    expiresAt: string;
}
export interface Decision {
    decision: "APPROVED" | "REJECTED";
    reason?: string;
}
export type Decide = (request: AuthorizationRequest) => Decision | Promise<Decision>;
export interface HookResult {
    status: number;
    body: string;
    headers: Record<string, string>;
}
export declare function handleHook(secret: string, decide: Decide, rawBody: string, headers: {
    signature: string | undefined;
    timestamp: string | undefined;
}, nowMs?: number): Promise<HookResult>;
export declare function amountCapPolicy(maxAmount: number, allowedAssets: ReadonlySet<string>): Decide;
export declare function createApprovalHookServer(secret: string, decide: Decide): Server;
