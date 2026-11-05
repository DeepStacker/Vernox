/**
 * Background services of the studio, each a small hook:
 *  - pricing/rules context from `settings/store` (same overrides the server applies)
 *  - text outline shaping (HarfBuzz, on demand, outside undo history)
 *  - debounced manufacturability analysis in the geometry worker
 *  - crash-safe autosave
 */
import { useEffect, useMemo, useRef } from 'react';
import { useStoreConfig } from '@/lib/data/settings';
import {
  CUSTOM_PIECE_LIMITS,
  DEFAULT_CUSTOM_LEAD_TIME_DAYS,
  quoteCustomPiece,
  resolveCustomFinishRates,
  type CustomFinishRate,
} from '@/lib/pricing/customPiece';
import { GeometryClient } from '@/lib/studio/geometryClient';
import { parseCutRuleOverrides, resolveCutRules, type CutRuleOverrides } from '@/lib/studio/materials';
import { useStudio } from '@/lib/studio/store';
import { shapeText } from '@/lib/studio/text/shaper';
import { autoFitBoundText } from '@/lib/studio/text/fit';
import type { StudioContext } from '@/lib/studio/api';
import type { TextObject } from '@/lib/studio/schema';
import { writeAutosave } from '@/lib/projectStorage';
import { useStudioUi } from './uiStore';

/** Public `settings/store` fields the studio reads (the client StoreConfig type omits them). */
interface StudioSettingsFields {
  customPieces?: unknown;
  customLeadTimeDays?: unknown;
  studioMaterials?: unknown;
}

export interface StudioRuntimeContext extends StudioContext {
  rates: Record<string, CustomFinishRate>;
  leadTimeDays: number;
  cutRuleOverrides?: CutRuleOverrides;
}

export function useStudioContext(): StudioRuntimeContext {
  const { data } = useStoreConfig();
  const raw = data as (typeof data & StudioSettingsFields) | undefined;
  return useMemo(() => {
    const lead = raw?.customLeadTimeDays;
    return {
      rates: resolveCustomFinishRates(raw?.customPieces),
      limits: CUSTOM_PIECE_LIMITS,
      leadTimeDays: typeof lead === 'number' && Number.isInteger(lead) && lead >= 0 && lead <= 90 ? lead : DEFAULT_CUSTOM_LEAD_TIME_DAYS,
      cutRuleOverrides: parseCutRuleOverrides(raw?.studioMaterials),
    };
  }, [raw?.customPieces, raw?.customLeadTimeDays, raw?.studioMaterials]);
}

export function useCutRules(ctx: StudioRuntimeContext) {
  const finish = useStudio(s => s.doc.material.finish);
  const thickness = useStudio(s => s.doc.material.thicknessMm);
  return useMemo(() => resolveCutRules(finish, thickness, ctx.cutRuleOverrides), [finish, thickness, ctx.cutRuleOverrides]);
}

/** Live price for the current billable size (from the latest analysis). */
export function useLivePrice(ctx: StudioRuntimeContext) {
  const size = useStudioUi(s => s.geometry?.size);
  const finish = useStudio(s => s.doc.material.finish);
  return useMemo(
    () => (size ? quoteCustomPiece({ ...size, finish }, ctx.rates, ctx.limits) : null),
    [size, finish, ctx.rates, ctx.limits],
  );
}

/** Shapes every text object that has no outline yet (template-bound text is fitted to the plate). */
export function useTextOutlines() {
  const objects = useStudio(s => s.doc.objects);
  const inFlight = useRef(new Map<string, string>());
  useEffect(() => {
    const ui = useStudioUi.getState();
    for (const o of objects) {
      if (o.kind !== 'text' || o.outline || !o.text.trim()) continue;
      const key = JSON.stringify([o.text, o.fontId, o.sizeMm, o.letterSpacingMm, o.lineHeight, o.align]);
      if (inFlight.current.get(o.id) === key) continue;
      inFlight.current.set(o.id, key);
      ui.shapingDelta(1);
      shapeText(o as TextObject)
        .then(shaped => {
          // Apply only if the object still has the same text settings.
          const current = useStudio.getState().doc.objects.find(x => x.id === o.id);
          if (current?.kind === 'text' && !current.outline &&
            JSON.stringify([current.text, current.fontId, current.sizeMm, current.letterSpacingMm, current.lineHeight, current.align]) === key) {
            const fitted = autoFitBoundText({ ...current, outline: shaped.d || undefined }, useStudio.getState().doc.plate);
            useStudio.getState().applyDerived({ [o.id]: { outline: fitted.outline, sizeMm: fitted.sizeMm, letterSpacingMm: fitted.letterSpacingMm } });
          }
        })
        .catch(err => useStudioUi.getState().setGeometryError(err instanceof Error ? err.message : String(err)))
        .finally(() => {
          if (inFlight.current.get(o.id) === key) inFlight.current.delete(o.id);
          useStudioUi.getState().shapingDelta(-1);
        });
    }
  }, [objects]);
}

const ANALYSIS_DEBOUNCE_MS = 120;

export function useGeometryAnalysis(ctx: StudioRuntimeContext) {
  const doc = useStudio(s => s.doc);
  const rules = useCutRules(ctx);
  const client = useRef<GeometryClient | null>(null);
  useEffect(() => {
    client.current = new GeometryClient(
      r => useStudioUi.getState().setGeometry(r),
      m => useStudioUi.getState().setGeometryError(m),
    );
    return () => client.current?.dispose();
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => client.current?.request(doc, rules, ctx.limits), ANALYSIS_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [doc, rules, ctx.limits]);
}

const AUTOSAVE_DEBOUNCE_MS = 800;

export function useAutosave(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let timer = 0;
    const flush = () => {
      window.clearTimeout(timer);
      writeAutosave(useStudio.getState().doc);
    };
    const unsub = useStudio.subscribe((s, prev) => {
      if (s.doc === prev.doc) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
    });
    window.addEventListener('pagehide', flush);
    return () => {
      unsub();
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [enabled]);
}
