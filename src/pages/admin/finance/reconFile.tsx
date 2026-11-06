/** Shared pieces of the reconciliation file panels (Razorpay settlement, courier COD remittance). */
import { Upload } from 'lucide-react';
import type { Order } from '@/types/store';

export function CsvUpload({ label, onFile }: { label: string; onFile: (file: File) => void }) {
  return (
    <label className="btn-secondary inline-flex cursor-pointer">
      <Upload className="h-4 w-4" aria-hidden /> {label}
      <input type="file" accept=".csv,text/csv" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </label>
  );
}

export function OrderLinks({ title, orders, detail, onSelect, tone = 'muted' }: {
  title: string; orders: readonly Order[]; detail: (o: Order) => string; onSelect: (id: string) => void; tone?: 'muted' | 'bad';
}) {
  if (orders.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className={`text-xs font-semibold uppercase tracking-wider ${tone === 'bad' ? 'text-destructive' : 'text-muted-foreground'}`}>{title}</h4>
      <ul className="space-y-2">
        {orders.slice(0, 50).map(o => (
          <li key={o.id}>
            <button type="button" onClick={() => onSelect(o.id)} className="min-h-11 w-full rounded-lg border border-border bg-card p-3 text-left text-sm">
              <span className="font-mono font-semibold">{o.orderNumber ?? o.id}</span> <span className="text-xs text-muted-foreground">{detail(o)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
