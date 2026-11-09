import { type Config } from "./config.ts";
export declare function decimalAmount(value: string | undefined): number;
export declare function run(argv: string[], config?: Config): Promise<void>;
