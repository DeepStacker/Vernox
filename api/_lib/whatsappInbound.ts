/**
 * Inbound WhatsApp (Cloud API webhook `messages` field) and staff replies on WhatsApp.
 *
 * Each inbound message is processed once: `webhook_events/wa_<hash of message id>` is created in the same
 * transaction as its effect, so Meta's retries and duplicate deliveries change nothing. Effects:
 *  - "STOP" / "START" set / clear `whatsapp_contacts/{phoneKey}.whatsappOptOut` (no ticket);
 *  - a text or media message opens a `whatsapp` ticket, or is appended as `inbound` to that phone's most
 *    recent open / waiting ticket (a `waiting` ticket reopens). New tickets are linked to the phone's latest
 *    order and queue the `support_ticket` alert. Media is never downloaded; a note says to open WhatsApp.
 * A staff reply (sendTicketWhatsApp) is free-form text, which Meta only allows within 24 hours of the
 * customer's last inbound message.
 */
import crypto from 'crypto';
import { ApiError } from './errors';
import type { FetchLike } from './notifications/channels';
import { enqueueNotification, planNotification } from './notifications/outbox';
import { phoneKey } from './orders';
import type { DocStore } from './store';
import { MAX_TICKET_MESSAGES, supportInbox, ticketRef, type TicketDoc } from './tickets';
import {
  isWhatsAppOptedOut, sendWhatsAppText, toE164India, WhatsAppError, WHATSAPP_CONTACTS_COLLECTION, WHATSAPP_SERVICE_WINDOW_MS,
  WINDOW_CLOSED_ERROR, type WhatsAppConfig,
} from './whatsapp';

const MEDIA_TYPES = new Set(['image', 'document', 'video', 'audio', 'sticker']);
export const MEDIA_NOTE = '[photo/document received — open WhatsApp]';
const MAX_INBOUND_TEXT = 4000;
const EVENT_TTL_MS = 90 * 24 * 3600_000;

export interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{ id?: string; from?: string; type?: string; text?: { body?: string } }>;
      };
    }>;
  }>;
}

export type InboundOutcome = 'ticket_created' | 'ticket_appended' | 'opted_out' | 'opted_in' | 'duplicate' | 'ignored';

const isStop = (text: string) => /^(stop|unsubscribe)\.?$/i.test(text.trim());
const isStart = (text: string) => /^(start|unstop|subscribe)\.?$/i.test(text.trim());

async function findOpenTicket(store: DocStore, key: string): Promise<{ id: string; ticket: TicketDoc } | null> {
  const rows = await store.query('tickets', { where: [{ field: 'phoneKey', op: '==', value: key }], limit: 50 });
  const open = rows
    .map(r => ({ id: r.id, ticket: r.data as unknown as TicketDoc }))
    .filter(r => r.ticket.status !== 'resolved' && r.ticket.messages.length < MAX_TICKET_MESSAGES)
    .sort((a, b) => b.ticket.updatedAt - a.ticket.updatedAt);
  return open[0] ?? null;
}

async function latestOrder(store: DocStore, key: string): Promise<{ id: string; orderNumber: string } | null> {
  const rows = await store.query('orders', { where: [{ field: 'phoneKey', op: '==', value: key }], limit: 50 });
  const sorted = rows.sort((a, b) => Number(b.data.createdAt ?? 0) - Number(a.data.createdAt ?? 0));
  const top = sorted[0];
  return top && typeof top.data.orderNumber === 'string' ? { id: top.id, orderNumber: top.data.orderNumber } : null;
}

async function processMessage(
  store: DocStore,
  message: { id: string; from: string; type: string; text?: string },
  profileName: string,
  now: number,
): Promise<InboundOutcome> {
  const key = phoneKey(message.from);
  const eventPath = `webhook_events/wa_${crypto.createHash('sha256').update(message.id).digest('hex').slice(0, 40)}`;
  const record = (outcome: InboundOutcome) => ({ event: 'whatsapp.message', outcome, receivedAt: now, expiresAt: new Date(now + EVENT_TTL_MS) });

  if (message.type === 'text' && (isStop(message.text ?? '') || isStart(message.text ?? ''))) {
    const optOut = isStop(message.text ?? '');
    return store.runTransaction(async tx => {
      if (await tx.get(eventPath)) return 'duplicate' as const;
      tx.set(`${WHATSAPP_CONTACTS_COLLECTION}/${key}`, { phoneKey: key, whatsappOptOut: optOut, optOutChangedAt: now, updatedAt: now }, { merge: true });
      const outcome = optOut ? ('opted_out' as const) : ('opted_in' as const);
      tx.create(eventPath, record(outcome));
      return outcome;
    });
  }

  const body = message.type === 'text' ? (message.text ?? '').trim().slice(0, MAX_INBOUND_TEXT) : MEDIA_TYPES.has(message.type) ? MEDIA_NOTE : '';
  if (!body) {
    // Reactions, buttons, location and unsupported types: acknowledged, nothing to answer.
    await store.create(eventPath, record('ignored')).catch(() => undefined); // already recorded on a repeat delivery
    return 'ignored';
  }

  const existing = await findOpenTicket(store, key);
  const order = existing ? null : await latestOrder(store, key);
  const supportEmail = existing ? '' : await supportInbox(store);
  const newId = store.newId('tickets');

  return store.runTransaction(async tx => {
    if (await tx.get(eventPath)) return 'duplicate' as const;
    const current = existing ? ((await tx.get(`tickets/${existing.id}`)) as unknown as TicketDoc | null) : null;
    const entry = { at: now, by: key, direction: 'inbound' as const, text: body };

    if (current && existing) {
      tx.update(`tickets/${existing.id}`, {
        messages: [...current.messages, entry],
        status: current.status === 'waiting' ? 'open' : current.status,
        updatedAt: now,
      });
      tx.create(eventPath, record('ticket_appended'));
      return 'ticket_appended' as const;
    }

    const plan = await planNotification(tx, newId, 'support_ticket');
    const ref = ticketRef(newId);
    const name = profileName || `+${message.from}`;
    const ticket: TicketDoc = {
      ref,
      channel: 'whatsapp',
      topic: order ? 'Order help' : 'Something else',
      subject: order ? 'Order help' : 'Something else',
      orderNumber: order?.orderNumber ?? null,
      orderId: order?.id ?? null,
      customerName: name,
      customerEmail: '',
      customerPhone: key,
      phoneKey: key,
      status: 'open',
      assignedTo: null,
      messages: [entry],
      createdAt: now,
      updatedAt: now,
    };
    tx.create(`tickets/${newId}`, ticket as unknown as Record<string, unknown>);
    enqueueNotification(tx, plan, {
      orderId: newId,
      orderNumber: ref,
      customerName: 'Vernox support',
      email: supportEmail,
      phone: '',
      paymentMethod: 'prepaid',
      totalPaise: 0,
      note: `${name} wrote on WhatsApp${order ? ` (latest order ${order.orderNumber})` : ''}.`,
    }, now);
    tx.create(eventPath, record('ticket_created'));
    return 'ticket_created' as const;
  });
}

