import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/orders/orderStateMachine';
import type { SlaState } from '@/lib/orders/productionQueue';

function statusTone(status: OrderStatus): string {
  if (status === 'Delivered') return 'bg-[#EEF5F0] text-[#1D5E37] border-[#1D5E37]/20';
  if (['Pending_Payment', 'Payment_Failed', 'Expired', 'Cancelled'].includes(status)) return 'bg-[#FFF4F0] text-[#9A3412] border-[#9A3412]/20';
  if (['Refunded', 'Partially_Refunded', 'Returned', 'Return_Requested'].includes(status)) return 'bg-neutral-100 text-neutral-600 border-neutral-200';
  return 'bg-[#FAF3E8] text-[#8C6219] border-[#C6A15B]/30';
}

/** Unknown future statuses (added by the server state machine) fall back to their raw name. */
export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusTone(status)}`}>
      {ORDER_STATUS_LABELS[status] ?? String(status).replace(/_/g, ' ')}
    </span>
  );
}

const SLA_TONE = {
  ok: 'bg-[#EEF5F0] text-[#1D5E37] border-[#1D5E37]/20',
  due_soon: 'bg-[#FFF8E6] text-[#8C6219] border-[#C6A15B]/40',
  overdue: 'bg-[#FDE8EC] text-[#9B1C2E] border-[#9B1C2E]/30',
} as const;

export function SlaBadge({ sla }: { sla: SlaState }) {
  const text = sla.level === 'overdue'
    ? `${Math.abs(sla.daysLeft)}d overdue`
    : sla.daysLeft === 0 ? 'Due today' : `${sla.daysLeft}d left`;
  return (
    <span title={`Order is ${sla.ageDays} day(s) old; lead time ${sla.leadTimeDays} day(s)`}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${SLA_TONE[sla.level]}`}>
      {text}
    </span>
  );
}
