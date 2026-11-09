import type { HttpClient } from "./http.ts";
import type { TokenPair } from "./partner.ts";
export interface Account {
    id: number;
    number: string;
    asset: string;
    type: string;
    description: string;
    credits: string;
    debits: string;
    pendingCredits: string;
    pendingDebits: string;
    locked: string;
}
export interface TransferInput {
    fromAccountId: number;
    toAccountId: number;
    amount: number;
    asset: string;
    description: string;
    clientReference?: string;
}
export interface TransferResult {
    transactionId: string;
    status: string;
    message: string;
    authorizationRef?: string;
}
export interface Page<T> {
    items: T[];
}
export declare class UserApi {
    #private;
    constructor(http: HttpClient, accessToken: string);
    kycStatus(): Promise<Record<string, unknown>>;
    occupations(): Promise<{
        code: string;
        kind: string;
    }[]>;
    accounts(): Promise<Account[]>;
    balance(): Promise<Account[]>;
    transactions(query?: {
        accountId?: number;
        page?: number;
        limit?: number;
    }): Promise<Page<Record<string, unknown>>>;
    transaction(uuid: string): Promise<Record<string, unknown>>;
    transfer(input: TransferInput): Promise<TransferResult>;
    pendingAuthorizations(): Promise<unknown>;
    requestApprovalCode(ref: string): Promise<void>;
    approve(ref: string, otpCode: string): Promise<unknown>;
    reject(ref: string, reason?: string): Promise<unknown>;
}
export declare function refreshSession(http: HttpClient, refreshToken: string): Promise<TokenPair>;
