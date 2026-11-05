/**
 * QC and packing console: orders in Quality_Check (inspect, then pack) and Packed (slip, package data).
 * Visible to roles with canManageProduction. Checklist results and package details are stored in the
 * order `notes` structured block (src/lib/orders/orderNotes.ts, documented in DATABASE.md).
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { parseNotes } from '@/lib/orders/orderNotes';
import { buildPackingSlipHtml, printHtml } from '@/lib/orders/printSheets';
import { groupByStage, QC_STAGES } from '@/lib/orders/productionQueue';
import type { Order } from '@/types/store';
import { useWorkshopQueue } from '../shared/useWorkshopQueue';
import { PackageForm } from './PackageForm';
import { QcOrderCard } from './QcOrderCard';

export function QcConsole() {
  const queue = useWorkshopQueue(QC_STAGES);
  const [busy, setBusy] = useState(false);
  const groups = groupByStage(queue.orders, QC_STAGES);

  const printSlip = (order: Order) => {
    if (!printHtml(buildPackingSlipHtml(order, { products: queue.products, storeName: queue.storeName }))) {
      toast.error('The print window was blocked. Allow pop-ups for this site and try again.');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="font-display text-3xl text-oxblood-deep">Quality check and packing</h2>
        <p className="text-sm text-muted-foreground">Inspect every item, record the package size and weight, then mark the order packed.</p>
      </div>
      {queue.error && (
        <p role="alert" className="rounded-lg border border-[#9B1C2E]/30 bg-[#FDE8EC] p-3 text-sm text-[#9B1C2E]">Could not load orders: {queue.error.message}</p>
      )}
      {queue.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <section aria-label="Awaiting inspection" className="space-y-3">
        <h3 className="text-lg font-semibold">Awaiting inspection ({groups.Quality_Check.length})</h3>
        {groups.Quality_Check.length === 0 && !queue.isLoading && <p className="text-sm text-muted-foreground">No orders are waiting for QC.</p>}
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.Quality_Check.map(order => (
            <QcOrderCard key={order.id} order={order} sla={queue.slaFor(order)} busy={busy} setBusy={setBusy} onPrintSlip={() => printSlip(order)} />
          ))}
        </div>
      </section>

      <section aria-label="Packed" className="space-y-3">
        <h3 className="text-lg font-semibold">Packed, waiting for dispatch ({groups.Packed.length})</h3>
        {groups.Packed.length === 0 && !queue.isLoading && <p className="text-sm text-muted-foreground">No packed orders.</p>}
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.Packed.map(order => {
            const pkg = parseNotes(order.adminNotes).data.package;
            return (
              <article key={order.id} className="rounded-xl border border-border/70 bg-card p-4 shadow-soft space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-mono font-bold">{order.orderNumber || order.id}</h4>
                  <button type="button" onClick={() => printSlip(order)} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">Packing slip</button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {pkg ? `${pkg.lengthCm} × ${pkg.widthCm} × ${pkg.heightCm} cm, ${pkg.weightKg} kg` : 'No package details recorded'}
                </p>
                <PackageForm order={order} disabled={busy} />
              </article>
            );
          })}
        </div>
      </section>

      {queue.hasMore && (
        <button type="button" onClick={() => void queue.loadMore()} disabled={queue.isFetchingMore} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">
          {queue.isFetchingMore ? 'Loading…' : 'Load more orders'}
        </button>
      )}
    </div>
  );
}
