/**
 * Custom (Crafting Studio) piece pricing — the single source of truth shared by the
 * server (api/_lib/pricing.ts, api/_lib/storeConfig.ts) and the studio's live price.
 *
 * Pure and dependency-free (relative imports only) so both the Vite client build and
 * the Node API typecheck (tsconfig.api.json) can import it. The server stays
 * authoritative: the client only *displays* this number; checkout re-prices on the
 * server from width, height and finish.
 *
 * Formula: unit price (paise) = max(minimum, round(setupFee + width_cm × height_cm × rate)).
 */

export interface CustomFinishRate {
  label: string;
  /** Fixed per-piece setup (CAM programming, handling), paise. */
  setupFeePaise: number;
  /** Plate area rate, paise per cm² of the bounding rectangle (may be fractional). */
  ratePaisePerCm2: number;
  /** Floor for the unit price, paise. */
  minimumPaise: number;
}

/** Size limits for a custom piece's bounding rectangle, millimetres. */
export const CUSTOM_PIECE_LIMITS = { minDimensionMm: 100, maxWidthMm: 3000, maxHeightMm: 1500 } as const;

export type CustomPieceLimits = { minDimensionMm: number; maxWidthMm: number; maxHeightMm: number };

/** Production days for studio pieces when `settings/store.customLeadTimeDays` is not set. */
export const DEFAULT_CUSTOM_LEAD_TIME_DAYS = 7;

const STANDARD = (label: string): CustomFinishRate => ({
  label,
  setupFeePaise: 14_900,
  ratePaisePerCm2: 2.5, // ₹250 per m²
  minimumPaise: 14_900,
});
const PREMIUM = (label: string): CustomFinishRate => ({
  label,
  setupFeePaise: 14_900,
  ratePaisePerCm2: 4.5, // ₹450 per m²
  minimumPaise: 14_900,
});

/**
 * Default rates, keyed by the finish ids the server accepts for custom pieces. The
 * business should set real rates in `settings/store.customPieces`.
 */
export const DEFAULT_CUSTOM_FINISH_RATES: Readonly<Record<string, CustomFinishRate>> = {
  steel: STANDARD('Mild steel'),
  natural_mill: STANDARD('Natural mill'),
  black_patina: STANDARD('Black patina'),
  brushed_hairline: STANDARD('Brushed hairline'),
  mirror_polish: STANDARD('Mirror polish'),
  stainless: STANDARD('Stainless steel'),
  corten: STANDARD('Corten'),
  corten_rust: STANDARD('Corten rust'),
  brass: PREMIUM('Brass'),
  antique_brass: PREMIUM('Antique brass'),
  copper: PREMIUM('Copper'),
  verdigris: PREMIUM('Verdigris'),
  gold: PREMIUM('Gold'),
};

const isNonNegativeFinite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const rupeesToPaise = (rupees: number) => Math.round(rupees * 100);

/** Same normalisation the server applies to finish ids in requests. */
export const normaliseFinishId = (finish: string) => finish.trim().toLowerCase().replace(/[\s-]+/g, '_');

/**
 * Merges one `settings/store.customPieces[finishId]` override (rupee amounts:
 * setupFee, ratePerCm2, minimum, label) over a base rate. Returns null when the
 * result is incomplete (unknown finish with partial fields) — callers ignore it.
 */
export function mergeCustomFinishRate(base: CustomFinishRate | undefined, raw: unknown, finishId: string): CustomFinishRate | null {
  if (!raw || typeof raw !== 'object') return base ?? null;
  const r = raw as Record<string, unknown>;
  const pick = (key: string, current: number | undefined, toPaise: (n: number) => number) =>
    isNonNegativeFinite(r[key]) ? toPaise(r[key] as number) : current;
  const setupFeePaise = pick('setupFee', base?.setupFeePaise, rupeesToPaise);
  const ratePaisePerCm2 = pick('ratePerCm2', base?.ratePaisePerCm2, n => n * 100);
  const minimumPaise = pick('minimum', base?.minimumPaise, rupeesToPaise);
  if (setupFeePaise === undefined || ratePaisePerCm2 === undefined || minimumPaise === undefined) return null;
  const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim() : base?.label ?? finishId;
  return { label, setupFeePaise, ratePaisePerCm2, minimumPaise };
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
  if (!overrides || typeof overrides !== 'object') return rates;
  for (const [finishId, raw] of Object.entries(overrides as Record<string, unknown>)) {
    const id = finishId.trim().toLowerCase();
    const merged = mergeCustomFinishRate(rates[id], raw, id);
    if (merged) rates[id] = merged;
    else onInvalid?.(finishId);
  }
  return rates;
}

export type CustomPieceProblem = 'missing-dimensions' | 'out-of-range' | 'unknown-finish';

export type CustomPieceQuote =
  | { ok: true; unitPricePaise: number; rate: CustomFinishRate; finish: string }
  | { ok: false; problem: CustomPieceProblem };

/** Prices one custom piece. Pure: the server wraps failures in its own API errors. */
export function quoteCustomPiece(
  input: { widthMm?: number; heightMm?: number; finish: string },
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
  const unitPricePaise = Math.max(rate.minimumPaise, Math.round(rate.setupFeePaise + areaCm2 * rate.ratePaisePerCm2));
  return { ok: true, unitPricePaise, rate, finish };
}
