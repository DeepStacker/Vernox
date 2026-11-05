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
 *   codEnabled: boolean                  cash on delivery offered at all (catalogue-only carts)
 *   codFee: number                       COD handling fee, its own taxable line
 *   codMaxOrderValue: number             COD is refused when the order total (incl. GST) exceeds it
 *   codMaxOpenOrdersPerPhone: number     undelivered COD orders allowed per mobile number
 *   returnWindowDays: number             days after delivery a return may be requested
 *   defaultLeadTimeDays: number          production days for catalogue items without leadTimeDays
 *   customLeadTimeDays: number           production days for Crafting Studio pieces
 *   manualTransitDays: number            courier transit estimate when Shiprocket is not configured
 *   defaultHsnCode: string               HSN for products without hsnCode (owner must confirm)
 *   seller: { legalName, tradeName, gstin, address, city, state, stateCode, pincode, email, phone }
 *                                        supplier block printed on GST invoices
 */
import type { StoreSettingsDoc } from '../../src/types/settings';
import { isNonNegativeFinite, paiseToRupees, rupeesToPaise } from './money';
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

export interface SellerDetails {
  legalName: string;
  tradeName: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  /** Two-digit GST state code (e.g. "29" Karnataka); compared with the buyer's to pick CGST+SGST vs IGST. */
  stateCode: string;
  pincode: string;
  email: string;
  phone: string;
}

export interface CodConfig {
  enabled: boolean;
  feePaise: number;
  maxOrderValuePaise: number;
  maxOpenOrdersPerPhone: number;
}

export interface FulfilmentConfig {
  defaultLeadTimeDays: number;
  customLeadTimeDays: number;
  manualTransitDays: number;
  returnWindowDays: number;
}

