/**
 * Material and machine presets — configuration, not UI. Every manufacturability rule
 * (kerf, minimum web, minimum hole, bridge width, minimum letter height) is resolved here
 * from (finish → substrate) and the chosen thickness, with optional overrides from
 * `settings/store.studioMaterials` (see docs/studio.md). Components never hardcode them.
 *
 * Gauge values come from the workshop's fiber-laser table (previously
 * src/lib/cadEngineTypes.ts). Derived values (bridge, minimum letter height, default
 * thickness per finish) are engineering defaults that the owner should confirm.
 */
import { DEFAULT_CUSTOM_FINISH_RATES } from '@/lib/pricing/customPiece';

export type Substrate = 'mild_steel' | 'stainless_304' | 'aluminum_5052' | 'brass_cz108' | 'copper_c101' | 'corten_weathering';

export interface GaugeRow {
  thicknessMm: number;
  kerfMm: number;
  minWebMm: number;
  minHoleMm: number;
  minEdgeMm: number;
  feedMmPerMin: number;
  pierceSec: number;
  densityGPerCm3: number;
}

const g = (thicknessMm: number, kerfMm: number, minWebMm: number, minHoleMm: number, minEdgeMm: number, feedMmPerMin: number, pierceSec: number, densityGPerCm3: number): GaugeRow =>
  ({ thicknessMm, kerfMm, minWebMm, minHoleMm, minEdgeMm, feedMmPerMin, pierceSec, densityGPerCm3 });

/** 3 kW fiber laser, bed 3000 × 1500 mm. */
export const MACHINE = {
  id: 'fiber_laser_3kw',
  name: '3 kW fiber laser',
  bedWidthMm: 3000,
  bedHeightMm: 1500,
  gauges: {
    mild_steel: [g(1, 0.15, 1.2, 1, 3, 6500, 0.05, 7.85), g(1.5, 0.18, 1.5, 1.5, 4, 4800, 0.08, 7.85), g(2, 0.2, 2, 2, 4.5, 3600, 0.12, 7.85), g(3, 0.25, 2.5, 3, 5, 2200, 0.25, 7.85), g(5, 0.32, 3.5, 5, 7, 1400, 0.6, 7.85), g(6, 0.38, 4.5, 6, 8, 1050, 0.9, 7.85)],
    stainless_304: [g(1, 0.14, 1.2, 1, 3, 7200, 0.05, 7.93), g(1.5, 0.17, 1.5, 1.5, 4, 5100, 0.1, 7.93), g(2, 0.2, 2, 2, 4.5, 3800, 0.15, 7.93), g(3, 0.24, 2.5, 3, 5, 2400, 0.3, 7.93)],
    aluminum_5052: [g(1.5, 0.2, 1.8, 1.8, 4, 6000, 0.1, 2.68), g(2, 0.22, 2.2, 2.2, 4.5, 4500, 0.18, 2.68), g(3, 0.28, 3, 3.2, 5.5, 2800, 0.35, 2.68)],
    brass_cz108: [g(1.5, 0.18, 1.8, 1.8, 4, 4200, 0.12, 8.44), g(2, 0.22, 2.2, 2.2, 4.5, 3100, 0.2, 8.44), g(3, 0.26, 2.8, 3, 5.5, 2100, 0.38, 8.44)],
    copper_c101: [g(1.5, 0.2, 2, 2, 4.5, 3800, 0.15, 8.94), g(2, 0.25, 2.5, 2.5, 5, 2700, 0.25, 8.94)],
    corten_weathering: [g(1.5, 0.18, 1.5, 1.5, 4, 4600, 0.08, 7.85), g(2, 0.2, 2, 2, 4.5, 3500, 0.12, 7.85), g(3, 0.25, 2.5, 3, 5, 2150, 0.25, 7.85)],
  } satisfies Record<Substrate, GaugeRow[]>,
} as const;

export interface FinishPreset {
  id: string;
  label: string;
  substrate: Substrate;
  defaultThicknessMm: number;
  /** Gradient stops for on-screen rendering (match the storefront swatches). */
  swatch: readonly string[];
  /** Shown in Simple mode (the storefront's core finishes); every finish is available in Pro. */
  simple: boolean;
}

const STEEL = ['#5c5c5c', '#2c2c2c', '#151515', '#0c0c0c'];
const STAINLESS = ['#ffffff', '#dfdfdf', '#a8a8a8', '#686868', '#383838'];
const BRASS = ['#ffe79a', '#dca842', '#b27b16', '#664103'];
const CORTEN = ['#f29f63', '#d9653b', '#963c11', '#4d1902'];

