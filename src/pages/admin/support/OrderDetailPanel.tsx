import { useMemo } from 'react';
import { useProducts } from '@/lib/data/products';
import { isRevenueStatus } from '@/lib/orders/orderStateMachine';
import { summariseCustomer } from '@/lib/orders/orderSearch';
import type { Order } from '@/types/store';
import { StatusBadge } from '../shared/badges';
import { OrderItemSpecs } from '../shared/OrderItemSpecs';
import { OrderNotesPanel } from '../shared/OrderNotesPanel';
import { MessageSnippets } from './MessageSnippets';

const inr = (n: number, currency: string) => `${currency}${n.toLocaleString('en-IN')}`;

/** Everything support needs about one order: customer, items, totals, timeline, notes, messages. */
export function OrderDetailPanel({ order, allOrders, currency, storeName }: { order: Order; allOrders: readonly Order[]; currency: string; storeName: string }) {
  const products = useProducts().data ?? [];
  const customer = useMemo(() => summariseCustomer(order.email, allOrders, o => isRevenueStatus(o.status)), [order.email, allOrders]);
  const address = [order.shippingAddress, order.shippingCity, order.shippingState, order.shippingPincode, order.shippingCountry].filter(Boolean).join(', ');

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-mono text-lg font-bold">{order.orderNumber || order.id}</h3>
        <StatusBadge status={order.status} />
        <span className="text-xs text-muted-foreground">Placed {new Date(order.placedAt).toLocaleString('en-IN')}</span>
      </header>

      <section aria-label="Customer" className="rounded-lg border border-border/70 p-3 text-sm space-y-1">
        <div className="font-semibold">{order.customerName || customer.name}</div>
        <div><a className="underline" href={`mailto:${order.email}`}>{order.email}</a>{order.phone && <> · <a className="underline" href={`tel:${order.phone}`}>{order.phone}</a></>}</div>
        <div className="text-muted-foreground">{address || 'No address recorded'}</div>
        <div className="pt-1 text-xs text-muted-foreground">
          In loaded orders: {customer.orderCount} order(s), lifetime value {inr(customer.lifetimeValue, currency)}, last order {customer.lastOrderAt ? new Date(customer.lastOrderAt).toLocaleDateString('en-IN') : 'n/a'}.
        </div>
      </section>

      <OrderItemSpecs order={order} products={products} />

      <section aria-label="Totals" className="rounded-lg border border-border/70 p-3 text-sm space-y-0.5">
        <div className="flex justify-between"><span>Subtotal</span><span>{inr(order.subtotal, currency)}</span></div>
        {order.discountTotal > 0 && <div className="flex justify-between"><span>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</span><span>-{inr(order.discountTotal, currency)}</span></div>}
        <div className="flex justify-between"><span>Shipping</span><span>{inr(order.shippingTotal, currency)}</span></div>
        <div className="flex justify-between"><span>Tax</span><span>{inr(order.taxTotal, currency)}</span></div>
        <div className="flex justify-between font-semibold border-t border-border/60 pt-1"><span>Total</span><span>{inr(order.total, currency)}</span></div>
      </section>

      {order.tracking?.trackingNumber && (
        <p className="text-sm">Tracking: {order.tracking.carrier ?? 'Carrier'} {order.tracking.trackingNumber}
          {order.tracking.url && <> · <a className="underline" href={order.tracking.url} target="_blank" rel="noopener noreferrer">Track</a></>}
        </p>
      )}

      <section aria-label="Timeline" className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timeline</h4>
        <ol className="space-y-1 border-l border-border pl-4 text-sm">
          {order.statusHistory.length === 0 && <li className="text-muted-foreground">No status history.</li>}
          {[...order.statusHistory].sort((a, b) => b.at - a.at).map((h, i) => (
            <li key={`${h.status}-${h.at}-${i}`} className="flex flex-wrap items-center gap-2">
              <StatusBadge status={h.status} />
              <span className="text-xs text-muted-foreground">{new Date(h.at).toLocaleString('en-IN')} by {h.by}</span>
            </li>
          ))}
        </ol>
      </section>

      <OrderNotesPanel order={order} />
      <MessageSnippets order={order} storeName={storeName} />
    </div>
  );
}
