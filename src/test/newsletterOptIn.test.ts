// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CONFIRMATION_RESEND_MS, emailHash, isDeliverableSubscriber, subscribe, subscribeRequestSchema } from '../../api/_lib/newsletter';
import { createChannels } from '../../api/_lib/notifications/channels';
import { deliverPendingNotifications } from '../../api/_lib/notifications/deliver';
import { OUTBOX_COLLECTION } from '../../api/_lib/notifications/outbox';
import type { NotificationChannel, OutboxDoc } from '../../api/_lib/notifications/types';
import { MemoryStore } from './support/memoryStore';
import { NOW, scriptedFetch } from './support/serverFixtures';

const signup = subscribeRequestSchema.parse({ action: 'NEWSLETTER_SUBSCRIBE', email: 'reader@example.com' });
const hash = emailHash('reader@example.com');

describe('subscribe', () => {
  it('re-sends the confirmation to a pending address only after an hour, with the same token', async () => {
    const store = new MemoryStore();
    await subscribe(store, signup, NOW);
    const first = store.read(`newsletter_subscribers/${hash}`)!;
    await subscribe(store, signup, NOW + CONFIRMATION_RESEND_MS - 1);
    expect(store.collection(OUTBOX_COLLECTION)).toHaveLength(1);
    await subscribe(store, signup, NOW + CONFIRMATION_RESEND_MS);
    expect(store.collection(OUTBOX_COLLECTION)).toHaveLength(2);
    expect(store.read(`newsletter_subscribers/${hash}`)).toMatchObject({ confirmToken: first.confirmToken, consentAt: first.consentAt });
  });
});

describe('export filter', () => {
  it('delivers only confirmed subscribers; a missing status is a pre-opt-in subscriber', () => {
    expect(isDeliverableSubscriber({ status: 'subscribed' })).toBe(true);
    expect(isDeliverableSubscriber({} as { status: never })).toBe(true);
    expect(isDeliverableSubscriber({ status: 'pending' })).toBe(false);
    expect(isDeliverableSubscriber({ status: 'unsubscribed' })).toBe(false);
  });
});

describe('confirmation email delivery', () => {
  const docOf = (store: MemoryStore) => store.collection(OUTBOX_COLLECTION)[0].data as unknown as OutboxDoc;

  it('stays queued, without using up attempts, while email is not configured', async () => {
    const store = new MemoryStore();
    await subscribe(store, signup, NOW);
    const channels = createChannels({} as NodeJS.ProcessEnv);
    await deliverPendingNotifications(store, channels, NOW);
    await deliverPendingNotifications(store, channels, NOW + 3600_000);
    expect(docOf(store)).toMatchObject({ status: 'pending', attempts: 0, channels: { email: 'pending' } });
  });

  it('goes out once the email provider is configured', async () => {
    const store = new MemoryStore();
    await subscribe(store, signup, NOW);
    await deliverPendingNotifications(store, createChannels({} as NodeJS.ProcessEnv), NOW);
    const fetch = scriptedFetch([{ match: /resend/, body: { id: 'e1' } }]);
    const env = { RESEND_API_KEY: 'k', NOTIFY_FROM_EMAIL: 'Vernox <hi@vernox.in>' } as NodeJS.ProcessEnv;
    const result = await deliverPendingNotifications(store, createChannels(env, fetch.impl), NOW + 3600_000);
    expect(result.sent).toBe(1);
    expect(JSON.parse(fetch.calls[0].init.body ?? '{}')).toMatchObject({ to: ['reader@example.com'], subject: 'Please confirm your Vernox subscription' });
    expect(docOf(store)).toMatchObject({ status: 'sent', channels: { email: 'sent' } });
  });

  it('never hands a held event to a placeholder channel', async () => {
    const store = new MemoryStore();
    const channel: NotificationChannel = { name: 'email', configured: false, async send() { return 'skipped'; } };
    await subscribe(store, signup, NOW);
    await deliverPendingNotifications(store, [channel], NOW);
    expect(docOf(store).status).toBe('pending');
  });
});
