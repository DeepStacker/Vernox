// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { confirmPayment } from '../../api/_lib/payments';
import { createChannels, createMsg91Channel, createResendChannel } from '../../api/_lib/notifications/channels';
import { backoffMs, deliverPendingNotifications, MAX_ATTEMPTS } from '../../api/_lib/notifications/deliver';
import { renderNotification } from '../../api/_lib/notifications/templates';
import type { NotificationChannel, OutboxDoc } from '../../api/_lib/notifications/types';
import { NOW, paidOrder, scriptedFetch, seededStore } from './support/serverFixtures';

const OUTBOX = 'notifications_outbox';

function channel(name: 'email' | 'sms', behaviour: () => Promise<'sent' | 'skipped'>) {
  const calls: string[] = [];
  const impl: NotificationChannel = {
    name,
    async send(_m, doc) {
      calls.push(doc.id);
      return behaviour();
    },
  };
  return { impl, calls };
}

describe('notification outbox', () => {
  it('enqueues exactly one confirmation per order, even when payment is confirmed twice', async () => {
    const store = seededStore();
    const res = await paidOrder(store);
    await confirmPayment(store, { orderId: res.orderId, razorpayPaymentId: 'pay_001', source: 'webhook', now: NOW });
    const docs = store.collection(OUTBOX);
    expect(docs.map(d => d.id)).toEqual([`${res.orderId}_order_confirmed`]);
    expect(docs[0].data).toMatchObject({ status: 'pending', channels: { email: 'pending', sms: 'pending' }, payload: { phone: '9876543210', email: 'asha@example.com' } });
  });

  it('delivers through every channel and marks the document sent', async () => {
    const store = seededStore();
    await paidOrder(store);
    const email = channel('email', async () => 'sent');
    const sms = channel('sms', async () => 'sent');
    expect(await deliverPendingNotifications(store, [email.impl, sms.impl], NOW)).toMatchObject({ scanned: 1, sent: 1 });
    expect(store.collection(OUTBOX)[0].data).toMatchObject({ status: 'sent', attempts: 1, sentAt: NOW });
    expect(await deliverPendingNotifications(store, [email.impl, sms.impl], NOW + 60_000)).toMatchObject({ scanned: 0 });
    expect(email.calls).toHaveLength(1);
  });

  it('retries only the failed channel with backoff, then gives up', async () => {
    const store = seededStore();
    await paidOrder(store);
    const email = channel('email', async () => 'sent');
    const sms = channel('sms', async () => {
      throw new Error('HTTP 503');
    });
    await deliverPendingNotifications(store, [email.impl, sms.impl], NOW);
    let doc = store.collection(OUTBOX)[0].data as unknown as OutboxDoc;
    expect(doc).toMatchObject({ status: 'pending', attempts: 1, channels: { email: 'sent', sms: 'pending' }, nextAttemptAt: NOW + backoffMs(1) });
    expect(doc.lastError).toContain('503');

    // Not due yet.
    expect((await deliverPendingNotifications(store, [email.impl, sms.impl], NOW + 1_000)).scanned).toBe(0);

    let at = NOW;
    for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt += 1) {
      at = doc.nextAttemptAt;
      await deliverPendingNotifications(store, [email.impl, sms.impl], at);
      doc = store.collection(OUTBOX)[0].data as unknown as OutboxDoc;
    }
    expect(doc.status).toBe('dead');
    expect(email.calls).toHaveLength(1); // the email was never re-sent
    expect(sms.calls).toHaveLength(MAX_ATTEMPTS);
    expect(backoffMs(30)).toBe(6 * 3600_000);
  });

  it('retries a document whose sender crashed after its lease expires', async () => {
    const store = seededStore();
    const res = await paidOrder(store);
    const id = `${res.orderId}_order_confirmed`;
    store.seed(`${OUTBOX}/${id}`, { ...store.read(`${OUTBOX}/${id}`)!, status: 'sending', leaseUntil: NOW + 60_000 });
    const email = channel('email', async () => 'sent');
    expect((await deliverPendingNotifications(store, [email.impl], NOW)).scanned).toBe(0);
    expect(await deliverPendingNotifications(store, [email.impl], NOW + 60_000)).toMatchObject({ sent: 1 });
  });

  it('never fails the business transaction when nothing is configured', async () => {
    const store = seededStore();
    await paidOrder(store);
    const result = await deliverPendingNotifications(store, createChannels({} as NodeJS.ProcessEnv), NOW);
    expect(result.sent).toBe(1);
    expect(store.collection(OUTBOX)[0].data).toMatchObject({ channels: { email: 'skipped', sms: 'skipped' } });
  });
});

describe('channels', () => {
  const doc = {
    id: 'o1_shipped',
    orderId: 'o1',
    event: 'shipped',
    payload: { orderId: 'o1', orderNumber: 'VX-1', customerName: 'Asha Rao', email: 'asha@example.com', phone: '9876543210', paymentMethod: 'cod', totalPaise: 62_918, awb: 'SR1', courier: 'Delhivery', trackingUrl: 'https://shiprocket.co/tracking/SR1' },
  } as unknown as OutboxDoc;

  it('Resend: posts the email with the outbox id as idempotency key', async () => {
    const f = scriptedFetch([{ match: /resend\.com\/emails/, body: { id: 'e1' } }]);
    const message = renderNotification('shipped', doc.payload);
    expect(await createResendChannel('re_key', 'Vernox <orders@vernox.in>', f.impl).send(message, doc)).toBe('sent');
    const call = f.calls[0];
    expect(call.init.headers).toMatchObject({ Authorization: 'Bearer re_key', 'Idempotency-Key': 'o1_shipped' });
    expect(JSON.parse(call.init.body!)).toMatchObject({ to: ['asha@example.com'], subject: 'Order VX-1 has shipped' });
    expect(message.text).toContain('Rs. 629.18');
  });

  it('MSG91: sends the DLT template with ordered variables; skips events without a template', async () => {
    const f = scriptedFetch([{ match: /msg91\.com\/api\/v5\/flow/, body: { type: 'success' } }]);
    const ch = createMsg91Channel('auth', { shipped: 'tmpl_shipped' }, f.impl);
    expect(await ch.send(renderNotification('shipped', doc.payload), doc)).toBe('sent');
    expect(JSON.parse(f.calls[0].init.body!)).toEqual({
      template_id: 'tmpl_shipped',
      short_url: '0',
      recipients: [{ mobiles: '919876543210', var1: 'Asha', var2: 'VX-1', var3: 'SR1' }],
    });
    expect(await ch.send(renderNotification('delivered', doc.payload), { ...doc, event: 'delivered' })).toBe('skipped');
  });

  it('MSG91: treats a 200 with type error as a failure', async () => {
    const f = scriptedFetch([{ match: /msg91/, body: { type: 'error', message: 'invalid template' } }]);
    await expect(createMsg91Channel('auth', { shipped: 't' }, f.impl).send(renderNotification('shipped', doc.payload), doc)).rejects.toThrow(/rejected/);
  });

  it('escapes customer-supplied text in HTML', () => {
    const html = renderNotification('return_rejected', { ...doc.payload, customerName: '<b>x</b>', note: '<script>' }).html;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
