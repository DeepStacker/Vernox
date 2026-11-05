import { useState } from 'react';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import { AdminError, AdminLoading } from '@/components/admin/AdminUi';
import { useAuth } from '@/lib/auth/AuthProvider';
import { downloadTaxDocument, useOrderDocuments, type RefundView } from '@/lib/data/orderOps';
import { collectedPaise, formatInr, paymentState, refundCeilingPaise, totalPaise } from '@/lib/orders/finance';
import type { Order } from '@/types/store';
import { Badge, StatusBadge, type BadgeTone } from '../shared/badges';
import { RefundDialog } from './RefundDialog';

const REFUND_TONE: Record<RefundView['status'], BadgeTone> = { processed: 'good', pending: 'warn', failed: 'bad' };
const PAYMENT_LABEL = {
  prepaid_captured: 'Prepaid, captured', prepaid_unpaid: 'Prepaid, no payment on record', cod_collected: 'COD collected', cod_pending: 'COD, cash not collected', replacement: 'Replacement (no payment)',
} as const;

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="font-mono">{value}</dd></div>
);

/** Money, refunds, invoice and credit notes of one order, with the refund action for roles that may refund. */
export function OrderFinancePanel({ order }: { order: Order }) {
  const { permissions } = useAuth();
  const docs = useOrderDocuments(order.id);
  const [refunding, setRefunding] = useState(false);
  const ceiling = docs.data?.refundablePaise ?? refundCeilingPaise(order);
  const canRefund = Boolean(permissions?.canRefund);

  const download = async (name: string, creditNoteId?: string) => {
    try {
      await downloadTaxDocument(order.id, `${name.replace(/\//g, '-')}.pdf`, creditNoteId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The document could not be downloaded.');
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-mono text-lg font-bold">{order.orderNumber ?? order.id}</h3>
        <StatusBadge status={order.status} />
        <Badge tone="info">{PAYMENT_LABEL[paymentState(order)]}</Badge>
      </header>

      <dl className="space-y-1 rounded-lg border border-border bg-card p-3 text-sm">
        <Row label="Order total" value={formatInr(totalPaise(order))} />
        <Row label="Collected" value={formatInr(collectedPaise(order))} />
        <Row label="Refunded" value={formatInr(order.ops?.refundedPaise ?? 0)} />
        <Row label="Refund in progress" value={formatInr(order.ops?.refundPendingPaise ?? 0)} />
        <div className="flex justify-between gap-3 border-t border-border pt-1 font-semibold"><dt>Refundable now</dt><dd className="font-mono">{formatInr(ceiling)}</dd></div>
        {order.ops?.razorpayPaymentId && <p className="pt-1 text-xs text-muted-foreground">Razorpay payment <span className="font-mono">{order.ops.razorpayPaymentId}</span></p>}
        {(order.ops?.flags.length ?? 0) > 0 && <p className="pt-1 text-xs text-destructive">Flags: {order.ops?.flags.join(', ')}</p>}
      </dl>

      {canRefund ? (
        <button type="button" className="btn-primary" disabled={docs.isLoading || ceiling <= 0} onClick={() => setRefunding(true)}>
          {ceiling <= 0 ? 'Nothing to refund' : 'Create refund'}
        </button>
      ) : (
        <p className="text-xs text-muted-foreground">Your role can view payments but not issue refunds.</p>
      )}
      {refunding && <RefundDialog order={order} ceilingPaise={ceiling} onClose={() => setRefunding(false)} />}

      {docs.isLoading && <AdminLoading rows={2} />}
      {docs.error && <AdminError>Could not load documents: {docs.error.message}</AdminError>}
      {docs.data && (
        <>
          <section aria-label="Refunds" className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Refunds</h4>
            {docs.data.refunds.length === 0 && <p className="text-sm text-muted-foreground">No refunds yet.</p>}
            <ul className="space-y-2">
              {[...docs.data.refunds].sort((a, b) => b.createdAt - a.createdAt).map(r => (
                <li key={r.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-semibold">{formatInr(r.amountPaise)}</span>
                    <span className="flex items-center gap-2"><Badge tone="neutral">{r.method}</Badge><Badge tone={REFUND_TONE[r.status]}>{r.status}</Badge></span>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.reason} · {new Date(r.createdAt).toLocaleString('en-IN')}{r.providerRefundId ? ` · ref ${r.providerRefundId}` : ''}</p>
                  {r.status === 'pending' && <p className="text-xs text-muted-foreground">Waiting for Razorpay to confirm (refund.processed webhook).</p>}
                  {r.error && <p className="text-xs text-destructive">{r.error}</p>}
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Tax documents" className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invoice and credit notes</h4>
            {!docs.data.invoice && <p className="text-sm text-muted-foreground">The invoice is issued when the shipment is booked.</p>}
            <ul className="space-y-2">
              {docs.data.invoice && (
                <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 text-sm">
                  <span><span className="font-mono font-semibold">{docs.data.invoice.number}</span> <span className="text-xs text-muted-foreground">tax invoice · {docs.data.invoice.supplyType === 'intra_state' ? 'CGST + SGST' : 'IGST'}</span></span>
                  <button type="button" className="btn-secondary" onClick={() => void download(docs.data.invoice!.number)}><FileText className="h-4 w-4" /> PDF</button>
                </li>
              )}
              {docs.data.creditNotes.map(c => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 text-sm">
                  <span><span className="font-mono font-semibold">{c.number}</span> <span className="text-xs text-muted-foreground">credit note · {formatInr(c.totals.totalPaise ?? 0)}</span></span>
                  <button type="button" className="btn-secondary" onClick={() => void download(c.number, c.id)}><FileText className="h-4 w-4" /> PDF</button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
