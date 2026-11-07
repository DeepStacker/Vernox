/**
 * Cash-on-delivery order confirmation by SMS one-time code (reduces fake COD orders and RTO).
 *
 * Flow (api/engage.ts actions COD_OTP_STATUS / COD_OTP_SEND / COD_OTP_VERIFY, then api/checkout-intent.ts):
 *  1. SEND generates a 6-digit code on OUR side, stores only a salted hash in `cod_otps/{phoneKey}` and has
 *     MSG91 deliver it (OTP API v5 with an explicit `otp`; the template is DLT-registered, MSG91_OTP_TEMPLATE_ID).
 *     Verification is local, so the attempt limit, expiry and single use are ours, not the provider's.
 *  2. VERIFY checks the code (5-minute expiry, at most 5 wrong attempts per code) and swaps it for a
 *     single-use verification token (30 minutes), stored hashed on the same document.
 *  3. createCheckoutIntent consumes that token for the phone inside the order transaction (`consumeVerification`),
 *     so a failed checkout (e.g. out of stock) does not burn it and a successful one always does.
 * Resend cooldown is 30 s. Per-phone and per-IP send limits live in rateLimit.ts.
 *
 * OTP is active only when the provider is configured AND the owner has not switched `cod.otpRequired` off
 * (`codOtpEnabled`). Otherwise COD orders are created flagged COD_UNVERIFIED for confirmation by phone.
 */
import crypto from 'crypto';
import { z } from 'zod';
import { ApiError } from './errors';
import { COD_UNVERIFIED_FLAG } from '../../src/lib/orders/codConfirmation';
import { phoneKey } from './orders';
import type { DocStore, StoreTransaction } from './store';
import type { StoreConfig } from './storeConfig';

/** Order flag of a COD order nobody has confirmed with the customer yet (staff clear it with CONFIRM_COD_ORDER). */
export { COD_UNVERIFIED_FLAG };

export const COD_OTP_TTL_MS = 5 * 60_000;
export const COD_OTP_MAX_ATTEMPTS = 5;
export const COD_OTP_RESEND_COOLDOWN_MS = 30_000;
export const COD_VERIFICATION_TTL_MS = 30 * 60_000;

const path = (phone: string) => `cod_otps/${phone}`;

interface CodOtpDoc {
  codeHash: string | null;
  salt: string;
  expiresAt: number;
  attempts: number;
  sentAt: number;
  tokenHash: string | null;
  tokenExpiresAt: number;
  updatedAt: number;
  /** Firestore TTL policy field (see DATABASE.md). */
  purgeAt: Date;
}

const mobileField = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s-]{8,15}$/, 'must be a valid mobile number')
  .transform(phoneKey)
  .refine(p => /^[6-9][0-9]{9}$/.test(p), 'must be a 10-digit Indian mobile number');

export const codOtpSendSchema = z.object({ action: z.literal('COD_OTP_SEND'), phone: mobileField });
export const codOtpVerifySchema = z.object({
  action: z.literal('COD_OTP_VERIFY'),
  phone: mobileField,
  code: z.string().trim().regex(/^[0-9]{6}$/, 'must be the 6-digit code'),
});
export const codOtpStatusSchema = z.object({ action: z.literal('COD_OTP_STATUS') });

export const verificationTokenSchema = z.string().regex(/^[0-9a-f]{48}$/, 'must be a verification token');

export const codOtpConfigured = (env: NodeJS.ProcessEnv = process.env) =>
  Boolean(env.MSG91_AUTH_KEY?.trim() && env.MSG91_OTP_TEMPLATE_ID?.trim());

/** Provider configured and the owner has not turned the requirement off. */
export const codOtpEnabled = (config: Pick<StoreConfig, 'cod'>, env: NodeJS.ProcessEnv = process.env) =>
  codOtpConfigured(env) && config.cod.otpRequired;

