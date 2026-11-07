// @vitest-environment node
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCheckoutIntent, type CodCheckoutResponse } from '../../api/_lib/checkout';
import {
  codOtpEnabled,
  COD_OTP_MAX_ATTEMPTS,
  COD_OTP_RESEND_COOLDOWN_MS,
  COD_OTP_TTL_MS,
  COD_UNVERIFIED_FLAG,
  COD_VERIFICATION_TTL_MS,
  createMsg91OtpSender,
  sendCodOtp,
  verifyCodOtp,
  type OtpSender,
} from '../../api/_lib/codOtp';
import { mergeStoreConfig } from '../../api/_lib/storeConfig';
import { awaitsCodConfirmation, telHref } from '../lib/orders/codConfirmation';
import { MemoryStore } from './support/memoryStore';
import { checkoutRequest, deps, NOW, scriptedFetch, seededStore, SELLER_CONFIG } from './support/serverFixtures';

const PHONE = '9876543210';
const ENV = { MSG91_AUTH_KEY: 'key', MSG91_OTP_TEMPLATE_ID: 'tpl' } as NodeJS.ProcessEnv;

function recordingSender() {
  const sent: Array<{ phone: string; code: string }> = [];
  const sender: OtpSender = { async send(phone, code) { sent.push({ phone, code }); } };
  return { sender, sent, last: () => sent[sent.length - 1].code };
}

describe('codOtpEnabled', () => {
  it('needs the provider env AND the store setting; the setting defaults to on', () => {
    expect(codOtpEnabled(SELLER_CONFIG, ENV)).toBe(true);
    expect(codOtpEnabled(SELLER_CONFIG, {} as NodeJS.ProcessEnv)).toBe(false);
    expect(codOtpEnabled(SELLER_CONFIG, { MSG91_AUTH_KEY: 'key' } as NodeJS.ProcessEnv)).toBe(false);
    expect(codOtpEnabled(mergeStoreConfig(SELLER_CONFIG, { codOtpRequired: false }), ENV)).toBe(false);
  });
});

describe('MSG91 OTP sender', () => {
  it('posts the v5 send-OTP request with the authkey header and our own code', async () => {
    const fetch = scriptedFetch([{ match: /api\/v5\/otp\?/, body: { type: 'success' } }]);
    await createMsg91OtpSender('key', 'tpl', fetch.impl).send(PHONE, '123456');
    const url = new URL(fetch.calls[0].url);
    expect(url.origin + url.pathname).toBe('https://control.msg91.com/api/v5/otp');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ template_id: 'tpl', mobile: `91${PHONE}`, otp: '123456', otp_expiry: '5' });
    expect(fetch.calls[0].init).toMatchObject({ method: 'POST', headers: { authkey: 'key' } });
  });

  it('treats a 200 with type error as a failure', async () => {
    const fetch = scriptedFetch([{ match: /otp/, body: { type: 'error', message: 'Template not approved' } }]);
    await expect(createMsg91OtpSender('key', 'tpl', fetch.impl).send(PHONE, '123456')).rejects.toThrow(/MSG91 OTP failed/);
  });
});