/** Keys are exactly the server's custom-piece finish ids (DEFAULT_CUSTOM_FINISH_RATES). */
export const FINISH_PRESETS: Readonly<Record<string, FinishPreset>> = {
  black_patina: { id: 'black_patina', label: 'Black', substrate: 'mild_steel', defaultThicknessMm: 2, swatch: STEEL, simple: true },
  brass: { id: 'brass', label: 'Brass', substrate: 'brass_cz108', defaultThicknessMm: 1.5, swatch: BRASS, simple: true },
  gold: { id: 'gold', label: 'Gold', substrate: 'brass_cz108', defaultThicknessMm: 1.5, swatch: ['#fff6d1', '#e8c95e', '#bc9a24', '#755b0a'], simple: true },
  copper: { id: 'copper', label: 'Copper', substrate: 'copper_c101', defaultThicknessMm: 1.5, swatch: ['#ffc4a6', '#e0764c', '#b54b20', '#631e05'], simple: true },
  antique_brass: { id: 'antique_brass', label: 'Antique brass', substrate: 'brass_cz108', defaultThicknessMm: 1.5, swatch: ['#d9b56a', '#a8803a', '#7a5a22', '#4a3410'], simple: true },
  stainless: { id: 'stainless', label: 'Stainless', substrate: 'stainless_304', defaultThicknessMm: 1.5, swatch: STAINLESS, simple: true },
  corten_rust: { id: 'corten_rust', label: 'Corten rust', substrate: 'corten_weathering', defaultThicknessMm: 2, swatch: CORTEN, simple: true },
  steel: { id: 'steel', label: 'Mild steel', substrate: 'mild_steel', defaultThicknessMm: 2, swatch: STEEL, simple: false },
  natural_mill: { id: 'natural_mill', label: 'Natural mill', substrate: 'mild_steel', defaultThicknessMm: 2, swatch: ['#b9b9b9', '#8d8d8d', '#6a6a6a', '#454545'], simple: false },
  brushed_hairline: { id: 'brushed_hairline', label: 'Brushed hairline', substrate: 'stainless_304', defaultThicknessMm: 1.5, swatch: STAINLESS, simple: false },
  mirror_polish: { id: 'mirror_polish', label: 'Mirror polish', substrate: 'stainless_304', defaultThicknessMm: 1.5, swatch: ['#ffffff', '#c9d3dc', '#7d8a96', '#eef2f5', '#4b5661'], simple: false },
  corten: { id: 'corten', label: 'Corten', substrate: 'corten_weathering', defaultThicknessMm: 2, swatch: CORTEN, simple: false },
  verdigris: { id: 'verdigris', label: 'Verdigris', substrate: 'copper_c101', defaultThicknessMm: 1.5, swatch: ['#a8e0cf', '#5fae97', '#3a7d6a', '#1f4a3e'], simple: false },
};

export const DEFAULT_FINISH = 'black_patina';

/** Resolved cutting rules for one material choice. */
export interface CutRules {
  substrate: Substrate;
  thicknessMm: number;
  kerfMm: number;
  /** Narrowest strip of metal that survives cutting and handling. */
  minFeatureMm: number;
  minHoleMm: number;
  /** Minimum distance from a hole to the plate edge. */
  minEdgeMm: number;
  bridgeMm: number;
  /** Smallest letter (cap) height that stays legible and strong. */
  minTextMm: number;
  feedMmPerMin: number;
  pierceSec: number;
  densityGPerCm3: number;
}

/** Optional per-substrate overrides, `settings/store.studioMaterials[substrate]` (millimetres). */
export type CutRuleOverrides = Partial<Record<Substrate, Partial<Pick<CutRules, 'kerfMm' | 'minFeatureMm' | 'minHoleMm' | 'minEdgeMm' | 'bridgeMm' | 'minTextMm'>>>>;

export function finishPreset(finish: string): FinishPreset {
  return FINISH_PRESETS[finish] ?? FINISH_PRESETS[DEFAULT_FINISH];
}

export function thicknessOptions(finish: string): number[] {
  return MACHINE.gauges[finishPreset(finish).substrate].map(row => row.thicknessMm);
}

function nearestGauge(substrate: Substrate, thicknessMm: number): GaugeRow {
  const rows = MACHINE.gauges[substrate];
  return rows.reduce((best, row) => (Math.abs(row.thicknessMm - thicknessMm) < Math.abs(best.thicknessMm - thicknessMm) ? row : best), rows[0]);
}

export function resolveCutRules(finish: string, thicknessMm: number, overrides?: CutRuleOverrides): CutRules {
  return resolveSubstrateRules(finishPreset(finish).substrate, thicknessMm, overrides);
}

export function isSubstrate(value: unknown): value is Substrate {
  return typeof value === 'string' && value in MACHINE.gauges;
}

export function resolveSubstrateRules(substrate: Substrate, thicknessMm: number, overrides?: CutRuleOverrides): CutRules {
  const row = nearestGauge(substrate, thicknessMm);
  const base: CutRules = {
    substrate,
    thicknessMm: row.thicknessMm,
    kerfMm: row.kerfMm,
    minFeatureMm: row.minWebMm,
    minHoleMm: row.minHoleMm,
    minEdgeMm: row.minEdgeMm,
    // A bridge must be comfortably wider than the thinnest web so it does not snap.
    bridgeMm: Math.max(2, Math.round(row.minWebMm * 1.5 * 10) / 10),
    // Letters below ~8× the minimum web lose their counters and strokes.
    minTextMm: Math.max(12, Math.round(row.minWebMm * 8)),
    feedMmPerMin: row.feedMmPerMin,
    pierceSec: row.pierceSec,
    densityGPerCm3: row.densityGPerCm3,
  };
  const o = overrides?.[substrate];
  if (!o) return base;
  const merged = { ...base };
  for (const key of ['kerfMm', 'minFeatureMm', 'minHoleMm', 'minEdgeMm', 'bridgeMm', 'minTextMm'] as const) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) merged[key] = v;
  }
  return merged;
}

/** Validates the raw settings value; anything malformed is dropped. */
export function parseCutRuleOverrides(raw: unknown): CutRuleOverrides | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: CutRuleOverrides = {};
  for (const [substrate, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(substrate in MACHINE.gauges) || !value || typeof value !== 'object') continue;
    out[substrate as Substrate] = value as CutRuleOverrides[Substrate];
  }
  return out;
}

/** Finishes the studio offers: server-priced ids only, filtered for the mode. */
export function availableFinishes(mode: 'simple' | 'pro', pricedFinishIds: Iterable<string> = Object.keys(DEFAULT_CUSTOM_FINISH_RATES)): FinishPreset[] {
  const priced = new Set(pricedFinishIds);
  return Object.values(FINISH_PRESETS).filter(p => priced.has(p.id) && (mode === 'pro' || p.simple));
}
