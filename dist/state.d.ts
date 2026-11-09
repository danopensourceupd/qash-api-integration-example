export interface Session {
    accessToken: string;
    refreshToken: string;
    email: string;
}
export interface State {
    user?: Session;
    business?: Session;
}
export declare function readState(file: string): Promise<State>;
export declare function writeState(file: string, state: State): Promise<void>;
