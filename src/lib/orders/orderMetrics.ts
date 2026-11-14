/** Real order metrics for the admin overview. Derived only from loaded orders; nothing is estimated. */
import type { Order } from '@/types/store';
import { ORDER_STATUSES, isRevenueStatus, type OrderStatus } from './orderStateMachine';
import { istDate, rupees, totalPaise } from './finance';

const DAY_MS = 24 * 3600 * 1000;
const IST_OFFSET_MS = 5.5 * 3600_000;

export interface TopProduct {
  productId: string;
  name: string;
  units: number;
  revenue: number;
}

export interface OrderMetrics {
  /** Orders that represent retained revenue (paid and not cancelled/returned/refunded). */
  paidOrderCount: number;
  /** Rupees for display; summed in paise (order total minus refunds) so rounding never drifts. */
  revenue: number;
  averageOrderValue: number;
  /** Every order in range per status; zero-count statuses are omitted. */
  funnel: Array<{ status: OrderStatus; count: number }>;
  topProducts: TopProduct[];
  /** One entry per IST calendar day in range, so a day's bucket matches the finance exports. */
  revenueByDay: Array<{ day: string; revenue: number; orders: number }>;
}

/** Revenue an order retains: its total less what was refunded (a partial refund keeps the rest). */
const retainedPaise = (o: Order): number => Math.max(0, totalPaise(o) - (o.ops?.refundedPaise ?? 0));

/** Paid statuses whose goods came back: not retained revenue even before a refund is recorded. */
const RETURNED_STATUSES: readonly OrderStatus[] = ['Return_Approved', 'Returned'];

export function computeOrderMetrics(orders: readonly Order[], from: number, to: number, topN = 5): OrderMetrics {
  const inRange = orders.filter(o => o.placedAt >= from && o.placedAt <= to);
  const paid = inRange.filter(o => isRevenueStatus(o.status) && !RETURNED_STATUSES.includes(o.status));
  const revenuePaise = paid.reduce((s, o) => s + retainedPaise(o), 0);

  const counts = new Map<OrderStatus, number>();
  inRange.forEach(o => counts.set(o.status, (counts.get(o.status) ?? 0) + 1));
  const funnel = ORDER_STATUSES.filter(s => counts.has(s)).map(status => ({ status, count: counts.get(status) as number }));

  // Line totals exist only as rupee display copies, so each line is scaled by the share of the order total
  // that was retained: refunds reduce product revenue too.
  const products = new Map<string, TopProduct>();
  paid.forEach(o => {
    const share = totalPaise(o) > 0 ? retainedPaise(o) / totalPaise(o) : 1;
    o.items.forEach(i => {
      const key = i.productId || i.productName;
      const cur = products.get(key) ?? { productId: i.productId, name: i.productName, units: 0, revenue: 0 };
      cur.units += i.quantity;
      cur.revenue += Math.round(i.lineTotal * 100 * share) / 100;
      products.set(key, cur);
    });
  });

  // Walk whole IST days from the day containing `from`; an unaligned `from` must not skip or shift a bucket.
  const byDay = new Map<string, { revenuePaise: number; orders: number }>();
  const firstDay = Math.floor((from + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
  for (let t = firstDay; t <= to; t += DAY_MS) byDay.set(istDate(t), { revenuePaise: 0, orders: 0 });
  paid.forEach(o => {
    const cur = byDay.get(istDate(o.placedAt));
    if (cur) { cur.revenuePaise += retainedPaise(o); cur.orders += 1; }
  });

  return {
    paidOrderCount: paid.length,
    revenue: rupees(revenuePaise),
    averageOrderValue: paid.length ? rupees(revenuePaise) / paid.length : 0,
    funnel,
    topProducts: [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, topN),
    revenueByDay: [...byDay.entries()].map(([day, v]) => ({ day, revenue: rupees(v.revenuePaise), orders: v.orders })),
  };
}
