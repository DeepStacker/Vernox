import { Plus, Trash2 } from 'lucide-react';
import { formatSizeCm } from '@/lib/catalog';
import { previewSizes, type ProductDraft, type SizeDraft } from './productForm';

interface Props {
  draft: Pick<ProductDraft, 'price' | 'mrp' | 'sizes'>;
  gstRatePercent: number;
  currency: string;
  errors: Record<string, string>;
  onChange: (sizes: SizeDraft[]) => void;
}

const inputClass = 'min-h-11 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-oxblood';

/** Sizes table: label, width, height and price difference, with the resulting unit price, MRP and discount per row. */
export function SizesEditor({ draft, gstRatePercent, currency, errors, onChange }: Props) {
  const preview = previewSizes(draft);
  const update = (i: number, patch: Partial<SizeDraft>) => onChange(draft.sizes.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const fmt = (n: number) => `${currency}${n.toLocaleString('en-IN')}`;

  return (
    <div className="space-y-2">
      {draft.sizes.map((s, i) => {
        const p = preview[i];
        const err = errors[`sizes.${i}.label`] || errors[`sizes.${i}.widthMm`] || errors[`sizes.${i}.heightMm`] || errors[`sizes.${i}.priceDelta`];
        const cm = Number(s.widthMm) > 0 && Number(s.heightMm) > 0 ? formatSizeCm({ widthMm: Number(s.widthMm), heightMm: Number(s.heightMm) }) : null;
        return (
          <div key={i} className="rounded-lg border border-border/70 p-2 space-y-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <input aria-label={`Size ${i + 1} label`} placeholder="Label" value={s.label} onChange={e => update(i, { label: e.target.value })} className={`${inputClass} col-span-2 sm:col-span-1`} />
              <input aria-label={`Size ${i + 1} width in mm`} placeholder="Width mm" inputMode="numeric" value={s.widthMm} onChange={e => update(i, { widthMm: e.target.value })} className={inputClass} />
              <input aria-label={`Size ${i + 1} height in mm`} placeholder="Height mm" inputMode="numeric" value={s.heightMm} onChange={e => update(i, { heightMm: e.target.value })} className={inputClass} />
              <input aria-label={`Size ${i + 1} price difference`} placeholder="+ Price" inputMode="decimal" value={s.priceDelta} onChange={e => update(i, { priceDelta: e.target.value })} className={inputClass} />
              <button type="button" aria-label={`Remove size ${i + 1}`} disabled={draft.sizes.length === 1} onClick={() => onChange(draft.sizes.filter((_, idx) => idx !== i))}
                className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg border border-border disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground">
              {cm ? `${cm} · ` : ''}
              {p.price === null ? 'Enter price and difference to preview' : (
                <>Unit price <strong className="text-foreground">{fmt(p.price)}</strong> + GST = {fmt(Math.round(p.price * (1 + gstRatePercent / 100)))}
                  {p.mrp ? <> · MRP {fmt(p.mrp)} · <strong className="text-emerald-700">{p.discountPercent}% off</strong></> : null}</>
              )}
            </p>
            {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
          </div>
        );
      })}
      <button type="button" onClick={() => onChange([...draft.sizes, { label: '', widthMm: '', heightMm: '', priceDelta: '' }])}
        className="min-h-11 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold"><Plus className="h-4 w-4" /> Add size</button>
    </div>
  );
}
