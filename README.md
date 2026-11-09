# qash-api-integration-example

An unofficial example of a Node.js + TypeScript backend that integrates with the [Qash](https://docs.qash.ai/) partner API on the **sandbox** environment.

> [!IMPORTANT]
> This project is **not official** and is **not maintained, endorsed or supported by Qash**. It is a community example. Qash's documentation at <https://docs.qash.ai/> is the source of truth. If this repository and the docs disagree, follow the docs and open an issue here.

It shows how to:

- onboard an end user with a partner API key (registration, profile, KYC hand-off) for Colombia, Venezuela and the United States;
- log the user in with an emailed one-time code and call their accounts, balances and transactions;
- manage API keys as the business owner: create, list, per-asset limits, bot keys and revocation;
- run an approval-hook endpoint that verifies Qash's signature and signs its reply.

Nothing here needs a Qash SDK. It uses Node's built-in `fetch`, has **no runtime dependencies**, and refuses to run against production.

## Contents

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [How authentication works](#how-authentication-works)
- [Flow 1: onboard a user with the API key](#flow-1-onboard-a-user-with-the-api-key)
- [Flow 2: act as the logged-in user](#flow-2-act-as-the-logged-in-user)
- [Flow 3: manage API keys as the business owner](#flow-3-manage-api-keys-as-the-business-owner)
- [Approval hook](#approval-hook)
- [Errors](#errors)
- [Testing](#testing)
- [Known API behaviour worth knowing](#known-api-behaviour-worth-knowing)
- [Security](#security)
- [License](#license)

## Requirements

- Node.js **22.18 or newer** (TypeScript runs natively, no build step needed to try it).
- A Qash **sandbox** business account with the owner role, and a partner API key pair. See [Partner integration](https://docs.qash.ai/guides/partner-integration) and [API key controls](https://docs.qash.ai/guides/api-key-controls).
- Mailboxes you control for the business owner and for each test user. Qash sends real one-time codes by email; the sandbox has no fixed test code.

## Quick start

```bash
git clone https://github.com/<owner>/qash-api-integration-example.git
cd qash-api-integration-example
npm ci
cp .env.example .env
```

Fill in `QASH_API_KEY` and `QASH_API_SECRET` in `.env`, then:

```bash
npm run cli -- subdivisions --country CO
```

You should get the 33 Colombian departments. Run `npm run cli -- help` to list every command.

## Configuration

All settings come from environment variables, loaded from `.env` when present. See [`.env.example`](.env.example).

| Variable | Default | Purpose |
| --- | --- | --- |
| `QASH_BASE_URL` | `https://sandbox.qash.ai` | API host. `app.qash.ai` and plain `http` are refused. |
| `QASH_API_KEY`, `QASH_API_SECRET` | – | Partner key pair, sent as `X-Api-Key` / `X-Api-Secret`. |
| `QASH_ENABLE_WRITES` | `false` | Must be `true` for anything that creates or changes resources. |
| `QASH_ENABLE_MONEY_MOVEMENT` | `false` | Must also be `true` for transfers and approvals. |
| `QASH_TIMEOUT_MS` | `30000` | Per-request timeout. |
| `QASH_STATE_FILE` | `.state/session.json` | Where login tokens are kept (git-ignored, file mode 600). |

## How authentication works

Qash uses three credentials. Keep each one on your server.

| Credential | How you get it | Used for |
| --- | --- | --- |
| Partner key: `X-Api-Key` + `X-Api-Secret` | Dashboard, or `keys:create` | Registering users, profile, KYC start, the subdivision catalog, starting the user login |
| User token: `Authorization: Bearer` | `POST /api/v1/partner/auth/send` then `/verify` with the partner key | Everything the user does after login |
| Business owner token: `Authorization: Bearer` | `POST /api/v1/auth/otp/send` then `/verify`, **without** a partner key | Managing API keys, limits and the approval hook |

A user token issued through a key is tied to that key. The user's permissions come from their Qash role; the key only narrows what the session can do (limits, bot rules). Details: [API key controls](https://docs.qash.ai/guides/api-key-controls).

## Flow 1: onboard a user with the API key

These calls run before the user can log in. They need the partner key and the user's id. Writes require `QASH_ENABLE_WRITES=true`.

```bash
npm run cli -- users:register --email ana+test@your-domain.com --country CO --phone +573000000000
npm run cli -- profile:create <userId> --file examples/profile-co.json
npm run cli -- profile:check <userId>
npm run cli -- kyc:start <userId> --file examples/kyc-co.json
```

| Step | Endpoint | Notes |
| --- | --- | --- |
| Register | `POST /api/v1/partner/users` | Returns `data.user.id` with status `pending`. A duplicate email or phone returns `400`. |
| Profile | `POST /api/v1/user/profile` | `userId` in the body. Allowed only while the user is not yet verified. |
| Check | `GET /api/v1/user/profile/check-completion?userId=` | `isComplete` and `missingFields`. |
| Departments (CO) | `GET /api/v1/user/kyc/subdivisions?country=CO` | Only `CO` has a catalog; other countries return `404`. |
| Start KYC | `POST /api/v1/user/kyc/start` | Returns `verificationUrl`. Send the user there; **the user completes the identity check themselves.** |
| Track | `GET /api/v1/partner/users/{userId}` | Poll until `status` is `active`. |

Country notes, from the examples in [`examples/`](examples):

- **Colombia:** `stateProvince` must be a department from the catalog, by name (`"Antioquia"`, `"Bogotá D.C."`) or code (`"CO-ANT"`). A city such as `"Medellín"` returns `422 INVALID_STATE_PROVINCE`. Send the **name** in both the profile and KYC calls.
- **Venezuela:** create the profile with `nationality: "VE"`, `governmentIdType: "national_id"` and `governmentIdCountry: "VE"` **before** starting KYC; you cannot change it afterwards.
- **United States:** there is no subdivision catalog; `stateProvince` is passed through as sent.
- `kyc/start` takes `birthDate` (camelCase) and requires `email`, `phone` and `gender` (`male` or `female`).
- Occupations are SOC codes (`15-1252`) or one of `SELFEMP`, `OTHERXX`, `UNEMPLO`, `STUDENT`, `RETIRED`. The logged-in user can list them with `user:occupations`.

KYC is decided by the identity provider, not by your integration. In the sandbox you still have to complete the hosted flow; there is no way, and no need, to approve a user from the API.

## Flow 2: act as the logged-in user

Once the user is `active`, start the login with the partner key. The code goes to the user's email:

```bash
npm run cli -- user:login --email ana+test@your-domain.com
```

The tokens are saved to the state file and used by every `user:*` command:

| Command | Endpoint |
| --- | --- |
| `user:kyc-status` | `GET /api/v1/user/kyc/status` |
| `user:occupations` | `GET /api/v1/user/kyc/occupations` |
| `user:accounts` | `GET /api/v1/user/accounts` |
| `user:balance` | `GET /api/v1/user/balance` |
| `user:transactions [--account <id>]` | `GET /api/v1/transactions` |
| `user:transaction <uuid>` | `GET /api/v1/transactions?id=<uuid>` |
| `user:authorizations` | `GET /api/v1/authorizations/pending` |
| `user:refresh` | `POST /api/v1/auth/refresh` |

Accounts come back as `{ "items": [...] }`. Each account has `id`, `asset`, `type`, `number`, `description` and the ledger totals `credits`, `debits`, `pendingCredits`, `pendingDebits` and `locked`, all as decimal strings. `user:balance` returns the same list. `user:transaction <uuid>` returns the transaction object itself (`status`, `amount`, `debitAccountId`, `creditAccountId`, …) or `404` when it does not exist.

Moving money needs both safety switches:

```bash
QASH_ENABLE_WRITES=true QASH_ENABLE_MONEY_MOVEMENT=true \
  npm run cli -- user:transfer --from 101 --to 202 --amount 1.50 --asset USDC --description "test"
```

The client sends `amount` as a JSON **number** in whole units of the source asset, as the [transfer reference](https://docs.qash.ai/api-reference/financials/transfer) specifies (the CLI accepts up to six decimals; COP takes none). `POST /api/v1/transactions/transfer` answers `201` with `transactionId`, `message` and, when the transfer waits for the user's approval, an `authorizationRef` (`grt_…`). The response says `"status": "PENDING"` even then; the stored transaction is `WAITING_APPROVAL` until the user decides.

Approve it with `user:approve <grt_ref>`, which asks Qash to email the user a code and then submits it. A wrong code returns `401 INVALID_CODE`, deciding twice returns `409 ALREADY_DECIDED`, and `user:reject` cancels it. See [Transaction authorization](https://docs.qash.ai/guides/transaction-authorization).

When the key has limits, transfers above them are refused before they reach the ledger with `403` and a `PARTNER_KEY_LIMIT_PER_TRANSACTION`, `PARTNER_KEY_LIMIT_DAILY` or `PARTNER_KEY_LIMIT_MONTHLY` code. Other policy codes you will see: `PARTNER_KEY_ASSET_MISMATCH` (the `asset` you declare is not the source account's), `PARTNER_KEY_LIMIT_NOT_CONFIGURED` (no limit for that asset) and `PARTNER_KEY_INVALID_AMOUNT`. Usage is reserved when the transfer is accepted and is not given back if the transfer is later rejected.

## Flow 3: manage API keys as the business owner

```bash
npm run cli -- owner:login --email owner@your-domain.com
npm run cli -- keys:list
QASH_ENABLE_WRITES=true npm run cli -- keys:create --name backend-prod-like
QASH_ENABLE_WRITES=true npm run cli -- keys:create --name payouts-bot --bot
npm run cli -- keys:limits <keyId>
QASH_ENABLE_WRITES=true npm run cli -- keys:set-limits <keyId> --file examples/limits.json
QASH_ENABLE_WRITES=true npm run cli -- keys:revoke <keyId>
```

- The secret is shown **once**, on creation. Store it in a secrets manager.
- Limits are per asset: `perTransaction` is required, `daily` and `monthly` are optional, amounts are decimal strings, and periods reset in UTC. A key with no limit for an asset cannot move that asset. Changing limits asks Qash to email the owner a confirmation code first. See [`examples/limits.json`](examples/limits.json).
- A **bot** key (`--bot`, fixed at creation) can create transfers but can never approve them.
- There is no in-place secret rotation: create a new key, switch over, then revoke the old one. Revoking ends the key's sessions.

## Approval hook

Qash can ask your server to approve or reject transfers made through a key, within that key's `perTransaction` limit. Your endpoint must use HTTPS on port 443 or 8443 at a public address, and a Qash admin must enable it. See [Approval hook](https://docs.qash.ai/guides/approval-hook).

[`src/approval-hook.ts`](src/approval-hook.ts) is a working endpoint:

- verifies `X-Qash-Signature: v1=<hex HMAC-SHA256(secret, "v1:" + X-Qash-Timestamp + ":" + rawBody)>` with a 300-second window;
- answers the `endpoint.verification` challenge;
- echoes `deliveryId`, `authorizationRef`, `transactionUuid`, `intentHash` and `nonce` with a decision;
- signs its own response the same way.

```bash
QASH_HOOK_SECRET=<qcb_secret_...> QASH_HOOK_MAX_AMOUNT=5 QASH_HOOK_ASSETS=USDC npm run cli -- hook:serve
```

The sample policy approves only the listed assets up to `QASH_HOOK_MAX_AMOUNT`. Deliveries are at least once: make your decision idempotent on `X-Qash-Delivery-Id`.

Setting it up:

1. `callback:set <keyId> --file examples/callback.json` asks Qash to email the owner a code, then registers the URL. The first registration returns the signing secret (`qcb_secret_…`) **once**; store it as `QASH_HOOK_SECRET`.
2. Start the hook, then run `callback:verify <keyId>`. Qash sends a signed challenge and expects the signed echo; the hook becomes `active`.
3. A Qash admin enables it. Until then it receives no deliveries.

Changing the URL or the allowed accounts sends the hook back to verification, and it needs admin enablement again.

## Errors

Every non-2xx response becomes a `QashApiError` with `status`, `code` (when present), `requestId` (from `x-request-id`) and the raw `body`. Qash uses several error shapes, and the client reads all of them:

| Source | Shape |
| --- | --- |
| Partner key checks | `{ "success": false, "error": "Invalid partner credentials" }` |
| Profile, KYC | `{ "statusCode", "error", "code", "message", "requestId", "timestamp" }` |
| API key session rules | `{ "error", "code": "PARTNER_KEY_<REASON>", "message", "statusCode", "timestamp" }` |
| Token errors | `{ "message", "errorCode", "statusCode", "timestamp" }` |

Always log `requestId`; it is what Qash support needs.

## Testing

```bash
npm run check     # typecheck, lint, unit tests, build
npm run test:e2e  # end-to-end against QASH_BASE_URL
```

Unit tests use no network. The end-to-end suites run against `QASH_BASE_URL` and **skip, marked `NOT VALIDATED`, when their prerequisites are missing**; a skip is not a pass. `QASH_BASE_URL` may use plain `http` only for `localhost`.

| Suite | Needs |
| --- | --- |
| `01-public` | nothing |
| `02-partner` read-only | partner key |
| `02-partner` onboarding | partner key and `QASH_ENABLE_WRITES=true`; registers users and starts KYC for CO, VE and US |
| `03-user` | an active user logged in with `user:login` |
| `04-business` | `owner:login`; key creation also needs `QASH_ENABLE_WRITES=true` |
| `05-limits` | both sessions, `QASH_E2E_KEY_ID` set to the key the user logged in with, limits on that key, and **empty** user accounts. It only sends transfers that must be refused. |

## Known API behaviour worth knowing

Observed while building this example. Check the docs for changes.

- `GET /api/v1/user/kyc/status` and `GET`/`PATCH /api/v1/user/profile` accept only the user's token, not the partner key. Before login, track onboarding with `GET /api/v1/partner/users/{userId}`.
- `GET /api/v1/transactions/{uuid}` is not routed for UUIDs. Use `GET /api/v1/transactions?id=<uuid>`.
- The transfer response reports `status: "PENDING"` even when the transfer waits for approval. Check for `authorizationRef`.
- Send `amount` as a number. A decimal string passes request validation but is refused later with `Transfer amount must be positive`.
- There is no idempotency header for transfers. Send a unique `clientReference`; a reused one can be refused with `400 Duplicate clientReference`, which is not a replay of the first result. After a timeout, look the transfer up before retrying.
- POST endpoints that take no body (for example `callback/verify`) need an empty JSON object and `Content-Type: application/json`; without it the API answers `415`.
- Email and phone are unique across all of Qash, so registering a test user with an address already used anywhere returns `400`.
- The partner login refuses users that are not `active` and still consumes the code.

## Security

- Keep the API secret, user tokens and the hook secret on the server. Never ship them to a browser or mobile app.
- `.env` and `.state/` are git-ignored. The state file holds bearer tokens; treat it like a password.
- This example refuses production hosts and keeps every write behind explicit switches.
- Found a security problem in Qash itself? Report it to Qash, not in this repository's issues.

## License

[MIT](LICENSE)
