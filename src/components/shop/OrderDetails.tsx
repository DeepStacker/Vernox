import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { OrderProgress } from '@/components/shop/OrderProgress';
import { useAuth } from '@/lib/auth/AuthProvider';
import { isOffPathStatus } from '@/lib/orders/fulfilmentStages';
import { ORDER_STATUS_LABELS } from '@/lib/orders/orderStateMachine';
import { formatINR } from '@/lib/storefront/format';
import {
  cancelOrder, downloadInvoice, fetchOrderActionState, MAX_PHOTO_BYTES, MAX_RETURN_PHOTOS, requestReturn, RETURN_REASONS,
  uploadReturnPhotos, type ReturnReason,
} from '@/lib/storefront/orderActions';
import type { PublicOrderSummary } from '@/types/store';

interface Props {
  order: PublicOrderSummary;
  /** Email the order was looked up with (guests); signed-in owners are identified by their token. */
  email?: string;
}

/**
 * One order, the same everywhere (confirmation, tracking, account): status, timeline, items, tracking link,
 * and the post-purchase actions the server allows right now (cancel, return/replacement, invoice).
 */
export function OrderDetails({ order, email }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'cancel' | 'return' | null>(null);
  const actionKey = ['order-actions', order.orderId, email?.toLowerCase() ?? null, user?.uid ?? null, order.status];
  const { data: actions } = useQuery({
    queryKey: actionKey,
    queryFn: () => fetchOrderActionState(order.orderId, email),
    enabled: Boolean(email || user),
    retry: false,
    staleTime: 30_000,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['order-lookup'] });
    void queryClient.invalidateQueries({ queryKey: ['order-actions'] });
  };

  const offPath = isOffPathStatus(order.status);
  const cod = (actions?.paymentMethod ?? order.paymentMethod) === 'cod';
  const trackingUrl = actions?.trackingUrl ?? order.tracking?.url;
  const invoiceNumber = actions?.invoiceNumber ?? order.invoiceNumber;
  const canReturn = !!actions?.returnEligibleUntil && actions.returnEligibleUntil > Date.now();

  const onInvoice = async () => {
    try {
      await downloadInvoice(order.orderId, email, invoiceNumber ?? order.orderNumber);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The invoice could not be downloaded.');
    }
  };

  return (
    <article className="space-y-5 rounded-lg border border-border bg-card p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-2xl">{order.orderNumber || order.orderId}</p>
          {order.placedAt && <p className="text-sm text-muted-foreground">{new Date(order.placedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
        </div>
        <span className="badge-pill">{ORDER_STATUS_LABELS[order.status]}</span>
      </header>

      {offPath ? (
        <p className="rounded-md bg-secondary p-3 text-sm">This order is {ORDER_STATUS_LABELS[order.status].toLowerCase()}. <Link to="/contact" className="font-semibold text-burgundy hover:underline">Contact us</Link> if you have questions.</p>
      ) : (
        <OrderProgress status={order.status} />
      )}

      {order.tracking?.estimatedDelivery && <p className="text-sm">Estimated delivery: <strong>{order.tracking.estimatedDelivery}</strong></p>}
      {order.tracking?.trackingNumber && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{order.tracking.carrier || 'Courier'}</span>
          <span className="font-mono">{order.tracking.trackingNumber}</span>
          {trackingUrl && <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-burgundy hover:underline">Track shipment <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>}
        </p>
      )}

      {order.items && order.items.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {order.items.map((item, i) => (
            <li key={`${item.productId ?? item.name}-${i}`} className="flex justify-between gap-3 py-2">
              <span>{item.name} <span className="text-muted-foreground">x {item.quantity}</span></span>
              {typeof item.lineTotal === 'number' && <span>{formatINR(item.lineTotal)}</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{[order.shippingCity, order.shippingState].filter(Boolean).join(', ')}</span>
        <span className="text-right">
          {typeof order.total === 'number' && <strong>{formatINR(order.total)}</strong>}
          {cod && <span className="ml-2 badge-pill">Pay on delivery</span>}
        </span>
      </div>

      {order.balanceDue ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
          <span>
            Advance received. <strong>{formatINR(order.balanceDue)}</strong> is due before dispatch.
          </span>
          {order.payBalanceUrl && (
            <a href={order.payBalanceUrl} target="_blank" rel="noopener noreferrer" className="btn-primary py-2 print:hidden">
              Pay balance <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
        </div>
      ) : null}

      {(actions?.canCancel || canReturn || invoiceNumber) && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4 print:hidden">
          {invoiceNumber && <button type="button" onClick={onInvoice} className="btn-secondary py-2"><Download className="h-4 w-4" aria-hidden="true" /> Invoice</button>}
          {canReturn && <button type="button" onClick={() => setDialog('return')} className="btn-secondary py-2"><FileText className="h-4 w-4" aria-hidden="true" /> Return or replace</button>}
          {actions?.canCancel && <button type="button" onClick={() => setDialog('cancel')} className="btn-secondary py-2 text-destructive">Cancel order</button>}
        </div>
      )}

      <CancelDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} order={order} email={email} onDone={refresh} />
      <ReturnDialog open={dialog === 'return'} onClose={() => setDialog(null)} order={order} email={email} onDone={refresh} />
    </article>
  );
}

interface DialogProps { open: boolean; onClose: () => void; order: PublicOrderSummary; email?: string; onDone: () => void }

function CancelDialog({ open, onClose, order, email, onDone }: DialogProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      toast.success(await cancelOrder(order.orderId, email, reason.trim()));
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The order could not be cancelled.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle className="font-display text-2xl">Cancel this order?</DialogTitle>
        <DialogDescription>Prepaid orders are refunded in full.</DialogDescription>
        <label className="text-sm font-medium">Reason (optional)
          <input value={reason} onChange={e => setReason(e.target.value)} maxLength={200} className="field mt-1 font-normal" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">Keep order</button>
          <button type="button" onClick={submit} disabled={busy} className="btn-primary">{busy ? 'Cancelling...' : 'Cancel order'}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReturnDialog({ open, onClose, order, email, onDone }: DialogProps) {
  const { user } = useAuth();
  const [reason, setReason] = useState<ReturnReason>('damaged');
  const [details, setDetails] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const needsPhoto = RETURN_REASONS.find(r => r.id === reason)?.needsPhoto ?? false;

  const pick = (list: FileList | null) => {
    const chosen = Array.from(list ?? []).filter(f => f.type.startsWith('image/'));
    if (chosen.some(f => f.size > MAX_PHOTO_BYTES)) toast.error('Each photo must be 5 MB or smaller.');
    setFiles(chosen.filter(f => f.size <= MAX_PHOTO_BYTES).slice(0, MAX_RETURN_PHOTOS));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (needsPhoto && files.length === 0) {
      toast.error('Please add at least one photo.');
      return;
    }
    setBusy(true);
    try {
      const photoPaths = await uploadReturnPhotos(order.orderId, files);
      await requestReturn({ orderId: order.orderId, email, reason, details: details.trim(), photoPaths });
      toast.success('Request sent. We will email you the next steps.');
      onDone();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The request could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogTitle className="font-display text-2xl">Return or replace</DialogTitle>
        <DialogDescription className="sr-only">Tell us what went wrong with order {order.orderNumber}.</DialogDescription>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium">What happened?
            <select value={reason} onChange={e => setReason(e.target.value as ReturnReason)} className="field mt-1 font-normal">
              {RETURN_REASONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">Details (optional)
            <textarea rows={3} maxLength={2000} value={details} onChange={e => setDetails(e.target.value)} className="field mt-1 font-normal" />
          </label>
          <div>
            <label className="block text-sm font-medium">Photos {needsPhoto ? '(required)' : '(optional)'}, up to {MAX_RETURN_PHOTOS}
              <input type="file" accept="image/*" multiple onChange={e => pick(e.target.files)} className="field mt-1 font-normal" disabled={!user} />
            </label>
            {!user && <p className="mt-1 text-xs text-muted-foreground"><Link to="/account" className="font-semibold text-burgundy hover:underline">Sign in</Link> with the order email to add photos.</p>}
            {files.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{files.map(f => f.name).join(', ')}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">Close</button>
            <button type="submit" disabled={busy || (needsPhoto && !user)} className="btn-primary">{busy ? 'Sending...' : 'Send request'}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
