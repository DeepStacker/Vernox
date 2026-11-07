/**
 * Integration keys entered in the admin (Settings > Integrations, super admin only) instead of the server environment,
 * so the owner can switch Razorpay, Resend, MSG91, Shiprocket and WhatsApp on from the application at any time.
 *
 * Storage: `integration_secrets/current` (firestore.rules: no client access). Every value is encrypted with
 * AES-256-GCM before it is written; the key comes from SECRETS_ENCRYPTION_KEY (32 bytes, base64 or hex; the VM
 * installer generates it) or, when that is unset, is derived (HKDF) from the Firebase service account's private
 * key, so a plain Vercel deployment needs no extra variable. Rotating that service account then means re-entering
 * the keys; setting SECRETS_ENCRYPTION_KEY avoids that. Values never leave the server: the admin sees only whether
 * a key is set and its last four characters.
 *
 * Precedence: a variable present in the real server environment always wins (operators can pin a value); stored
 * values fill only the names the environment leaves empty. applyStoredIntegrations() copies them into process.env,
 * so the existing readers (config.ts, notification channels, shipping, WhatsApp, launch status) need no change. It
 * caches for CACHE_MS; a save through the admin refreshes this instance at once and others within CACHE_MS.
 */
import crypto from 'crypto';
import { ApiError } from './errors';
import type { DocStore } from './store';

export const INTEGRATION_SECRETS_PATH = 'integration_secrets/current';
const CACHE_MS = 30_000;

export type IntegrationGroup = 'payments' | 'email' | 'sms' | 'shipping' | 'whatsapp';

export interface IntegrationField {
  name: string;
  group: IntegrationGroup;
  label: string;
  /** Secret values are never shown back, only their last four characters. */
  secret: boolean;
  hint?: string;
  validate?: (value: string) => string | null;
}

const json = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? null : 'Enter a JSON object, for example {"shipped":"1234"}.';
  } catch {
    return 'Enter valid JSON, for example {"shipped":"1234"}.';
  }
};

