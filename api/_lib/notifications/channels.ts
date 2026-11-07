/**
 * Notification delivery channels.
 *
 *  - Email: Resend HTTP API (RESEND_API_KEY, NOTIFY_FROM_EMAIL). The outbox id is
 *    sent as Resend's Idempotency-Key, so a retry after an ambiguous failure does
 *    not send a second email.
 *  - SMS: MSG91 Flow API (MSG91_AUTH_KEY, MSG91_TEMPLATES = JSON map of
 *    event -> DLT-approved flow template id). Events without a template are skipped.
 *  - WhatsApp: Cloud API template messages (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATES =
 *    JSON map event -> { name, language }; see api/_lib/whatsapp.ts). Only events with an approved template are
 *    sent, to customers who have not opted out; template variables are the SMS variables ({{1}} first name,
 *    {{2}} order number, {{3}} event value). Permanent provider rejections are 'skipped', not retried.
 *  - A channel whose configuration is missing is replaced by a logger that
 *    reports 'skipped', so unconfigured environments never fail or block.
 *
 * Channels throw on failures worth retrying (network, 429, 5xx) and on
 * permanent provider rejections alike; the outbox applies backoff and gives up
 * after MAX_ATTEMPTS (deliver.ts), recording the provider's message.
 */
import {
  isWhatsAppOptedOut, PERMANENT_WHATSAPP_ERRORS, sendWhatsAppTemplate, toE164India, whatsappConfig, WhatsAppError, type WhatsAppConfig,
} from '../whatsapp';
import type { DocStore } from '../store';
import type { ChannelName, NotificationChannel, NotificationEvent, OutboxDoc, RenderedMessage } from './types';

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export class ChannelError extends Error {
  constructor(readonly channel: ChannelName, message: string) {
    super(message);
    this.name = 'ChannelError';
  }
}

async function providerFailure(channel: ChannelName, res: { status: number; text(): Promise<string> }): Promise<ChannelError> {
  const body = (await res.text().catch(() => '')).slice(0, 300);
  return new ChannelError(channel, `HTTP ${res.status}: ${body}`);
}

export function createResendChannel(apiKey: string, from: string, fetchImpl: FetchLike): NotificationChannel {
  return {
    name: 'email',
    async send(message: RenderedMessage, outbox: OutboxDoc) {
      if (!outbox.payload.email) return 'skipped';
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': outbox.id,
        },
        body: JSON.stringify({ from, to: [outbox.payload.email], subject: message.subject, text: message.text, html: message.html }),
      });
      if (!res.ok) throw await providerFailure('email', res);
      return 'sent';
    },
  };
}

export function createMsg91Channel(
  authKey: string,
  templates: Partial<Record<NotificationEvent, string>>,
  fetchImpl: FetchLike,
): NotificationChannel {
  return {
    name: 'sms',
    async send(message: RenderedMessage, outbox: OutboxDoc) {
      const templateId = templates[outbox.event];
      if (!templateId || !outbox.payload.phone) return 'skipped';
      const recipient: Record<string, string> = { mobiles: `91${outbox.payload.phone}` };
      message.smsVars.forEach((value, idx) => {
        recipient[`var${idx + 1}`] = value.slice(0, 30); // DLT variables are limited to 30 characters
      });
      const res = await fetchImpl('https://control.msg91.com/api/v5/flow', {
        method: 'POST',
        headers: { authkey: authKey, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ template_id: templateId, short_url: '0', recipients: [recipient] }),
      });
      if (!res.ok) throw await providerFailure('sms', res);
      const body = await res.text().catch(() => '');
      // MSG91 answers 200 with {"type":"error"} for rejected requests.
      if (/"type"\s*:\s*"error"/.test(body)) throw new ChannelError('sms', `MSG91 rejected: ${body.slice(0, 300)}`);
      return 'sent';
    },
  };
}

export function createWhatsAppChannel(config: WhatsAppConfig, store: DocStore, fetchImpl: FetchLike): NotificationChannel {
  return {
    name: 'whatsapp',
    async send(message: RenderedMessage, outbox: OutboxDoc) {
      const template = config.templates[outbox.event];
      const to = toE164India(outbox.payload.phone);
      if (!template || !to) return 'skipped';
      if (await isWhatsAppOptedOut(store, outbox.payload.phone)) return 'skipped';
      try {
        await sendWhatsAppTemplate(config, fetchImpl, { to, template, bodyParams: message.smsVars });
      } catch (err) {
        if (err instanceof WhatsAppError && err.code !== null && PERMANENT_WHATSAPP_ERRORS.has(err.code)) {
          console.warn(`[notifications] whatsapp rejected ${outbox.event} for order ${outbox.orderId} permanently (code ${err.code}); skipped`);
          return 'skipped';
        }
        throw new ChannelError('whatsapp', err instanceof Error ? err.message : String(err));
      }
      return 'sent';
    },
  };
}

export function createLoggingChannel(name: ChannelName): NotificationChannel {
  return {
    name,
    configured: false,
    async send(message: RenderedMessage, outbox: OutboxDoc) {
      // No PII in logs: event and order only.
      console.info(`[notifications] ${name} not configured; skipped ${outbox.event} for order ${outbox.orderId}`);
      return 'skipped';
    },
  };
}

function parseTemplates(raw: string | undefined): Partial<Record<NotificationEvent, string>> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'string' && v.trim())) as Partial<
      Record<NotificationEvent, string>
    >;
  } catch {
    console.error('[notifications] MSG91_TEMPLATES is not a JSON object of event -> template id; SMS disabled');
    return {};
  }
}

/** `store` is needed by the WhatsApp channel (opt-out lookup); without it WhatsApp stays off. */
export function createChannels(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  store?: DocStore,
): NotificationChannel[] {
  const resendKey = env.RESEND_API_KEY?.trim();
  const from = env.NOTIFY_FROM_EMAIL?.trim();
  const msg91Key = env.MSG91_AUTH_KEY?.trim();
  const templates = parseTemplates(env.MSG91_TEMPLATES);
  const whatsapp = whatsappConfig(env);
  return [
    resendKey && from ? createResendChannel(resendKey, from, fetchImpl) : createLoggingChannel('email'),
    msg91Key && Object.keys(templates).length > 0 ? createMsg91Channel(msg91Key, templates, fetchImpl) : createLoggingChannel('sms'),
    whatsapp && store && Object.keys(whatsapp.templates).length > 0
      ? createWhatsAppChannel(whatsapp, store, fetchImpl)
      : createLoggingChannel('whatsapp'),
  ];
}
