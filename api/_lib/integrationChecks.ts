/**
 * "Check" buttons in Settings > Integrations: a harmless read-only call to each provider with the keys currently in
 * effect (environment or stored), so the owner learns at once whether a key works instead of at the first order.
 * Only the outcome is returned; provider responses and key values are never echoed.
 */
import type { FetchLike } from './notifications/channels';

export type IntegrationCheckId = 'razorpay' | 'resend' | 'shiprocket' | 'whatsapp';
export interface IntegrationCheckResult {
  ok: boolean;
  message: string;
}

const TIMEOUT_MS = 10_000;

async function call(fetchImpl: FetchLike, url: string, init: { method?: string; headers?: Record<string, string>; body?: string }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body, signal: controller.signal } as Parameters<FetchLike>[1]);
    return { status: res.status, body: await res.text().catch(() => '') };
  } finally {
    clearTimeout(timer);
  }
}

const missing = (what: string): IntegrationCheckResult => ({ ok: false, message: `Enter the ${what} first.` });
const unreachable = (provider: string): IntegrationCheckResult => ({ ok: false, message: `Could not reach ${provider}. Check the server's internet access and try again.` });

export async function checkIntegration(id: IntegrationCheckId, env: NodeJS.ProcessEnv, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<IntegrationCheckResult> {
  try {
    switch (id) {
      case 'razorpay': {
        const keyId = env.RAZORPAY_KEY_ID?.trim();
        const secret = env.RAZORPAY_KEY_SECRET?.trim();
        if (!keyId || !secret) return missing('Razorpay key id and secret');
        const { status } = await call(fetchImpl, 'https://api.razorpay.com/v1/orders?count=1', {
          headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}` },
        });
        if (status === 200) return { ok: true, message: `Razorpay accepted the keys (${keyId.startsWith('rzp_live_') ? 'live mode' : 'test mode: no real money is taken'}).` };
        if (status === 401) return { ok: false, message: 'Razorpay rejected the key id or secret. Copy them again from the Razorpay Dashboard.' };
        return { ok: false, message: `Razorpay answered ${status}. Try again in a minute.` };
      }
      case 'resend': {
        const key = env.RESEND_API_KEY?.trim();
        const from = env.NOTIFY_FROM_EMAIL?.trim();
        if (!key) return missing('Resend API key');
        const { status, body } = await call(fetchImpl, 'https://api.resend.com/domains', { headers: { Authorization: `Bearer ${key}` } });
        if (status === 401 || status === 403) return { ok: false, message: 'Resend rejected the API key (it needs "Full access" to be checked, or create a new key).' };
        if (status !== 200) return { ok: false, message: `Resend answered ${status}. Try again in a minute.` };
        if (!from) return { ok: false, message: 'The API key works. Now enter the "Send emails from" address.' };
        const domain = from.replace(/.*<|>.*/g, '').split('@')[1]?.toLowerCase();
        let domains: Array<{ name?: string; status?: string }> = [];
        try {
          domains = (JSON.parse(body) as { data?: typeof domains }).data ?? [];
        } catch {
          domains = [];
        }
        const match = domains.find(d => d.name?.toLowerCase() === domain);
        if (!match) return { ok: false, message: `The key works, but ${domain} is not a domain in your Resend account. Add and verify it in Resend > Domains.` };
        if (match.status !== 'verified') return { ok: false, message: `The key works, but ${domain} is ${match.status ?? 'not verified'} in Resend. Finish the DNS records there.` };
        return { ok: true, message: `Resend accepted the key and ${domain} is verified.` };
      }
      case 'shiprocket': {
        const email = env.SHIPROCKET_EMAIL?.trim();
        const password = env.SHIPROCKET_PASSWORD?.trim();
        if (!email || !password) return missing('Shiprocket API user email and password');
        const { status } = await call(fetchImpl, 'https://apiv2.shiprocket.in/v1/external/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (status === 200) return { ok: true, message: env.SHIPROCKET_PICKUP_LOCATION?.trim() ? 'Shiprocket accepted the API user.' : 'Shiprocket accepted the API user. Now enter the pickup location name.' };
        if (status === 400 || status === 401 || status === 403) return { ok: false, message: 'Shiprocket rejected the email or password. Use an API user (Settings > API), not your login.' };
        return { ok: false, message: `Shiprocket answered ${status}. Try again in a minute.` };
      }
      case 'whatsapp': {
        const token = env.WHATSAPP_ACCESS_TOKEN?.trim();
        const phoneId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
        if (!token || !phoneId) return missing('WhatsApp access token and phone number id');
        const version = env.WHATSAPP_GRAPH_VERSION?.trim() || 'v27.0';
        const { status } = await call(fetchImpl, `https://graph.facebook.com/${version}/${encodeURIComponent(phoneId)}?fields=display_phone_number`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (status === 200) return { ok: true, message: 'Meta accepted the token and the phone number id.' };
        if (status === 401) return { ok: false, message: 'Meta rejected the access token. Generate a permanent system-user token.' };
        return { ok: false, message: `Meta answered ${status}: check the phone number id and the token's WhatsApp permissions.` };
      }
    }
  } catch {
    return unreachable(id === 'whatsapp' ? 'Meta' : id[0].toUpperCase() + id.slice(1));
  }
}
