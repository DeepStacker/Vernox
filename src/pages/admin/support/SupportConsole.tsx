/**
 * Support console: find an order by number, email, phone, pincode or name, then read its timeline,
 * customer, items and totals, add an internal note (support through ADD_ORDER_NOTE) and copy or send
 * customer messages (Orders view), and work contact-form tickets (Tickets view, TicketsConsole.tsx).
 * Notes about an order live on the order.
 */
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminData } from '@/lib/data/adminData';
import { searchOrdersRemote } from '@/lib/data/orders';
import { matchesOrder } from '@/lib/orders/orderSearch';
import type { Order } from '@/types/store';
import { StatusBadge } from '../shared/badges';
import { useAuth } from '@/lib/auth/AuthProvider';
import { OrderDetailPanel } from './OrderDetailPanel';
import { TicketsConsole } from './TicketsConsole';

export function SupportConsole() {
  const { permissions } = useAuth();
  const [view, setView] = useState<'orders' | 'tickets'>('orders');
  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="font-display text-3xl">Support</h2>
      </div>
      {permissions?.canReadTickets && (
        <div className="flex gap-2" role="tablist" aria-label="Support view">
          {(['orders', 'tickets'] as const).map(v => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${view === v ? 'bg-oxblood text-ivory' : 'bg-muted/50 text-muted-foreground'}`}>
              {v === 'orders' ? 'Orders' : 'Tickets'}
            </button>
          ))}
        </div>
      )}
      {view === 'tickets' && permissions?.canReadTickets ? <TicketsConsole /> : <OrderSupport />}
    </div>
  );
}

function OrderSupport() {
  const { orders, ordersLoading, ordersError, hasMoreOrders, loadMoreOrders, isLoadingMoreOrders, storeConfig } = useAdminData();
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const pool = useMemo(() => {
    const ids = new Set(orders.map(o => o.id));
    return [...orders, ...remote.filter(o => !ids.has(o.id))];
  }, [orders, remote]);
  const results = useMemo(() => (query.trim() ? pool.filter(o => matchesOrder(o, query)) : pool.slice(0, 25)), [pool, query]);
  const selected = pool.find(o => o.id === selectedId) ?? null;

  const searchEverywhere = async () => {
    setSearching(true);
    try {
      setRemote(await searchOrdersRemote(query));
    } catch (err) {
      toast.error(`Search failed: ${err instanceof Error ? err.message : 'please try again'}`);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Search by order number, email, phone, pincode or name.</p>
      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="VX-20261105-ABC123, name@email.com, 98xxxxxx, 560001"
          aria-label="Search orders" className="min-h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-oxblood" />
      </div>
      {ordersError && <p role="alert" className="text-sm text-destructive">Could not load orders: {ordersError.message}</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-label="Results" className="space-y-2">
          {ordersLoading && <p className="text-sm text-muted-foreground">Loading orders…</p>}
          {!ordersLoading && results.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground space-y-2">
              <p>No loaded order matches. Only the most recent orders are loaded.</p>
              {query.trim() && (
                <button type="button" onClick={() => void searchEverywhere()} disabled={searching} className="min-h-11 rounded-lg border border-border px-4 font-semibold text-foreground">
                  {searching ? 'Searching…' : 'Search all orders (order number or email)'}
                </button>
              )}
            </div>
          )}
          <ul className="space-y-2">
            {results.map(o => (
              <li key={o.id}>
                <button type="button" onClick={() => setSelectedId(o.id)}
                  className={`min-h-11 w-full rounded-lg border p-3 text-left text-sm ${o.id === selectedId ? 'border-oxblood bg-oxblood/5' : 'border-border/70 bg-card'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold">{o.orderNumber || o.id}</span><StatusBadge status={o.status} />
                  </div>
                  <div className="text-xs text-muted-foreground">{o.customerName || o.email} · {new Date(o.placedAt).toLocaleDateString('en-IN')}</div>
                </button>
              </li>
            ))}
          </ul>
          {hasMoreOrders && (
            <button type="button" onClick={() => void loadMoreOrders()} disabled={isLoadingMoreOrders} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">
              {isLoadingMoreOrders ? 'Loading…' : 'Load older orders'}
            </button>
          )}
        </section>
        <section aria-label="Order detail">
          {selected
            ? <OrderDetailPanel order={selected} allOrders={pool} currency={storeConfig.currency || '₹'} storeName={storeConfig.storeName} />
            : <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">Select an order to see its details.</p>}
        </section>
      </div>
    </div>
  );
}
