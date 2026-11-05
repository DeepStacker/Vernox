import { describe, expect, it, vi } from 'vitest';
import type { Order } from '@/types/store';

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null }, db: {}, app: {} }));

const { parsePublicOrder, normalizeOrder } = await import('../orders');
const { toPublicSummary } = await import('../orderLookup');

const apiOrder = {
  orderId: 'o1', orderNumber: 'VX-1', status: 'Delivered', placedAt: 1000, currency: 'INR',
  pricing: { total: 590, codFee: 49 }, items: [{ productId: 'p1', name: 'Disc', quantity: 1, lineTotal: 541 }],
  timeline: [{ status: 'Paid', at: 1 }], paymentMethod: 'cod', invoiceNumber: 'VX/26-27/000001', canCancel: false,
  returnEligibleUntil: 99, tracking: { carrier: 'DTDC', trackingNumber: 'AB123', url: 'https://t.example/AB123' }, shipTo: { city: 'Pune' },
};

describe('customer order summary', () => {
  it('maps the Phase 2 API fields', () => {
    expect(parsePublicOrder(apiOrder)).toMatchObject({
      orderId: 'o1', total: 590, paymentMethod: 'cod', codFee: 49, invoiceNumber: 'VX/26-27/000001', canCancel: false,
      returnEligibleUntil: 99, shippingCity: 'Pune',
    });
  });

  it('defaults safely when the API omits the Phase 2 fields', () => {
    expect(parsePublicOrder({ orderId: 'o2', status: 'Paid' })).toMatchObject({
      paymentMethod: 'prepaid', invoiceNumber: null, canCancel: false, returnEligibleUntil: null, codFee: 0,
    });
  });

  it('gives a Firestore-loaded order the same fields', () => {
    const order: Order = normalizeOrder('o3', {
      status: 'Confirmed_COD', orderNumber: 'VX-3', email: 'a@b.in', placedAt: 5, paymentMethod: 'cod', amounts: { codFeePaise: 4900, totalPaise: 59000 },
      invoiceNumber: 'VX/26-27/000002', deliveredAt: 1000, pricing: { total: 590 },
    });
    const summary = toPublicSummary(order);
    expect(summary).toMatchObject({ paymentMethod: 'cod', codFee: 49, invoiceNumber: 'VX/26-27/000002', canCancel: true, returnEligibleUntil: null });
    expect(Object.keys(summary).sort()).toEqual(Object.keys(parsePublicOrder(apiOrder)).sort());
  });

  it('computes the return deadline from delivery only when the window is supplied', () => {
    const order = normalizeOrder('o4', { status: 'Delivered', email: 'a@b.in', placedAt: 5, deliveredAt: 1_000_000, pricing: { total: 1 } });
    expect(toPublicSummary(order, 7).returnEligibleUntil).toBe(1_000_000 + 7 * 24 * 3600_000);
    expect(toPublicSummary(order).returnEligibleUntil).toBeNull();
  });
});
