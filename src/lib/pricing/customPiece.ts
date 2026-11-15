/**
 * Custom (Crafting Studio) piece pricing — the single source of truth shared by the
 * server (api/_lib/pricing.ts, api/_lib/storeConfig.ts) and the studio's live price.
 *
 * Pure and dependency-free (relative imports only) so both the Vite client build and
 * the Node API typecheck (tsconfig.api.json) can import it. The server stays
 * authoritative: the client only *displays* this number; checkout re-prices on the
 * server from width, height, finish and the cutting work it measures itself from the
 * design's frozen production contours (cutWork.ts).
 *
 * Formula (all amounts GST-inclusive, paise, each part rounded to whole paise):
 *
 *   plate     = setupFee + round(width_cm × height_cm × ratePerCm2)
 *   cutting   = round(max(0, cutLength_m − includedCut_m) × cutRatePerMetre × f)
 *               where includedCut_m = includedCutMetres + includedCutMetresPerM2 × area_m²
 *   engraving = round(scoreLength_m × scoreRatePerMetre × f)
 *   holes     = round(max(0, pierces − includedPierces) × pierceRate × f)
 *   unit      = max(minimum, plate + cutting + engraving + holes)
 *
 * f is the finish's thickness factor for the sheet thickness (1 when none is set). A piece
 * with no measured geometry (staff custom pieces, legacy designs) pays the plate part only.
 * The included allowance grows with the plate so scaling a design up (which the area rate
 * already charges for) does not also trigger a cutting surcharge; only density does.
 */
import type { CutWork } from './cutWork';

export interface CustomFinishRate {
  label: string;
  /** Fixed per-piece setup (CAM programming, handling), paise. */
  setupFeePaise: number;
  /** Plate area rate, paise per cm² of the bounding rectangle (may be fractional). */
  ratePaisePerCm2: number;
  /** Floor for the unit price, paise. */
  minimumPaise: number;
  /** Through-cutting beyond the included length, paise per metre. */
  cutPaisePerMetre: number;
  /** Cutting included in the plate price: a fixed length, mm … */
  includedCutMm: number;
  /** … plus this much per m² of the bounding rectangle, mm. */
  includedCutMmPerM2: number;
  /** Each pierce (start of a closed cut) beyond the included count, paise. */
  piercePaise: number;
  /** Pierces included in the plate price (the outline, mounting holes, a few letters). */
  includedPierces: number;
  /** Engraved score lines, paise per metre (no allowance). */
  scorePaisePerMetre: number;
  /**
   * Multiplier on cutting, engraving and pierce charges by sheet thickness in mm (key "3" → 1.6).
   * A thickness without an entry uses 1.
   */
  thicknessFactors: Readonly<Record<string, number>>;
}

/** Size limits for a custom piece's bounding rectangle, millimetres. */
export const CUSTOM_PIECE_LIMITS = { minDimensionMm: 100, maxWidthMm: 3000, maxHeightMm: 1500 } as const;

export type CustomPieceLimits = { minDimensionMm: number; maxWidthMm: number; maxHeightMm: number };

/** Production days for studio pieces when `settings/store.customLeadTimeDays` is not set. */
export const DEFAULT_CUSTOM_LEAD_TIME_DAYS = 7;

type CuttingRates = Pick<CustomFinishRate, 'cutPaisePerMetre' | 'includedCutMm' | 'includedCutMmPerM2' | 'piercePaise' | 'includedPierces' | 'scorePaisePerMetre'>;

// Cutting defaults (owner to confirm; ROADMAP.md "Business and tax decisions", custom pieces).
// The allowance (3 m + 50 m per m² of plate, 40 pierces) covers every built-in template at its
// default size, so their prices do not change; dense jali fills (100–220 m per m², hundreds of
// pierces) pay for the extra laser time and finishing of every hole. ₹25/m is about twice a
// job shop's 2 mm mild-steel rate (retail, GST-inclusive); ₹3 per pierce covers the pierce and
// deburring each cut-out; engraving is a light surface pass.
/** Cutting rates for steel-family finishes; also the fallback for a finish added in settings without them. */
export const DEFAULT_CUTTING_RATES: Readonly<CuttingRates> = {
  cutPaisePerMetre: 2_500, // ₹25 per metre
  includedCutMm: 3_000, // 3 m
  includedCutMmPerM2: 50_000, // + 50 m per m² of plate
  piercePaise: 300, // ₹3 per pierce
  includedPierces: 40,
  scorePaisePerMetre: 1_000, // ₹10 per metre of engraving
};
/** Brass and copper cut more slowly (lower feed on the fiber laser). */
const PREMIUM_CUTTING: Readonly<CuttingRates> = { ...DEFAULT_CUTTING_RATES, cutPaisePerMetre: 3_000 };

