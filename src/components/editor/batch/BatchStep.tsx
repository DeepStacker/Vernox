import { useMemo, useRef } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { MAX_BATCH_ROWS } from '@/lib/csv/parseCsv';
import { splitQuantity } from '@/lib/studio/batch/plan';
import { templateFields, type TextLink } from '@/lib/studio/batch/variables';
import { useCartQuote, type CartQuoteItem } from '@/lib/data/cartQuote';
import { volumeDiscountLabel, volumeNudge } from '@/lib/pricing/volumeDiscount';
import { formatPaise } from '@/lib/storefront/format';
import { CUSTOM_PRODUCT_ID } from '@/types/products';
import { t } from '@/lib/studio/i18n';
import { ORDER_LIMITS } from '@/lib/pricing/orderLimits';
import type { TextObject } from '@/lib/studio/schema';
import { Section } from '../panels/fields';
import type { StudioRuntimeContext } from '../useStudioRuntime';
import { BatchTable } from './BatchTable';
import { useBatchStore } from './batchStore';
import { useBatchAddToCart } from './useBatchAddToCart';
import { useBatchModel } from './useBatchModel';

const MAX_FILE_BYTES = 2_000_000;

function VariableRow({ text, link, headers }: { text: TextObject; link: TextLink | undefined; headers: readonly string[] }) {
  const template = link?.template ?? '';
  const { setBinding, clearBinding } = useBatchStore.getState();
  const name = text.text.split('\n')[0] || 'Text';
  const fieldName = link?.label ?? link?.field ?? '';
  return (
    <div className="flex flex-col gap-1.5" data-testid="batch-variable">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span className="truncate">{name}</span>
        <input
          className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          value={template}
          placeholder={t('batch.fixed')}
          onChange={e => setBinding(text.id, e.target.value)}
          aria-label={`Variable for ${name}`}
        />
      </label>
      {link?.source === 'auto' && (
        <p className="text-[11px] text-emerald-700" data-testid="batch-link">{t('batch.linkAuto', { column: link.columns[0] ?? '', field: fieldName })}</p>
      )}
      {link?.source === 'unlinked' && headers.length > 0 && (
        <p className="text-[11px] text-amber-700" data-testid="batch-link">{t('batch.linkMissing', { field: fieldName, text: name })}</p>
      )}
      {link?.source === 'manual' && link.field && (
        <button type="button" className="self-start text-[11px] text-muted-foreground underline hover:text-foreground" onClick={() => clearBinding(text.id)}>
          {t('batch.linkReset')}
        </button>
      )}
      {headers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {headers.filter(Boolean).slice(0, 12).map(h => (
            <button
              key={h}
              type="button"
              onClick={() => setBinding(text.id, `${template}{${h}}`)}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${templateFields(template).some(f => f.toLowerCase() === h.toLowerCase()) ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}
            >
              {`{${h}}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The batch's price from the server (one quote for all priced designs, as cart lines), including the bulk discount. */
function useBatchQuote(model: ReturnType<typeof useBatchModel>, priced: boolean) {
  const { variants, results, version, doc } = model;
  const finish = doc.material.finish;
  const request = useMemo(() => {
    if (!priced) return null;
    const items: CartQuoteItem[] = [];
    for (const v of variants) {
      const r = results.get(v.key);
      if (r?.state !== 'ok' || !r.size) continue;
      for (const quantity of splitQuantity(v.quantity)) items.push({ productId: CUSTOM_PRODUCT_ID, widthMm: r.size.widthMm, heightMm: r.size.heightMm, finish, quantity });
    }
    // More lines than one order takes: the batch goes to the cart in rounds, and checkout prices each order.
    return items.length > 0 && items.length <= ORDER_LIMITS.maxLines ? { items } : null;
    // `version` signals that `results` changed.
  }, [priced, variants, finish, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return useCartQuote(request);
}

/** Batch screen: variables, sheet, validated table with previews, total and add to cart. */
export function BatchStep({ ctx }: { ctx: StudioRuntimeContext }) {
  const model = useBatchModel(ctx);
  const { parsed, doc, checks, variants, results, totals, missing, links, unusedColumns } = model;
  const csv = useBatchStore(s => s.csv);
  const fileName = useBatchStore(s => s.fileName);
  const added = useBatchStore(s => s.added);
  const { setCsv, clearSheet } = useBatchStore.getState();
  const { addBatch, adding } = useBatchAddToCart(ctx);
  const fileRef = useRef<HTMLInputElement>(null);

  const texts = doc.objects.filter((o): o is TextObject => o.kind === 'text');
  const orderable = variants.filter(v => results.get(v.key)?.state === 'ok' && !added.has(v.key));
  const priced = totals.pending === 0;
  const { quote } = useBatchQuote(model, priced);
  // The server's figures only when they price exactly the rows on screen (no stale quote after an edit).
  const serverQuote = quote && quote.subtotalPaise === totals.totalPaise ? quote : null;

  const onFile = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) return void toast.error(t('batch.inputTruncated'));
    setCsv(await file.text(), file.name);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <aside className="flex max-h-[45%] w-full shrink-0 flex-col overflow-y-auto border-b border-border bg-card lg:max-h-none lg:w-80 lg:border-b-0 lg:border-r">
        <Section title={t('batch.variables')}>
          {texts.length === 0 && <p className="text-sm text-muted-foreground">{t('batch.noText')}</p>}
          {texts.length > 0 && <p className="text-xs text-muted-foreground">{t('batch.variablesHint', { column: '{name}' })}</p>}
          {texts.map(o => <VariableRow key={o.id} text={o} link={links.find(l => l.objectId === o.id)} headers={parsed.headers} />)}
          {unusedColumns.length > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="batch-unused-columns">{t('batch.unusedColumns', { columns: unusedColumns.join(', ') })}</p>
          )}
        </Section>
        <Section title={t('batch.data')}>
          <textarea
            className="h-28 w-full resize-y rounded-md border border-input bg-background p-2 font-mono text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
            placeholder={t('batch.paste')}
            value={csv}
            onChange={e => setCsv(e.target.value)}
            spellCheck={false}
            aria-label={t('batch.paste')}
          />
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary h-9 gap-1.5 px-3 text-xs" onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />{t('batch.upload')}
            </button>
            {csv && <button type="button" className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={clearSheet}>{t('batch.clear')}</button>}
            <span className="min-w-0 truncate text-xs text-muted-foreground">{fileName}</span>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" data-testid="batch-file"
            onChange={e => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
          {parsed.truncated && <p className="text-xs text-amber-700">{t('batch.truncated', { max: MAX_BATCH_ROWS, total: parsed.totalRows })}</p>}
          {parsed.inputTruncated && <p className="text-xs text-amber-700">{t('batch.inputTruncated')}</p>}
          {parsed.unterminatedQuote && <p className="text-xs text-amber-700">{t('batch.unterminated')}</p>}
          {missing.map(f => <p key={f} className="text-xs text-destructive">{t('batch.missingColumn', { field: f })}</p>)}
        </Section>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-xs text-muted-foreground" aria-live="polite">
          <span>{t('batch.rows', { count: parsed.rows.length })}</span>
          {totals.flaggedRows > 0 && <span className="font-medium text-destructive">{t('batch.flagged', { count: totals.flaggedRows })}</span>}
          <span>{t('batch.variants', { count: totals.variants })}</span>
          <span>{t('batch.units', { count: totals.units })}</span>
          {!priced && <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />{t('batch.pricing', { done: totals.variants - totals.pending, total: totals.variants })}</span>}
          <span className="ml-auto hidden sm:inline">{t('batch.limits', { lines: ORDER_LIMITS.maxLines, qty: ORDER_LIMITS.maxQuantityPerLine })}</span>
        </div>

        {parsed.rows.length > 0 ? (
          <BatchTable headers={parsed.headers} rows={parsed.rows} checks={checks} results={results} added={added} finish={doc.material.finish} onVisible={model.prioritise} />
        ) : <div className="flex-1" />}

        <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-4 py-3">
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{t('batch.total')}</span>
            <span className="text-lg font-semibold tabular-nums" data-testid="batch-total">
              {totals.variants > 0 ? formatPaise(serverQuote ? serverQuote.totalPaise : totals.totalPaise) : '—'}
            </span>
            {serverQuote?.volumeDiscount && (
              <span className="text-xs text-emerald-700" data-testid="batch-volume-discount">
                {t('batch.bulk', { label: volumeDiscountLabel(serverQuote.volumeDiscount), amount: formatPaise(serverQuote.volumeDiscount.discountPaise), subtotal: formatPaise(serverQuote.subtotalPaise) })}
              </span>
            )}
            {serverQuote?.nextVolumeTier && <span className="text-xs text-muted-foreground">{volumeNudge({ tier: serverQuote.nextVolumeTier, unitsToGo: serverQuote.nextVolumeTier.unitsToGo })}</span>}
          </div>
          <span className="text-xs text-muted-foreground sm:hidden">{t('batch.limits', { lines: ORDER_LIMITS.maxLines, qty: ORDER_LIMITS.maxQuantityPerLine })}</span>
          <button
            type="button"
            className="btn-primary h-11 px-5 text-sm disabled:opacity-50"
            disabled={adding || !priced || orderable.length === 0}
            onClick={() => void addBatch(orderable)}
            data-testid="batch-add-to-cart"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : t('batch.add', { count: orderable.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
