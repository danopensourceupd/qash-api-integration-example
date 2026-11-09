import type { HttpClient } from "./http.ts";
export interface PartnerUser {
    id: string;
    email: string;
    status: "pending" | "active" | "suspended" | "banned" | "kyc_required";
    countryCode?: string;
    phone?: string;
    createdAt: string;
}
export interface RegisterUserInput {
    email: string;
    countryCode: string;
    phone?: string;
    preferredLanguage?: string;
}
export interface Subdivision {
    code: string;
    name: string;
}
export interface KycStart {
    inquiryId: string;
    verificationUrl: string | null;
    isExisting: boolean;
    message: string;
}
export interface TokenPair {
    accessToken: string;
    refreshToken: string;
}
export declare class PartnerApi {
    #private;
    constructor(http: HttpClient, credentials: {
        apiKey: string;
        apiSecret: string;
    });
    registerUser(input: RegisterUserInput): Promise<PartnerUser>;
    listUsers(query?: {
        status?: string;
        limit?: number;
        offset?: number;
    }): Promise<PartnerUser[]>;
    getUser(userId: string): Promise<PartnerUser>;
    subdivisions(country: string): Promise<Subdivision[]>;
    createProfile(userId: string, profile: Record<string, unknown>): Promise<Record<string, unknown>>;
    checkProfileCompletion(userId: string): Promise<{
        isComplete: boolean;
        missingFields: string[];
    }>;
    startKyc(userId: string, identity: Record<string, unknown>): Promise<KycStart>;
    sendLoginCode(email: string): Promise<void>;
    verifyLoginCode(email: string, code: string): Promise<TokenPair>;
}