// Thickness factors: the feed rate at the finish's standard thickness divided by the feed at the
// thicker gauge (src/lib/studio/materials.ts MACHINE.gauges), rounded. Thinner gauges stay at 1.
const MILD_STEEL_FACTORS = { '3': 1.6, '5': 2.6, '6': 3.4 }; // standard 2 mm
const STAINLESS_FACTORS = { '2': 1.3, '3': 2.1 }; // standard 1.5 mm
const CORTEN_FACTORS = { '3': 1.6 }; // standard 2 mm
const BRASS_FACTORS = { '2': 1.4, '3': 2 }; // standard 1.5 mm
const COPPER_FACTORS = { '2': 1.4 }; // standard 1.5 mm

// Plate defaults are anchored to the sample catalogue (45 × 45 cm ≈ ₹2,499, 90 × 90 cm ≈ ₹8,099, i.e. about
// ₹632 + ₹0.92/cm²) with ~20% for custom design work, and a premium for copper-alloy finishes.
// Owner to confirm; real rates belong in settings/store.customPieces.
const STANDARD = (label: string, thicknessFactors: Record<string, number>): CustomFinishRate => ({
  label,
  setupFeePaise: 75_000, // ₹750
  ratePaisePerCm2: 110, // ₹1.10 per cm² (₹11,000 per m²)
  minimumPaise: 149_900, // ₹1,499
  ...DEFAULT_CUTTING_RATES,
  thicknessFactors,
});
const PREMIUM = (label: string, thicknessFactors: Record<string, number>): CustomFinishRate => ({
  label,
  setupFeePaise: 75_000,
  ratePaisePerCm2: 140, // ₹1.40 per cm²
  minimumPaise: 149_900,
  ...PREMIUM_CUTTING,
  thicknessFactors,
});

/**
 * Default rates, keyed by the finish ids the server accepts for custom pieces. The
 * business should set real rates in `settings/store.customPieces`.
 */
export const DEFAULT_CUSTOM_FINISH_RATES: Readonly<Record<string, CustomFinishRate>> = {
  steel: STANDARD('Mild steel', MILD_STEEL_FACTORS),
  natural_mill: STANDARD('Natural mill', MILD_STEEL_FACTORS),
  black_patina: STANDARD('Black patina', MILD_STEEL_FACTORS),
  brushed_hairline: STANDARD('Brushed hairline', STAINLESS_FACTORS),
  mirror_polish: STANDARD('Mirror polish', STAINLESS_FACTORS),
  stainless: STANDARD('Stainless steel', STAINLESS_FACTORS),
  corten: STANDARD('Corten', CORTEN_FACTORS),
  corten_rust: STANDARD('Corten rust', CORTEN_FACTORS),
  brass: PREMIUM('Brass', BRASS_FACTORS),
  antique_brass: PREMIUM('Antique brass', BRASS_FACTORS),
  copper: PREMIUM('Copper', COPPER_FACTORS),
  verdigris: PREMIUM('Verdigris', COPPER_FACTORS),
  gold: PREMIUM('Gold', BRASS_FACTORS),
};

const isNonNegativeFinite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const rupeesToPaise = (rupees: number) => Math.round(rupees * 100);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Same normalisation the server applies to finish ids in requests. */
export const normaliseFinishId = (finish: string) => finish.trim().toLowerCase().replace(/[\s-]+/g, '_');

/** Largest thickness factor a setting may hold (a typo guard, not a business limit). */
const MAX_THICKNESS_FACTOR = 20;

/**
 * Settings keys of one `settings/store.customPieces[finishId]` entry, in rupees / metres as
 * staff write them, and how each maps onto CustomFinishRate.
 */
const NUMERIC_SETTINGS = {
  setupFee: { field: 'setupFeePaise', toInternal: rupeesToPaise },
  ratePerCm2: { field: 'ratePaisePerCm2', toInternal: (n: number) => n * 100 },
  minimum: { field: 'minimumPaise', toInternal: rupeesToPaise },
  cutRatePerMetre: { field: 'cutPaisePerMetre', toInternal: (n: number) => n * 100 },
  includedCutMetres: { field: 'includedCutMm', toInternal: (n: number) => n * 1000 },
  includedCutMetresPerM2: { field: 'includedCutMmPerM2', toInternal: (n: number) => n * 1000 },
  pierceRate: { field: 'piercePaise', toInternal: (n: number) => n * 100 },
  includedPierces: { field: 'includedPierces', toInternal: (n: number) => Math.floor(n) },
  scoreRatePerMetre: { field: 'scorePaisePerMetre', toInternal: (n: number) => n * 100 },
} as const satisfies Record<string, { field: keyof CustomFinishRate; toInternal: (n: number) => number }>;

