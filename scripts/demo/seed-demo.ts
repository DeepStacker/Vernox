/**
 * Demo data for `npm run demo` (scripts/demo/run.mjs): one login per staff role plus a customer (scripts/demo/accounts.json),
 * and orders at every workshop stage, a support ticket and a trade enquiry, all created through the running API exactly as
 * the screens do. Runs only against the Firebase emulators with a `demo-` project, so it can never touch real data.
 *
 *   npx tsx scripts/demo/seed-demo.ts    (env from run.mjs: FIREBASE_AUTH_EMULATOR_HOST, FIRESTORE_EMULATOR_HOST, FIREBASE_PROJECT_ID, DEMO_SITE)
 */
import { readFileSync } from 'node:fs';
import { getAdminAuth, getDb } from '../../api/_lib/firebaseAdmin';
import { TICKET_TOPICS } from '../../api/_lib/tickets';
import { TRADE_FINISH_IDS, TRADE_PROJECT_TYPE_IDS, TRADE_TIMELINES, TRADE_VOLUMES } from '../../src/types/trade';
import type { StaffMember } from '../../src/types/admin';

interface Account { email: string; name: string; role: StaffMember['role'] | null }
const { password, accounts } = JSON.parse(readFileSync(new URL('./accounts.json', import.meta.url), 'utf8')) as { password: string; accounts: Account[] };

const SITE = process.env.DEMO_SITE ?? 'http://localhost:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT = process.env.FIREBASE_PROJECT_ID ?? '';

function guard() {
  if (!AUTH_HOST || !process.env.FIRESTORE_EMULATOR_HOST || !PROJECT.startsWith('demo-')) {
    console.error('seed-demo runs only against the Firebase emulators with a demo- project (use `npm run demo`).');
    process.exit(1);
  }
}

async function createAccounts() {
  const auth = getAdminAuth();
  const db = getDb();
  for (const a of accounts) {
    const existing = await auth.getUserByEmail(a.email).catch(() => null);
    const user = existing ?? await auth.createUser({ email: a.email, password, displayName: a.name, emailVerified: true });
    if (!a.role) continue;
    await auth.setCustomUserClaims(user.uid, { role: a.role });
    const member: StaffMember = { uid: user.uid, email: a.email, name: a.name, role: a.role, updatedAt: Date.now(), updatedBy: 'demo-seed' };
    await db.doc(`staff/${user.uid}`).set(member);
  }
}

/** A fresh ID token from the Auth emulator (carries the role claim set above). */
async function signIn(email: string): Promise<string> {
  const res = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await res.json() as { idToken?: string; error?: { message: string } };
  if (!body.idToken) throw new Error(`sign-in ${email}: ${body.error?.message ?? res.status}`);
  return body.idToken;
}

