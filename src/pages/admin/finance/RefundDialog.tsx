import { useState } from 'react';
import { toast } from 'sonner';
import { ActionDialog } from '@/components/admin/ActionDialog';
import { Field } from '@/components/admin/AdminUi';
import { newIdempotencyKey, opsApi, useOpsRunner } from '@/lib/data/orderOps';
import { formatInr, parseRupeesToPaise, refundAmountError } from '@/lib/orders/finance';
import type { Order } from '@/types/store';

interface Props {
  order: Order;
  /** Refundable balance in paise from GET_ORDER_DOCUMENTS (the server's figure). */
  ceilingPaise: number;
  onClose: () => void;
}

/**
 * Creates a full or partial refund. The attempt carries one idempotency key for the life of the
 * dialog, so a retry after a network failure returns the same refund instead of paying twice; a
 * server rejection (for example the ceiling, if another refund landed meanwhile) is shown here.
 */
export function RefundDialog({ order, ceilingPaise, onClose }: Props) {
  const { run, busy } = useOpsRunner();
  const hasOnlinePayment = Boolean(order.ops?.razorpayPaymentId);
  const [amount, setAmount] = useState((ceilingPaise / 100).toFixed(2));
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<'razorpay' | 'manual'>(hasOnlinePayment ? 'razorpay' : 'manual');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(newIdempotencyKey);

  const amountError = amount.trim() ? refundAmountError(amount, ceilingPaise) : null;
  const paise = parseRupeesToPaise(amount);
  const valid = paise !== null && !amountError && reason.trim().length >= 3
    && (method === 'razorpay' ? hasOnlinePayment : reference.trim().length >= 4);

  const submit = async () => {
    if (paise === null) return;
    setError(null);
    const result = await run(() => opsApi.createRefund({
      orderId: order.id, amount: paise / 100, reason: reason.trim(), method, idempotencyKey,
      ...(method === 'manual' ? { reference: reference.trim() } : {}),
    }));
    if (result.ok) {
      toast.success(`${order.orderNumber ?? order.id}: ${formatInr(paise)} refund ${result.value.refund.status === 'pending' ? 'requested, waiting for Razorpay' : 'recorded'}`);
      onClose();
    } else {
      setError(result.error);
    }
  };

  return (
    <ActionDialog open onClose={onClose} title={`Refund ${order.orderNumber ?? order.id}`} submitLabel="Refund" busy={busy} canSubmit={valid} error={error} onSubmit={submit}
      description={`Refundable now: ${formatInr(ceilingPaise)}. A credit note is issued if the order was invoiced.`}>
      <Field label="Amount (₹)" error={amountError ?? undefined}>
        <div className="flex gap-2">
          <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className="field font-mono" />
          <button type="button" className="btn-secondary shrink-0" onClick={() => setAmount((ceilingPaise / 100).toFixed(2))}>Full</button>
        </div>
      </Field>
      <Field label="Reason" hint="Recorded on the refund and the credit note. At least 3 characters.">
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={300} className="field" />
      </Field>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">How the money goes back</legend>
        <label className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm">
          <input type="radio" name="method" checked={method === 'razorpay'} disabled={!hasOnlinePayment} onChange={() => setMethod('razorpay')} className="h-5 w-5 accent-primary" />
          <span><strong>Razorpay</strong> <span className="text-muted-foreground">{hasOnlinePayment ? '(to the original payment)' : '(no online payment on this order)'}</span></span>
        </label>
        <label className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm">
          <input type="radio" name="method" checked={method === 'manual'} onChange={() => setMethod('manual')} className="h-5 w-5 accent-primary" />
          <span><strong>Manual</strong> <span className="text-muted-foreground">(bank transfer or UPI already sent)</span></span>
        </label>
      </fieldset>
      {method === 'manual' && (
        <Field label="Bank or UPI reference" hint="4 to 80 characters.">
          <input value={reference} onChange={e => setReference(e.target.value)} maxLength={80} className="field font-mono" />
        </Field>
      )}
    </ActionDialog>
  );
}