type NumericSetting = keyof typeof NUMERIC_SETTINGS;
const SETTINGS_KEYS = new Set<string>([...Object.keys(NUMERIC_SETTINGS), 'label', 'thicknessFactors']);

/** Thickness factor map from settings; null when malformed. */
function parseThicknessFactors(raw: unknown): Record<string, number> | null {
  if (!isRecord(raw)) return null;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    const thickness = Number(key);
    if (!key.trim() || !Number.isFinite(thickness) || thickness <= 0) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > MAX_THICKNESS_FACTOR) return null;
    out[String(thickness)] = value;
  }
  return out;
}

/**
 * What is wrong with a `settings/store.customPieces` value, or null when it is valid. The
 * settings save (api/_lib/catalogAdmin.ts) refuses an invalid value with this message, so a
 * typo in a money setting never reaches checkout silently.
 */
export function customPiecesSettingsProblem(raw: unknown): string | null {
  if (raw === undefined) return null;
  if (!isRecord(raw)) return 'customPieces must be an object keyed by finish id.';
  for (const [finishId, entry] of Object.entries(raw)) {
    const at = `customPieces.${finishId}`;
    if (!isRecord(entry)) return `${at} must be an object.`;
    for (const key of Object.keys(entry)) {
      if (!SETTINGS_KEYS.has(key)) return `${at}.${key} is not a custom piece setting (allowed: ${[...SETTINGS_KEYS].join(', ')}).`;
    }
    for (const key of Object.keys(NUMERIC_SETTINGS) as NumericSetting[]) {
      if (entry[key] !== undefined && !isNonNegativeFinite(entry[key])) return `${at}.${key} must be a number of zero or more.`;
    }
    if (entry.includedPierces !== undefined && !Number.isInteger(entry.includedPierces)) return `${at}.includedPierces must be a whole number.`;
    if (entry.label !== undefined && typeof entry.label !== 'string') return `${at}.label must be text.`;
    if (entry.thicknessFactors !== undefined && !parseThicknessFactors(entry.thicknessFactors)) {
      return `${at}.thicknessFactors must map a thickness in mm (e.g. "3") to a factor above 0 and at most ${MAX_THICKNESS_FACTOR}.`;
    }
    if (!mergeCustomFinishRate(DEFAULT_CUSTOM_FINISH_RATES[finishId.trim().toLowerCase()], entry, finishId)) {
      return `${at} is a new finish, so it needs setupFee, ratePerCm2 and minimum.`;
    }
  }
  return null;
}

/**
 * Merges one `settings/store.customPieces[finishId]` override (rupee amounts and metres:
 * setupFee, ratePerCm2, minimum, cutRatePerMetre, includedCutMetres, includedCutMetresPerM2,
 * pierceRate, includedPierces, scoreRatePerMetre, thicknessFactors, label) over a base rate.
 * Returns null when the result is incomplete (unknown finish without the plate fields) or a
 * thickness factor map is malformed — callers ignore it. A new finish without cutting fields
 * gets DEFAULT_CUTTING_RATES.
 */
export function mergeCustomFinishRate(base: CustomFinishRate | undefined, raw: unknown, finishId: string): CustomFinishRate | null {
  if (!isRecord(raw)) return base ?? null;
  const merged: Partial<Record<keyof CustomFinishRate, unknown>> = { ...DEFAULT_CUTTING_RATES, thicknessFactors: {}, ...base };
  for (const [key, spec] of Object.entries(NUMERIC_SETTINGS)) {
    const value = raw[key];
    if (isNonNegativeFinite(value)) merged[spec.field] = spec.toInternal(value);
  }
  if (merged.setupFeePaise === undefined || merged.ratePaisePerCm2 === undefined || merged.minimumPaise === undefined) return null;
  if (raw.thicknessFactors !== undefined) {
    const factors = parseThicknessFactors(raw.thicknessFactors);
    if (!factors) return null;
    merged.thicknessFactors = factors;
  }
  const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : base?.label ?? finishId;
  return { ...(merged as CustomFinishRate), label };
}

/**
 * Applies a whole `settings/store.customPieces` map over the defaults. `onInvalid`
 * receives finish ids whose override was rejected (the server logs them).
 */
export function resolveCustomFinishRates(
  overrides: unknown,
  base: Readonly<Record<string, CustomFinishRate>> = DEFAULT_CUSTOM_FINISH_RATES,
  onInvalid?: (finishId: string) => void,
): Record<string, CustomFinishRate> {
  const rates: Record<string, CustomFinishRate> = { ...base };
  if (!isRecord(overrides)) return rates;
  for (const [finishId, raw] of Object.entries(overrides)) {
    const id = finishId.trim().toLowerCase();
    const merged = mergeCustomFinishRate(rates[id], raw, id);
    if (merged) rates[id] = merged;
    else onInvalid?.(finishId);
  }
  return rates;
}

