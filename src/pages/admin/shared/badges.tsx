import { cn } from '@/lib/utils';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/orders/orderStateMachine';
import type { SlaState } from '@/lib/orders/productionQueue';

export type BadgeTone = 'good' | 'warn' | 'bad' | 'neutral' | 'info';

const TONES: Record<BadgeTone, string> = {
  good: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warn: 'bg-amber-50 text-amber-900 border-amber-300',
  bad: 'bg-destructive/10 text-destructive border-destructive/30',
  neutral: 'bg-muted text-muted-foreground border-border',
  info: 'bg-secondary text-secondary-foreground border-border',
};

/** The one pill used for every status in the admin: orders, shipments, refunds, returns, SLA. */
export function Badge({ tone = 'neutral', children, title }: { tone?: BadgeTone; children: React.ReactNode; title?: string }) {
  return <span title={title} className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold', TONES[tone])}>{children}</span>;
}

function statusTone(status: OrderStatus): BadgeTone {
  if (status === 'Delivered' || status === 'Refunded') return 'good';
  if (['Payment_Failed', 'Payment_Discrepancy', 'Expired', 'Cancelled', 'RTO_Initiated', 'RTO_Delivered'].includes(status)) return 'bad';
  if (['Partially_Refunded', 'Returned', 'Return_Requested', 'Return_Approved', 'Pending_Payment'].includes(status)) return 'neutral';
  return 'warn';
}

/** Unknown future statuses (added by the server state machine) fall back to their raw name. */
export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={statusTone(status)}>{ORDER_STATUS_LABELS[status] ?? String(status).replace(/_/g, ' ')}</Badge>;
}

const SLA_TONE: Record<SlaState['level'], BadgeTone> = { ok: 'good', due_soon: 'warn', overdue: 'bad' };

export function SlaBadge({ sla }: { sla: SlaState }) {
  const text = sla.level === 'overdue'
    ? `${Math.abs(sla.daysLeft)}d overdue`
    : sla.daysLeft === 0 ? 'Due today' : `${sla.daysLeft}d left`;
  return <Badge tone={SLA_TONE[sla.level]} title={`Order is ${sla.ageDays} day(s) old; lead time ${sla.leadTimeDays} day(s)`}>{text}</Badge>;
}
