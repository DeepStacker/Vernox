// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkIntegration } from '../../api/_lib/integrationChecks';
import {
  applyStoredIntegrations, decryptValue, encryptValue, INTEGRATION_SECRETS_PATH, listIntegrations, resetIntegrationCache, saveIntegrations,
} from '../../api/_lib/integrationSecrets';
import { roleHasPermission } from '../types/admin';
import { MemoryStore } from './support/memoryStore';
import { scriptedFetch } from './support/serverFixtures';

const KEY = '0'.repeat(64);
let store: MemoryStore;

beforeEach(() => {
  process.env.SECRETS_ENCRYPTION_KEY = KEY;
  store = new MemoryStore();
  resetIntegrationCache();
});
afterEach(() => {
  resetIntegrationCache();
  delete process.env.SECRETS_ENCRYPTION_KEY;
});

describe('integration keys stored in the app', () => {
  it('encrypts with AES-256-GCM and detects tampering', () => {
    const key = Buffer.from(KEY, 'hex');
    const sealed = encryptValue('rzp_secret_value', key);
    expect(sealed.data).not.toContain('rzp_secret_value');
    expect(decryptValue(sealed, key)).toBe('rzp_secret_value');
    expect(() => decryptValue({ ...sealed, data: Buffer.from('tampered').toString('base64') }, key)).toThrow();
  });

  it('saves without storing plaintext, applies to process.env, and lists only previews', async () => {
    await saveIntegrations(store, { RAZORPAY_KEY_ID: 'rzp_test_ABC123xyz', RAZORPAY_KEY_SECRET: 'super-secret-9876' }, 'owner@vernox.in', 1000);
    const raw = JSON.stringify(store.read(INTEGRATION_SECRETS_PATH));
    expect(raw).not.toContain('super-secret-9876');
    expect(raw).not.toContain('rzp_test_ABC123xyz');
    expect(process.env.RAZORPAY_KEY_SECRET).toBe('super-secret-9876');
    const list = await listIntegrations(store);
    const secret = list.find(f => f.name === 'RAZORPAY_KEY_SECRET')!;
    expect(secret).toMatchObject({ source: 'app', preview: '••••9876', secret: true });
    expect(JSON.stringify(list)).not.toContain('super-secret-9876');
    expect(list.find(f => f.name === 'RAZORPAY_KEY_ID')!.preview).toBe('rzp_test_ABC123xyz');
    expect(list.find(f => f.name === 'RESEND_API_KEY')!.source).toBeNull();
  });

  it('removing a key stops applying it', async () => {
    await saveIntegrations(store, { RESEND_API_KEY: 're_abcdef' }, 'o', 1000);
    expect(process.env.RESEND_API_KEY).toBe('re_abcdef');
    await saveIntegrations(store, { RESEND_API_KEY: null }, 'o', 2000);
    expect(process.env.RESEND_API_KEY).toBeUndefined();
  });

  it('a fresh instance loads stored keys (cached), and a changed encryption key makes them unreadable, not wrong', async () => {
    await saveIntegrations(store, { RESEND_API_KEY: 're_abcdef' }, 'o', 1000);
    resetIntegrationCache();
    expect(process.env.RESEND_API_KEY).toBeUndefined();
    await applyStoredIntegrations(store, 5000);
    expect(process.env.RESEND_API_KEY).toBe('re_abcdef');
    resetIntegrationCache();
    process.env.SECRETS_ENCRYPTION_KEY = '1'.repeat(64);
    await applyStoredIntegrations(store, 9000);
    expect(process.env.RESEND_API_KEY).toBeUndefined();
    expect((await listIntegrations(store)).find(f => f.name === 'RESEND_API_KEY')).toMatchObject({ source: 'app', unreadable: true, preview: null });
  });

  it('refuses unknown names, bad formats and empty values', async () => {
    await expect(saveIntegrations(store, { FIREBASE_SERVICE_ACCOUNT_BASE64: 'x' }, 'o')).rejects.toThrow(/cannot be set here/);
    await expect(saveIntegrations(store, { RAZORPAY_KEY_ID: 'pk_live_123' }, 'o')).rejects.toThrow(/rzp_live_/);
    await expect(saveIntegrations(store, { MSG91_TEMPLATES: '[1,2]' }, 'o')).rejects.toThrow(/JSON object/);
    await expect(saveIntegrations(store, { RESEND_API_KEY: '   ' }, 'o')).rejects.toThrow(/enter a value/);
    expect(store.read(INTEGRATION_SECRETS_PATH)).toBeUndefined();
  });

  it('only the super admin may manage integrations', () => {
    expect(roleHasPermission('super_admin', 'integrations.manage')).toBe(true);
    for (const role of ['admin', 'order_manager', 'finance', 'support', 'production', 'shipping', 'catalog_manager', 'designer']) {
      expect(roleHasPermission(role, 'integrations.manage')).toBe(false);
    }
  });
});

describe('provider checks', () => {
  it('Razorpay: accepted, rejected, missing', async () => {
    const ok = scriptedFetch([{ match: /razorpay/, body: { items: [] } }]);
    expect(await checkIntegration('razorpay', { RAZORPAY_KEY_ID: 'rzp_live_x', RAZORPAY_KEY_SECRET: 's' } as NodeJS.ProcessEnv, ok.impl)).toMatchObject({ ok: true, message: expect.stringContaining('live mode') });
    expect(ok.calls[0].init.headers.Authorization).toMatch(/^Basic /);
    const bad = scriptedFetch([{ match: /razorpay/, status: 401, body: {} }]);
    expect((await checkIntegration('razorpay', { RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 's' } as NodeJS.ProcessEnv, bad.impl)).ok).toBe(false);
    expect((await checkIntegration('razorpay', {} as NodeJS.ProcessEnv)).message).toMatch(/Enter the Razorpay/);
  });

  it('Resend: verified sending domain required', async () => {
    const env = { RESEND_API_KEY: 're_x', NOTIFY_FROM_EMAIL: 'Vernox <orders@vernox.in>' } as NodeJS.ProcessEnv;
    const verified = scriptedFetch([{ match: /resend/, body: { data: [{ name: 'vernox.in', status: 'verified' }] } }]);
    expect((await checkIntegration('resend', env, verified.impl)).ok).toBe(true);
    const pending = scriptedFetch([{ match: /resend/, body: { data: [{ name: 'vernox.in', status: 'pending' }] } }]);
    expect(await checkIntegration('resend', env, pending.impl)).toMatchObject({ ok: false, message: expect.stringContaining('pending') });
    const other = scriptedFetch([{ match: /resend/, body: { data: [] } }]);
    expect((await checkIntegration('resend', env, other.impl)).message).toMatch(/not a domain/);
  });

  it('reports an unreachable provider without throwing', async () => {
    const down = (async () => { throw new Error('ECONNREFUSED'); }) as never;
    expect(await checkIntegration('shiprocket', { SHIPROCKET_EMAIL: 'a@b.in', SHIPROCKET_PASSWORD: 'p' } as NodeJS.ProcessEnv, down)).toMatchObject({ ok: false, message: expect.stringContaining('Could not reach') });
  });
});