describe('send and verify', () => {
  let store: MemoryStore;
  beforeEach(() => { store = new MemoryStore(); });

  it('stores only a hash of the code and verifies it into a token', async () => {
    const { sender, last } = recordingSender();
    await sendCodOtp(store, sender, PHONE, NOW);
    expect(JSON.stringify(store.read(`cod_otps/${PHONE}`))).not.toContain(last());
    expect(last()).toMatch(/^[0-9]{6}$/);
    const token = await verifyCodOtp(store, PHONE, last(), NOW + 1000);
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    // The code itself is single use.
    await expect(verifyCodOtp(store, PHONE, last(), NOW + 2000)).rejects.toMatchObject({ code: 'COD_OTP_INVALID' });
  });

  it('refuses a new code during the 30 second cooldown and allows it afterwards', async () => {
    const { sender, sent } = recordingSender();
    await sendCodOtp(store, sender, PHONE, NOW);
    await expect(sendCodOtp(store, sender, PHONE, NOW + COD_OTP_RESEND_COOLDOWN_MS - 1)).rejects.toMatchObject({ status: 429 });
    expect(sent).toHaveLength(1);
    await sendCodOtp(store, sender, PHONE, NOW + COD_OTP_RESEND_COOLDOWN_MS);
    expect(sent).toHaveLength(2);
  });

  it('a resent code replaces the old one', async () => {
    const { sender, sent } = recordingSender();
    await sendCodOtp(store, sender, PHONE, NOW);
    await sendCodOtp(store, sender, PHONE, NOW + COD_OTP_RESEND_COOLDOWN_MS);
    await expect(verifyCodOtp(store, PHONE, sent[0].code === sent[1].code ? '000000' : sent[0].code, NOW + 40_000)).rejects.toMatchObject({ code: 'COD_OTP_INVALID' });
    await expect(verifyCodOtp(store, PHONE, sent[1].code, NOW + 41_000)).resolves.toMatch(/^[0-9a-f]{48}$/);
  });

  it('expires after 5 minutes', async () => {
    const { sender, last } = recordingSender();
    await sendCodOtp(store, sender, PHONE, NOW);
    await expect(verifyCodOtp(store, PHONE, last(), NOW + COD_OTP_TTL_MS + 1)).rejects.toThrow(/expired/);
  });

  it('locks after 5 wrong attempts, even for the right code, and counts attempts across requests', async () => {
    const { sender, last } = recordingSender();
    await sendCodOtp(store, sender, PHONE, NOW);
    const wrong = last() === '111111' ? '222222' : '111111';
    for (let i = 1; i < COD_OTP_MAX_ATTEMPTS; i += 1) {
      await expect(verifyCodOtp(store, PHONE, wrong, NOW + i)).rejects.toThrow(/not correct/);
    }
    await expect(verifyCodOtp(store, PHONE, wrong, NOW + 9)).rejects.toThrow(/Too many wrong attempts/);
    await expect(verifyCodOtp(store, PHONE, last(), NOW + 10)).rejects.toMatchObject({ code: 'COD_OTP_INVALID' });
    expect(store.read(`cod_otps/${PHONE}`)).toMatchObject({ codeHash: null, attempts: COD_OTP_MAX_ATTEMPTS });
  });

  it('a code for one phone does not verify another', async () => {
    const { sender, last } = recordingSender();
    await sendCodOtp(store, sender, PHONE, NOW);
    await expect(verifyCodOtp(store, '9123456780', last(), NOW + 1)).rejects.toMatchObject({ code: 'COD_OTP_INVALID' });
  });

  it('lets the customer retry at once when the SMS provider fails', async () => {
    const failing: OtpSender = { async send() { throw new Error('boom'); } };
    await expect(sendCodOtp(store, failing, PHONE, NOW)).rejects.toMatchObject({ status: 502 });
    const { sender, sent } = recordingSender();
    await sendCodOtp(store, sender, PHONE, NOW + 1);
    expect(sent).toHaveLength(1);
  });
});

