// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { environmentItems, launchStatus } from '../../api/_lib/launchStatus';
import { MemoryStore } from './support/memoryStore';

const FULL = {
  RAZORPAY_KEY_ID: 'rzp_live_abc', RAZORPAY_KEY_SECRET: 'secret-value-1', RAZORPAY_WEBHOOK_SECRET: 'whsec-2',
  SHIPROCKET_EMAIL: 'api@x.in', SHIPROCKET_PASSWORD: 'pw-3', SHIPROCKET_PICKUP_LOCATION: 'Primary', SHIPROCKET_WEBHOOK_TOKEN: 'tok-4',
  RESEND_API_KEY: 're_5', NOTIFY_FROM_EMAIL: 'Vernox <o@x.in>', MSG91_AUTH_KEY: 'msg-6', MSG91_TEMPLATES: '{"shipped":"t1"}', MSG91_OTP_TEMPLATE_ID: 'otp-8',
  CRON_SECRET: 'cron-7',
  WHATSAPP_ACCESS_TOKEN: 'wa-tok-9', WHATSAPP_PHONE_NUMBER_ID: '1055', WHATSAPP_TEMPLATES: '{"shipped":{"name":"tpl-secret-name","language":"en"}}',
  WHATSAPP_APP_SECRET: 'wa-app-10', WHATSAPP_VERIFY_TOKEN: 'wa-verify-11', VITE_SITE_URL: 'https://vernox.in', FIREBASE_SERVICE_ACCOUNT_BASE64: 'e30=',
} as NodeJS.ProcessEnv;

describe('launch status', () => {
  it('reports every item ready when all keys are set, and never echoes a secret', () => {
    const items = environmentItems(FULL);
    expect(items.every(i => i.ready)).toBe(true);
    const json = JSON.stringify(items);
    for (const secret of ['secret-value-1', 'whsec-2', 'pw-3', 'tok-4', 're_5', 'msg-6', 'cron-7', 'e30=', 'otp-8', 'wa-tok-9', 'wa-app-10', 'wa-verify-11', '1055', 'tpl-secret-name']) expect(json).not.toContain(secret);
    expect(items.find(i => i.id === 'razorpay')?.detail).toBe('live mode');
  });

  it('does not require VITE_RAZORPAY_KEY_ID for Razorpay: the browser gets the key id at runtime', () => {
    const byId = (env: NodeJS.ProcessEnv) => Object.fromEntries(environmentItems(env).map(i => [i.id, i]));
    expect(byId({ RAZORPAY_KEY_ID: 'rzp_live_a', RAZORPAY_KEY_SECRET: 's' } as NodeJS.ProcessEnv).razorpay.ready).toBe(true);
    expect(byId({ RAZORPAY_KEY_ID: 'rzp_live_a' } as NodeJS.ProcessEnv).razorpay.ready).toBe(false);
    expect(byId({ VITE_RAZORPAY_KEY_ID: 'rzp_live_a', RAZORPAY_KEY_SECRET: 's' } as NodeJS.ProcessEnv).razorpay.ready).toBe(false);
  });

  it('reports WhatsApp as optional and ready only with the right keys', () => {
    const byId = (env: NodeJS.ProcessEnv) => Object.fromEntries(environmentItems(env).map(i => [i.id, i]));
    expect(byId(FULL)['whatsapp']).toMatchObject({ ready: true, required: false, group: 'messages' });
    expect(byId(FULL)['whatsapp-inbound']).toMatchObject({ ready: true, required: false });
    const none = byId({} as NodeJS.ProcessEnv);
    expect(none['whatsapp'].ready).toBe(false);
    expect(none['whatsapp-inbound'].ready).toBe(false);
    expect(byId({ WHATSAPP_ACCESS_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '1', WHATSAPP_TEMPLATES: '{}' } as NodeJS.ProcessEnv)['whatsapp'].ready).toBe(false);
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