export interface StoreConfig {
  currency: 'INR';
  /** GST in basis points (1800 = 18%). */
  gstRateBps: number;
  shippingFeePaise: number;
  freeShippingThresholdPaise: number;
  reservationTtlMs: number;
  cod: CodConfig;
  fulfilment: FulfilmentConfig;
  defaultHsnCode: string;
  seller: SellerDetails;
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

const EMPTY_SELLER: SellerDetails = {
  legalName: '',
  tradeName: '',
  gstin: '',
  address: '',
  city: '',
  state: '',
  stateCode: '',
  pincode: '',
  email: '',
  phone: '',
};

/** 2-digit state code + 10-char PAN + entity digit + 'Z' + checksum. */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function envBoolean(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new Error(`${name} must be true or false`);
}

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
    cod: {
      enabled: envBoolean(env, 'STORE_COD_ENABLED', true),
      feePaise: rupeesToPaise(envNumber(env, 'STORE_COD_FEE_INR', 49)),
      maxOrderValuePaise: rupeesToPaise(envNumber(env, 'STORE_COD_MAX_ORDER_VALUE_INR', 10000)),
      maxOpenOrdersPerPhone: Math.floor(envNumber(env, 'STORE_COD_MAX_OPEN_ORDERS_PER_PHONE', 2)),
    },
    fulfilment: {
      defaultLeadTimeDays: Math.floor(envNumber(env, 'STORE_DEFAULT_LEAD_TIME_DAYS', 3)),
      customLeadTimeDays: Math.floor(envNumber(env, 'STORE_CUSTOM_LEAD_TIME_DAYS', 7)),
      manualTransitDays: Math.floor(envNumber(env, 'STORE_MANUAL_TRANSIT_DAYS', 5)),
      returnWindowDays: Math.floor(envNumber(env, 'STORE_RETURN_WINDOW_DAYS', 7)),
    },
    defaultHsnCode: env.STORE_DEFAULT_HSN_CODE?.trim() || '8306',
    seller: { ...EMPTY_SELLER },
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
    cod: { ...defaults.cod },
    fulfilment: { ...defaults.fulfilment },
    seller: { ...defaults.seller },
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
  if (doc.codEnabled !== undefined) {
    if (typeof doc.codEnabled === 'boolean') config.cod.enabled = doc.codEnabled;
    else warn('codEnabled');
  }
  if (doc.codFee !== undefined) {
    if (isNonNegativeFinite(doc.codFee)) config.cod.feePaise = rupeesToPaise(doc.codFee);
    else warn('codFee');
  }
  if (doc.codMaxOrderValue !== undefined) {
    if (isNonNegativeFinite(doc.codMaxOrderValue)) config.cod.maxOrderValuePaise = rupeesToPaise(doc.codMaxOrderValue);
    else warn('codMaxOrderValue');
  }
  const wholeDays = (field: string, apply: (n: number) => void, max = 365) => {
    const value = doc[field];
    if (value === undefined) return;
    if (isNonNegativeFinite(value) && Number.isInteger(value) && value <= max) apply(value);
    else warn(field);
  };
  wholeDays('codMaxOpenOrdersPerPhone', n => (config.cod.maxOpenOrdersPerPhone = n), 50);
  wholeDays('returnWindowDays', n => (config.fulfilment.returnWindowDays = n), 90);
  wholeDays('defaultLeadTimeDays', n => (config.fulfilment.defaultLeadTimeDays = n), 90);
  wholeDays('customLeadTimeDays', n => (config.fulfilment.customLeadTimeDays = n), 90);
  wholeDays('manualTransitDays', n => (config.fulfilment.manualTransitDays = n), 30);
  if (doc.defaultHsnCode !== undefined) {
    if (typeof doc.defaultHsnCode === 'string' && /^[0-9]{4,8}$/.test(doc.defaultHsnCode.trim())) {
      config.defaultHsnCode = doc.defaultHsnCode.trim();
    } else warn('defaultHsnCode');
  }
  if (doc.seller && typeof doc.seller === 'object') {
    const raw = doc.seller as Record<string, unknown>;
    for (const key of Object.keys(EMPTY_SELLER) as Array<keyof SellerDetails>) {
      if (typeof raw[key] === 'string') config.seller[key] = (raw[key] as string).trim();
    }
    config.seller.gstin = config.seller.gstin.toUpperCase();
    if (config.seller.gstin && !GSTIN_PATTERN.test(config.seller.gstin)) warn('seller.gstin');
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

/**
 * `settings/store` document for a fresh project, derived from the same defaults
 * the API uses (env STORE_* or built-ins), so the seed can never drift from them.
 * Seller and contact fields start empty for the owner to fill in.
 */
export function defaultSettingsDoc(config: StoreConfig = defaultStoreConfig()): StoreSettingsDoc {
  return {
    gstRatePercent: config.gstRateBps / 100,
    shippingFee: paiseToRupees(config.shippingFeePaise),
    freeShippingThreshold: paiseToRupees(config.freeShippingThresholdPaise),
    codEnabled: config.cod.enabled,
    codFee: paiseToRupees(config.cod.feePaise),
    codMaxOrderValue: paiseToRupees(config.cod.maxOrderValuePaise),
    codMaxOpenOrdersPerPhone: config.cod.maxOpenOrdersPerPhone,
    returnWindowDays: config.fulfilment.returnWindowDays,
    defaultLeadTimeDays: config.fulfilment.defaultLeadTimeDays,
    customLeadTimeDays: config.fulfilment.customLeadTimeDays,
    manualTransitDays: config.fulfilment.manualTransitDays,
    defaultHsnCode: config.defaultHsnCode,
    seller: { ...EMPTY_SELLER },
    whatsappNumber: '',
    supportPhone: '',
    supportEmail: '',
    supportHours: '',
    workshopAddress: '',
  };
}

export async function loadStoreConfig(store: DocStore, env: NodeJS.ProcessEnv = process.env): Promise<StoreConfig> {
  return mergeStoreConfig(defaultStoreConfig(env), await store.get('settings/store'));
}
