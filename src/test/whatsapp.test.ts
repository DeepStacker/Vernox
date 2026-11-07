// @vitest-environment node
import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChannels } from '../../api/_lib/notifications/channels';
import { deliverPendingNotifications } from '../../api/_lib/notifications/deliver';
import { OUTBOX_COLLECTION } from '../../api/_lib/notifications/outbox';
import { createStaffTicket, type TicketDoc } from '../../api/_lib/tickets';
import { toE164India, whatsappConfig } from '../../api/_lib/whatsapp';
import { MEDIA_NOTE, processWhatsAppWebhook, sendTicketWhatsApp } from '../../api/_lib/whatsappInbound';
import { NOW, paidOrder, scriptedFetch, seededStore } from './support/serverFixtures';
import type { MemoryStore } from './support/memoryStore';

let store: MemoryStore;
vi.mock('../../api/_lib/firebaseAdmin', () => ({ getStore: () => store, getAdminAuth: () => ({}) }));
const { default: webhook } = await import('../../api/whatsapp-webhook');

const SECRET = 'app-secret-xyz';
const VERIFY = 'verify-me';
const ENV = {
  WHATSAPP_ACCESS_TOKEN: 'tok-abc', WHATSAPP_PHONE_NUMBER_ID: '1055', WHATSAPP_APP_SECRET: SECRET, WHATSAPP_VERIFY_TOKEN: VERIFY,
  WHATSAPP_TEMPLATES: JSON.stringify({ order_confirmed: { name: 'order_confirmed_v1', language: 'en' } }),
} as NodeJS.ProcessEnv;

const inbound = (id: string, text: string, from = '919876543210', type = 'text') => ({
  entry: [{ changes: [{ field: 'messages', value: {
    contacts: [{ wa_id: from, profile: { name: 'Asha Rao' } }],
    messages: [{ id, from, type, ...(type === 'text' ? { text: { body: text } } : {}) }],
  } }] }],
});

const tickets = () => store.collection('tickets');
const outbox = () => store.collection(OUTBOX_COLLECTION);

beforeEach(() => { store = seededStore(); });

describe('WhatsApp inbound messages', () => {
  it('opens a whatsapp ticket linked to the latest order and queues the support alert', async () => {
    const order = await paidOrder(store);
    expect(await processWhatsAppWebhook(store, inbound('wamid.1', 'Where is my order?'), NOW)).toEqual(['ticket_created']);
    const [t] = tickets();
    expect(t.data).toMatchObject({ channel: 'whatsapp', status: 'open', phoneKey: '9876543210', customerName: 'Asha Rao', orderId: order.orderId });
    expect((t.data as unknown as TicketDoc).messages).toEqual([{ at: NOW, by: '9876543210', direction: 'inbound', text: 'Where is my order?' }]);
    expect(outbox().some(d => d.id === `${t.id}_support_ticket`)).toBe(true);
  });

  it('is idempotent per message id', async () => {
    await processWhatsAppWebhook(store, inbound('wamid.1', 'hello'), NOW);
    expect(await processWhatsAppWebhook(store, inbound('wamid.1', 'hello'), NOW + 5)).toEqual(['duplicate']);
    expect(tickets()).toHaveLength(1);
    expect((tickets()[0].data as unknown as TicketDoc).messages).toHaveLength(1);
  });

  it('appends to the open ticket and reopens a waiting one; a resolved ticket starts a new one', async () => {
    await processWhatsAppWebhook(store, inbound('wamid.1', 'hello'), NOW);
    const id = tickets()[0].id;
    store.seed(`tickets/${id}`, { ...tickets()[0].data, status: 'waiting' });
    expect(await processWhatsAppWebhook(store, inbound('wamid.2', 'any update?'), NOW + 1000)).toEqual(['ticket_appended']);
    expect(tickets()).toHaveLength(1);
    expect(tickets()[0].data).toMatchObject({ status: 'open', updatedAt: NOW + 1000 });
    expect((tickets()[0].data as unknown as TicketDoc).messages).toHaveLength(2);

    store.seed(`tickets/${id}`, { ...tickets()[0].data, status: 'resolved' });
    expect(await processWhatsAppWebhook(store, inbound('wamid.3', 'new problem'), NOW + 2000)).toEqual(['ticket_created']);
    expect(tickets()).toHaveLength(2);
  });

  it('records media as a note without downloading it', async () => {
    await processWhatsAppWebhook(store, inbound('wamid.9', '', '919876543210', 'image'), NOW);
    expect((tickets()[0].data as unknown as TicketDoc).messages[0].text).toBe(MEDIA_NOTE);
  });

  it('STOP sets and START clears the opt-out, without opening tickets', async () => {
    expect(await processWhatsAppWebhook(store, inbound('wamid.s1', ' stop '), NOW)).toEqual(['opted_out']);
    expect(store.collection('whatsapp_contacts')[0]).toMatchObject({ id: '9876543210', data: { whatsappOptOut: true } });
    expect(await processWhatsAppWebhook(store, inbound('wamid.s2', 'START'), NOW + 1)).toEqual(['opted_in']);
    expect(store.collection('whatsapp_contacts')[0].data.whatsappOptOut).toBe(false);
    expect(tickets()).toHaveLength(0);
  });

  it('acknowledges unsupported message types without a ticket', async () => {
    expect(await processWhatsAppWebhook(store, inbound('wamid.r', '', '919876543210', 'reaction'), NOW)).toEqual(['ignored']);
    expect(tickets()).toHaveLength(0);
  });
});

