/**
 * Server-side store configuration: tax, shipping and custom-piece rates.
 *
 * Source of truth is the Firestore document `settings/store` (editable by staff
 * with `settings.write`); env vars provide defaults for fields the document does
 * not set. Request bodies never influence these values.
 *
 * `settings/store` fields (all optional, rupee amounts):
 *   gstRatePercent: number               goods rate, default 5 (HSN 8306, GST 2.0 from 22 Sep 2025)
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
 *   defaultHsnCode: string               HSN for products without hsnCode, default 830629 (other base-metal ornaments)
 *   consultation: { enabled, priceInr, creditTowardsOrder, creditValidityDays, turnaroundDays, sacCode, gstRatePercent }
 *                                        paid design consultation (see ConsultationSettings; price is GST-exclusive)
 *   seller: { legalName, tradeName, gstin, address, city, state, stateCode, pincode, email, phone }
 *                                        supplier block printed on GST invoices
 */
import { DEFAULT_CONSULTATION_SETTINGS } from '../../src/types/consultation';
import { PLACEHOLDER_CONTACT, PLACEHOLDER_SELLER, type StoreSettingsDoc } from '../../src/types/settings';
import { isNonNegativeFinite, paiseToRupees, rupeesToPaise } from './money';
import type { DocData, DocStore } from './store';
import {
  CUSTOM_PIECE_LIMITS,
  DEFAULT_CUSTOM_FINISH_RATES,
  DEFAULT_CUSTOM_LEAD_TIME_DAYS,
  resolveCustomFinishRates,
  type CustomFinishRate,
} from '../../src/lib/pricing/customPiece';

// Custom-piece rates and limits live in the shared module so the studio's displayed price
// is computed by the same code the server charges with.
export { CUSTOM_PIECE_LIMITS, DEFAULT_CUSTOM_FINISH_RATES, type CustomFinishRate };

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

export interface ConsultationConfig {
  enabled: boolean;
  pricePaise: number;
  creditTowardsOrder: boolean;
  creditValidityDays: number;
  turnaroundDays: number;
  sacCode: string;
  /** GST on the consultation in basis points; services are taxed apart from the goods rate. */
  gstRateBps: number;
}

export interface StoreConfig {
  currency: 'INR';
  /** Goods GST in basis points (500 = 5%); products may override it per item. */
  gstRateBps: number;
  shippingFeePaise: number;
  freeShippingThresholdPaise: number;
  reservationTtlMs: number;
  cod: CodConfig;
  fulfilment: FulfilmentConfig;
  defaultHsnCode: string;
  consultation: ConsultationConfig;
  seller: SellerDetails;
  customPieces: {
    minDimensionMm: number;
    maxWidthMm: number;
    maxHeightMm: number;
    finishes: Record<string, CustomFinishRate>;
  };
}

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
    gstRateBps: Math.round(envNumber(env, 'STORE_GST_RATE_PERCENT', 5) * 100),
    shippingFeePaise: rupeesToPaise(envNumber(env, 'STORE_SHIPPING_FEE_INR', 150)),
    freeShippingThresholdPaise: rupeesToPaise(envNumber(env, 'STORE_FREE_SHIPPING_THRESHOLD_INR', 1499)),
    reservationTtlMs: 15 * 60 * 1000,
    cod: {
      enabled: envBoolean(env, 'STORE_COD_ENABLED', true),
      feePaise: rupeesToPaise(envNumber(env, 'STORE_COD_FEE_INR', 49)),
      maxOrderValuePaise: rupeesToPaise(envNumber(env, 'STORE_COD_MAX_ORDER_VALUE_INR', 10000)),
      maxOpenOrdersPerPhone: Math.floor(envNumber(env, 'STORE_COD_MAX_OPEN_ORDERS_PER_PHONE', 2)),
    },
    fulfilment: {
      defaultLeadTimeDays: Math.floor(envNumber(env, 'STORE_DEFAULT_LEAD_TIME_DAYS', 3)),
      customLeadTimeDays: Math.floor(envNumber(env, 'STORE_CUSTOM_LEAD_TIME_DAYS', DEFAULT_CUSTOM_LEAD_TIME_DAYS)),
      manualTransitDays: Math.floor(envNumber(env, 'STORE_MANUAL_TRANSIT_DAYS', 5)),
      returnWindowDays: Math.floor(envNumber(env, 'STORE_RETURN_WINDOW_DAYS', 7)),
    },
    defaultHsnCode: env.STORE_DEFAULT_HSN_CODE?.trim() || '830629',
    consultation: {
      enabled: DEFAULT_CONSULTATION_SETTINGS.enabled,
      pricePaise: rupeesToPaise(DEFAULT_CONSULTATION_SETTINGS.priceInr),
      creditTowardsOrder: DEFAULT_CONSULTATION_SETTINGS.creditTowardsOrder,
      creditValidityDays: DEFAULT_CONSULTATION_SETTINGS.creditValidityDays,
      turnaroundDays: DEFAULT_CONSULTATION_SETTINGS.turnaroundDays,
      sacCode: DEFAULT_CONSULTATION_SETTINGS.sacCode,
      gstRateBps: Math.round(DEFAULT_CONSULTATION_SETTINGS.gstRatePercent * 100),
    },
    seller: { ...EMPTY_SELLER },
    customPieces: { ...CUSTOM_PIECE_LIMITS, finishes: { ...DEFAULT_CUSTOM_FINISH_RATES } },
  };
}

