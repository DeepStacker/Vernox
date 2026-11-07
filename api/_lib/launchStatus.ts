/**
 * Launch setup (admin action GET_LAUNCH_STATUS, permission settings.write): which owner-provided integrations
 * and data are in place, so the owner can fill them in at any time and see what each one switches on.
 *
 * Only presence is reported, never a value: the response says "set" or "missing" and names the variable, so no
 * secret can leak through it. Business details (seller, contacts, grievance officer) are checked in the browser
 * from settings/store (src/pages/admin/settings/settingsForm.ts `launchChecklist`); this covers what the browser
 * cannot see: server environment variables and the catalogue.
 */
import type { DocStore } from './store';

export type LaunchGroup = 'payments' | 'shipping' | 'messages' | 'platform' | 'catalogue';

export interface LaunchItem {
  id: string;
  group: LaunchGroup;
  label: string;
  ready: boolean;
  /** Required to take real orders; optional items only switch extra features on. */
  required: boolean;
  /** What it switches on, and where to set it. */
  help: string;
  /** Non-secret detail, e.g. Razorpay test or live mode. */
  detail?: string;
}

const set = (env: NodeJS.ProcessEnv, ...names: string[]) => names.every(n => Boolean(env[n]?.trim()));

function msg91TemplatesSet(raw: string | undefined): boolean {
  try {
    const parsed = JSON.parse(raw ?? '');
    return Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0;
  } catch {
    return false;
  }
}

export function environmentItems(env: NodeJS.ProcessEnv = process.env): LaunchItem[] {
  const keyId = env.RAZORPAY_KEY_ID?.trim() ?? '';
  const site = env.VITE_SITE_URL?.trim() ?? '';
  const vercel = 'Vercel > Project > Settings > Environment Variables, then redeploy';
  return [
    {
      id: 'razorpay', group: 'payments', required: true,
      label: 'Razorpay API keys',
      ready: set(env, 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'VITE_RAZORPAY_KEY_ID'),
      detail: keyId.startsWith('rzp_live_') ? 'live mode' : keyId.startsWith('rzp_test_') ? 'test mode: no real money is taken' : undefined,
      help: `Online payments, refunds and payment links. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and VITE_RAZORPAY_KEY_ID (the same key id) in ${vercel}.`,
    },
    {
      id: 'razorpay-webhook', group: 'payments', required: true,
      label: 'Razorpay webhook secret',
      ready: set(env, 'RAZORPAY_WEBHOOK_SECRET'),
      help: 'Confirms payments even if the customer closes the page, records refunds, and confirms payment-link orders. Razorpay Dashboard > Webhooks: URL https://<your domain>/api/razorpay-webhook with events payment.captured, order.paid, payment.failed, refund.processed, payment_link.paid; put the secret in RAZORPAY_WEBHOOK_SECRET.',
    },
    {
      id: 'shiprocket', group: 'shipping', required: false,
      label: 'Shiprocket account',
      ready: set(env, 'SHIPROCKET_EMAIL', 'SHIPROCKET_PASSWORD', 'SHIPROCKET_PICKUP_LOCATION'),
      help: `Courier rates, booking, labels, manifests and PIN serviceability. Without it shipping is manual (enter the courier and AWB). Set SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD (an API user), SHIPROCKET_PICKUP_LOCATION and SHIPROCKET_PICKUP_PINCODE in ${vercel}.`,
    },
    {
      id: 'shiprocket-webhook', group: 'shipping', required: false,
      label: 'Shiprocket tracking webhook',
      ready: set(env, 'SHIPROCKET_WEBHOOK_TOKEN'),
      help: 'Moves orders to Shipped, Out for delivery, Delivered and RTO by themselves. Shiprocket > Settings > API > Webhooks: URL https://<your domain>/api/courier-webhook with a token; put the token in SHIPROCKET_WEBHOOK_TOKEN.',
    },
    {
      id: 'email', group: 'messages', required: true,
      label: 'Order emails (Resend)',
      ready: set(env, 'RESEND_API_KEY', 'NOTIFY_FROM_EMAIL'),
      help: `Order confirmations, shipping updates, ticket replies and staff alerts by email. Verify your domain in Resend, then set RESEND_API_KEY and NOTIFY_FROM_EMAIL (e.g. Vernox <orders@yourdomain.in>) in ${vercel}.`,
    },
    {
      id: 'sms', group: 'messages', required: false,
      label: 'Order SMS (MSG91)',
      ready: set(env, 'MSG91_AUTH_KEY') && msg91TemplatesSet(env.MSG91_TEMPLATES),
      help: `SMS updates. Indian SMS needs DLT-registered templates: register them, create MSG91 Flows, then set MSG91_AUTH_KEY and MSG91_TEMPLATES (JSON of event to template id, see .env.example) in ${vercel}.`,
    },
    {
      id: 'cron', group: 'platform', required: true,
      label: 'Scheduled jobs secret',
      ready: set(env, 'CRON_SECRET'),
      help: `Releases unpaid stock holds and sends queued emails and SMS every few minutes (Vercel Cron, Pro plan). Set CRON_SECRET to a long random value in ${vercel}.`,
    },
    {
      id: 'site-url', group: 'platform', required: true,
      label: 'Public site address',
      ready: /^https:\/\//.test(site) && !/localhost|127\.0\.0\.1/.test(site),
      detail: site || undefined,
      help: `Links in emails, the sitemap and link previews. Set VITE_SITE_URL to https://<your domain> in ${vercel}.`,
    },
    {
      id: 'firebase-admin', group: 'platform', required: true,
      label: 'Firebase server credentials',
      ready: set(env, 'FIREBASE_SERVICE_ACCOUNT_BASE64') || set(env, 'GOOGLE_APPLICATION_CREDENTIALS') || set(env, 'FIRESTORE_EMULATOR_HOST'),
      help: `The API reads and writes the database with a service account. Firebase console > Project settings > Service accounts > Generate key; base64-encode the JSON into FIREBASE_SERVICE_ACCOUNT_BASE64 in ${vercel}.`,
    },
  ];
}

export async function launchStatus(store: DocStore, env: NodeJS.ProcessEnv = process.env): Promise<LaunchItem[]> {
  const [samples, designers] = await Promise.all([
    store.query('products', { where: [{ field: 'isSample', op: '==', value: true }], limit: 500 }),
    store.query('staff', { where: [{ field: 'role', op: '==', value: 'designer' }], limit: 1 }),
  ]);
  return [
    ...environmentItems(env),
    {
      id: 'catalogue', group: 'catalogue', required: true,
      label: 'Real catalogue',
      ready: samples.length === 0,
      detail: samples.length ? `${samples.length} sample piece${samples.length === 1 ? '' : 's'} left` : undefined,
      help: 'Replace the sample pieces with your products, photos and prices (Products), or delete them. Sample pieces are marked in the product list.',
    },
    {
      id: 'designer', group: 'catalogue', required: false,
      label: 'A designer for paid consultations',
      ready: designers.length > 0,
      help: 'Paid design consultations stay off until a team member has the designer role (Team), then switch them on in Settings.',
    },
  ];
}
