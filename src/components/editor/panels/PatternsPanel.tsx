import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { ringsBounds, ringsToPathData, type Bounds } from '@/lib/studio/geometry/path';
import {
  defaultMarginMm, defaultPatternSizeMm, defaultWebMm, MAX_PATTERN_CELLS, MAX_PATTERN_SIZE_MM, MIN_PATTERN_SIZE_MM,
  minPatternSizeMm, PATTERNS, patternInfo, type PatternId,
} from '@/lib/studio/patterns/catalog';
import { generatePattern, HEAVY_PATTERN_CHARS, type PatternRequest, type PatternResult } from '@/lib/studio/patterns/generate';
import { PatternClient } from '@/lib/studio/patterns/patternClient';
import { canFill, objectFillTarget, plateFillTarget, type FillTarget } from '@/lib/studio/patterns/region';
import { selectedObjects, useStudio } from '@/lib/studio/store';
import { cn } from '@/lib/utils';
import { addPatternFill } from '../actions';
import { useCutRules, useStudioContext } from '../useStudioRuntime';
import { Field, NumberField, Section, Segmented } from './fields';

const PREVIEW_DEBOUNCE_MS = 300;

/** Tiny in-thread samples for the pattern picker (a few cells each, a millisecond to make). */
const THUMBS = new Map<PatternId, { d: string; x: number; y: number }>();
function thumbnail(id: PatternId) {
  let t = THUMBS.get(id);
  if (!t) {
    const r = generatePattern({ patternId: id, region: [[{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }, { x: 0, y: 60 }]], sizeMm: 14, webMm: 2.5, marginMm: 3, minHoleMm: 0, mode: 'cut' });
    t = r.ok === true ? { d: r.d, x: r.centre.x, y: r.centre.y } : { d: '', x: 0, y: 0 };
    THUMBS.set(id, t);
  }
  return t;
}

type Preview = { key: string; result: PatternResult } | null;

const failureText = (r: Extract<PatternResult, { ok: false }>): string => {
  switch (r.reason) {
    case 'too-many-cells': return `This would need about ${r.cells} cells (the limit is ${MAX_PATTERN_CELLS}). Make the pattern bigger or fill a smaller area.`;
    case 'no-room': return 'The margin leaves no room. Reduce the margin.';
    case 'empty': return 'No whole cell fits. Reduce the margin or the pattern size.';
    default: return 'These settings cannot make a pattern.';
  }
};

