import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { issueMessage, t, type MessageKey } from '@/lib/studio/i18n';
import type { CutRules } from '@/lib/studio/materials';
import { useStudio } from '@/lib/studio/store';
import { cn } from '@/lib/utils';
import { applyFix } from './actions';
import { useStudioUi } from './uiStore';
import { useLivePrice, type StudioRuntimeContext } from './useStudioRuntime';

const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

const metres = (mm: number) => (mm / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 });

function BreakdownRow({ label, hint, paise }: { label: string; hint?: string; paise: number }) {
  return (
    <li className="flex items-start justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <span className="shrink-0 text-sm tabular-nums text-foreground">{rupees(paise)}</span>
    </li>
  );
}

/** The live price; clicking it explains the parts (plate, cutting, holes) in plain words. */
export function PriceTag({ ctx }: { ctx: StudioRuntimeContext }) {
  const quote = useLivePrice(ctx);
  const size = useStudioUi(s => s.geometry?.size);
  if (!quote) return <span className="text-sm text-muted-foreground">…</span>;
  if ('problem' in quote) return <span className="text-sm text-muted-foreground">—</span>;
  const b = quote.breakdown;
  const work = b.work;
  const sizeLabel = size ? `${(size.widthMm / 10).toFixed(1)} × ${(size.heightMm / 10).toFixed(1)} cm` : '';
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="text-left text-lg font-semibold text-foreground underline decoration-dotted underline-offset-4" aria-label={t('price.open')} data-testid="studio-price">
          {rupees(quote.unitPricePaise)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 p-3" data-testid="price-breakdown">
        <p className="text-sm font-semibold text-foreground">{t('price.title')}</p>
        <ul className="mt-1 divide-y divide-border">
          <BreakdownRow label={t('price.plate', { size: sizeLabel })} hint={t('price.plateHint')} paise={b.platePaise} />
          {work && (
            <BreakdownRow label={t('price.cutting')} hint={t('price.cuttingHint', { total: metres(work.cutLengthMm), included: metres(work.includedCutMm) })} paise={b.cuttingPaise} />
          )}
          {work && work.scoreLengthMm > 0 && (
            <BreakdownRow label={t('price.engraving')} hint={t('price.engravingHint', { total: metres(work.scoreLengthMm) })} paise={b.engravingPaise} />
          )}
          {work && (
            <BreakdownRow label={t('price.holes')} hint={t('price.holesHint', { total: work.pierces, included: work.includedPierces })} paise={b.holesPaise} />
          )}
          {b.minimumTopUpPaise > 0 && <BreakdownRow label={t('price.minimum')} paise={b.minimumTopUpPaise} />}
          <li className="flex justify-between pt-2 text-sm font-semibold text-foreground"><span>{t('price.total')}</span><span className="tabular-nums">{rupees(quote.unitPricePaise)}</span></li>
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{t('price.why')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('price.gst')}</p>
      </PopoverContent>
    </Popover>
  );
}

export function SizeLabel() {
  const size = useStudioUi(s => s.geometry?.size);
  if (!size) return null;
  const cm = `${(size.widthMm / 10).toFixed(1)} × ${(size.heightMm / 10).toFixed(1)} cm`;
  const inch = `${(size.widthMm / 25.4).toFixed(1)} × ${(size.heightMm / 25.4).toFixed(1)} in`;
  return <span className="text-xs text-muted-foreground" title={inch}>{cm} <span className="hidden sm:inline">· {inch}</span></span>;
}

export function IssuesButton({ rules, ctx }: { rules: CutRules; ctx: StudioRuntimeContext }) {
  const analysis = useStudioUi(s => s.geometry?.analysis);
  const shaping = useStudioUi(s => s.shaping);
  const select = useStudio(s => s.select);
  if (!analysis || shaping > 0) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Checking" />;
  const errors = analysis.issues.filter(i => i.severity === 'error');
  const warnings = analysis.issues.filter(i => i.severity === 'warning');
  const Icon = errors.length ? XCircle : warnings.length ? AlertTriangle : CheckCircle2;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn('inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium',
            errors.length ? 'bg-destructive/10 text-destructive' : warnings.length ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400')}
          aria-label={t('issues.title')}
        >
          <Icon className="h-4 w-4" />
          {errors.length + warnings.length > 0 ? errors.length + warnings.length : t('issues.none')}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" side="top" className="w-80 p-2">
        {analysis.issues.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">{t('issues.none')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {analysis.issues.map(issue => (
              <li key={issue.id} className="flex items-start gap-2 rounded-md p-2 text-sm hover:bg-muted">
                {issue.severity === 'error' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                <button type="button" className="flex-1 text-left" onClick={() => issue.objectId && select([issue.objectId])}>{issueMessage(issue)}</button>
                {issue.fix && (
                  <button type="button" className="shrink-0 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground" onClick={() => applyFix(issue.fix!, issue, rules, ctx)}>
                    {t(`fix.${issue.fix}` as MessageKey)}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function BottomBar({ ctx, rules, primaryLabel, onPrimary, busy, children }: {
  ctx: StudioRuntimeContext;
  rules: CutRules;
  primaryLabel: string;
  onPrimary: () => void;
  busy?: boolean;
  children?: React.ReactNode;
}) {
  const orderable = useStudioUi(s => Boolean(s.geometry?.analysis.orderable) && s.shaping === 0);
  return (
    <div className="flex h-16 shrink-0 items-center gap-3 border-t border-border bg-card px-3 sm:px-4">
      {children}
      <div className="flex min-w-0 flex-col">
        <PriceTag ctx={ctx} />
        <SizeLabel />
      </div>
      <span className="hidden text-xs text-muted-foreground md:inline">{t('bar.leadTime', { days: ctx.leadTimeDays })}</span>
      <div className="ml-auto flex items-center gap-2">
        <IssuesButton rules={rules} ctx={ctx} />
        <button
          type="button"
          className="btn-primary h-10 min-w-[120px] px-4 text-sm disabled:opacity-50"
          disabled={!orderable || busy}
          title={orderable ? undefined : t('bar.fixFirst')}
          onClick={onPrimary}
          data-testid="studio-primary"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : primaryLabel}
        </button>
      </div>
    </div>
  );
}