describe('/api/whatsapp-webhook', () => {
  const sign = (raw: string, secret = SECRET) => `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
  async function call(req: Partial<VercelRequest> & { rawBody?: Buffer }) {
    const out: { status: number; body: unknown } = { status: 0, body: undefined };
    const res = {
      setHeader: () => res,
      status: (s: number) => { out.status = s; return res; },
      json: (b: unknown) => { out.body = b; return res; },
      end: (b: unknown) => { out.body = b; return res; },
    } as unknown as VercelResponse;
    await webhook({ headers: {}, query: {}, socket: {}, ...req } as unknown as VercelRequest, res);
    return out;
  }
  beforeEach(() => { Object.assign(process.env, ENV); });

  it('answers the verification handshake only for the right token', async () => {
    const ok = await call({ method: 'GET', query: { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '1158201444' } });
    expect(ok).toEqual({ status: 200, body: '1158201444' });
    const bad = await call({ method: 'GET', query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '1' } });
    expect(bad.status).toBe(403);
  });

  it('rejects a bad or missing signature and accepts a valid one', async () => {
    const raw = JSON.stringify(inbound('wamid.w1', 'hi'));
    const rawBody = Buffer.from(raw);
    expect((await call({ method: 'POST', rawBody, headers: { 'x-hub-signature-256': sign(raw, 'wrong') } })).status).toBe(400);
    expect((await call({ method: 'POST', rawBody })).status).toBe(400);
    expect(tickets()).toHaveLength(0);
    const ok = await call({ method: 'POST', rawBody, headers: { 'x-hub-signature-256': sign(raw) } });
    expect(ok.status).toBe(200);
    expect(tickets()).toHaveLength(1);
  });
});

describe('WhatsApp order updates', () => {
  it('normalises Indian numbers to E.164 and reads the config', () => {
    expect(toE164India('9876543210')).toBe('+919876543210');
    expect(toE164India('12345')).toBeNull();
    expect(whatsappConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(whatsappConfig(ENV)).toMatchObject({ graphVersion: 'v27.0', templates: { order_confirmed: { name: 'order_confirmed_v1', language: 'en' } } });
    expect(whatsappConfig({ ...ENV, WHATSAPP_GRAPH_VERSION: 'v30.0' })?.graphVersion).toBe('v30.0');
  });

  it('sends a template message with body parameters and marks the channel sent', async () => {
    await paidOrder(store);
    const fetch = scriptedFetch([
      { match: /resend/, body: {} }, { match: /graph\.facebook\.com/, body: { messages: [{ id: 'wamid.x' }] } },
    ]);
    const channels = createChannels({ ...ENV, RESEND_API_KEY: 'r', NOTIFY_FROM_EMAIL: 'a@b.in' }, fetch.impl, store);
    await deliverPendingNotifications(store, channels, NOW);
    const call = fetch.calls.find(c => c.url.includes('graph.facebook.com'))!;
    expect(call.url).toBe('https://graph.facebook.com/v27.0/1055/messages');
    expect(call.init.headers.Authorization).toBe('Bearer tok-abc');
    const body = JSON.parse(call.init.body!);
    expect(body).toMatchObject({ messaging_product: 'whatsapp', to: '+919876543210', type: 'template', template: { name: 'order_confirmed_v1', language: { code: 'en' } } });
    expect(body.template.components[0]).toMatchObject({ type: 'body' });
    expect(body.template.components[0].parameters).toHaveLength(3);
    expect(outbox()[0].data).toMatchObject({ status: 'sent', channels: { email: 'sent', whatsapp: 'sent' } });
  });

  it('skips events without a template and customers who opted out', async () => {
    await paidOrder(store);
    const none = scriptedFetch([{ match: /./, body: {} }]);
    const noTemplate = createChannels({ ...ENV, WHATSAPP_TEMPLATES: JSON.stringify({ shipped: { name: 's', language: 'en' } }) }, none.impl, store);
    await deliverPendingNotifications(store, noTemplate, NOW);
    expect(none.calls).toHaveLength(0);
    expect(outbox()[0].data).toMatchObject({ channels: { whatsapp: 'skipped' } });

    store = seededStore();
    await paidOrder(store);
    store.seed('whatsapp_contacts/9876543210', { whatsappOptOut: true });
    const optOut = scriptedFetch([{ match: /./, body: {} }]);
    await deliverPendingNotifications(store, createChannels(ENV, optOut.impl, store), NOW);
    expect(optOut.calls).toHaveLength(0);
    expect(outbox()[0].data).toMatchObject({ channels: { whatsapp: 'skipped' } });
  });

  it('does nothing for WhatsApp when unconfigured, and retries a transient failure', async () => {
    await paidOrder(store);
    await deliverPendingNotifications(store, createChannels({} as NodeJS.ProcessEnv, undefined, store), NOW);
    expect(outbox()[0].data).toMatchObject({ status: 'sent', channels: { whatsapp: 'skipped' } });

    store = seededStore();
    await paidOrder(store);
    const down = scriptedFetch([{ match: /graph/, status: 503, body: { error: { code: 2, message: 'Service unavailable' } } }]);
    await deliverPendingNotifications(store, createChannels(ENV, down.impl, store), NOW);
    expect(outbox()[0].data).toMatchObject({ status: 'pending', channels: { whatsapp: 'pending' } });
  });

  it('treats a permanent rejection (number not on WhatsApp) as skipped', async () => {
    await paidOrder(store);
    const f = scriptedFetch([{ match: /graph/, status: 400, body: { error: { code: 131026, message: 'Undeliverable' } } }]);
    await deliverPendingNotifications(store, createChannels(ENV, f.impl, store), NOW);
    expect(outbox()[0].data).toMatchObject({ channels: { whatsapp: 'skipped' } });
  });
});

describe('staff replies on WhatsApp (24-hour window)', () => {
  const config = whatsappConfig(ENV);
  const send = (id: string, at: number, f = scriptedFetch([{ match: /graph/, body: {} }])) =>
    sendTicketWhatsApp(store, config, f.impl, { id, by: 'staff@vernox.in', text: 'It ships tomorrow.' }, at);

  it('sends free-form text inside the window and records a reply', async () => {
    await processWhatsAppWebhook(store, inbound('wamid.1', 'hello'), NOW);
    const id = tickets()[0].id;
    const f = scriptedFetch([{ match: /graph/, body: {} }]);
    const next = await send(id, NOW + 23 * 3600_000, f);
    expect(JSON.parse(f.calls[0].init.body!)).toMatchObject({ type: 'text', to: '+919876543210', text: { body: 'It ships tomorrow.' } });
    expect(next.status).toBe('waiting');
    expect(next.messages.at(-1)).toMatchObject({ direction: 'reply', by: 'staff@vernox.in' });
  });

  it('refuses outside 24 hours, when opted out, for non-WhatsApp tickets and when unconfigured', async () => {
    await processWhatsAppWebhook(store, inbound('wamid.1', 'hello'), NOW);
    const id = tickets()[0].id;
    const f = scriptedFetch([]);
    await expect(send(id, NOW + 25 * 3600_000, f)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('24-hour') });
    store.seed('whatsapp_contacts/9876543210', { whatsappOptOut: true });
    await expect(send(id, NOW + 1000, f)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('STOP') });
    await expect(sendTicketWhatsApp(store, null, f.impl, { id, by: 'x', text: 'y' }, NOW)).rejects.toMatchObject({ status: 409 });
    const { id: emailTicket } = await createStaffTicket(store, { channel: 'email', topic: 'Order help', customerEmail: 'a@b.in', message: 'hi' }, 'staff');
    await expect(send(emailTicket, NOW)).rejects.toMatchObject({ status: 409 });
    expect(f.calls).toHaveLength(0);
  });
});
