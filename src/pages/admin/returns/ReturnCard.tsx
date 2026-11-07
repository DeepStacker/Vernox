import { useState } from 'react';
import { toast } from 'sonner';
import { ActionDialog } from '@/components/admin/ActionDialog';
import { AdminError, AdminLoading, Field } from '@/components/admin/AdminUi';
import { ReasonDialog } from '@/components/admin/ReasonDialog';
import { useAuth } from '@/lib/auth/AuthProvider';
import { canAccessTab, type AdminTabId } from '@/lib/auth/permissions';
import { opsApi, useOpsRunner, useOrderDocuments, type ReturnView } from '@/lib/data/orderOps';
import { formatInr, refundCeilingPaise } from '@/lib/orders/finance';
import { qcPhotoPaths } from '@/lib/orders/orderNotes';
import type { Order } from '@/types/store';
import { Badge, StatusBadge } from '../shared/badges';
import { PhotoStrip } from '../shared/PhotoStrip';

const REASON_LABELS: Record<string, string> = {
  damaged: 'Arrived damaged', defective: 'Manufacturing defect', wrong_item: 'Wrong item', not_as_described: 'Not as described', changed_mind: 'Changed my mind',
};

type Dialog = 'approve' | 'reject' | 'received' | null;

/** One order with a return: customer's reason and photos, then approve, reject, receive and route to refund or replacement. */
export function ReturnCard({ order, onNavigate }: { order: Order; onNavigate?: (tab: AdminTabId) => void }) {
  const { staffRole } = useAuth();
  const docs = useOrderDocuments(order.id);
  const { run, busy } = useOpsRunner();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [resolution, setResolution] = useState<'refund' | 'replacement'>('refund');
  const [restock, setRestock] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const label = order.orderNumber ?? order.id;
  const ret: ReturnView | null = docs.data?.return ?? null;
  const qcPaths = qcPhotoPaths(order.adminNotes);
  const close = () => { setDialog(null); setNote(''); setError(null); };

  const approve = async () => {
    const r = await run(() => opsApi.approveReturn(order.id, resolution, note.trim() || undefined));
    if (r.ok) { toast.success(`${label}: return approved for ${resolution}`); close(); } else setError(r.error);
  };
  const receive = async () => {
    const r = await run(() => opsApi.markReturnReceived(order.id, restock, note.trim() || undefined));
    if (r.ok) {
      toast.success(r.value.replacementOrderNumber ? `${label}: received. Replacement order ${r.value.replacementOrderNumber} created.` : `${label}: return received`);
      close();
    } else setError(r.error);
  };

  return (
    <article className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-soft">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-mono text-base font-bold">{label}</h4>
        <div className="flex items-center gap-2">
          {ret?.resolution && <Badge tone="info">{ret.resolution === 'refund' ? 'Refund' : 'Replacement'}</Badge>}
          <StatusBadge status={order.status} />
        </div>
      </header>
      <p className="text-sm text-muted-foreground">
        {[order.customerName, order.shippingCity].filter(Boolean).join(' · ')} · {order.items.map(i => `${i.productName} × ${i.quantity}`).join(', ')}
      </p>

      {docs.isLoading && <AdminLoading rows={1} />}
      {docs.error && <AdminError>Could not load the return: {docs.error.message}</AdminError>}
      {ret && (
        <div className="space-y-2 text-sm">
          <p><span className="font-semibold">{REASON_LABELS[ret.reason] ?? ret.reason}</span>
            <span className="text-xs text-muted-foreground"> · requested {new Date(ret.requestedAt).toLocaleDateString('en-IN')}</span></p>
          {ret.details && <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-3">{ret.details}</p>}
          <PhotoStrip paths={ret.photoPaths} label="Customer photos" alt="Return evidence" empty="No photos attached." />
          {qcPaths.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Photographed at QC before dispatch</p>
              <PhotoStrip paths={qcPaths} label="QC photos" alt="Piece at quality check" />
            </div>
          )}
          {ret.decisionNote && <p className="text-xs text-muted-foreground">Note to customer: {ret.decisionNote}</p>}
        </div>
      )}

      {ret?.status === 'requested' && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => setDialog('approve')}>Approve</button>
          <button type="button" className="btn-secondary" onClick={() => setDialog('reject')}>Reject</button>
        </div>
      )}
      {ret?.status === 'approved' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Arrange the pickup or wait for the parcel, then record it as received.</p>
          <button type="button" className="btn-primary" onClick={() => setDialog('received')}>Mark received</button>
        </div>
      )}
      {ret?.status === 'received' && ret.resolution === 'refund' && (
        <div className="space-y-2">
          <p className="text-sm">Received. Finance issues the refund (up to {formatInr(refundCeilingPaise(order))}).</p>
          {staffRole && canAccessTab(staffRole, 'finance')
            ? <button type="button" className="btn-primary" onClick={() => onNavigate?.('finance')}>Go to Finance</button>
            : <p className="text-xs text-muted-foreground">Ask finance to refund this order.</p>}
        </div>
      )}
      {ret?.status === 'received' && ret.resolution === 'replacement' && (
        <p className="text-sm">Received. {ret.replacementOrderId ? 'A replacement order is in production.' : 'The replacement order was not created; check the order history.'}</p>
      )}

      <ActionDialog open={dialog === 'approve'} onClose={close} title={`Approve return for ${label}`} submitLabel="Approve" busy={busy} error={error} onSubmit={approve}
        description="Choose how the customer is made whole once the item is back.">
        <fieldset className="grid gap-2">
          {(['refund', 'replacement'] as const).map(r => (
            <label key={r} className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 text-sm">
              <input type="radio" name="resolution" checked={resolution === r} onChange={() => setResolution(r)} className="h-5 w-5 accent-primary" />
              <span><strong>{r === 'refund' ? 'Refund' : 'Replacement'}</strong> <span className="text-muted-foreground">{r === 'refund' ? '(finance refunds after receipt)' : '(a new zero-value order goes to production)'}</span></span>
            </label>
          ))}
        </fieldset>
        <Field label="Message to the customer (optional)"><textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={300} className="field" /></Field>
      </ActionDialog>

      <ReasonDialog open={dialog === 'reject'} onClose={close} destructive busy={busy} title={`Reject return for ${label}`} label="Reason (shown to the customer)"
        submitLabel="Reject return" description="The order goes back to Delivered and the customer is told why."
        onConfirm={async reason => {
          const r = await run(() => opsApi.rejectReturn(order.id, reason));
          if (r.ok) toast.success(`${label}: return rejected`);
          return r;
        }} />

      <ActionDialog open={dialog === 'received'} onClose={close} title={`Received ${label}`} submitLabel="Mark received" busy={busy} error={error} onSubmit={receive}
        description={ret?.resolution === 'replacement' ? 'A replacement order is created and sent to production.' : 'Finance can refund once the return is recorded.'}>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} className="h-5 w-5 accent-primary" />
          <span>Item is in good condition: add it back to stock</span>
        </label>
        <Field label="Note (optional)"><textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={300} className="field" /></Field>
      </ActionDialog>
    </article>
  );
}
