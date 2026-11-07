// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { environmentItems, launchStatus } from '../../api/_lib/launchStatus';
import { MemoryStore } from './support/memoryStore';

const FULL = {
  RAZORPAY_KEY_ID: 'rzp_live_abc', RAZORPAY_KEY_SECRET: 'secret-value-1', VITE_RAZORPAY_KEY_ID: 'rzp_live_abc', RAZORPAY_WEBHOOK_SECRET: 'whsec-2',
  SHIPROCKET_EMAIL: 'api@x.in', SHIPROCKET_PASSWORD: 'pw-3', SHIPROCKET_PICKUP_LOCATION: 'Primary', SHIPROCKET_WEBHOOK_TOKEN: 'tok-4',
  RESEND_API_KEY: 're_5', NOTIFY_FROM_EMAIL: 'Vernox <o@x.in>', MSG91_AUTH_KEY: 'msg-6', MSG91_TEMPLATES: '{"shipped":"t1"}', MSG91_OTP_TEMPLATE_ID: 'otp-8',
  CRON_SECRET: 'cron-7', VITE_SITE_URL: 'https://vernox.in', FIREBASE_SERVICE_ACCOUNT_BASE64: 'e30=',
} as NodeJS.ProcessEnv;

describe('launch status', () => {
  it('reports every item ready when all keys are set, and never echoes a secret', () => {
    const items = environmentItems(FULL);
    expect(items.every(i => i.ready)).toBe(true);
    const json = JSON.stringify(items);
    for (const secret of ['secret-value-1', 'whsec-2', 'pw-3', 'tok-4', 're_5', 'msg-6', 'cron-7', 'e30=', 'otp-8']) expect(json).not.toContain(secret);
    expect(items.find(i => i.id === 'razorpay')?.detail).toBe('live mode');
  });

  it('flags missing required keys and treats bad values as unset', () => {
    const items = environmentItems({ RAZORPAY_KEY_ID: 'rzp_test_x', MSG91_AUTH_KEY: 'k', MSG91_TEMPLATES: '{}', VITE_SITE_URL: 'http://localhost:8080' } as NodeJS.ProcessEnv);
    const byId = Object.fromEntries(items.map(i => [i.id, i]));
    expect(byId.razorpay).toMatchObject({ ready: false, required: true, detail: 'test mode: no real money is taken' });
    expect(byId.sms.ready).toBe(false);
    expect(byId['cod-otp']).toMatchObject({ ready: false, required: false });
    expect(byId['site-url'].ready).toBe(false);
    expect(byId.shiprocket).toMatchObject({ ready: false, required: false });
  });

  it('counts sample products and checks for a designer', async () => {
    const store = new MemoryStore();
    store.seed('products/a', { name: 'A', isSample: true });
    store.seed('products/b', { name: 'B' });
    const items = await launchStatus(store, FULL);
    expect(items.find(i => i.id === 'catalogue')).toMatchObject({ ready: false, detail: '1 sample piece left' });
    expect(items.find(i => i.id === 'designer')?.ready).toBe(false);
    store.seed('staff/u1', { role: 'designer' });
    store.seed('products/a', { name: 'A', isSample: false });
    const after = await launchStatus(store, FULL);
    expect(after.find(i => i.id === 'catalogue')?.ready).toBe(true);
    expect(after.find(i => i.id === 'designer')?.ready).toBe(true);
  });
});
