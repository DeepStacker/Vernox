import { useMemo, useState } from 'react';
import { Download, Minus, Plus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { exportProductionDXF, exportProductionSVG } from '@/lib/exportCAM';
import { getDesignOutlineForPreview, toProduction } from '@/lib/studio/api';
import { WallPreview } from '@/components/wall-preview';
import type { FinishId } from '@/lib/catalog';
import { t } from '@/lib/studio/i18n';
import { availableFinishes, finishPreset, type CutRules } from '@/lib/studio/materials';
import { hasFeature } from '@/lib/studio/modes';
import { useStudio } from '@/lib/studio/store';
import { FinishSwatch } from './panels/FinishSwatch';
import { Section } from './panels/fields';
import { IssuesButton, PriceTag, SizeLabel } from './BottomBar';
import { useStudioUi } from './uiStore';
import { useAddToCart } from './useAddToCart';
import type { StudioRuntimeContext } from './useStudioRuntime';

function download(name: string, content: string | Blob, type: string) {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Production files of the customer's own design; jsPDF loads only for the PDF. */
async function exportFile(format: 'svg' | 'dxf' | 'dxf-kerf' | 'pdf', ctx: StudioRuntimeContext) {
  const doc = useStudio.getState().doc;
  const prod = toProduction(doc, ctx);
  const base = `vernox-${doc.name ? doc.name.replace(/[^\w-]+/g, '-').toLowerCase() : doc.id}`;
  if (format === 'pdf') {
    const { exportProductionPDF } = await import('@/lib/exportPDF');
    exportProductionPDF(prod, { title: doc.name || 'Custom design' }).save(`${base}.pdf`);
    return;
  }
  if (format === 'svg') download(`${base}.svg`, exportProductionSVG(prod), 'image/svg+xml');
  else download(`${base}${format === 'dxf-kerf' ? '-kerf' : ''}.dxf`, exportProductionDXF(prod, { applyKerf: format === 'dxf-kerf' }), 'application/dxf');
}

/** The finished part on a wall: finish gradient, optional standoff shadow. */
function PartPreview({ shadow }: { shadow: boolean }) {
  const geometry = useStudioUi(s => s.geometry);
  const finish = useStudio(s => s.doc.material.finish);
  const swatch = finishPreset(finish).swatch;
  const b = geometry?.bounds;
  if (!geometry?.materialD || !b) return <div className="aspect-[4/3] w-full animate-pulse rounded-lg bg-muted" />;
  const minX = b.minX, minY = b.minY, w = b.maxX - b.minX, h = b.maxY - b.minY;
  const pad = Math.max(w, h) * 0.12;
  return (
    <svg viewBox={`${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`} className="h-full max-h-[60vh] w-full" role="img" aria-label="Preview of the finished piece">
      <defs>
        <linearGradient id="review-metal" x1="0" y1="0" x2="1" y2="1">
          {swatch.map((c, i) => <stop key={i} offset={i / Math.max(1, swatch.length - 1)} stopColor={c} />)}
        </linearGradient>
        <filter id="review-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx={w * 0.012} dy={w * 0.02} stdDeviation={w * 0.012} floodColor="#000" floodOpacity="0.35" />
        </filter>
      </defs>
      <path d={geometry.materialD} fill="url(#review-metal)" fillRule="nonzero" filter={shadow ? 'url(#review-shadow)' : undefined} />
    </svg>
  );
}

/** Step 3: preview, finish, quantity, add to cart (and production files in Pro). */
export function ReviewStep({ ctx, rules, pricedFinishes }: { ctx: StudioRuntimeContext; rules: CutRules; pricedFinishes: string[] }) {
  const [quantity, setQuantity] = useState(1);
  const [shadow, setShadow] = useState(true);
  const mode = useStudioUi(s => s.mode);
  const orderable = useStudioUi(s => Boolean(s.geometry?.analysis.orderable));
  const material = useStudio(s => s.doc.material);
  const doc = useStudio(s => s.doc);
  // Contours are frozen in cut order on review; recompute only when the design changes.
  const outline = useMemo(() => getDesignOutlineForPreview(doc, ctx), [doc, ctx]);
  const updateMaterial = useStudio(s => s.updateMaterial);
  const { addToCart, adding } = useAddToCart(ctx);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto lg:flex-row">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-muted p-4 sm:p-8">
        <PartPreview shadow={shadow} />
        {orderable && <WallPreview outline={outline} finish={material.finish as FinishId} source="studio" className="w-full max-w-3xl" />}
      </div>
      <div className="flex w-full flex-col border-l border-border bg-card lg:w-96">
        <Section>
          <div className="flex items-baseline justify-between">
            <PriceTag ctx={ctx} />
            <IssuesButton rules={rules} ctx={ctx} />
          </div>
          <SizeLabel />
          <p className="text-xs text-muted-foreground">{t('bar.leadTime', { days: ctx.leadTimeDays })}</p>
        </Section>
        <Section title={t('review.finish')}>
          <div className="grid grid-cols-4 gap-2">
            {availableFinishes(mode, pricedFinishes).map(f => (
              <FinishSwatch key={f.id} finish={f.id} active={material.finish === f.id} onClick={() => updateMaterial({ finish: f.id, thicknessMm: f.defaultThicknessMm })} />
            ))}
          </div>
          <label className="flex items-center justify-between text-sm">{t('review.standoff')}<Switch checked={shadow} onCheckedChange={setShadow} /></label>
        </Section>
        <Section title={t('review.quantity')}>
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Fewer" className="btn-secondary h-10 w-10 p-0" onClick={() => setQuantity(q => Math.max(1, q - 1))}><Minus className="h-4 w-4" /></button>
            <span className="w-8 text-center text-lg" aria-live="polite">{quantity}</span>
            <button type="button" aria-label="More" className="btn-secondary h-10 w-10 p-0" onClick={() => setQuantity(q => Math.min(99, q + 1))}><Plus className="h-4 w-4" /></button>
          </div>
          <button type="button" className="btn-primary h-12 text-sm disabled:opacity-50" disabled={!orderable || adding} onClick={() => void addToCart(quantity)} data-testid="studio-add-to-cart">
            {t('bar.addToCart')}
          </button>
        </Section>
        {hasFeature(mode, 'export') && (
          <Section title={t('review.download')}>
            <div className="grid grid-cols-2 gap-2">
              {(['svg', 'dxf', 'dxf-kerf', 'pdf'] as const).map(f => (
                <button key={f} type="button" className="btn-secondary h-9 text-xs" onClick={() => void exportFile(f, ctx)}>
                  <Download className="mr-1 h-3.5 w-3.5" />{f === 'dxf-kerf' ? 'DXF (kerf)' : f.toUpperCase()}
                </button>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
