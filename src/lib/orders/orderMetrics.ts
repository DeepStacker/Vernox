/** Real order metrics for the admin overview. Derived only from loaded orders; nothing is estimated. */
import type { Order } from '@/types/store';
import { ORDER_STATUSES, isRevenueStatus, type OrderStatus } from './orderStateMachine';

const DAY_MS = 24 * 3600 * 1000;

export interface TopProduct {
  productId: string;
  name: string;
  units: number;
  revenue: number;
}

export interface OrderMetrics {
  /** Orders that represent retained revenue (paid and not cancelled/refunded). */
  paidOrderCount: number;
  revenue: number;
  averageOrderValue: number;
  /** Every order in range per status; zero-count statuses are omitted. */
  funnel: Array<{ status: OrderStatus; count: number }>;
  topProducts: TopProduct[];
  revenueByDay: Array<{ day: string; revenue: number; orders: number }>;
}

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function computeOrderMetrics(orders: readonly Order[], from: number, to: number, topN = 5): OrderMetrics {
  const inRange = orders.filter(o => o.placedAt >= from && o.placedAt <= to);
  const paid = inRange.filter(o => isRevenueStatus(o.status));
  const revenue = paid.reduce((s, o) => s + o.total, 0);

  const counts = new Map<OrderStatus, number>();
  inRange.forEach(o => counts.set(o.status, (counts.get(o.status) ?? 0) + 1));
  const funnel = ORDER_STATUSES.filter(s => counts.has(s)).map(status => ({ status, count: counts.get(status) as number }));

  const products = new Map<string, TopProduct>();
  paid.forEach(o => o.items.forEach(i => {
    const key = i.productId || i.productName;
    const cur = products.get(key) ?? { productId: i.productId, name: i.productName, units: 0, revenue: 0 };
    cur.units += i.quantity;
    cur.revenue += i.lineTotal;
    products.set(key, cur);
  }));

  const byDay = new Map<string, { revenue: number; orders: number }>();
  for (let t = from; t <= to; t += DAY_MS) byDay.set(dayKey(t), { revenue: 0, orders: 0 });
  paid.forEach(o => {
    const cur = byDay.get(dayKey(o.placedAt));
    if (cur) { cur.revenue += o.total; cur.orders += 1; }
  });

  return {
    paidOrderCount: paid.length,
    revenue,
    averageOrderValue: paid.length ? revenue / paid.length : 0,
    funnel,
    topProducts: [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, topN),
    revenueByDay: [...byDay.entries()].map(([day, v]) => ({ day, ...v })),
  };
}