/** Applies validated overrides from `settings/store`; invalid fields are ignored and logged. */
export function mergeStoreConfig(defaults: StoreConfig, doc: DocData | null): StoreConfig {
  if (!doc) return defaults;
  const config: StoreConfig = {
    ...defaults,
    cod: { ...defaults.cod },
    fulfilment: { ...defaults.fulfilment },
    consultation: { ...defaults.consultation },
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
  if (doc.consultation && typeof doc.consultation === 'object') {
    const raw = doc.consultation as Record<string, unknown>;
    const c = config.consultation;
    if (typeof raw.enabled === 'boolean') c.enabled = raw.enabled;
    if (raw.priceInr !== undefined) {
      // A zero price would create a free paid order the gateway refuses; treat it as invalid.
      if (isNonNegativeFinite(raw.priceInr) && raw.priceInr >= 1 && raw.priceInr <= 100_000) c.pricePaise = rupeesToPaise(raw.priceInr);
      else warn('consultation.priceInr');
    }
    if (typeof raw.creditTowardsOrder === 'boolean') c.creditTowardsOrder = raw.creditTowardsOrder;
    for (const [key, max] of [['creditValidityDays', 365], ['turnaroundDays', 30]] as const) {
      const value = raw[key];
      if (value === undefined) continue;
      if (isNonNegativeFinite(value) && Number.isInteger(value) && value >= 1 && value <= max) c[key] = value;
      else warn(`consultation.${key}`);
    }
    if (raw.sacCode !== undefined) {
      if (typeof raw.sacCode === 'string' && /^[0-9]{4,8}$/.test(raw.sacCode.trim())) c.sacCode = raw.sacCode.trim();
      else warn('consultation.sacCode');
    }
    if (raw.gstRatePercent !== undefined) {
      if (isNonNegativeFinite(raw.gstRatePercent) && raw.gstRatePercent <= 100) c.gstRateBps = Math.round(raw.gstRatePercent * 100);
      else warn('consultation.gstRatePercent');
    }
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
    config.customPieces.finishes = resolveCustomFinishRates(doc.customPieces, config.customPieces.finishes, id =>
      warn(`customPieces.${id}`),
    );
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
    consultation: {
      enabled: config.consultation.enabled,
      priceInr: paiseToRupees(config.consultation.pricePaise),
      creditTowardsOrder: config.consultation.creditTowardsOrder,
      creditValidityDays: config.consultation.creditValidityDays,
      turnaroundDays: config.consultation.turnaroundDays,
      sacCode: config.consultation.sacCode,
      gstRatePercent: config.consultation.gstRateBps / 100,
    },
    // Seeded placeholders keep every flow working until the owner enters real details (invoices are specimens meanwhile).
    seller: { ...PLACEHOLDER_SELLER },
    ...PLACEHOLDER_CONTACT,
  };
}

export async function loadStoreConfig(store: DocStore, env: NodeJS.ProcessEnv = process.env): Promise<StoreConfig> {
  return mergeStoreConfig(defaultStoreConfig(env), await store.get('settings/store'));
}
