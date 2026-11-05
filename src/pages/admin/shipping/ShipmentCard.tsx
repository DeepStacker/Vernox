import { useState } from 'react';
import { ExternalLink, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { ReasonDialog } from '@/components/admin/ReasonDialog';
import { AdminError } from '@/components/admin/AdminUi';
import { useAuth } from '@/lib/auth/AuthProvider';
import { opsApi, useOpsRunner, type DeliveryStatus } from '@/lib/data/orderOps';
import { parseNotes } from '@/lib/orders/orderNotes';
import { ORDER_STATUS_LABELS } from '@/lib/orders/orderStateMachine';
import { buildShippingLabelHtml, printHtml } from '@/lib/orders/printSheets';
import { DELIVERY_STATUS_LABELS, hasActiveShipment, shippingActions } from '@/lib/orders/shipping';
import { formatInr, totalPaise } from '@/lib/orders/finance';
import type { Order } from '@/types/store';
import { Badge, StatusBadge } from '../shared/badges';
import { CreateShipmentDialog } from './CreateShipmentDialog';

type Dialog = { kind: 'create' } | { kind: 'cancel_shipment' } | { kind: 'cancel_order' } | { kind: 'status'; status: DeliveryStatus } | null;

interface Props {
  order: Order;
  storeName: string;
  fromAddress: string;
  missingSeller: string[];
  onOpenSettings?: () => void;
}

/** One order in the shipping queue with the actions its state allows. */
export function ShipmentCard({ order, storeName, fromAddress, missingSeller, onOpenSettings }: Props) {
  const { permissions } = useAuth();
  const { run, busy } = useOpsRunner();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [refund, setRefund] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);

  const label = order.orderNumber ?? order.id;
  const actions = shippingActions(order);
  const shipment = order.ops?.shipment ?? null;
  const active = hasActiveShipment(order);
  const pkg = parseNotes(order.adminNotes).data.package;
  const isCod = order.ops?.paymentMethod === 'cod';
  const canRefund = Boolean(permissions?.canRefund);
  const canTrack = Boolean(permissions?.canTrackShipments);
  const close = () => setDialog(null);

  const printManualLabel = () => {
    if (!printHtml(buildShippingLabelHtml(order, { storeName, fromAddress }))) toast.error('The print window was blocked. Allow pop-ups for this site and try again.');
  };

  const openShiprocketLabel = async () => {
    setLinkError(null);
    const result = await run(() => opsApi.getLabel(order.id));
    if (!result.ok) return setLinkError(result.error);
    const url = result.value.labelUrl;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else setLinkError('The courier has not produced a label yet.');
  };

  return (
    <article className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-soft">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-mono text-base font-bold">{label}</h4>
        <div className="flex flex-wrap items-center gap-2">
          {isCod && <Badge tone="warn" title="Cash to collect on delivery">COD {formatInr(totalPaise(order))}</Badge>}
          <StatusBadge status={order.status} />
        </div>
      </header>

      <p className="text-sm text-muted-foreground">
        {[order.customerName, order.shippingCity, order.shippingPincode].filter(Boolean).join(' · ')}
        {' · '}{order.items.reduce((n, i) => n + i.quantity, 0)} item(s)
      </p>
      <p className="text-xs text-muted-foreground">
        {pkg ? `Package ${pkg.lengthCm} × ${pkg.widthCm} × ${pkg.heightCm} cm, ${pkg.weightKg} kg` : 'No package size recorded at packing'}
      </p>

      {shipment && shipment.status !== 'cancelled' && (
        <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">{shipment.provider === 'shiprocket' ? 'Shiprocket' : 'Manual'}</Badge>
            <span className="font-semibold">{shipment.courier ?? 'Courier pending'}</span>
            {shipment.awb && <span className="font-mono">AWB {shipment.awb}</span>}
            <Badge tone={shipment.status === 'delivered' ? 'good' : shipment.status === 'rto' ? 'bad' : 'neutral'}>{shipment.status.replace(/_/g, ' ')}</Badge>
          </div>
          {shipment.error && <p className="text-xs text-destructive">Last step: {shipment.error}</p>}
          <div className="flex flex-wrap gap-4">
            {shipment.trackingUrl && <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 underline">Track <ExternalLink className="h-3 w-3" /></a>}
            {shipment.labelUrl && <a href={shipment.labelUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 underline">Label <ExternalLink className="h-3 w-3" /></a>}
            {shipment.manifestUrl && <a href={shipment.manifestUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 underline">Manifest <ExternalLink className="h-3 w-3" /></a>}
          </div>
        </div>
      )}
      {shipment?.status === 'cancelled' && <p className="text-xs text-muted-foreground">The previous shipment was cancelled. Book a new one.</p>}
      {linkError && <AdminError>{linkError}</AdminError>}

      {canTrack ? (
        <div className="flex flex-wrap gap-2">
          {actions.canCreate && <button type="button" className="btn-primary" onClick={() => setDialog({ kind: 'create' })}>Create shipment</button>}
          {active && shipment?.provider === 'manual' && (
            <button type="button" className="btn-secondary" onClick={printManualLabel}><Printer className="h-4 w-4" /> Print label</button>
          )}
          {active && shipment?.provider === 'shiprocket' && !shipment.labelUrl && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void openShiprocketLabel()}>Get label</button>
          )}
          {actions.canCancelShipment && <button type="button" className="btn-secondary" onClick={() => setDialog({ kind: 'cancel_shipment' })}>Cancel shipment</button>}
          {actions.nextStatuses.map(s => (
            <button key={s} type="button" className="btn-secondary" onClick={() => setDialog({ kind: 'status', status: s })}>{DELIVERY_STATUS_LABELS[s]}</button>
          ))}
          {actions.canCancelOrder && <button type="button" className="btn-primary" onClick={() => { setRefund(canRefund); setDialog({ kind: 'cancel_order' }); }}>Cancel order and refund</button>}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Your role can view shipments but not change them.</p>
      )}
      {shipment?.provider === 'shiprocket' && active && order.status !== 'Packed' && (
        <p className="text-xs text-muted-foreground">Delivery updates for Shiprocket shipments arrive from the courier automatically.</p>
      )}

      {dialog?.kind === 'create' && <CreateShipmentDialog order={order} open onClose={close} missingSeller={missingSeller} onOpenSettings={onOpenSettings} />}

      <ReasonDialog open={dialog?.kind === 'cancel_shipment'} onClose={close} title={`Cancel shipment for ${label}`} label="Reason" submitLabel="Cancel shipment"
        description="Possible only before the courier picks the parcel up. The order stays Packed." busy={busy}
        onConfirm={async reason => {
          const r = await run(() => opsApi.cancelShipment(order.id, reason));
          if (r.ok) toast.success(`${label}: shipment cancelled`);
          return r;
        }} />

      <ReasonDialog open={dialog?.kind === 'status'} onClose={close} required={false} busy={busy}
        title={dialog?.kind === 'status' ? `${label}: ${DELIVERY_STATUS_LABELS[dialog.status]}` : ''} label="Note (optional)" submitLabel="Update status"
        description={dialog?.kind === 'status' && dialog.status === 'Delivered' && isCod
          ? `The courier collected ${formatInr(totalPaise(order))}; marking delivered records it as collected.`
          : `The order moves from ${ORDER_STATUS_LABELS[order.status]}. The customer is notified.`}
        onConfirm={async note => {
          if (dialog?.kind !== 'status') return { ok: false as const, error: 'No status selected.' };
          const r = await run(() => opsApi.updateDeliveryStatus(order.id, dialog.status, note || undefined));
          if (r.ok) toast.success(`${label}: ${DELIVERY_STATUS_LABELS[dialog.status]}`);
          return r;
        }} />

      <ReasonDialog open={dialog?.kind === 'cancel_order'} onClose={close} destructive busy={busy} title={`Cancel ${label}`} label="Reason"
        description="The parcel is back at the workshop. Stock returns, and the customer is refunded (prepaid) or a credit note is issued (COD)."
        submitLabel="Cancel order"
        onConfirm={async reason => {
          const r = await run(() => opsApi.cancelOrder(order.id, reason, refund && canRefund));
          if (r.ok && r.value.refundError) toast.warning(`${label} cancelled, but the refund did not start: ${r.value.refundError}. Ask finance to refund.`);
          else if (r.ok) toast.success(`${label} cancelled`);
          return r;
        }}>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={refund && canRefund} disabled={!canRefund} onChange={e => setRefund(e.target.checked)} className="h-5 w-5 accent-primary" />
          <span>Refund the customer now{!canRefund && ' (your role cannot refund; finance will do it)'}</span>
        </label>
      </ReasonDialog>
    </article>
  );
}
