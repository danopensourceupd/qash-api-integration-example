import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { sign, verify } from "./signature.ts";

const MAX_BODY_BYTES = 64 * 1024;

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

interface VerificationRequest {
  type: "endpoint.verification";
  version: number;
  callbackId: string;
  challenge: string;
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

function json(status: number, payload: unknown, secret?: string, nowMs = Date.now()): HookResult {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) {
    const timestamp = String(Math.floor(nowMs / 1000));
    headers["X-Qash-Timestamp"] = timestamp;
    headers["X-Qash-Signature"] = sign(secret, timestamp, body);
  }
  return { status, body, headers };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function handleHook(
  secret: string,
  decide: Decide,
  rawBody: string,
  headers: { signature: string | undefined; timestamp: string | undefined },
  nowMs: number = Date.now(),
): Promise<HookResult> {
  const check = verify(secret, headers.signature, headers.timestamp, rawBody, nowMs);
  if (check !== "VALID") return json(401, { error: check });
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "INVALID_JSON" });
  }
  if (!isObject(payload)) return json(400, { error: "INVALID_BODY" });
  if (payload.type === "endpoint.verification") {
    const request = payload as unknown as VerificationRequest;
    return json(200, { type: "endpoint.verification", challenge: request.challenge }, secret, nowMs);
  }
  if (payload.type === "transaction.authorization.requested") {
    const request = payload as unknown as AuthorizationRequest;
    const outcome = await decide(request);
    return json(
      200,
      {
        deliveryId: request.deliveryId,
        authorizationRef: request.authorizationRef,
        transactionUuid: request.transactionUuid,
        intentHash: request.intentHash,
        nonce: request.nonce,
        decision: outcome.decision,
        ...(outcome.reason ? { reason: outcome.reason.slice(0, 200) } : {}),
      },
      secret,
      nowMs,
    );
  }
  return json(400, { error: "UNSUPPORTED_TYPE" });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function amountCapPolicy(maxAmount: number, allowedAssets: ReadonlySet<string>): Decide {
  return (request) => {
    if (!allowedAssets.has(request.asset)) return { decision: "REJECTED", reason: "Asset not allowed by policy" };
    const amount = Number(request.amount);
    if (!Number.isFinite(amount) || amount > maxAmount) return { decision: "REJECTED", reason: "Amount above policy cap" };
    return { decision: "APPROVED" };
  };
}

export function createApprovalHookServer(secret: string, decide: Decide): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      let result: HookResult;
      if (req.method !== "POST") {
        result = json(405, { error: "METHOD_NOT_ALLOWED" });
      } else {
        try {
          const raw = await readBody(req);
          result = await handleHook(secret, decide, raw, {
            signature: header(req, "x-qash-signature"),
            timestamp: header(req, "x-qash-timestamp"),
          });
        } catch {
          result = json(400, { error: "BAD_REQUEST" });
        }
      }
      res.writeHead(result.status, result.headers).end(result.body);
    })();
  });
}
