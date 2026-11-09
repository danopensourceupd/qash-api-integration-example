import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { amountCapPolicy, createApprovalHookServer } from "./approval-hook.js";
import { BusinessApi, sendOwnerLoginCode, verifyOwnerLoginCode } from "./business.js";
import { ConfigError, loadConfig, requireMoneyMovement, requirePartnerCredentials, requireWrites } from "./config.js";
import { HttpClient, QashApiError } from "./http.js";
import { PartnerApi } from "./partner.js";
import { readState, writeState } from "./state.js";
import { refreshSession, UserApi } from "./user.js";
const USAGE = `Usage: npm run cli -- <command> [args]

Partner (X-Api-Key + X-Api-Secret)
  subdivisions [--country CO]
  users:list [--status pending]
  users:get <userId>
  users:register --email <email> --country <CC> [--phone <phone>]   (writes)
  profile:create <userId> --file <profile.json>                      (writes)
  profile:check <userId>
  kyc:start <userId> --file <kyc.json>                                (writes)
  user:login --email <email> [--code <otp>]

End user (Bearer token from user:login)
  user:kyc-status | user:occupations | user:accounts | user:balance
  user:transactions [--account <id>] | user:transaction <uuid> | user:authorizations
  user:refresh
  user:transfer --from <id> --to <id> --amount <decimal> --asset <ASSET> --description <text>   (moves funds)
  user:approve <grt_ref> [--code <otp>]                               (moves funds)
  user:reject <grt_ref> [--reason <text>]                             (writes)

Business owner (Bearer token from owner:login)
  owner:login --email <email> [--code <otp>]
  keys:list | keys:limits <keyId> | keys:audit <keyId> | callback:get <keyId>
  keys:create --name <name> [--bot]                                   (writes)
  keys:revoke <keyId>                                                 (writes)
  keys:set-limits <keyId> --file <limits.json> [--code <otp>]         (writes)
  callback:set <keyId> --file <callback.json> [--code <otp>]          (writes)
  callback:verify <keyId> | callback:disable <keyId>                  (writes)

Approval hook
  hook:serve`;
