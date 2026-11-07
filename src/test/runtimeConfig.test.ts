// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildRuntimeConfig, runtimeConfigScript } from '../../api/_lib/runtimeConfig';
import { razorpayKeyId } from '../lib/emi/affordability';

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

describe('runtime config (public values served to the browser)', () => {
  it('prefers FIREBASE_WEB_* over VITE_FIREBASE_* and derives auth domain and bucket from the project', () => {
    const cfg = buildRuntimeConfig(env({ FIREBASE_WEB_API_KEY: 'k1', VITE_FIREBASE_API_KEY: 'k2', FIREBASE_WEB_PROJECT_ID: 'shop', FIREBASE_WEB_APP_ID: 'app' }));
    expect(cfg.firebase).toMatchObject({ apiKey: 'k1', projectId: 'shop', authDomain: 'shop.firebaseapp.com', storageBucket: 'shop.firebasestorage.app', appId: 'app' });
  });

  it('takes the Razorpay key id and site URL from the server environment, trimming the trailing slash', () => {
    const cfg = buildRuntimeConfig(env({ RAZORPAY_KEY_ID: ' rzp_live_x ', VITE_SITE_URL: 'https://shop.example.in/' }));
    expect(cfg).toMatchObject({ razorpayKeyId: 'rzp_live_x', siteUrl: 'https://shop.example.in' });
  });

  it('never includes a secret, whatever the environment holds', () => {
    const script = runtimeConfigScript(env({
      RAZORPAY_KEY_ID: 'rzp_live_x', RAZORPAY_KEY_SECRET: 'sek-1', RAZORPAY_WEBHOOK_SECRET: 'sek-2', CRON_SECRET: 'sek-3',
      SECRETS_ENCRYPTION_KEY: 'sek-4', FIREBASE_SERVICE_ACCOUNT_BASE64: 'sek-5', RESEND_API_KEY: 'sek-6',
    }));
    for (const secret of ['sek-1', 'sek-2', 'sek-3', 'sek-4', 'sek-5', 'sek-6']) expect(script).not.toContain(secret);
    expect(script.startsWith('window.__VERNOX_CONFIG__=')).toBe(true);
  });

  it('escapes < so a value cannot break out of a script element', () => {
    expect(runtimeConfigScript(env({ VITE_SITE_URL: 'https://a.in/</script>' }))).not.toContain('</script>');
  });

  it('the EMI widget prefers the runtime key id over the build-time one and falls back to it', () => {
    expect(razorpayKeyId({ VITE_RAZORPAY_KEY_ID: 'rzp_test_build' }, { razorpayKeyId: 'rzp_live_run' })).toBe('rzp_live_run');
    expect(razorpayKeyId({ VITE_RAZORPAY_KEY_ID: 'rzp_test_build' }, {})).toBe('rzp_test_build');
    expect(razorpayKeyId({}, { razorpayKeyId: '  ' })).toBeNull();
  });
});