/** Processes a verified webhook body. Always resolves with per-message outcomes; the endpoint answers 200. */
export async function processWhatsAppWebhook(store: DocStore, payload: WhatsAppWebhookPayload, now = Date.now()): Promise<InboundOutcome[]> {
  const outcomes: InboundOutcome[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field && change.field !== 'messages') continue;
      const names = new Map((change.value?.contacts ?? []).map(c => [c.wa_id ?? '', c.profile?.name?.trim() ?? '']));
      for (const m of change.value?.messages ?? []) {
        if (!m.id || !m.from || !/^[0-9]{6,15}$/.test(m.from)) continue;
        outcomes.push(await processMessage(store, { id: m.id, from: m.from, type: m.type ?? '', text: m.text?.body }, names.get(m.from) ?? '', now));
      }
    }
  }
  return outcomes;
}

/** Time of the customer's last inbound message, or 0. */
export function lastInboundAt(ticket: Pick<TicketDoc, 'messages'>): number {
  return ticket.messages.reduce((latest, m) => (m.direction === 'inbound' && m.at > latest ? m.at : latest), 0);
}

export const isWithinServiceWindow = (ticket: Pick<TicketDoc, 'messages'>, now: number) => now - lastInboundAt(ticket) < WHATSAPP_SERVICE_WINDOW_MS;

/**
 * Sends a staff reply on WhatsApp and records it in the thread as a `reply` (waiting on the customer).
 * Refused outside the 24-hour window (only templates may be sent then), for an opted-out customer, and
 * when WhatsApp is not configured.
 */
export async function sendTicketWhatsApp(
  store: DocStore,
  config: WhatsAppConfig | null,
  fetchImpl: FetchLike,
  params: { id: string; by: string; text: string },
  now = Date.now(),
): Promise<TicketDoc> {
  if (!config) throw new ApiError(409, 'CONFLICT', 'WhatsApp is not set up yet. Add the WhatsApp keys in Vercel (see Launch setup).');
  const ticket = (await store.get(`tickets/${params.id}`)) as unknown as TicketDoc | null;
  if (!ticket) throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
  const key = ticket.phoneKey ?? '';
  const to = toE164India(key);
  if (ticket.channel !== 'whatsapp' || !to) throw new ApiError(409, 'CONFLICT', 'This ticket has no WhatsApp number to reply to.');
  if (!isWithinServiceWindow(ticket, now)) {
    throw new ApiError(409, 'CONFLICT', 'The 24-hour WhatsApp window has closed. Only an approved template can be sent now; use the WhatsApp link or email.');
  }
  if (await isWhatsAppOptedOut(store, key)) throw new ApiError(409, 'CONFLICT', 'This customer replied STOP and asked not to receive WhatsApp messages.');
  if (ticket.messages.length >= MAX_TICKET_MESSAGES) {
    throw new ApiError(409, 'CONFLICT', 'This ticket has too many messages. Resolve it and ask the customer to write again.');
  }
  try {
    await sendWhatsAppText(config, fetchImpl, { to, text: params.text });
  } catch (err) {
    if (err instanceof WhatsAppError && err.code === WINDOW_CLOSED_ERROR) {
      throw new ApiError(409, 'CONFLICT', 'WhatsApp says the 24-hour window has closed. Only an approved template can be sent now.');
    }
    throw new ApiError(502, 'MESSAGING_PROVIDER_ERROR', 'WhatsApp could not send the message. Try again shortly.', err instanceof Error ? err.message : String(err));
  }
  const next: TicketDoc = {
    ...ticket,
    messages: [...ticket.messages, { at: now, by: params.by, direction: 'reply', text: params.text }],
    status: ticket.status === 'open' ? 'waiting' : ticket.status,
    assignedTo: ticket.assignedTo ?? params.by,
    updatedAt: now,
  };
  await store.update(`tickets/${params.id}`, next as unknown as Record<string, unknown>);
  return next;
}
