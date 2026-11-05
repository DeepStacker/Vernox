/**
 * Shared fixtures for server (api/_lib) tests.
 */
import { checkoutRequestSchema, type CheckoutDeps, type CheckoutRequest } from '../../../api/_lib/checkout';
import type { PaymentGateway } from '../../../api/_lib/razorpay';
import { defaultStoreConfig } from '../../../api/_lib/storeConfig';
import { MemoryStore } from './memoryStore';

export const NOW = Date.parse('2026-11-05T10:00:00+05:30');

export const TEST_CONFIG = defaultStoreConfig({
  STORE_GST_RATE_PERCENT: '18',
  STORE_SHIPPING_FEE_INR: '40',
  STORE_FREE_SHIPPING_THRESHOLD_INR: '150',
} as NodeJS.ProcessEnv);

export const PRODUCT_FRAME = {
  id: 'p-01',
  name: 'Ember Round Frame',
  category: 'frames',
  price: 189,
  finishes: ['gold', 'brass', 'steel'],
  sizes: [
    { label: 'Small · 30cm', widthMm: 300, heightMm: 300, priceDelta: 0 },
    { label: 'Medium · 50cm', widthMm: 500, heightMm: 500, priceDelta: 80 },
  ],
  stock: 10,
  trackInventory: true,
};

export const PRODUCT_CHEAP = {
  id: 'p-11',
  name: 'Triad',
  category: 'geometric',
  price: 89,
  finishes: ['steel'],
  sizes: [],
  stock: 5,
  trackInventory: true,
};

export class FakeGateway implements PaymentGateway {
  calls: Array<{ amountPaise: number; receipt: string; notes: Record<string, string> }> = [];
  failWith: Error | null = null;

  async createOrder(params: Parameters<PaymentGateway['createOrder']>[0]) {
    this.calls.push({ amountPaise: params.amountPaise, receipt: params.receipt, notes: params.notes });
    if (this.failWith) throw this.failWith;
    return { id: `order_rzp${String(this.calls.length).padStart(6, '0')}`, amount: params.amountPaise, currency: 'INR' };
  }
}

export function seededStore(): MemoryStore {
  const store = new MemoryStore();
  store.seed('products/p-01', PRODUCT_FRAME);
  store.seed('products/p-11', PRODUCT_CHEAP);
  return store;
}

export function deps(store: MemoryStore, gateway = new FakeGateway()): CheckoutDeps & { gateway: FakeGateway } {
  return { store, gateway, razorpayKeyId: 'rzp_test_key', config: TEST_CONFIG, now: () => NOW };
}

export function checkoutRequest(overrides: Record<string, unknown> = {}): CheckoutRequest {
  return checkoutRequestSchema.parse({
    items: [{ productId: 'p-01', sizeLabel: 'Medium · 50cm', finish: 'brass', quantity: 2 }],
    idempotencyKey: 'idem-key-0001',
    customer: {
      email: 'Asha@Example.com',
      name: 'Asha Rao',
      phone: '+91 98765 43210',
      address: '12 MG Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
      country: 'India',
    },
    ...overrides,
  });
}
