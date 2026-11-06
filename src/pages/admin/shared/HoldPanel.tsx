/**
 * Hold or material-shortage flag on an order (OrderHold in src/types/orderStatus.ts). While it is set the
 * order keeps its stage and cannot move forward or ship; releasing resumes from the same stage.
 * Server actions SET_ORDER_HOLD / RELEASE_ORDER_HOLD (orders.update_status), audited.
 */
import { useState } from 'react';
import { PauseCircle } from 'lucide-react';
import { toast } from 'sonner';
import { opsApi, useOpsRunner } from '@/lib/data/orderOps';
import { HOLDABLE_STATUSES, type HoldKind } from '@/types/orderStatus';
import type { Order } from '@/types/store';

const KIND_LABEL: Record<HoldKind, string> = { hold: 'On hold', material_shortage: 'Waiting for material' };

export function HoldPanel({ order, canWrite }: { order: Order; canWrite: boolean }) {
  const { run, busy } = useOpsRunner();
  const [kind, setKind] = useState<HoldKind | null>(null);
  const [reason, setReason] = useState('');
  const hold = order.hold;

  const submit = async () => {
    if (!kind) return;
    const result = await run(() => opsApi.setOrderHold(order.id, kind, reason.trim()));
    if (result.ok) {
      toast.success(`${order.orderNumber || order.id}: ${KIND_LABEL[kind].toLowerCase()}`);
      setKind(null);
      setReason('');
    } else toast.error(result.error);
  };
  const release = async () => {
    const result = await run(() => opsApi.releaseOrderHold(order.id));
    if (result.ok) toast.success('Hold released; the order can move on.');
    else toast.error(result.error);
  };

  if (hold) {
    return (
      <div role="status" className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <p><PauseCircle className="mr-1 inline h-4 w-4" aria-hidden /><strong>{KIND_LABEL[hold.kind]}:</strong> {hold.reason}
          <span className="block text-xs">{hold.by} · {new Date(hold.at).toLocaleString('en-IN')}</span></p>
        {canWrite && <button type="button" disabled={busy} onClick={() => void release()} className="btn-secondary">Release hold</button>}
      </div>
    );
  }
  if (!canWrite || !HOLDABLE_STATUSES.includes(order.status)) return null;
  if (!kind) {
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setKind('hold')} className="btn-secondary">Put on hold</button>
        <button type="button" onClick={() => setKind('material_shortage')} className="btn-secondary">Material shortage</button>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <label className="block text-sm font-medium">{kind === 'hold' ? 'Why is it on hold?' : 'Which material is short?'}
        <input value={reason} maxLength={300} onChange={e => setReason(e.target.value)} className="field mt-1 font-normal"
          placeholder={kind === 'hold' ? 'Customer asked to wait until 20 Nov' : '2 mm brass sheet, expected Friday'} />
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => void submit()} className="btn-primary">Save</button>
        <button type="button" onClick={() => setKind(null)} className="btn-secondary">Cancel</button>
      </div>
    </div>
  );
}
