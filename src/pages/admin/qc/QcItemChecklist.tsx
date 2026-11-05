import { useState } from 'react';
import { toast } from 'sonner';
import { emptyChecks, isQcComplete, QC_CHECKS, type QcChecks, type QcItemResult } from '@/lib/orders/orderNotes';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/orders/orderStateMachine';
import type { OrderItem } from '@/types/store';
import { itemSizeText } from '../shared/itemSpec';

interface Props {
  item: OrderItem;
  result?: QcItemResult;
  disabled: boolean;
  /** Stages the order may be sent back to on failure (role-dependent). */
  reworkTargets: readonly OrderStatus[];
  onPass: (checks: QcChecks) => Promise<void>;
  /** Fails the item and sends the order back; the reason is mandatory. */
  onFail: (checks: QcChecks, reason: string, target: OrderStatus) => Promise<void>;
}

/** Checklist for one line item. Pass needs every box ticked; fail needs a reason. */
export function QcItemChecklist({ item, result, disabled, reworkTargets, onPass, onFail }: Props) {
  const [checks, setChecks] = useState<QcChecks>(result?.outcome === 'pass' ? result.checks : emptyChecks());
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState<OrderStatus>(reworkTargets[0] ?? 'Cutting');
  const passed = result?.outcome === 'pass';

  const fail = async () => {
    if (!reason.trim()) {
      toast.error('Enter the reason for failing this item.');
      return;
    }
    await onFail(checks, reason, target);
  };

  return (
    <fieldset className={`rounded-lg border p-3 space-y-3 ${passed ? 'border-emerald-700/40 bg-emerald-50/50' : 'border-border/70'}`}>
      <legend className="px-1 text-sm font-semibold">
        {item.quantity} × {item.productName} <span className="font-normal text-muted-foreground">· {itemSizeText(item)}</span>
        {passed && <span className="ml-2 text-xs text-emerald-700">Passed{result?.by ? ` by ${result.by}` : ''}</span>}
      </legend>
      <div className="grid gap-1 sm:grid-cols-2">
        {QC_CHECKS.map(c => (
          <label key={c.id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted/40">
            <input type="checkbox" className="h-5 w-5 accent-primary" checked={checks[c.id]} disabled={disabled || passed}
              onChange={e => setChecks(prev => ({ ...prev, [c.id]: e.target.checked }))} />
            {c.label}
          </label>
        ))}
      </div>
      {!passed && (
        <>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (required to fail)" aria-label={`Fail reason for ${item.productName}`}
            maxLength={200} disabled={disabled}
            className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-oxblood" />
          <label className="block text-xs text-muted-foreground">
            If failed, send back to
            <select value={target} onChange={e => setTarget(e.target.value as OrderStatus)} disabled={disabled || reworkTargets.length === 0}
              className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground">
              {reworkTargets.map(t => <option key={t} value={t}>{ORDER_STATUS_LABELS[t]}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={disabled || !isQcComplete(checks)} onClick={() => void onPass(checks)}
              className="min-h-11 flex-1 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-40">Pass item</button>
            <button type="button" disabled={disabled || reworkTargets.length === 0} onClick={() => void fail()}
              className="min-h-11 flex-1 rounded-lg border border-destructive/50 px-4 text-sm font-semibold text-destructive disabled:opacity-40">Fail and send back</button>
          </div>
        </>
      )}
    </fieldset>
  );
}
