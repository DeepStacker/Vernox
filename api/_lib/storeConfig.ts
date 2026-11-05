/**
 * Server-side store configuration: tax, shipping and custom-piece rates.
 *
 * Source of truth is the Firestore document `settings/store` (editable by staff
 * with `settings.write`); env vars provide defaults for fields the document does
 * not set. Request bodies never influence these values.
 *
 * `settings/store` fields (all optional, rupee amounts):
 *   gstRatePercent: number               e.g. 18
 *   shippingFee: number                  flat fee when below the threshold
 *   freeShippingThreshold: number        merchandise subtotal (before discount) at or above
 *                                        which shipping is free (`>=`)
 *   customPieces: { [finishId]: { label, setupFee, ratePerCm2, minimum } }
 *                                        per-finish overrides merged over DEFAULT_CUSTOM_FINISH_RATES
 */
import { isNonNegativeFinite, rupeesToPaise } from './money';
import type { DocData, DocStore } from './store';

export interface CustomFinishRate {
  label: string;
  /** Fixed per-piece setup (CAM programming, handling), paise. */
  setupFeePaise: number;
  /** Plate area rate, paise per cm² of the bounding rectangle (may be fractional). */
  ratePaisePerCm2: number;
  /** Floor for the unit price, paise. */
  minimumPaise: number;
}

export interface StoreConfig {
  currency: 'INR';
  /** GST in basis points (1800 = 18%). */
  gstRateBps: number;
  shippingFeePaise: number;
  freeShippingThresholdPaise: number;
  reservationTtlMs: number;
  customPieces: {
    minDimensionMm: number;
    maxWidthMm: number;
    maxHeightMm: number;
    finishes: Record<string, CustomFinishRate>;
  };
}

export const CUSTOM_PIECE_LIMITS = { minDimensionMm: 100, maxWidthMm: 3000, maxHeightMm: 1500 } as const;

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
 * Default rates for Crafting Studio pieces, keyed by the studio's MetalFinish id
 * (src/lib/cadEngineTypes.ts). The numbers preserve the formula the studio used
 * to display (₹149 + area × ₹250/m², ₹450/m² for copper-alloy finishes); the
 * business should set real rates in `settings/store.customPieces`.
 */
export const DEFAULT_CUSTOM_FINISH_RATES: Record<string, CustomFinishRate> = {
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

function envNumber(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!isNonNegativeFinite(value)) throw new Error(`${name} must be a non-negative number`);
  return value;
}

export function defaultStoreConfig(env: NodeJS.ProcessEnv = process.env): StoreConfig {
  return {
    currency: 'INR',
    gstRateBps: Math.round(envNumber(env, 'STORE_GST_RATE_PERCENT', 18) * 100),
    shippingFeePaise: rupeesToPaise(envNumber(env, 'STORE_SHIPPING_FEE_INR', 150)),
    freeShippingThresholdPaise: rupeesToPaise(envNumber(env, 'STORE_FREE_SHIPPING_THRESHOLD_INR', 5000)),
    reservationTtlMs: 15 * 60 * 1000,
    customPieces: { ...CUSTOM_PIECE_LIMITS, finishes: { ...DEFAULT_CUSTOM_FINISH_RATES } },
  };
}

function mergeFinishRate(base: CustomFinishRate | undefined, raw: unknown, finishId: string): CustomFinishRate | null {
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

/** Applies validated overrides from `settings/store`; invalid fields are ignored and logged. */
export function mergeStoreConfig(defaults: StoreConfig, doc: DocData | null): StoreConfig {
  if (!doc) return defaults;
  const config: StoreConfig = {
    ...defaults,
    customPieces: { ...defaults.customPieces, finishes: { ...defaults.customPieces.finishes } },
  };
  const warn = (field: string) => console.warn(`[storeConfig] ignoring invalid settings/store.${field}`);

  if (doc.gstRatePercent !== undefined) {
    if (isNonNegativeFinite(doc.gstRatePercent) && doc.gstRatePercent <= 100) {
      config.gstRateBps = Math.round(doc.gstRatePercent * 100);
    } else warn('gstRatePercent');
  }
  if (doc.shippingFee !== undefined) {
    if (isNonNegativeFinite(doc.shippingFee)) config.shippingFeePaise = rupeesToPaise(doc.shippingFee);
    else warn('shippingFee');
  }
  if (doc.freeShippingThreshold !== undefined) {
    if (isNonNegativeFinite(doc.freeShippingThreshold)) {
      config.freeShippingThresholdPaise = rupeesToPaise(doc.freeShippingThreshold);
    } else warn('freeShippingThreshold');
  }
  if (doc.customPieces && typeof doc.customPieces === 'object') {
    for (const [finishId, raw] of Object.entries(doc.customPieces as Record<string, unknown>)) {
      const id = finishId.trim().toLowerCase();
      const merged = mergeFinishRate(config.customPieces.finishes[id], raw, id);
      if (merged) config.customPieces.finishes[id] = merged;
      else warn(`customPieces.${finishId}`);
    }
  }
  return config;
}

export async function loadStoreConfig(store: DocStore, env: NodeJS.ProcessEnv = process.env): Promise<StoreConfig> {
  return mergeStoreConfig(defaultStoreConfig(env), await store.get('settings/store'));
}
