/**
 * Analytics: real order metrics only (orders, revenue from paid orders, AOV, status funnel, top
 * products). Nothing is estimated: no costs, margins or taxes beyond what orders record.
 * Metrics cover the orders loaded in the browser, and the screen says how far back that goes.
 */
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAdminData } from '@/lib/data/adminData';
import { computeOrderMetrics } from '@/lib/orders/orderMetrics';
import { ORDER_STATUS_LABELS } from '@/lib/orders/orderStateMachine';

const RANGES = [{ days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }] as const;
const DAY_MS = 24 * 3600 * 1000;

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 shadow-soft">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-3xl text-oxblood-deep">{value}</div>
    </div>
  );
}

export function MetricsDashboard() {
  const { orders, storeConfig, ordersLoading, ordersError, hasMoreOrders, loadMoreOrders, isLoadingMoreOrders } = useAdminData();
  const [days, setDays] = useState<number>(30);
  const currency = storeConfig.currency || '₹';
  const inr = (n: number) => `${currency}${Math.round(n).toLocaleString('en-IN')}`;

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` is recomputed only when the data or range changes
  const now = useMemo(() => Date.now(), [orders, days]);
  const from = now - days * DAY_MS;
  const metrics = useMemo(() => computeOrderMetrics(orders, from, now), [orders, from, now]);
  const oldestLoaded = orders.length ? Math.min(...orders.map(o => o.placedAt)) : null;
  const incomplete = hasMoreOrders && oldestLoaded !== null && oldestLoaded > from;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-3xl text-oxblood-deep">Analytics</h2>
          <p className="text-sm text-muted-foreground">Real orders only. Revenue counts paid orders that were not cancelled or fully refunded.</p>
        </div>
        <div className="flex gap-2" role="tablist" aria-label="Date range">
          {RANGES.map(r => (
            <button key={r.days} type="button" role="tab" aria-selected={days === r.days} onClick={() => setDays(r.days)}
              className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${days === r.days ? 'bg-oxblood text-ivory' : 'bg-muted/50 text-muted-foreground'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {ordersError && <p role="alert" className="text-sm text-[#9B1C2E]">Could not load orders: {ordersError.message}</p>}
      {incomplete && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#C6A15B]/40 bg-[#FFF8E6] p-3 text-sm text-[#8C6219]">
          Only orders since {new Date(oldestLoaded).toLocaleDateString('en-IN')} are loaded, so this range is incomplete.
          <button type="button" onClick={() => void loadMoreOrders()} disabled={isLoadingMoreOrders} className="min-h-11 rounded-lg border border-[#C6A15B]/50 px-3 font-semibold">
            {isLoadingMoreOrders ? 'Loading…' : 'Load older orders'}
          </button>
        </div>
      )}

      {ordersLoading ? <p className="text-sm text-muted-foreground">Loading orders…</p> : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Kpi label="Paid orders" value={metrics.paidOrderCount.toLocaleString('en-IN')} />
            <Kpi label="Revenue" value={inr(metrics.revenue)} />
            <Kpi label="Average order value" value={metrics.paidOrderCount ? inr(metrics.averageOrderValue) : 'n/a'} />
          </div>

          <section aria-label="Revenue by day" className="rounded-xl border border-border/70 bg-card p-4 shadow-soft">
            <h3 className="mb-3 text-sm font-semibold">Revenue by day</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.revenueByDay}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 11 }} minTickGap={16} />
                  <YAxis tick={{ fontSize: 11 }} width={56} />
                  <Tooltip formatter={(v: number) => inr(v)} />
                  <Bar dataKey="revenue" fill="#5B262C" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-label="Order status funnel" className="rounded-xl border border-border/70 bg-card p-4 shadow-soft">
              <h3 className="mb-3 text-sm font-semibold">Orders by status</h3>
              {metrics.funnel.length === 0 ? <p className="text-sm text-muted-foreground">No orders in this range.</p> : (
                <ul className="space-y-1 text-sm">
                  {metrics.funnel.map(f => (
                    <li key={f.status} className="flex justify-between"><span>{ORDER_STATUS_LABELS[f.status] ?? f.status}</span><span className="font-mono">{f.count}</span></li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-label="Top products" className="rounded-xl border border-border/70 bg-card p-4 shadow-soft">
              <h3 className="mb-3 text-sm font-semibold">Top products by revenue</h3>
              {metrics.topProducts.length === 0 ? <p className="text-sm text-muted-foreground">No paid orders in this range.</p> : (
                <ol className="space-y-1 text-sm">
                  {metrics.topProducts.map(p => (
                    <li key={p.productId || p.name} className="flex justify-between gap-3"><span className="truncate">{p.name} <span className="text-muted-foreground">× {p.units}</span></span><span className="font-mono">{inr(p.revenue)}</span></li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