describe('COD checkout with SMS confirmation enabled', () => {
  const cod = (overrides: Record<string, unknown> = {}) => checkoutRequest({ paymentMethod: 'cod', ...overrides });
  let store: MemoryStore;
  beforeEach(() => { store = seededStore(); });
  const otpDeps = () => ({ ...deps(store), codOtpEnabled: true });

  async function verifiedToken(phone = PHONE) {
    const { sender, last } = recordingSender();
    await sendCodOtp(store, sender, phone, NOW - 1000);
    return verifyCodOtp(store, phone, last(), NOW - 500);
  }

  it('rejects COD without a token, with a friendly message, and creates nothing', async () => {
    const err = await createCheckoutIntent(otpDeps(), cod(), null).then(() => null, e => e);
    expect(err).toMatchObject({ status: 400, code: 'COD_OTP_REQUIRED' });
    expect(err.message).toMatch(/confirm your mobile number/);
    expect(store.collection('orders')).toHaveLength(0);
    expect(store.read('products/p-01')!.stock).toBe(10);
  });

  it('rejects a token that is wrong, for another phone, or expired', async () => {
    const token = await verifiedToken();
    await expect(createCheckoutIntent(otpDeps(), cod({ codVerificationToken: 'a'.repeat(48) }), null)).rejects.toMatchObject({ code: 'COD_OTP_REQUIRED' });
    const other = await verifiedToken('9123456780');
    await expect(createCheckoutIntent(otpDeps(), cod({ codVerificationToken: other }), null)).rejects.toMatchObject({ code: 'COD_OTP_REQUIRED' });
    const late = { ...otpDeps(), now: () => NOW + COD_VERIFICATION_TTL_MS + 1 };
    await expect(createCheckoutIntent(late, cod({ codVerificationToken: token }), null)).rejects.toMatchObject({ code: 'COD_OTP_REQUIRED' });
    expect(store.collection('orders')).toHaveLength(0);
  });

  it('accepts a valid token once: the order is clean (no flag) and the token is single use', async () => {
    const token = await verifiedToken();
    const res = (await createCheckoutIntent(otpDeps(), cod({ codVerificationToken: token }), null)) as CodCheckoutResponse;
    expect(store.read(`orders/${res.orderId}`)!.flags).toEqual([]);
    await expect(
      createCheckoutIntent(otpDeps(), cod({ codVerificationToken: token, idempotencyKey: 'idem-key-0002' }), null),
    ).rejects.toMatchObject({ code: 'COD_OTP_REQUIRED' });
  });

  it('keeps the token when the order fails for another reason (e.g. stock)', async () => {
    const token = await verifiedToken();
    const failing = cod({ codVerificationToken: token, items: [{ productId: 'p-01', sizeLabel: 'Medium · 50cm', finish: 'brass', quantity: 11 }] });
    await expect(createCheckoutIntent(otpDeps(), failing, null)).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    await expect(createCheckoutIntent(otpDeps(), cod({ codVerificationToken: token }), null)).resolves.toMatchObject({ paymentMethod: 'cod' });
  });

  it('a retried request with the same idempotency key returns the order without needing the token again', async () => {
    const token = await verifiedToken();
    const first = await createCheckoutIntent(otpDeps(), cod({ codVerificationToken: token }), null);
    const again = await createCheckoutIntent(otpDeps(), cod(), null);
    expect(again.orderId).toBe(first.orderId);
  });

  it('does not ask prepaid checkouts for a token', async () => {
    await expect(createCheckoutIntent(otpDeps(), checkoutRequest(), null)).resolves.toMatchObject({ paymentMethod: 'prepaid' });
  });
});

describe('COD checkout fallback when SMS confirmation is not configured', () => {
  it('creates the order flagged COD_UNVERIFIED for staff to phone', async () => {
    const store = seededStore();
    const res = (await createCheckoutIntent(deps(store), checkoutRequest({ paymentMethod: 'cod' }), null)) as CodCheckoutResponse;
    const order = store.read(`orders/${res.orderId}`)!;
    expect(order).toMatchObject({ status: 'Confirmed_COD', flags: [COD_UNVERIFIED_FLAG] });
    expect(awaitsCodConfirmation({ status: 'Confirmed_COD', ops: { flags: order.flags as string[] } })).toBe(true);
  });

  it('does not flag prepaid orders', async () => {
    const store = seededStore();
    const res = await createCheckoutIntent(deps(store), checkoutRequest(), null);
    expect(store.read(`orders/${res.orderId}`)!.flags).toEqual([]);
  });
});

describe('confirmation helpers', () => {
  it('hides the prompt once confirmed or closed and builds a tel: link', () => {
    expect(awaitsCodConfirmation({ status: 'Confirmed_COD', ops: { flags: [] } })).toBe(false);
    expect(awaitsCodConfirmation({ status: 'Cancelled', ops: { flags: [COD_UNVERIFIED_FLAG] } })).toBe(false);
    expect(telHref('+91 98765 43210')).toBe('tel:+919876543210');
    expect(telHref('abc')).toBeNull();
  });
});

// ---------------------------------------------------------------- CONFIRM_COD_ORDER and the engage actions

let adminStore: MemoryStore;
vi.mock('../../api/_lib/firebaseAdmin', () => ({ getStore: () => adminStore, getAdminAuth: () => ({}), getPhotoStorage: () => ({}) }));
vi.mock('../../api/_lib/rateLimit', async orig => ({ ...(await orig<object>()), enforceRateLimit: async () => undefined }));
vi.mock('../../api/_lib/auth', async orig => {
  const real = await orig<typeof import('../../api/_lib/auth')>();
  return {
    ...real,
    requireStaff: async (req: VercelRequest, _verifier: unknown, permission: Parameters<typeof real.authoriseStaff>[1]) =>
      real.authoriseStaff({ uid: `u-${req.headers.authorization}`, email: `${req.headers.authorization}@vernox.in`, email_verified: true, role: req.headers.authorization, firebase: { sign_in_provider: 'google.com' } } as never, permission),
  };
});