/** Jali fills: a geometric pattern clipped to the plate or to the selected shape, with a web that suits the metal. */
export function PatternsPanel() {
  const doc = useStudio(s => s.doc);
  const selected = useStudio(useShallow(s => selectedObjects(s)));
  const rules = useCutRules(useStudioContext());
  const [patternId, setPatternId] = useState<PatternId>('hexagon');
  const [onSelection, setOnSelection] = useState(false);
  const [overrides, setOverrides] = useState<{ size?: number; web?: number; margin?: number }>({});
  const [preview, setPreview] = useState<Preview>(null);
  const [busy, setBusy] = useState(false);
  const client = useRef<PatternClient | null>(null);

  const info = patternInfo(patternId);
  const only = selected.length === 1 ? selected[0] : undefined;
  const selectionOk = canFill(only);
  const useSelection = onSelection && selectionOk;

  const target: FillTarget = useMemo(
    () => (useSelection && only ? objectFillTarget(only) : plateFillTarget(doc.plate)),
    [useSelection, only, doc.plate],
  );

  const web = overrides.web ?? defaultWebMm(rules.minFeatureMm);
  const size = overrides.size ?? defaultPatternSizeMm(info, web, rules.minHoleMm);
  const margin = overrides.margin ?? (useSelection ? Math.max(6, Math.ceil(web * 2)) : defaultMarginMm(doc.mounting, rules.minEdgeMm, web));

  const request: PatternRequest = useMemo(
    () => ({ patternId, region: target.region, sizeMm: size, webMm: web, marginMm: margin, minHoleMm: rules.minHoleMm, mode: target.mode }),
    [patternId, target, size, web, margin, rules.minHoleMm],
  );
  const key = useMemo(() => JSON.stringify([request.patternId, request.sizeMm, request.webMm, request.marginMm, request.minHoleMm, request.mode, ringsToPathData(request.region, true, 1)]), [request]);

  const getClient = () => (client.current ??= new PatternClient());
  useEffect(() => () => client.current?.dispose(), []);

  // Debounced live preview in the worker; a newer request replaces an older one.
  useEffect(() => {
    setBusy(true);
    const timer = setTimeout(() => {
      getClient().generate(request).then(result => {
        if (result) { setPreview({ key, result }); setBusy(false); }
      }, () => { setPreview(null); setBusy(false); });
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `key` captures every input of `request`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = preview?.key === key ? preview.result : null;
  const ok = current?.ok === true ? current : null;
  const box: Bounds | null = useMemo(() => ringsBounds(target.region), [target.region]);
  const regionD = useMemo(() => ringsToPathData(target.region, true, 1), [target.region]);

  const warnings: string[] = [];
  if (web < rules.minFeatureMm) warnings.push(`A web under ${rules.minFeatureMm} mm is too thin for this metal.`);
  if (info.holeFactor * size - web < rules.minHoleMm) warnings.push(`The smallest holes are under ${rules.minHoleMm} mm. Make the pattern bigger (at least ${minPatternSizeMm(info, web, rules.minHoleMm)} mm).`);
  if (ok && ok.chars > HEAVY_PATTERN_CHARS) warnings.push('This is a very detailed fill. The design file may be too large to order online; a bigger pattern size makes it lighter.');

  const commit = async () => {
    setBusy(true);
    try {
      const result = current ?? await getClient().generate(request);
      if (!result) return;
      if (result.ok === false) { toast.error(failureText(result)); return; }
      const replace = useSelection && only?.op === 'cut' ? only.id : undefined;
      addPatternFill(result, target.mode, `${info.name} pattern`, replace);
      toast.success(`Added ${result.holes} ${target.mode === 'cut' ? 'cut-outs' : 'cells'}`);
    } catch {
      toast.error('Could not make the pattern. Try a bigger pattern size.');
    } finally {
      setBusy(false);
    }
  };

  const set = (patch: typeof overrides) => setOverrides(o => ({ ...o, ...patch }));
  const fillLabel = useSelection ? 'Fill selected shape' : 'Fill plate';

  return (
    <>
      <Section title="Pattern">
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Pattern">
          {PATTERNS.map(p => {
            const th = thumbnail(p.id);
            return (
              <button key={p.id} type="button" role="radio" aria-checked={patternId === p.id} aria-label={p.name} title={`${p.name}: ${p.blurb}`}
                onClick={() => { setPatternId(p.id); setOverrides(o => ({ web: o.web, margin: o.margin })); }}
                className={cn('aspect-square rounded-md border p-0.5', patternId === p.id ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-foreground/40')}>
                <svg viewBox="0 0 60 60" className="h-full w-full" aria-hidden="true">
                  <rect width="60" height="60" className="fill-foreground/70" />
                  <g transform={`translate(${th.x} ${th.y})`}><path d={th.d} className="fill-card" /></g>
                </svg>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{info.name}.</span> {info.blurb}.</p>
      </Section>

      <Section title="Where">
        <Segmented<'plate' | 'selection'>
          label=""
          value={useSelection ? 'selection' : 'plate'}
          options={[{ value: 'plate', label: 'Whole plate' }, { value: 'selection', label: 'Selected shape' }]}
          onChange={v => setOnSelection(v === 'selection')}
        />
        {onSelection && !selectionOk && <p className="text-xs text-muted-foreground">Select one shape, drawing or text first. Engrave lines and holes cannot be filled.</p>}
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="Pattern size" length value={size} min={MIN_PATTERN_SIZE_MM} max={MAX_PATTERN_SIZE_MM} onChange={v => set({ size: v })} />
          <NumberField label="Web width" length value={web} min={0.5} max={20} step={0.5} onChange={v => set({ web: v })} />
          <NumberField label="Margin" length value={margin} min={0} max={200} onChange={v => set({ margin: v })} />
        </div>
        <Field label="">
          <span className="text-xs text-muted-foreground">
            Web width is the metal left between holes; the default suits {rules.thicknessMm} mm metal. Margin keeps the pattern clear of the edge{doc.mounting.preset !== 'none' && !useSelection ? ' and the mounting holes' : ''}.
          </span>
        </Field>
      </Section>

      <Section title="Preview">
        {box && (
          <div className="relative overflow-hidden rounded-md border border-border bg-muted/40">
            <svg viewBox={`${box.minX} ${box.minY} ${Math.max(1, box.maxX - box.minX)} ${Math.max(1, box.maxY - box.minY)}`} className="max-h-56 w-full" aria-label="Pattern preview">
              {target.mode === 'cut' ? (
                <>
                  <path d={regionD} className="fill-foreground/70" />
                  {ok && <g transform={`translate(${ok.centre.x} ${ok.centre.y})`}><path d={ok.d} className="fill-card" /></g>}
                </>
              ) : (
                ok && <g transform={`translate(${ok.centre.x} ${ok.centre.y})`}><path d={ok.d} fillRule="evenodd" className="fill-foreground/70" /></g>
              )}
            </svg>
            {busy && <div className="absolute right-2 top-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Working" /></div>}
          </div>
        )}
        {current?.ok === false && <p role="alert" className="text-sm text-destructive">{failureText(current)}</p>}
        {ok && <p className="text-xs text-muted-foreground">{ok.holes} {target.mode === 'cut' ? 'cut-outs' : 'cells'} · {Math.round(ok.widthMm)} × {Math.round(ok.heightMm)} mm</p>}
        {warnings.map(w => <p key={w} className="text-xs text-amber-700 dark:text-amber-400">{w}</p>)}
        <button type="button" className="btn-primary h-10 text-sm" disabled={busy || (onSelection && !selectionOk) || current?.ok === false} onClick={() => void commit()}>
          {fillLabel}
        </button>
      </Section>
    </>
  );
}
