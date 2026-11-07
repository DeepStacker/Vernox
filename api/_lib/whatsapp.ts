/**
 * WhatsApp Business Cloud API (Meta): configuration, message sending and the per-phone opt-out.
 *
 * Switched on purely by environment (WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID); without them every
 * caller gets `null` from whatsappConfig() and degrades gracefully. Business-initiated messages (order updates)
 * must be approved templates; a free-form text may only be sent while the customer's 24-hour service window is
 * open, i.e. within WHATSAPP_SERVICE_WINDOW_MS of their last inbound message. Inbound handling is whatsappInbound.ts.
 *
 * The opt-out lives in `whatsapp_contacts/{phoneKey}` (server-only), keyed by the 10-digit mobile because most
 * customers are guests without an account.
 */
import crypto from 'crypto';
import type { FetchLike } from './notifications/channels';
import type { NotificationEvent } from './notifications/types';
import { safeEqualHex } from './razorpay';
import type { DocStore } from './store';

export const WHATSAPP_CONTACTS_COLLECTION = 'whatsapp_contacts';
export const WHATSAPP_SERVICE_WINDOW_MS = 24 * 3600_000;
export const DEFAULT_GRAPH_VERSION = 'v27.0';

export interface WhatsAppTemplateRef {
  name: string;
  language: string;
}

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  graphVersion: string;
  templates: Partial<Record<NotificationEvent, WhatsAppTemplateRef>>;
}

export class WhatsAppError extends Error {
  constructor(readonly status: number, readonly code: number | null, message: string) {
    super(message);
    this.name = 'WhatsAppError';
  }
}

/**
 * Errors that retrying cannot fix: number not on WhatsApp (131026), template missing or unapproved (132001),
 * parameter mismatch (132000, 132012), recipient not allowed (131030). The channel marks these 'skipped'.
 */
export const PERMANENT_WHATSAPP_ERRORS: ReadonlySet<number> = new Set([131026, 132001, 132000, 132012, 131030]);
/** 24-hour window closed (re-engagement required): only a template can be sent. */
export const WINDOW_CLOSED_ERROR = 131047;

function parseTemplates(raw: string | undefined): WhatsAppConfig['templates'] {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    const out: WhatsAppConfig['templates'] = {};
    for (const [event, value] of Object.entries(parsed)) {
      const v = value as { name?: unknown; language?: unknown };
      if (v && typeof v.name === 'string' && v.name.trim()) {
        out[event as NotificationEvent] = { name: v.name.trim(), language: typeof v.language === 'string' && v.language.trim() ? v.language.trim() : 'en' };
      }
    }
    return out;
  } catch {
    console.error('[whatsapp] WHATSAPP_TEMPLATES is not a JSON object of event -> { name, language }; order messages disabled');
    return {};
  }
}

/** The Cloud API settings, or null when the access token or phone number id is missing. */
export function whatsappConfig(env: NodeJS.ProcessEnv = process.env): WhatsAppConfig | null {
  const accessToken = env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!accessToken || !phoneNumberId) return null;
  const version = env.WHATSAPP_GRAPH_VERSION?.trim();
  return {
    accessToken,
    phoneNumberId,
    graphVersion: version && /^v\d+\.\d+$/.test(version) ? version : DEFAULT_GRAPH_VERSION,
    templates: parseTemplates(env.WHATSAPP_TEMPLATES),
  };
}

/** E.164 for an Indian 10-digit mobile; null for anything else. */
export function toE164India(phone10: string): string | null {
  return /^[6-9][0-9]{9}$/.test(phone10) ? `+91${phone10}` : null;
}

async function postMessage(config: WhatsAppConfig, fetchImpl: FetchLike, body: Record<string, unknown>): Promise<void> {
  const res = await fetchImpl(`https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...body }),
  });
  if (res.ok) return;
  const raw = (await res.text().catch(() => '')).slice(0, 600);
  let code: number | null = null;
  let message = raw;
  try {
    const err = (JSON.parse(raw) as { error?: { code?: unknown; message?: unknown } }).error;
    if (typeof err?.code === 'number') code = err.code;
    if (typeof err?.message === 'string') message = err.message;
  } catch {
    // Not JSON: keep the truncated body as the message.
  }
  throw new WhatsAppError(res.status, code, `HTTP ${res.status}${code ? ` (code ${code})` : ''}: ${message.slice(0, 300)}`);
}

/** Business-initiated template message; `bodyParams` fill {{1}}, {{2}}, ... in order. */
export function sendWhatsAppTemplate(
  config: WhatsAppConfig,
  fetchImpl: FetchLike,
  params: { to: string; template: WhatsAppTemplateRef; bodyParams: string[] },
): Promise<void> {
  return postMessage(config, fetchImpl, {
    to: params.to,
    type: 'template',
    template: {
      name: params.template.name,
      language: { code: params.template.language },
      components: [{ type: 'body', parameters: params.bodyParams.map(text => ({ type: 'text', text })) }],
    },
  });
}

/** Free-form text: only valid inside the customer's 24-hour service window. */
export function sendWhatsAppText(config: WhatsAppConfig, fetchImpl: FetchLike, params: { to: string; text: string }): Promise<void> {
  return postMessage(config, fetchImpl, { to: params.to, type: 'text', text: { preview_url: false, body: params.text } });
}

export async function isWhatsAppOptedOut(store: DocStore, phone10: string): Promise<boolean> {
  return (await store.get(`${WHATSAPP_CONTACTS_COLLECTION}/${phone10}`))?.whatsappOptOut === true;
}

/** Meta signs the raw body with the app secret: `X-Hub-Signature-256: sha256=<hex hmac>`. */
export function verifyMetaSignature(rawBody: Buffer, header: unknown, appSecret: string): boolean {
  if (typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return safeEqualHex(header.slice('sha256='.length), expected);
}
