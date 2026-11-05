import { Printer, UserCheck } from 'lucide-react';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/orders/orderStateMachine';
import { isAssignedTo, type SlaState } from '@/lib/orders/productionQueue';
import type { Order } from '@/types/store';
import { SlaBadge } from '../shared/badges';
import { isCustomItem, itemSizeText } from '../shared/itemSpec';

interface JobCardProps {
  order: Order;
  sla: SlaState;
  who: string;
  nextStage: OrderStatus | null;
  canWrite: boolean;
  busy: boolean;
  onOpen: () => void;
  onClaim: () => void;
  onAdvance: () => void;
  onPrint: () => void;
}

/** One order in a workshop column. Buttons are 44px+ so they work with gloves on a tablet. */
export function JobCard({ order, sla, who, nextStage, canWrite, busy, onOpen, onClaim, onAdvance, onPrint }: JobCardProps) {
  const mine = isAssignedTo(order, who);
  return (
    <article className={`rounded-xl border bg-card p-3 shadow-soft space-y-2 ${sla.level === 'overdue' ? 'border-destructive/50' : 'border-border/70'}`}>
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-sm font-bold">{order.orderNumber || order.id}</span>
          <SlaBadge sla={sla} />
        </div>
        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          {order.items.map(i => (
            <li key={i.id}>
              <span className="text-foreground">{i.quantity} × {i.productName}</span> · {itemSizeText(i)}{i.finish ? ` · ${i.finish}` : ''}
              {isCustomItem(i) && <span className="ml-1 font-semibold text-oxblood-deep">[custom]</span>}
            </li>
          ))}
        </ul>
      </button>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{order.assignedTo ? (mine ? 'Assigned to you' : `Assigned: ${order.assignedTo}`) : 'Unassigned'}</span>
        <span>{sla.ageDays}d old</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {canWrite && !mine && (
          <button type="button" disabled={busy} onClick={onClaim}
            className="min-h-11 flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-semibold disabled:opacity-50">
            <UserCheck className="h-4 w-4" /> Claim
          </button>
        )}
        {nextStage && (
          <button type="button" disabled={busy} onClick={onAdvance}
            className="min-h-11 flex-1 rounded-lg bg-oxblood px-3 text-sm font-semibold text-ivory disabled:opacity-50">
            {ORDER_STATUS_LABELS[nextStage]} →
          </button>
        )}
        <button type="button" onClick={onPrint} aria-label={`Print job sheet for ${order.orderNumber || order.id}`}
          className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg border border-border bg-background">
          <Printer className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}
