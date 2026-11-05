import { describe, expect, it } from 'vitest';
import type { Order } from '@/types/store';
import type { OrderStatus } from '../orderStateMachine';
import { computeOrderMetrics } from '../orderMetrics';

const DAY = 24 * 3600 * 1000;
const NOW = Date.UTC(2026, 10, 10, 12);
const o = (id: string, status: OrderStatus, total: number, ageDays: number, productId = 'p1', qty = 1): Order => ({
  id, email: 'a@b.in', status, placedAt: NOW - ageDays * DAY, subtotal: total, discountTotal: 0, shippingTotal: 0, taxTotal: 0, total, statusHistory: [],
  items: [{ id: id + 'i', productId, productName: productId, productSlug: '', shapeId: '', sizeLabel: '', widthMm: 0, heightMm: 0, finish: '', unitPrice: total, quantity: qty, lineTotal: total }],
});

describe('order metrics', () => {
  const orders = [
    o('a', 'Delivered', 1000, 1), o('b', 'Cutting', 3000, 2, 'p2', 2), o('c', 'Cancelled', 5000, 2), o('d', 'Pending_Payment', 700, 1), o('e', 'Paid', 2000, 40),
  ];

  it('counts revenue only from paid, retained orders in range', () => {
    const m = computeOrderMetrics(orders, NOW - 7 * DAY, NOW);
    expect(m.paidOrderCount).toBe(2);
    expect(m.revenue).toBe(4000);
    expect(m.averageOrderValue).toBe(2000);
  });

  it('builds the status funnel from every order in range', () => {
    const m = computeOrderMetrics(orders, NOW - 7 * DAY, NOW);
    expect(Object.fromEntries(m.funnel.map(f => [f.status, f.count]))).toEqual({ Pending_Payment: 1, Cutting: 1, Delivered: 1, Cancelled: 1 });
  });

  it('ranks top products by revenue with units', () => {
    const m = computeOrderMetrics(orders, NOW - 7 * DAY, NOW);
    expect(m.topProducts[0]).toMatchObject({ productId: 'p2', units: 2, revenue: 3000 });
  });

  it('returns zeros, not estimates, for an empty range', () => {
    const m = computeOrderMetrics([], NOW - 7 * DAY, NOW);
    expect(m).toMatchObject({ paidOrderCount: 0, revenue: 0, averageOrderValue: 0, funnel: [], topProducts: [] });
    expect(m.revenueByDay.length).toBeGreaterThanOrEqual(7);
  });

  it('buckets revenue by day', () => {
    const m = computeOrderMetrics(orders, NOW - 7 * DAY, NOW);
    expect(m.revenueByDay.reduce((s, d) => s + d.revenue, 0)).toBe(4000);
  });
});