/** The finish's factor for a sheet thickness (1 when the thickness is unknown or has no entry). */
export function thicknessFactorFor(rate: Pick<CustomFinishRate, 'thicknessFactors'>, thicknessMm: number | null | undefined): number {
  if (thicknessMm === null || thicknessMm === undefined) return 1;
  for (const [key, factor] of Object.entries(rate.thicknessFactors)) {
    if (Math.abs(Number(key) - thicknessMm) < 1e-6) return factor;
  }
  return 1;
}

export type CustomPieceProblem = 'missing-dimensions' | 'out-of-range' | 'unknown-finish';

/** How a unit price was made up (all paise). The parts add up to the unit price. */
export interface CustomPieceBreakdown {
  /** Setup fee plus the plate area. */
  platePaise: number;
  /** Through-cutting beyond the included length. */
  cuttingPaise: number;
  /** Engraved score lines. */
  engravingPaise: number;
  /** Pierces (cut-outs and holes) beyond the included count. */
  holesPaise: number;
  /** What the minimum price added on top (0 when the parts already exceed it). */
  minimumTopUpPaise: number;
  /** The measured work behind the cutting parts; null when priced by size only (no design geometry). */
  work: {
    cutLengthMm: number;
    includedCutMm: number;
    pierces: number;
    includedPierces: number;
    scoreLengthMm: number;
    thicknessFactor: number;
  } | null;
}

export type CustomPieceQuote =
  | { ok: true; unitPricePaise: number; rate: CustomFinishRate; finish: string; breakdown: CustomPieceBreakdown }
  | { ok: false; problem: CustomPieceProblem };

/** The measured cutting work a quote needs (cutWork.ts); null/absent = size-only pricing. */
export type QuoteCutWork = Pick<CutWork, 'cutLengthMm' | 'pierces' | 'scoreLengthMm' | 'thicknessMm'>;

/** Prices one custom piece. Pure: the server wraps failures in its own API errors. */
export function quoteCustomPiece(
  input: { widthMm?: number; heightMm?: number; finish: string; work?: QuoteCutWork | null },
  rates: Readonly<Record<string, CustomFinishRate>>,
  limits: CustomPieceLimits = CUSTOM_PIECE_LIMITS,
): CustomPieceQuote {
  const { widthMm, heightMm } = input;
  if (!widthMm || !heightMm) return { ok: false, problem: 'missing-dimensions' };
  if (
    widthMm < limits.minDimensionMm || heightMm < limits.minDimensionMm ||
    widthMm > limits.maxWidthMm || heightMm > limits.maxHeightMm
  ) {
    return { ok: false, problem: 'out-of-range' };
  }
  const finish = normaliseFinishId(input.finish);
  const rate = rates[finish];
  if (!rate) return { ok: false, problem: 'unknown-finish' };
  const areaCm2 = (widthMm / 10) * (heightMm / 10);
  const platePaise = rate.setupFeePaise + Math.round(areaCm2 * rate.ratePaisePerCm2);

  let cuttingPaise = 0;
  let engravingPaise = 0;
  let holesPaise = 0;
  let work: CustomPieceBreakdown['work'] = null;
  if (input.work) {
    const f = thicknessFactorFor(rate, input.work.thicknessMm);
    const includedCutMm = rate.includedCutMm + rate.includedCutMmPerM2 * (areaCm2 / 10_000);
    cuttingPaise = Math.round((Math.max(0, input.work.cutLengthMm - includedCutMm) / 1000) * rate.cutPaisePerMetre * f);
    engravingPaise = Math.round((input.work.scoreLengthMm / 1000) * rate.scorePaisePerMetre * f);
    holesPaise = Math.round(Math.max(0, input.work.pierces - rate.includedPierces) * rate.piercePaise * f);
    work = {
      cutLengthMm: input.work.cutLengthMm,
      includedCutMm,
      pierces: input.work.pierces,
      includedPierces: rate.includedPierces,
      scoreLengthMm: input.work.scoreLengthMm,
      thicknessFactor: f,
    };
  }
  const parts = platePaise + cuttingPaise + engravingPaise + holesPaise;
  const unitPricePaise = Math.max(rate.minimumPaise, parts);
  return {
    ok: true,
    unitPricePaise,
    rate,
    finish,
    breakdown: { platePaise, cuttingPaise, engravingPaise, holesPaise, minimumTopUpPaise: unitPricePaise - parts, work },
  };
}
