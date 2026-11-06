import { AlertTriangle, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { downloadOrderZip, downloadProductionFile, manufacturabilityWarnings, type CamFormat } from '@/lib/orders/camDownload';
import type { Order, Product } from '@/types/store';
import { StatusBadge } from '../shared/badges';
import { isCustomItem } from '../shared/itemSpec';
import { OrderItemSpecs } from '../shared/OrderItemSpecs';
import { OrderNotesPanel } from '../shared/OrderNotesPanel';

const FORMATS: CamFormat[] = ['dxf', 'svg', 'pdf'];

function download(order: Order, itemId: string, format: CamFormat) {
  const item = order.items.find(i => i.id === itemId);
  if (!item) return;
  try {
    const source = downloadProductionFile(order, item, format);
    toast.success(`${format.toUpperCase()} downloaded from the ${source === 'customer-design' ? 'customer design' : 'catalog outline'}`);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : `Could not generate the ${format.toUpperCase()} file`);
  }
}

function downloadAll(order: Order, format: CamFormat) {
  try {
    const { files, failed } = downloadOrderZip(order, format);
    toast.success(`${files} ${format.toUpperCase()} file${files === 1 ? '' : 's'} in one zip`);
    if (failed.length) toast.warning(`${failed.length} line${failed.length === 1 ? '' : 's'} could not be exported: ${failed[0].reason}`);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not build the zip');
  }
}

/** Full order detail for the workshop: specs, production files, manufacturability warnings, notes. */
export function JobDetail({ order, products, onClose }: { order: Order | null; products: readonly Product[]; onClose: () => void }) {
  return (
    <Dialog open={Boolean(order)} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {order && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 font-mono">
                {order.orderNumber || order.id} <StatusBadge status={order.status} />
              </DialogTitle>
              <DialogDescription>Placed {new Date(order.placedAt).toLocaleString('en-IN')}</DialogDescription>
            </DialogHeader>
            <OrderItemSpecs order={order} products={products} />
            <section aria-label="Production files" className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Production files</h4>
                {order.items.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Download all lines as zip">
                    <span className="text-xs text-muted-foreground">All {order.items.length} lines (zip)</span>
                    {FORMATS.map(f => (
                      <button key={f} type="button" onClick={() => downloadAll(order, f)}
                        className="min-h-9 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold uppercase">
                        <Download className="h-3.5 w-3.5" /> {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {order.items.map(item => {
                const warnings = manufacturabilityWarnings(order, item);
                return (
                  <div key={item.id} className="rounded-lg border border-border/70 p-3 space-y-2">
                    <div className="text-sm font-medium">
                      {item.productName} <span className="text-xs text-muted-foreground">
                        ({isCustomItem(item) ? 'customer design' : 'catalog outline'})
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {FORMATS.map(f => (
                        <button key={f} type="button" onClick={() => download(order, item.id, f)}
                          className="min-h-11 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 text-sm font-semibold uppercase">
                          <Download className="h-4 w-4" /> {f}
                        </button>
                      ))}
                    </div>
                    {warnings.length > 0 && (
                      <ul className="space-y-1 text-xs text-amber-800">
                        {warnings.map((w, i) => (
                          <li key={i} className="flex gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{w}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </section>
            <OrderNotesPanel order={order} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