export interface OtpSender {
  send(phone: string, code: string): Promise<void>;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

/**
 * MSG91 "Send OTP" v5: POST https://control.msg91.com/api/v5/otp?template_id=&mobile=91XXXXXXXXXX&otp=&otp_expiry=
 * with the account key in the `authkey` header. The template (with the ##OTP## variable) must be approved on DLT.
 */
export function createMsg91OtpSender(authKey: string, templateId: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): OtpSender {
  return {
    async send(phone, code) {
      const query = new URLSearchParams({
        template_id: templateId,
        mobile: `91${phone}`,
        otp: code,
        otp_expiry: String(Math.ceil(COD_OTP_TTL_MS / 60_000)),
      });
      const res = await fetchImpl(`https://control.msg91.com/api/v5/otp?${query}`, {
        method: 'POST',
        headers: { authkey: authKey, 'Content-Type': 'application/json', accept: 'application/json' },
        body: '{}',
      });
      const body = (await res.text().catch(() => '')).slice(0, 300);
      // MSG91 answers 200 with {"type":"error"} for rejected requests.
      if (!res.ok || /"type"\s*:\s*"error"/.test(body)) throw new Error(`MSG91 OTP failed (HTTP ${res.status}): ${body}`);
    },
  };
}

export function createOtpSender(env: NodeJS.ProcessEnv = process.env): OtpSender | null {
  const key = env.MSG91_AUTH_KEY?.trim();
  const template = env.MSG91_OTP_TEMPLATE_ID?.trim();
  return key && template ? createMsg91OtpSender(key, template) : null;
}

const sha = (salt: string, value: string) => crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex');
/** The token is 192 random bits, so an unsalted digest is enough. */
const tokenDigest = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const same = (a: string, b: string) => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

export async function sendCodOtp(store: DocStore, sender: OtpSender, phone: string, now = Date.now()): Promise<{ retryAfterSeconds: number }> {
  const code = String(crypto.randomInt(100_000, 1_000_000));
  const salt = crypto.randomBytes(8).toString('hex');
  await store.runTransaction(async tx => {
    const current = (await tx.get(path(phone))) as unknown as CodOtpDoc | null;
    if (current && now - current.sentAt < COD_OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((COD_OTP_RESEND_COOLDOWN_MS - (now - current.sentAt)) / 1000);
      throw new ApiError(429, 'RATE_LIMITED', `Please wait ${wait} seconds before asking for a new code.`);
    }
    const doc: CodOtpDoc = {
      codeHash: sha(salt, code),
      salt,
      expiresAt: now + COD_OTP_TTL_MS,
      attempts: 0,
      sentAt: now,
      // A fresh code does not revoke a verification the customer already earned.
      tokenHash: current?.tokenHash ?? null,
      tokenExpiresAt: current?.tokenExpiresAt ?? 0,
      updatedAt: now,
      purgeAt: new Date(now + COD_VERIFICATION_TTL_MS + COD_OTP_TTL_MS),
    };
    tx.set(path(phone), doc as unknown as Record<string, unknown>);
  });
  try {
    await sender.send(phone, code);
  } catch (err) {
    // Nothing was delivered: let the customer retry at once.
    await store.update(path(phone), { sentAt: 0, codeHash: null }).catch(() => undefined);
    console.error('[cod-otp] provider rejected the send', err instanceof Error ? err.message : err);
    throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'We could not send the code right now. Please try again, or pay online.', 'MSG91 OTP send failed');
  }
  return { retryAfterSeconds: COD_OTP_RESEND_COOLDOWN_MS / 1000 };
}

const invalid = (message: string) => new ApiError(400, 'COD_OTP_INVALID', message);

/** Checks a code; on success returns a single-use verification token for `consumeVerification`. */
export async function verifyCodOtp(store: DocStore, phone: string, code: string, now = Date.now()): Promise<string> {
  // A wrong code must still be counted, so failures are returned from the transaction (a throw would roll the count back).
  const outcome = await store.runTransaction(async tx => {
    const doc = (await tx.get(path(phone))) as unknown as CodOtpDoc | null;
    if (!doc?.codeHash) return { error: 'No code is active for this number. Please request a new one.' };
    if (now > doc.expiresAt) {
      tx.update(path(phone), { codeHash: null, updatedAt: now });
      return { error: 'This code has expired. Please request a new one.' };
    }
    if (!same(doc.codeHash, sha(doc.salt, code))) {
      const attempts = doc.attempts + 1;
      const locked = attempts >= COD_OTP_MAX_ATTEMPTS;
      tx.update(path(phone), { attempts, ...(locked ? { codeHash: null } : {}), updatedAt: now });
      const left = COD_OTP_MAX_ATTEMPTS - attempts;
      return { error: locked ? 'Too many wrong attempts. Please request a new code.' : `That code is not correct. ${left} attempt${left === 1 ? '' : 's'} left.` };
    }
    const token = crypto.randomBytes(24).toString('hex');
    tx.update(path(phone), { codeHash: null, tokenHash: tokenDigest(token), tokenExpiresAt: now + COD_VERIFICATION_TTL_MS, updatedAt: now });
    return { token };
  });
  if (outcome.token) return outcome.token;
  throw invalid(outcome.error ?? 'The code could not be checked. Please request a new one.');
}

/**
 * Inside the order transaction: the token must belong to this phone, be unexpired and unused. Call it in the read
 * phase and run the returned function in the write phase, which spends the token.
 */
export async function consumeVerification(tx: StoreTransaction, phone: string, token: string | undefined, now: number): Promise<() => void> {
  const needed = () => new ApiError(400, 'COD_OTP_REQUIRED', 'Please confirm your mobile number with the code we send you before placing a cash on delivery order.');
  if (!token) throw needed();
  const doc = (await tx.get(path(phone))) as unknown as CodOtpDoc | null;
  if (!doc?.tokenHash || now > doc.tokenExpiresAt || !same(doc.tokenHash, tokenDigest(token))) throw needed();
  return () => tx.update(path(phone), { tokenHash: null, tokenExpiresAt: 0, updatedAt: now });
}