/** The only names that can be stored. Database credentials and the domain stay in the environment (bootstrap). */
export const INTEGRATION_FIELDS: readonly IntegrationField[] = [
  { name: 'RAZORPAY_KEY_ID', group: 'payments', label: 'Razorpay key id', secret: false, hint: 'rzp_live_… (or rzp_test_… to try it out). Razorpay Dashboard > Account & Settings > API keys.',
    validate: v => (/^rzp_(live|test)_[A-Za-z0-9]{6,40}$/.test(v) ? null : 'A Razorpay key id starts with rzp_live_ or rzp_test_.') },
  { name: 'RAZORPAY_KEY_SECRET', group: 'payments', label: 'Razorpay key secret', secret: true, hint: 'Shown once when the key is generated.' },
  { name: 'RAZORPAY_WEBHOOK_SECRET', group: 'payments', label: 'Razorpay webhook secret', secret: true, hint: 'The secret you typed when adding the webhook https://<your domain>/api/razorpay-webhook.' },
  { name: 'RESEND_API_KEY', group: 'email', label: 'Resend API key', secret: true, hint: 're_… from resend.com > API Keys, after verifying your domain.',
    validate: v => (v.startsWith('re_') ? null : 'A Resend API key starts with re_.') },
  { name: 'NOTIFY_FROM_EMAIL', group: 'email', label: 'Send emails from', secret: false, hint: 'For example: Vernox <orders@yourdomain.in> (an address on the verified domain).',
    validate: v => (/^(.+<)?[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>?$/.test(v) ? null : 'Enter an email address, optionally as Name <address>.') },
  { name: 'MSG91_AUTH_KEY', group: 'sms', label: 'MSG91 auth key', secret: true },
  { name: 'MSG91_TEMPLATES', group: 'sms', label: 'MSG91 SMS templates (JSON)', secret: false, hint: 'Event to DLT-approved Flow id, e.g. {"order_confirmed":"…","shipped":"…"}.', validate: json },
  { name: 'MSG91_OTP_TEMPLATE_ID', group: 'sms', label: 'MSG91 OTP template id', secret: false, hint: 'DLT-approved template containing ##OTP##; turns on the COD confirmation code.' },
  { name: 'SHIPROCKET_EMAIL', group: 'shipping', label: 'Shiprocket API user email', secret: false, hint: 'Shiprocket > Settings > API > create an API user (not your login).' },
  { name: 'SHIPROCKET_PASSWORD', group: 'shipping', label: 'Shiprocket API user password', secret: true },
  { name: 'SHIPROCKET_PICKUP_LOCATION', group: 'shipping', label: 'Shiprocket pickup location name', secret: false, hint: 'Exactly as named in Shiprocket > Settings > Pickup addresses.' },
  { name: 'SHIPROCKET_PICKUP_PINCODE', group: 'shipping', label: 'Pickup PIN code', secret: false, validate: v => (/^[1-9]\d{5}$/.test(v) ? null : 'Enter a 6-digit PIN code.') },
  { name: 'SHIPROCKET_WEBHOOK_TOKEN', group: 'shipping', label: 'Shiprocket tracking webhook token', secret: true, hint: 'The token you set for https://<your domain>/api/courier-webhook.' },
  { name: 'WHATSAPP_ACCESS_TOKEN', group: 'whatsapp', label: 'WhatsApp access token', secret: true, hint: 'A permanent system-user token from Meta Business settings.' },
  { name: 'WHATSAPP_PHONE_NUMBER_ID', group: 'whatsapp', label: 'WhatsApp phone number id', secret: false, validate: v => (/^\d{6,30}$/.test(v) ? null : 'The phone number id is digits only.') },
  { name: 'WHATSAPP_TEMPLATES', group: 'whatsapp', label: 'WhatsApp templates (JSON)', secret: false, hint: 'Event to approved template, e.g. {"shipped":{"name":"order_shipped","language":"en"}}.', validate: json },
  { name: 'WHATSAPP_APP_SECRET', group: 'whatsapp', label: 'Meta app secret', secret: true, hint: 'Verifies incoming WhatsApp messages.' },
  { name: 'WHATSAPP_VERIFY_TOKEN', group: 'whatsapp', label: 'WhatsApp webhook verify token', secret: true, hint: 'Any long random text; type the same in Meta when adding https://<your domain>/api/whatsapp-webhook.' },
];
const FIELD_BY_NAME = new Map(INTEGRATION_FIELDS.map(f => [f.name, f]));

interface StoredValue { iv: string; tag: string; data: string; last4: string; updatedAt: number; updatedBy: string }
type StoredDoc = { values?: Record<string, StoredValue> };

/** Names the real environment provided when the process started; stored values never override these. */
const ENV_PROVIDED = new Set(INTEGRATION_FIELDS.map(f => f.name).filter(n => Boolean(process.env[n]?.trim())));

function encryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const explicit = env.SECRETS_ENCRYPTION_KEY?.trim();
  if (explicit) {
    const key = /^[0-9a-f]{64}$/i.test(explicit) ? Buffer.from(explicit, 'hex') : Buffer.from(explicit, 'base64');
    if (key.length !== 32) throw new ApiError(500, 'CONFIG_ERROR', 'The server cannot store keys right now.', 'SECRETS_ENCRYPTION_KEY must be 32 bytes (64 hex or 44 base64 chars)');
    return key;
  }
  const serviceAccount = env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  let material: string | null = null;
  if (serviceAccount) {
    try {
      material = (JSON.parse(Buffer.from(serviceAccount, 'base64').toString('utf8')) as { private_key?: string }).private_key ?? null;
    } catch {
      material = null;
    }
  }
  if (!material && (env.FIRESTORE_EMULATOR_HOST || env.NODE_ENV === 'test')) material = 'vernox-local-development-only';
  if (!material) {
    throw new ApiError(500, 'CONFIG_ERROR', 'The server cannot store keys right now.', 'set SECRETS_ENCRYPTION_KEY (or FIREBASE_SERVICE_ACCOUNT_BASE64) to store integration keys');
  }
  return Buffer.from(crypto.hkdfSync('sha256', material, 'vernox-integration-secrets', 'aes-256-gcm', 32));
}

export function encryptValue(value: string, key: Buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

export function decryptValue(stored: Pick<StoredValue, 'iv' | 'tag' | 'data'>, key: Buffer): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(stored.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(stored.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(stored.data, 'base64')), decipher.final()]).toString('utf8');
}

let cache: { at: number; applied: Set<string> } | null = null;
let loading: Promise<void> | null = null;

