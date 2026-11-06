import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import type { VariantEval } from '@/lib/studio/batch/evaluate';
import type { BatchProblem, RowCheck } from '@/lib/studio/batch/plan';
import { t } from '@/lib/studio/i18n';
import { finishPreset } from '@/lib/studio/materials';
import { cn } from '@/lib/utils';

const ROW_HEIGHT = 60;
const OVERSCAN = 4;

const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

function problemMessage(p: BatchProblem): string {
  switch (p.code) {
    case 'empty-row': return t('batch.err.empty-row');
    case 'empty-value': return t('batch.err.empty-value', { field: p.field });
    case 'bad-qty': return t('batch.err.bad-qty', { value: p.value });
    case 'qty-too-high': return t('batch.err.qty-too-high', { max: p.max });
    case 'too-long': return t('batch.err.too-long', { over: p.overMm });
    case 'shape-failed': return t('batch.err.shape-failed');
    case 'unpriced': return t('batch.err.unpriced', { reason: p.reason });
    case 'not-orderable': return p.message;
  }
}

function Thumb({ result, fill }: { result: VariantEval | undefined; fill: string }) {
  if (!result) return <div className="h-11 w-14 animate-pulse rounded bg-muted" aria-label="Preview loading" />;
  if (!result.previewD || !result.viewBox) return <div className="h-11 w-14 rounded bg-muted" />;
  return (
    <svg viewBox={result.viewBox} className="h-11 w-14 rounded bg-muted p-1" role="img" aria-label="Preview">
      <path d={result.previewD} fill={fill} fillRule="evenodd" />
    </svg>
  );
}

interface RowProps {
  check: RowCheck;
  cells: readonly string[];
  result: VariantEval | undefined;
  inCart: boolean;
  fill: string;
  template: string;
  top: number;
}

const Row = memo(function Row({ check, cells, result, inCart, fill, template, top }: RowProps) {
  const problems = check.state === 'valid' ? result?.problems ?? [] : check.problems;
  const flagged = check.state !== 'valid' ? true : result?.state === 'error';
  return (
    <div
      role="row"
      data-testid="batch-row"
      className={cn('absolute left-0 right-0 grid items-center gap-x-3 border-b border-border px-3 text-sm', flagged && 'bg-destructive/5')}
      style={{ top, height: ROW_HEIGHT, gridTemplateColumns: template }}
    >
      <span className="text-xs tabular-nums text-muted-foreground">{check.index + 1}</span>
      {check.state === 'empty' ? <div className="h-11 w-14 rounded bg-muted" /> : <Thumb result={result} fill={fill} />}
      {cells.map((c, i) => <span key={i} className="truncate" title={c}>{c}</span>)}
      <span className="text-right tabular-nums">{check.state === 'valid' ? check.quantity : ''}</span>
      <span className="text-right tabular-nums">
        {result?.unitPricePaise !== undefined && check.state === 'valid' ? rupees(result.unitPricePaise * check.quantity) : ''}
      </span>
      <div className="flex min-w-0 items-center gap-1.5 text-xs">
        {flagged ? (
          <>
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            <span className="line-clamp-2 text-destructive">{problems.map(problemMessage).join('. ')}</span>
          </>
        ) : inCart ? (
          <><Check className="h-4 w-4 text-emerald-600" /><span className="text-muted-foreground">{t('batch.added')}</span></>
        ) : !result ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Checking" /> : null}
      </div>
    </div>
  );
});

/**
 * The validated sheet. Only the rows in (or near) the viewport are rendered, and the
 * evaluator is told which designs those are so their previews are produced first.
 */
export function BatchTable({ headers, rows, checks, results, added, finish, onVisible }: {
  headers: readonly string[];
  rows: readonly (readonly string[])[];
  checks: readonly RowCheck[];
  results: ReadonlyMap<string, VariantEval>;
  added: ReadonlySet<string>;
  finish: string;
  onVisible: (keys: string[]) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // An unmeasured (0 px) container renders the default window rather than nothing.
    const measure = () => setHeight(el.clientHeight || 600);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + height) / ROW_HEIGHT) + OVERSCAN);

  useEffect(() => {
    const keys: string[] = [];
    for (let i = first; i < last; i++) if (checks[i]?.state === 'valid') keys.push(checks[i].key);
    onVisible(keys);
  }, [first, last, checks, onVisible]);

  const fill = finishPreset(finish).swatch[0];
  const template = `2rem 3.5rem ${headers.map(() => 'minmax(7rem,1fr)').join(' ')} 3rem 5rem minmax(10rem,1.4fr)`;
  const minWidth = `${2 + 3.5 + headers.length * 7 + 3 + 5 + 10 + 2}rem`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-auto" role="table" aria-label="Batch rows" aria-rowcount={rows.length}>
      <div className="flex min-h-0 flex-1 flex-col" style={{ minWidth }}>
        <div role="row" className="grid shrink-0 items-center gap-x-3 border-b border-border bg-muted/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ gridTemplateColumns: template }}>
          <span>#</span><span />
          {headers.map((h, i) => <span key={i} className="truncate">{h || '—'}</span>)}
          <span className="text-right">{t('batch.col.qty')}</span>
          <span className="text-right">{t('batch.col.price')}</span>
          <span />
        </div>
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto" onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
          <div className="relative" style={{ height: rows.length * ROW_HEIGHT }}>
            {checks.slice(first, last).map(check => (
              <Row
                key={check.index}
                check={check}
                cells={rows[check.index]}
                result={check.state === 'valid' ? results.get(check.key) : undefined}
                inCart={added.has(check.key)}
                fill={fill}
                template={template}
                top={check.index * ROW_HEIGHT}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