async function api(path: string, body: Record<string, unknown>, token?: string) {
  const res = await fetch(`${SITE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) throw new Error(`${path} ${String(body.action ?? '')}: ${res.status} ${String(json.message ?? '')}`);
  return json;
}

const admin = (token: string, action: string, params: Record<string, unknown>) => api('/api/admin', { action, ...params }, token);

/** Where each demo order ends up, so every console has something to show. */
const STAGES = [[], ['In_Design'], ['In_Design', 'Cutting'], ['In_Design', 'Cutting', 'Finishing', 'Quality_Check'], ['In_Design', 'Cutting', 'Finishing', 'Quality_Check', 'Packed'], ['In_Design', 'Cutting', 'Finishing', 'Quality_Check', 'Packed']] as const;

async function createOrders() {
  const catalog = await (await fetch(`${SITE}/api/catalog`)).json() as { products: Array<{ id: string; name: string; sizes?: Array<{ label: string }>; finishes?: string[] }> };
  const products = catalog.products.filter(p => p.sizes?.length && p.finishes?.length).slice(0, STAGES.length);
  const customer = accounts.find(a => !a.role)!;
  const customerToken = await signIn(customer.email);
  const ordersToken = await signIn('orders@demo.vernox.test');
  const workshopToken = await signIn('production@demo.vernox.test');
  const shippingToken = await signIn('shipping@demo.vernox.test');

  const address = { address: '12 MG Road, Indiranagar', city: 'Bengaluru', state: 'Karnataka', pincode: '560038', country: 'India' };
  for (const [i, product] of products.entries()) {
    const item = { productId: product.id, sizeLabel: product.sizes![0].label, finish: product.finishes![0], quantity: 1 + (i % 2) };
    // One mobile per order: the shop limits open COD orders per number and COD checkouts per email (3 an hour),
    // so the first orders are the customer's own COD checkouts and the rest are staff orders paid by UPI.
    const phone = `+91 98765 432${String(10 + i)}`;
    let intent: { orderId: string; orderNumber?: string };
    if (i < 3) {
      intent = await api('/api/checkout-intent', {
        items: [item], idempotencyKey: `demo-order-${i}-${product.id}`.slice(0, 120), paymentMethod: 'cod',
        customer: { email: customer.email, name: customer.name, phone, ...address },
      }, customerToken) as typeof intent;
      await admin(ordersToken, 'CONFIRM_COD_ORDER', { orderId: intent.orderId, note: 'Confirmed by phone (demo)' });
    } else {
      intent = await admin(ordersToken, 'CREATE_STAFF_ORDER', {
        channel: 'phone', items: [item], idempotencyKey: `demo-staff-${i}-${product.id}`.slice(0, 120),
        customer: { name: customer.name, email: customer.email, phone, ...address },
        payment: { method: 'offline', mode: 'upi', reference: `UPI-DEMO-${1000 + i}` },
      }) as typeof intent;
    }
    const orderId = intent.orderId;
    for (const status of STAGES[i]) {
      try {
        await admin(workshopToken, 'UPDATE_ORDER_STATUS', { orderId, status });
      } catch (err) {
        console.warn(`  order ${intent.orderNumber ?? orderId} stopped before ${status}: ${(err as Error).message}`);
        break;
      }
    }
    if (i === STAGES.length - 1) {
      try {
        await admin(shippingToken, 'CREATE_SHIPMENT', { orderId, manual: { courier: 'Delhivery', awb: `DEMO${Date.now().toString().slice(-8)}` } });
        await admin(shippingToken, 'UPDATE_DELIVERY_STATUS', { orderId, status: 'Delivered', note: 'Delivered (demo)' });
      } catch (err) {
        console.warn(`  shipping demo order ${intent.orderNumber ?? orderId}: ${(err as Error).message}`);
      }
    }
    console.log(`  ${intent.orderNumber ?? orderId}: ${product.name} → ${i === STAGES.length - 1 ? 'Delivered' : STAGES[i].at(-1) ?? 'Confirmed (COD)'}`);
  }

  await api('/api/engage', { action: 'CONTACT', name: customer.name, email: customer.email, topic: TICKET_TOPICS[0], message: 'Can I get the Om plate in a 60 cm size for my pooja room? (demo ticket)' });
  await api('/api/engage', {
    action: 'TRADE_ENQUIRY', name: 'Rahul Mehta', email: 'rahul@studio.example', company: 'Mehta Interiors', phone: '+91 99000 11122',
    projectType: TRADE_PROJECT_TYPE_IDS[0], volume: TRADE_VOLUMES[2], alloyPreference: TRADE_FINISH_IDS[0], timeline: TRADE_TIMELINES[1],
    notes: '30 brass door plates for an apartment block (demo enquiry).',
  });
}

async function main() {
  guard();
  console.log('Creating demo accounts…');
  await createAccounts();
  console.log('Creating demo orders, a support ticket and a trade enquiry through the API…');
  await createOrders();
  console.log('Demo data ready.');
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