async function prompt(question) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        return (await rl.question(question)).trim();
    }
    finally {
        rl.close();
    }
}
async function readJson(path) {
    if (!path)
        throw new ConfigError("--file is required");
    return JSON.parse(await readFile(path, "utf8"));
}
function required(value, name) {
    if (!value)
        throw new ConfigError(`${name} is required`);
    return value;
}
function positiveInt(value, name) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
        throw new ConfigError(`${name} must be a positive integer`);
    return parsed;
}
export function decimalAmount(value) {
    if (!value || !/^\d{1,12}(\.\d{1,6})?$/.test(value) || Number(value) <= 0) {
        throw new ConfigError("--amount must be a positive number with at most six decimals, for example 1.50");
    }
    return Number(value);
}
function print(value) {
    console.log(JSON.stringify(value, null, 2));
}
async function session(config, kind) {
    const state = await readState(config.stateFile);
    const current = state[kind];
    if (!current)
        throw new ConfigError(`No ${kind} session. Run ${kind === "user" ? "user:login" : "owner:login"} first.`);
    return current.accessToken;
}
async function code(flag, label) {
    return flag ?? (await prompt(`${label}: `));
}
async function execute(argv, config) {
    const { positionals, values } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
            country: { type: "string" },
            status: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            file: { type: "string" },
            code: { type: "string" },
            account: { type: "string" },
            from: { type: "string" },
            to: { type: "string" },
            amount: { type: "string" },
            asset: { type: "string" },
            description: { type: "string" },
            reason: { type: "string" },
            name: { type: "string" },
            bot: { type: "boolean" },
        },
    });
    const [command, arg] = positionals;
    const http = new HttpClient(config);
    const partner = () => new PartnerApi(http, requirePartnerCredentials(config));
    const user = async () => new UserApi(http, await session(config, "user"));
    const business = async () => new BusinessApi(http, await session(config, "business"));
    switch (command) {
        case "subdivisions":
            return partner().subdivisions(values.country ?? "CO");
        case "users:list":
            return partner().listUsers(values.status ? { status: values.status } : {});
        case "users:get":
            return partner().getUser(required(arg, "userId"));
        case "users:register": {
            requireWrites(config, command);
            const input = { email: required(values.email, "--email"), countryCode: required(values.country, "--country") };
            return partner().registerUser(values.phone ? { ...input, phone: values.phone } : input);
        }
        case "profile:create":
            requireWrites(config, command);
            return partner().createProfile(required(arg, "userId"), await readJson(values.file));
        case "profile:check":
            return partner().checkProfileCompletion(required(arg, "userId"));
        case "kyc:start":
            requireWrites(config, command);
            return partner().startKyc(required(arg, "userId"), await readJson(values.file));
        case "user:login": {
            const email = required(values.email, "--email");
            const api = partner();
            if (!values.code)
                await api.sendLoginCode(email);
            const tokens = await api.verifyLoginCode(email, await code(values.code, "Code sent by email"));
            await writeState(config.stateFile, { ...(await readState(config.stateFile)), user: { ...tokens, email } });
            return { loggedIn: email, stateFile: config.stateFile };
        }
        case "user:refresh": {
            const state = await readState(config.stateFile);
            if (!state.user)
                throw new ConfigError("No user session. Run user:login first.");
            const tokens = await refreshSession(http, state.user.refreshToken);
            await writeState(config.stateFile, { ...state, user: { ...tokens, email: state.user.email } });
            return { refreshed: state.user.email };
        }
        case "user:kyc-status":
            return (await user()).kycStatus();
        case "user:occupations":
            return (await user()).occupations();
        case "user:accounts":
            return (await user()).accounts();
        case "user:balance":
            return (await user()).balance();
        case "user:transactions":
            return (await user()).transactions(values.account ? { accountId: positiveInt(values.account, "--account") } : {});
        case "user:transaction":
            return (await user()).transaction(required(arg, "uuid"));
        case "user:authorizations":
            return (await user()).pendingAuthorizations();
        case "user:transfer":
            requireMoneyMovement(config, command);
            return (await user()).transfer({
                fromAccountId: positiveInt(values.from, "--from"),
                toAccountId: positiveInt(values.to, "--to"),
                amount: decimalAmount(values.amount),
                asset: required(values.asset, "--asset"),
                description: required(values.description, "--description"),
            });
        case "user:approve": {
            requireMoneyMovement(config, command);
            const ref = required(arg, "authorizationRef");
            const api = await user();
            if (!values.code)
                await api.requestApprovalCode(ref);
            return api.approve(ref, await code(values.code, "Approval code sent by email"));
        }
        case "user:reject":
            requireWrites(config, command);
            return (await user()).reject(required(arg, "authorizationRef"), values.reason);
        case "owner:login": {
            const email = required(values.email, "--email");
            if (!values.code)
                await sendOwnerLoginCode(http, email);
            const tokens = await verifyOwnerLoginCode(http, email, await code(values.code, "Code sent by email"));
            await writeState(config.stateFile, { ...(await readState(config.stateFile)), business: { ...tokens, email } });
            return { loggedIn: email, stateFile: config.stateFile };
        }
        case "keys:list":
            return (await business()).listKeys();
        case "keys:create": {
            requireWrites(config, command);
            const created = await (await business()).createKey({ keyName: required(values.name, "--name"), isBot: values.bot ?? false });
            console.error("Store the secret now. Qash shows it only once.");
            return created;
        }
        case "keys:revoke":
            requireWrites(config, command);
            await (await business()).revokeKey(required(arg, "keyId"));
            return { revoked: arg };
        case "keys:limits":
            return (await business()).getLimits(required(arg, "keyId"));
        case "keys:audit":
            return (await business()).audit(required(arg, "keyId"));
        case "keys:set-limits":
            requireWrites(config, command);
            return withActionCode(await business(), required(arg, "keyId"), "update_limits", values.code, async (api, id, otpCode) => {
                const current = await api.getLimits(id);
                return api.setLimits(id, { expectedVersion: current.limits?.version ?? null, limits: await readJson(values.file), otpCode });
            });
        case "callback:get":
            return (await business()).getCallback(required(arg, "keyId"));
        case "callback:set":
            requireWrites(config, command);
            return withActionCode(await business(), required(arg, "keyId"), "update_callback", values.code, async (api, id, otpCode) => {
                const current = (await api.getCallback(id));
                return api.setCallback(id, {
                    expectedVersion: current.callback?.version ?? null,
                    callback: await readJson(values.file),
                    otpCode,
                });
            });
        case "callback:verify":
            requireWrites(config, command);
            return (await business()).verifyCallback(required(arg, "keyId"));
        case "callback:disable":
            requireWrites(config, command);
            return (await business()).disableCallback(required(arg, "keyId"));
        case "hook:serve":
            serveHook();
            return undefined;
        default:
            console.log(USAGE);
            if (command && command !== "help")
                process.exitCode = 2;
            return undefined;
    }
}
export async function run(argv, config = loadConfig()) {
    const result = await execute(argv, config);
    if (result !== undefined)
        print(result);
}
async function withActionCode(api, keyId, action, flag, apply) {
    if (!flag)
        await api.requestActionCode(keyId, action);
    return apply(api, keyId, await code(flag, "Confirmation code sent to the owner email"));
}
function serveHook() {
    const secret = required(process.env.QASH_HOOK_SECRET, "QASH_HOOK_SECRET");
    const port = Number(process.env.QASH_HOOK_PORT ?? "8443");
    const maxAmount = Number(process.env.QASH_HOOK_MAX_AMOUNT ?? "0");
    const assets = new Set((process.env.QASH_HOOK_ASSETS ?? "").split(",").map((a) => a.trim().toUpperCase()).filter(Boolean));
    createApprovalHookServer(secret, amountCapPolicy(maxAmount, assets)).listen(port, () => {
        console.log(`Approval hook listening on :${port}. Put an HTTPS endpoint (443 or 8443) in front of it.`);
    });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    run(process.argv.slice(2)).catch((error) => {
        if (error instanceof QashApiError) {
            console.error(error.message);
            print({ status: error.status, code: error.code, requestId: error.requestId, body: error.body });
        }
        else if (error instanceof ConfigError) {
            console.error(error.message);
        }
        else {
            console.error(error);
        }
        process.exitCode = 1;
    });
}
//# sourceMappingURL=cli.js.map