import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const DEFAULT_WEBHOOK_MAX_SKEW_SECONDS = 300;

export function providerWebhookEnvKey(provider: string): string {
  const normalized = provider.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return `PAYMENT_WEBHOOK_HMAC_SECRET_${normalized}`;
}

export function resolveProviderWebhookSecret(
  provider: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = providerWebhookEnvKey(provider);
  const raw = env[key];
  if (!raw || raw.trim().length < 16) return null;
  return raw.trim();
}

export function computePayloadSha256(rawBody: Buffer | string): string {
  return createHash('sha256').update(rawBody).digest('hex');
}

function constantTimeHexEqual(aHex: string, bHex: string): boolean {
  if (aHex.length !== bHex.length || aHex.length === 0 || aHex.length % 2 !== 0) return false;
  const aBuf = Buffer.from(aHex, 'hex');
  const bBuf = Buffer.from(bHex, 'hex');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function parseTimestampMs(raw: string): number | null {
  const trimmed = raw.trim();
  if (/^\d{10,13}$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isSafeInteger(num)) return null;
    return trimmed.length === 10 ? num * 1000 : num;
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

export interface VerifyWebhookHmacInput {
  rawBody: Buffer;
  signatureHeader: string;
  timestampHeader?: string | null;
  secret: string;
  nowMs?: number;
  maxSkewSeconds?: number;
}

export type VerifyWebhookHmacResult =
  | { ok: true; payloadSha256: string }
  | { ok: false; code: 'WEBHOOK_SIGNATURE_INVALID' | 'WEBHOOK_TIMESTAMP_EXPIRED' };

/**
 * Verifies provider webhook authenticity via HMAC-SHA256 using constant-time comparison
 * over the exact raw request bytes, with optional timestamp anti-replay window.
 */
export function verifyWebhookHmac(input: VerifyWebhookHmacInput): VerifyWebhookHmacResult {
  const maxSkewMs = (input.maxSkewSeconds ?? DEFAULT_WEBHOOK_MAX_SKEW_SECONDS) * 1000;
  const nowMs = input.nowMs ?? Date.now();

  const rawSig = input.signatureHeader.trim();
  const sigMatch = /^(?:sha256=)?([0-9a-f]{64})$/i.exec(rawSig);
  if (!sigMatch) {
    return { ok: false, code: 'WEBHOOK_SIGNATURE_INVALID' };
  }
  const providedHex = sigMatch[1].toLowerCase();

  let signedPayload: Buffer;
  if (input.timestampHeader && input.timestampHeader.trim().length > 0) {
    const tsMs = parseTimestampMs(input.timestampHeader);
    if (tsMs === null || Math.abs(nowMs - tsMs) > maxSkewMs) {
      return { ok: false, code: 'WEBHOOK_TIMESTAMP_EXPIRED' };
    }
    signedPayload = Buffer.concat([
      Buffer.from(`${input.timestampHeader.trim()}.`, 'utf8'),
      input.rawBody,
    ]);
  } else {
    signedPayload = input.rawBody;
  }

  const expectedHex = createHmac('sha256', input.secret).update(signedPayload).digest('hex');
  if (!constantTimeHexEqual(expectedHex, providedHex)) {
    return { ok: false, code: 'WEBHOOK_SIGNATURE_INVALID' };
  }

  return { ok: true, payloadSha256: computePayloadSha256(input.rawBody) };
}

export type VerifyCronBearerResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; code: 'CRON_SECRET_UNCONFIGURED' | 'CRON_UNAUTHORIZED' };

export function verifyCronBearer(
  authHeader: string | undefined,
  expectedSecret: string | undefined,
): VerifyCronBearerResult {
  const secret = expectedSecret?.trim() ?? '';
  if (secret.length < 16) {
    return { ok: false, status: 503, code: 'CRON_SECRET_UNCONFIGURED' };
  }
  const match = /^Bearer ([A-Za-z0-9_.-]{1,8192})$/i.exec(authHeader ?? '');
  if (!match) {
    return { ok: false, status: 401, code: 'CRON_UNAUTHORIZED' };
  }
  const a = Buffer.from(match[1], 'utf8');
  const b = Buffer.from(secret, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, code: 'CRON_UNAUTHORIZED' };
  }
  return { ok: true };
}
