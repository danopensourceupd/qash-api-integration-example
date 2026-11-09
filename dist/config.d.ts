export interface Config {
    baseUrl: URL;
    apiKey: string | undefined;
    apiSecret: string | undefined;
    enableWrites: boolean;
    enableMoneyMovement: boolean;
    timeoutMs: number;
    stateFile: string;
}
export declare class ConfigError extends Error {
    name: string;
}
export declare function loadConfig(env?: NodeJS.ProcessEnv): Config;
export declare function requirePartnerCredentials(config: Config): {
    apiKey: string;
    apiSecret: string;
};
export declare function requireWrites(config: Config, action: string): void;
export declare function requireMoneyMovement(config: Config, action: string): void;
