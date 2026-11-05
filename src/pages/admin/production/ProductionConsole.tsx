/**
 * Production console: workshop queue Paid → In design → Cutting → Finishing → Quality check.
 * Visible to roles with canManageProduction (production, order manager, admin, super admin).
 * Stage moves use the restricted order update (status/assignedTo/notes), so Firestore rules and
 * the client state machine both apply.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ORDER_STATUS_LABELS } from '@/lib/orders/orderStateMachine';
import { buildJobSheetsHtml, printHtml } from '@/lib/orders/printSheets';
import { groupByStage, isAssignedTo, nextStageFor, PRODUCTION_STAGES } from '@/lib/orders/productionQueue';
import { matchesOrder } from '@/lib/orders/orderSearch';
import type { Order } from '@/types/store';
import { useOrderActions } from '../shared/useOrderActions';
import { useWorkshopQueue } from '../shared/useWorkshopQueue';
import { JobCard } from './JobCard';
import { JobDetail } from './JobDetail';

export function ProductionConsole() {
  const queue = useWorkshopQueue(PRODUCTION_STAGES);
  const actions = useOrderActions();
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const visible = queue.orders.filter(o => (!mineOnly || isAssignedTo(o, actions.who)) && matchesOrder(o, search));
    return groupByStage(visible, PRODUCTION_STAGES);
  }, [queue.orders, mineOnly, search, actions.who]);

  const opened = queue.orders.find(o => o.id === openId) ?? null;
  const print = (orders: Order[]) => {
    if (!printHtml(buildJobSheetsHtml(orders, { products: queue.products, storeName: queue.storeName }))) {
      toast.error('The print window was blocked. Allow pop-ups for this site and try again.');
    }
  };
  const run = async (order: Order, fn: () => Promise<boolean>) => {
    setBusyId(order.id);
    await fn();
    setBusyId(null);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-3xl text-oxblood-deep">Production</h2>
          <p className="text-sm text-muted-foreground">Oldest orders first. Move an order forward only when the stage is finished.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find order number"
            aria-label="Find order" className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-oxblood" />
          <label className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm">
            <input type="checkbox" checked={mineOnly} onChange={e => setMineOnly(e.target.checked)} className="h-4 w-4" /> Mine only
          </label>
        </div>
      </div>

      {queue.error && (
        <p role="alert" className="rounded-lg border border-[#9B1C2E]/30 bg-[#FDE8EC] p-3 text-sm text-[#9B1C2E]">
          Could not load the queue: {queue.error.message}
        </p>
      )}
      {queue.isLoading && <p className="text-sm text-muted-foreground">Loading the queue…</p>}

      <div className="flex gap-4 overflow-x-auto pb-4 md:grid md:grid-cols-5 md:overflow-visible">
        {PRODUCTION_STAGES.map(stage => (
          <section key={stage} aria-label={ORDER_STATUS_LABELS[stage]} className="min-w-[280px] md:min-w-0 space-y-3 rounded-xl bg-muted/30 p-3">
            <header className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{stage === 'Paid' ? 'Waiting to start' : ORDER_STATUS_LABELS[stage]}</h3>
              <span className="rounded-full bg-background px-2 py-0.5 text-xs font-mono">{groups[stage].length}</span>
            </header>
            {groups[stage].length === 0 && <p className="text-xs text-muted-foreground">Nothing here.</p>}
            {groups[stage].map(order => {
              // Quality_Check -> Packed belongs to the QC console, which enforces the checklist.
              const next = actions.permissions && order.status !== 'Quality_Check' ? nextStageFor(order.status, actions.permissions) : null;
              return (
                <JobCard key={order.id} order={order} sla={queue.slaFor(order)} who={actions.who}
                  nextStage={actions.canWrite ? next : null} canWrite={actions.canWrite} busy={busyId === order.id}
                  onOpen={() => setOpenId(order.id)}
                  onClaim={() => void run(order, () => actions.claim(order))}
                  onAdvance={() => next && void run(order, () => actions.moveTo(order, next))}
                  onPrint={() => print([order])} />
              );
            })}
          </section>
        ))}
      </div>
      {queue.hasMore && (
        <button type="button" onClick={() => void queue.loadMore()} disabled={queue.isFetchingMore}
          className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">
          {queue.isFetchingMore ? 'Loading…' : 'Load more orders'}
        </button>
      )}
      <JobDetail order={opened} products={queue.products} onClose={() => setOpenId(null)} />
    </div>
  );
}