const { default: adminHandler } = await import('../../api/admin');
const { default: engageHandler } = await import('../../api/engage');

async function invoke(handler: typeof adminHandler, body: Record<string, unknown>, bearer?: string) {
  const out: { status: number; body: Record<string, unknown> } = { status: 0, body: {} };
  const res = {
    setHeader: () => res,
    status: (s: number) => { out.status = s; return res; },
    json: (b: Record<string, unknown>) => { out.body = b; return res; },
  } as unknown as VercelResponse;
  await handler({ method: 'POST', headers: bearer ? { authorization: bearer } : {}, body, query: {}, socket: {} } as unknown as VercelRequest, res);
  return out;
}

describe('CONFIRM_COD_ORDER', () => {
  let orderId: string;
  beforeEach(async () => {
    adminStore = seededStore();
    orderId = ((await createCheckoutIntent(deps(adminStore), checkoutRequest({ paymentMethod: 'cod' }), null)) as CodCheckoutResponse).orderId;
  });

  it('clears the flag, records who confirmed, and audits it', async () => {
    const res = await invoke(adminHandler, { action: 'CONFIRM_COD_ORDER', orderId, note: 'spoke to customer' }, 'order_manager');
    expect(res.status).toBe(200);
    expect(adminStore.read(`orders/${orderId}`)).toMatchObject({ flags: [], codConfirmedBy: 'order_manager@vernox.in', status: 'Confirmed_COD' });
    const audits = adminStore.collection('audit_logs').map(a => a.data);
    expect(audits).toContainEqual(expect.objectContaining({ action: 'COD_ORDER_CONFIRMED', targetId: orderId }));
  });

  it('refuses a second confirmation, unknown orders and roles without orders.update_status', async () => {
    await invoke(adminHandler, { action: 'CONFIRM_COD_ORDER', orderId }, 'order_manager');
    expect((await invoke(adminHandler, { action: 'CONFIRM_COD_ORDER', orderId }, 'order_manager')).status).toBe(409);
    expect((await invoke(adminHandler, { action: 'CONFIRM_COD_ORDER', orderId: 'doesnotexist1' }, 'order_manager')).status).toBe(404);
    expect((await invoke(adminHandler, { action: 'CONFIRM_COD_ORDER', orderId }, 'finance')).status).toBe(403);
  });
});

describe('engage COD_OTP actions', () => {
  beforeEach(() => { adminStore = seededStore(); });

  it('report disabled and send nothing when the SMS provider is not configured', async () => {
    delete process.env.MSG91_AUTH_KEY;
    delete process.env.MSG91_OTP_TEMPLATE_ID;
    expect((await invoke(engageHandler, { action: 'COD_OTP_STATUS' })).body).toMatchObject({ required: false });
    const sent = await invoke(engageHandler, { action: 'COD_OTP_SEND', phone: PHONE });
    expect(sent.body).toMatchObject({ success: true, required: false });
    expect(adminStore.collection('cod_otps')).toHaveLength(0);
  });

  it('report enabled when configured, and honour the store setting', async () => {
    process.env.MSG91_AUTH_KEY = 'key';
    process.env.MSG91_OTP_TEMPLATE_ID = 'tpl';
    try {
      expect((await invoke(engageHandler, { action: 'COD_OTP_STATUS' })).body).toMatchObject({ required: true });
      adminStore.seed('settings/store', { codOtpRequired: false });
      expect((await invoke(engageHandler, { action: 'COD_OTP_STATUS' })).body).toMatchObject({ required: false });
    } finally {
      delete process.env.MSG91_AUTH_KEY;
      delete process.env.MSG91_OTP_TEMPLATE_ID;
    }
  });

  it('validate the phone and the code format', async () => {
    expect((await invoke(engageHandler, { action: 'COD_OTP_SEND', phone: '12345' })).status).toBe(400);
    expect((await invoke(engageHandler, { action: 'COD_OTP_VERIFY', phone: PHONE, code: 'abc' })).status).toBe(400);
  });

  it('answer a wrong code with a friendly 400', async () => {
    const res = await invoke(engageHandler, { action: 'COD_OTP_VERIFY', phone: PHONE, code: '123456' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: 'COD_OTP_INVALID' });
  });
});
