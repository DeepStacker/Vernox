/**
 * Derives everything the batch screen shows from the design, the bindings and the sheet:
 * parsed CSV, per-row checks, distinct variants, and the geometry results that arrive
 * lazily from the evaluator (visible rows first). Results are flushed to React at most
 * every FLUSH_MS so 500 rows finishing never means 500 renders.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BatchEvaluator, type VariantEval } from '@/lib/studio/batch/evaluate';
import { parseCsv } from '@/lib/csv/parseCsv';
import { batchTotals, checkRows, groupVariants } from '@/lib/studio/batch/plan';
import { activeBindings, missingColumns, type Bindings } from '@/lib/studio/batch/variables';
import { useStudio } from '@/lib/studio/store';
import type { StudioRuntimeContext } from '../useStudioRuntime';
import { useBatchStore } from './batchStore';

const FLUSH_MS = 120;

/** Design signature that ignores cached outlines and timestamps, so shaping does not restart a batch. */
function designSignature(doc: unknown): string {
  return JSON.stringify(doc, (key, value) => (key === 'outline' || key === 'production' || key === 'updatedAt' ? undefined : value));
}

export function useBatchModel(ctx: StudioRuntimeContext) {
  const doc = useStudio(s => s.doc);
  const csv = useBatchStore(s => s.csv);
  const storedBindings = useBatchStore(s => s.bindings);

  const parsed = useMemo(() => parseCsv(csv), [csv]);
  // Keyed by content: the document object changes whenever an outline is shaped.
  const bindingsKey = JSON.stringify(activeBindings(storedBindings, doc));
  const bindings = useMemo(() => JSON.parse(bindingsKey) as Bindings, [bindingsKey]);
  const missing = useMemo(() => missingColumns(bindings, parsed.headers), [bindings, parsed.headers]);
  const checks = useMemo(() => checkRows(parsed.headers, parsed.rows, bindings), [parsed, bindings]);
  const variants = useMemo(() => (missing.length ? [] : groupVariants(checks)), [checks, missing]);

  const signature = useMemo(() => designSignature(doc), [doc]);
  const results = useRef(new Map<string, VariantEval>());
  const [version, setVersion] = useState(0);
  const evaluator = useRef<BatchEvaluator | null>(null);

  useEffect(() => {
    results.current = new Map();
    setVersion(v => v + 1);
    if (variants.length === 0) return;
    let timer = 0;
    const flush = () => { timer = 0; setVersion(v => v + 1); };
    const ev = new BatchEvaluator({
      doc: useStudio.getState().doc,
      variants,
      ctx,
      onResult: (key, result) => {
        results.current.set(key, result);
        if (!timer) timer = window.setTimeout(flush, FLUSH_MS);
      },
    });
    evaluator.current = ev;
    void ev.run().then(() => { window.clearTimeout(timer); flush(); });
    return () => {
      window.clearTimeout(timer);
      ev.dispose();
      evaluator.current = null;
    };
    // `signature` stands in for the document: outline shaping must not restart the batch.
  }, [variants, signature, ctx]);

  const totals = useMemo(() => {
    const unit = new Map<string, number>();
    const failed = new Set<string>();
    for (const [key, r] of results.current) {
      if (r.state === 'ok' && r.unitPricePaise !== undefined) unit.set(key, r.unitPricePaise);
      else if (r.state === 'error') failed.add(key);
    }
    return batchTotals(checks, unit, failed);
    // `version` signals that `results` changed.
  }, [checks, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const prioritise = useCallback((keys: string[]) => evaluator.current?.setPriority(keys), []);

  return { doc, parsed, bindings, missing, checks, variants, results: results.current, version, totals, prioritise };
}
