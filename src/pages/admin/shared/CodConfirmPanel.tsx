/**
 * "Confirm by phone" prompt for a COD order nobody has verified by SMS code (flag COD_UNVERIFIED, see
 * src/lib/orders/codConfirmation.ts). One tap marks it confirmed (CONFIRM_COD_ORDER) or cancels it as
 * unreachable (CANCEL_ORDER, no refund: nothing was paid). Both actions are audited server-side.
 */
import { Phone } from 'lucide-react';
import { toast } from 'sonner';
import { awaitsCodConfirmation, telHref } from '@/lib/orders/codConfirmation';
import { opsApi, useOpsRunner } from '@/lib/data/orderOps';
import type { Order } from '@/types/store';

export function CodConfirmPanel({ order, canWrite, compact = false }: { order: Order; canWrite: boolean; compact?: boolean }) {
  const { run, busy } = useOpsRunner();
  if (!awaitsCodConfirmation(order)) return null;
  const tel = telHref(order.phone);
  const label = order.orderNumber || order.id;

  const confirm = async () => {
    const result = await run(() => opsApi.confirmCodOrder(order.id));
    if (result.ok) toast.success(`${label} confirmed by phone.`);
    else toast.error(result.error);
  };
  const cancel = async () => {
    const result = await run(() => opsApi.cancelOrder(order.id, 'COD not confirmed: customer unreachable', false));
    if (result.ok) toast.success(`${label} cancelled.`);
    else toast.error(result.error);
  };

  return (
    <div role="status" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p>
        <Phone className="mr-1 inline h-4 w-4" aria-hidden />
        <strong>Confirm by phone.</strong>{' '}
        {compact ? 'Awaiting confirmation.' : 'This cash on delivery order was not confirmed by SMS code. Call the customer before production starts.'}
      </p>
      {tel ? (
        <a href={tel} className="inline-flex min-h-11 items-center font-mono text-base font-semibold underline">{order.phone}</a>
      ) : (
        <p className="font-mono">{order.phone || 'No phone number on the order'}</p>
      )}
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void confirm()} className="btn-primary min-h-11">Confirmed</button>
          <button type="button" disabled={busy} onClick={() => void cancel()} className="btn-secondary min-h-11">Cancel (customer unreachable)</button>
        </div>
      )}
    </div>
  );
}
