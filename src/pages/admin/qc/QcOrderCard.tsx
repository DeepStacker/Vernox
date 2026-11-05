import { Printer } from 'lucide-react';
import { toast } from 'sonner';
import { allItemsPassedQc, parseNotes, recordQc, resetQc, type QcChecks } from '@/lib/orders/orderNotes';
import type { OrderStatus } from '@/lib/orders/orderStateMachine';
import { reworkTargetsFor, type SlaState } from '@/lib/orders/productionQueue';
import type { Order } from '@/types/store';
import { SlaBadge } from '../shared/badges';
import { useOrderActions } from '../shared/useOrderActions';
import { PackageForm } from './PackageForm';
import { QcItemChecklist } from './QcItemChecklist';

interface Props {
  order: Order;
  sla: SlaState;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onPrintSlip: () => void;
}

/** One order awaiting inspection: per-item checklist, package details, and the move to Packed. */
export function QcOrderCard({ order, sla, busy, setBusy, onPrintSlip }: Props) {
  const actions = useOrderActions();
  const data = parseNotes(order.adminNotes).data;
  const itemIds = order.items.map(i => i.id);
  const allPassed = allItemsPassedQc(itemIds, data);
  const hasPackage = Boolean(data.package);
  const reworkTargets = actions.permissions ? reworkTargetsFor(order.status, actions.permissions) : [];
  const canPack = actions.canWrite && allPassed && hasPackage;

  const guarded = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const pass = (itemId: string, checks: QcChecks) => guarded(async () => {
    await actions.saveNotes(order, recordQc(order.adminNotes, { itemId, checks, outcome: 'pass', by: actions.who, at: Date.now() }));
  });

  // A failed item sends the whole order back; results are cleared so rework is re-inspected in full.
  const fail = (itemId: string, checks: QcChecks, reason: string, target: OrderStatus) => guarded(async () => {
    const notes = resetQc(recordQc(order.adminNotes, { itemId, checks, outcome: 'fail', by: actions.who, at: Date.now(), reason }));
    await actions.moveTo(order, target, notes);
  });

  const pack = () => guarded(async () => { await actions.moveTo(order, 'Packed'); });

  return (
    <article className="rounded-xl border border-border/70 bg-card p-4 shadow-soft space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-mono text-base font-bold">{order.orderNumber || order.id}</h3>
        <SlaBadge sla={sla} />
      </header>
      {order.items.map(item => (
        <QcItemChecklist key={`${item.id}-${data.qc[item.id]?.at ?? 0}`} item={item} result={data.qc[item.id]}
          disabled={busy || !actions.canWrite}
          onPass={checks => pass(item.id, checks)}
          reworkTargets={reworkTargets}
          onFail={(checks, reason, target) => fail(item.id, checks, reason, target)} />
      ))}
      <PackageForm order={order} disabled={busy || !actions.canWrite} />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !canPack} onClick={() => void pack()}
          className="min-h-11 flex-1 rounded-lg bg-oxblood px-4 text-sm font-semibold text-ivory disabled:opacity-40">
          Mark packed
        </button>
        <button type="button" onClick={onPrintSlip} className="min-h-11 inline-flex items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-semibold">
          <Printer className="h-4 w-4" /> Packing slip
        </button>
      </div>
      {!canPack && actions.canWrite && (
        <p className="text-xs text-muted-foreground">
          {!allPassed ? 'Pass every item to continue.' : 'Save the package dimensions and weight to continue.'}
        </p>
      )}
    </article>
  );
}