async function load(store: DocStore, now: number) {
  const doc = (await store.get(INTEGRATION_SECRETS_PATH)) as StoredDoc | null;
  const applied = new Set<string>();
  const values = doc?.values ?? {};
  let key: Buffer | null = null;
  for (const [name, stored] of Object.entries(values)) {
    if (!FIELD_BY_NAME.has(name) || ENV_PROVIDED.has(name)) continue;
    try {
      key ??= encryptionKey();
      process.env[name] = decryptValue(stored, key);
      applied.add(name);
    } catch (err) {
      // A value that cannot be decrypted (encryption key changed) is treated as unset; the admin shows it to re-enter.
      console.error(`[integrations] could not read stored ${name}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }
  // Names removed in the admin since the last load stop applying.
  for (const name of cache?.applied ?? []) if (!applied.has(name)) delete process.env[name];
  cache = { at: now, applied };
}

/** Copies stored integration keys into process.env (cached). Call before any code that reads them. */
export async function applyStoredIntegrations(store: DocStore, now = Date.now()): Promise<void> {
  if (cache && now - cache.at < CACHE_MS) return;
  loading ??= load(store, now).finally(() => { loading = null; });
  return loading;
}

/** Test hook. */
export function resetIntegrationCache() {
  for (const name of cache?.applied ?? []) delete process.env[name];
  cache = null;
}

export type IntegrationSource = 'environment' | 'app' | null;

export interface IntegrationStatus {
  name: string;
  group: IntegrationGroup;
  label: string;
  secret: boolean;
  hint?: string;
  source: IntegrationSource;
  /** Non-secret values in full; secrets as "••••" + last four. */
  preview: string | null;
  updatedAt: number | null;
  /** Stored but unreadable (encryption key changed): re-enter it. */
  unreadable?: boolean;
}

export async function listIntegrations(store: DocStore): Promise<IntegrationStatus[]> {
  const values = ((await store.get(INTEGRATION_SECRETS_PATH)) as StoredDoc | null)?.values ?? {};
  let key: Buffer | null = null;
  return INTEGRATION_FIELDS.map(f => {
    const base = { name: f.name, group: f.group, label: f.label, secret: f.secret, ...(f.hint ? { hint: f.hint } : {}) };
    if (ENV_PROVIDED.has(f.name)) {
      const v = process.env[f.name] ?? '';
      return { ...base, source: 'environment' as const, preview: f.secret ? `••••${v.slice(-4)}` : v, updatedAt: null };
    }
    const stored = values[f.name];
    if (!stored) return { ...base, source: null, preview: null, updatedAt: null };
    let unreadable = false;
    let plain = '';
    try {
      key ??= encryptionKey();
      plain = decryptValue(stored, key);
    } catch {
      unreadable = true;
    }
    return {
      ...base,
      source: 'app' as const,
      preview: unreadable ? null : f.secret ? `••••${stored.last4}` : plain,
      updatedAt: stored.updatedAt,
      ...(unreadable ? { unreadable } : {}),
    };
  });
}

/** Saves (string) or removes (null) values. Unknown names, environment-pinned names and invalid formats are refused. */
export async function saveIntegrations(store: DocStore, changes: Record<string, string | null>, by: string, now = Date.now()): Promise<string[]> {
  const entries = Object.entries(changes);
  if (entries.length === 0) throw new ApiError(400, 'VALIDATION_ERROR', 'Nothing to save.');
  const key = encryptionKey();
  const updates: Record<string, StoredValue | null> = {};
  for (const [name, raw] of entries) {
    const field = FIELD_BY_NAME.get(name);
    if (!field) throw new ApiError(400, 'VALIDATION_ERROR', `${name} cannot be set here.`);
    if (ENV_PROVIDED.has(name)) throw new ApiError(409, 'CONFLICT', `${field.label} is set in the server environment, which takes precedence. Change it there.`);
    if (raw === null) { updates[name] = null; continue; }
    const value = raw.trim();
    if (!value || value.length > 4000) throw new ApiError(400, 'VALIDATION_ERROR', `${field.label}: enter a value (up to 4000 characters).`);
    const problem = field.validate?.(value);
    if (problem) throw new ApiError(400, 'VALIDATION_ERROR', `${field.label}: ${problem}`);
    updates[name] = { ...encryptValue(value, key), last4: value.slice(-4), updatedAt: now, updatedBy: by };
  }
  await store.runTransaction(async tx => {
    const current = ((await tx.get(INTEGRATION_SECRETS_PATH)) as StoredDoc | null)?.values ?? {};
    const next: Record<string, StoredValue> = { ...current };
    for (const [name, v] of Object.entries(updates)) {
      if (v) next[name] = v;
      else delete next[name];
    }
    tx.set(INTEGRATION_SECRETS_PATH, { values: next, updatedAt: now, updatedBy: by });
  });
  cache = null; // apply on this instance at once
  await applyStoredIntegrations(store, now);
  return entries.map(([name]) => name);
}
