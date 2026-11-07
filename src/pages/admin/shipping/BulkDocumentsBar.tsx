import { useState } from 'react';
import { ExternalLink, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { AdminError } from '@/components/admin/AdminUi';
import { opsApi, useOpsRunner, type BulkDocumentsView } from '@/lib/data/orderOps';
import { buildShippingLabelsHtml, printHtml } from '@/lib/orders/printSheets';
import { hasActiveShipment } from '@/lib/orders/shipping';
import type { Order } from '@/types/store';

interface Props {
  selected: Order[];
  storeName: string;
  fromAddress: string;
  onClear: () => void;
}

const refOf = (o: Order) => o.orderNumber ?? o.id;

/**
 * Bulk label and manifest actions for the orders ticked in the console: one merged courier PDF
 * (labels, manifest) for the booked Shiprocket shipments, and one printable sheet for manual ones.
 */
export function BulkDocumentsBar({ selected, storeName, fromAddress, onClear }: Props) {
  const { run, busy } = useOpsRunner();
  const [result, setResult] = useState<BulkDocumentsView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const booked = selected.filter(hasActiveShipment);
  const shiprocket = booked.filter(o => o.ops?.shipment?.provider === 'shiprocket');
  const manual = booked.filter(o => o.ops?.shipment?.provider === 'manual');
  const unbooked = selected.length - booked.length;

  const fetchCourierDocuments = async () => {
    setError(null);
    setResult(null);
    const r = await run(() => opsApi.bulkShipmentDocuments(shiprocket.map(o => o.id)));
    if (r.ok) setResult(r.value);
    else setError(r.error);
  };

  const printManual = () => {
    if (!printHtml(buildShippingLabelsHtml(manual, { storeName, fromAddress }))) toast.error('The print window was blocked. Allow pop-ups for this site and try again.');
  };

  const refs = (ids: string[]) => ids.map(id => { const o = selected.find(s => s.id === id); return o ? refOf(o) : id; }).join(', ');

  return (
    <section aria-label="Bulk documents" className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{selected.length} selected</span>
        <button type="button" className="btn-secondary" disabled={busy || shiprocket.length === 0} onClick={() => void fetchCourierDocuments()}>
          Courier labels and manifest ({shiprocket.length})
        </button>
        <button type="button" className="btn-secondary" disabled={manual.length === 0} onClick={printManual}>
          <Printer className="h-4 w-4" /> Print manual labels ({manual.length})
        </button>
        <button type="button" className="min-h-11 px-2 text-sm underline" onClick={onClear}>Clear selection</button>
      </div>
      {unbooked > 0 && <p className="text-xs text-muted-foreground">{unbooked} selected order(s) have no booked shipment yet and are left out.</p>}
      {error && <AdminError>{error}</AdminError>}
      {result && (
        <div className="space-y-2 text-sm">
          {result.batches.map((b, i) => (
            <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-muted-foreground">{refs(b.orderIds)}</span>
              {b.error && <span className="text-destructive">{b.error}</span>}
              {b.labelUrl && <a href={b.labelUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 underline">Labels PDF <ExternalLink className="h-3 w-3" /></a>}
              {b.manifestUrl && <a href={b.manifestUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 underline">Manifest PDF <ExternalLink className="h-3 w-3" /></a>}
            </div>
          ))}
          {result.skipped.map(s => <p key={s.orderId} className="text-xs text-muted-foreground">{refs([s.orderId])}: {s.reason}</p>)}
        </div>
      )}
    </section>
  );
}
