/**
 * Form model for the business settings stored in `settings/store`: seller (GST invoice) details,
 * storefront contact fields, COD and lead-time settings. Field names match StoreSettingsDoc
 * (src/types/settings.ts); the server parses the same document (api/_lib/storeConfig.ts) and its
 * GSTIN pattern is mirrored here so a bad value is caught before it blocks every invoice.
 */
import type { SellerSettings } from '@/types/settings';
import type { StoreConfig } from '@/types/store';
import { DEFAULT_CONSULTATION_SETTINGS } from '@/types/consultation';

/** Mirror of GSTIN_PATTERN in api/_lib/storeConfig.ts. */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const SELLER_FIELDS = ['legalName', 'tradeName', 'gstin', 'address', 'city', 'state', 'stateCode', 'pincode', 'email', 'phone'] as const;
/** Seller fields the server requires before it can issue a GST invoice (assertSellerConfigured). */
export const SELLER_REQUIRED_FOR_INVOICE = ['legalName', 'gstin', 'address', 'state', 'stateCode', 'pincode'] as const;

export interface BusinessDraft {
  seller: Record<(typeof SELLER_FIELDS)[number], string>;
  whatsappNumber: string;
  supportPhone: string;
  supportEmail: string;
  supportHours: string;
  workshopAddress: string;
  codEnabled: boolean;
  codFee: string;
  codMaxOrderValue: string;
  defaultLeadTimeDays: string;
  customLeadTimeDays: string;
  returnWindowDays: string;
  consultation: { enabled: boolean; priceInr: string; creditTowardsOrder: boolean; creditValidityDays: string; turnaroundDays: string; sacCode: string };
}

export type BusinessErrors = Partial<Record<string, string>>;

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

export function draftFromConfig(config: StoreConfig): BusinessDraft {
  const seller: Partial<SellerSettings> = config.seller ?? {};
  return {
    seller: Object.fromEntries(SELLER_FIELDS.map(f => [f, str(seller[f])])) as BusinessDraft['seller'],
    whatsappNumber: str(config.whatsappNumber),
    supportPhone: str(config.supportPhone),
    supportEmail: str(config.supportEmail),
    supportHours: str(config.supportHours),
    workshopAddress: str(config.workshopAddress),
    codEnabled: config.codEnabled === true,
    codFee: str(config.codFee),
    codMaxOrderValue: str(config.codMaxOrderValue),
    defaultLeadTimeDays: str(config.defaultLeadTimeDays),
    customLeadTimeDays: str(config.customLeadTimeDays),
    returnWindowDays: str(config.returnWindowDays),
    consultation: {
      enabled: config.consultation?.enabled === true,
      priceInr: str(config.consultation?.priceInr ?? DEFAULT_CONSULTATION_SETTINGS.priceInr),
      creditTowardsOrder: config.consultation?.creditTowardsOrder ?? DEFAULT_CONSULTATION_SETTINGS.creditTowardsOrder,
      creditValidityDays: str(config.consultation?.creditValidityDays ?? DEFAULT_CONSULTATION_SETTINGS.creditValidityDays),
      turnaroundDays: str(config.consultation?.turnaroundDays ?? DEFAULT_CONSULTATION_SETTINGS.turnaroundDays),
      sacCode: str(config.consultation?.sacCode ?? DEFAULT_CONSULTATION_SETTINGS.sacCode),
    },
  };
}

/** Invoice-critical seller fields that are still empty (the Shipping console warns about these). */
export function missingSellerFields(seller: Partial<SellerSettings> | undefined): string[] {
  return SELLER_REQUIRED_FOR_INVOICE.filter(f => !seller?.[f]?.toString().trim());
}

const SELLER_LABELS: Record<string, string> = {
  legalName: 'legal name', gstin: 'GSTIN', address: 'address', state: 'state', stateCode: 'GST state code', pincode: 'PIN code',
};

/** Staff-facing names for seller field keys, for example "GST state code". */
export const describeSellerFields = (keys: readonly string[]): string => keys.map(k => SELLER_LABELS[k] ?? k).join(', ');

const EMAIL =/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digitsOnly = (v: string) => v.replace(/[\s()+-]/g, '');

function checkNumber(errors: BusinessErrors, key: string, raw: string, label: string, { integer = false, max }: { integer?: boolean; max?: number } = {}) {
  if (raw.trim() === '') return;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) errors[key] = `${label} must be zero or more.`;
  else if (integer && !Number.isInteger(n)) errors[key] = `${label} must be a whole number.`;
  else if (max !== undefined && n > max) errors[key] = `${label} must be at most ${max}.`;
}

export function validateBusiness(d: BusinessDraft): BusinessErrors {
  const errors: BusinessErrors = {};
  const s = d.seller;
  const gstin = s.gstin.trim().toUpperCase();
  if (gstin && !GSTIN_PATTERN.test(gstin)) errors.gstin = 'Enter a valid 15-character GSTIN, for example 29ABCDE1234F1Z5.';
  if (s.stateCode.trim() && !/^\d{2}$/.test(s.stateCode.trim())) errors.stateCode = 'The GST state code is two digits, for example 29.';
  else if (gstin && GSTIN_PATTERN.test(gstin) && s.stateCode.trim() && gstin.slice(0, 2) !== s.stateCode.trim()) {
    errors.stateCode = 'The state code must equal the first two characters of the GSTIN.';
  }
  if (s.pincode.trim() && !/^[1-9]\d{5}$/.test(s.pincode.trim())) errors.pincode = 'Enter a 6-digit PIN code.';
  if (s.email.trim() && !EMAIL.test(s.email.trim())) errors.sellerEmail = 'Enter a valid email address.';
  if (d.supportEmail.trim() && !EMAIL.test(d.supportEmail.trim())) errors.supportEmail = 'Enter a valid email address.';
  for (const [key, value] of [['whatsappNumber', d.whatsappNumber], ['supportPhone', d.supportPhone], ['sellerPhone', s.phone]] as const) {
    if (value.trim() && !/^\d{10,15}$/.test(digitsOnly(value))) errors[key] = 'Enter 10 to 15 digits, with the country code for WhatsApp.';
  }
  checkNumber(errors, 'codFee', d.codFee, 'The COD fee');
  checkNumber(errors, 'codMaxOrderValue', d.codMaxOrderValue, 'The COD order limit');
  checkNumber(errors, 'defaultLeadTimeDays', d.defaultLeadTimeDays, 'Lead time', { integer: true, max: 365 });
  checkNumber(errors, 'customLeadTimeDays', d.customLeadTimeDays, 'Custom lead time', { integer: true, max: 365 });
  checkNumber(errors, 'returnWindowDays', d.returnWindowDays, 'The return window', { integer: true, max: 90 });
  const c = d.consultation;
  if (c.priceInr.trim() === '' || !(Number(c.priceInr) >= 1) || Number(c.priceInr) > 100_000) errors.consultationPrice = 'Enter a fee between ₹1 and ₹1,00,000, before GST.';
  checkNumber(errors, 'creditValidityDays', c.creditValidityDays, 'Credit validity', { integer: true, max: 365 });
  checkNumber(errors, 'turnaroundDays', c.turnaroundDays, 'Turnaround', { integer: true, max: 30 });
  if (c.sacCode.trim() && !/^\d{4,8}$/.test(c.sacCode.trim())) errors.sacCode = 'A SAC code is 4 to 8 digits, for example 998391.';
  return errors;
}

const num = (raw: string): number | undefined => (raw.trim() === '' ? undefined : Number(raw));

/** The fields to merge into `settings/store`. Empty numbers are omitted so the server default stays in force. */
export function toStorePatch(d: BusinessDraft): Partial<StoreConfig> {
  const patch: Partial<StoreConfig> = {
    seller: {
      ...Object.fromEntries(SELLER_FIELDS.map(f => [f, d.seller[f].trim()])),
      gstin: d.seller.gstin.trim().toUpperCase(),
    },
    whatsappNumber: d.whatsappNumber.trim(),
    supportPhone: d.supportPhone.trim(),
    supportEmail: d.supportEmail.trim(),
    supportHours: d.supportHours.trim(),
    workshopAddress: d.workshopAddress.trim(),
    codEnabled: d.codEnabled,
    consultation: {
      enabled: d.consultation.enabled,
      priceInr: Number(d.consultation.priceInr),
      creditTowardsOrder: d.consultation.creditTowardsOrder,
      ...(num(d.consultation.creditValidityDays) !== undefined ? { creditValidityDays: num(d.consultation.creditValidityDays) } : {}),
      ...(num(d.consultation.turnaroundDays) !== undefined ? { turnaroundDays: num(d.consultation.turnaroundDays) } : {}),
      ...(d.consultation.sacCode.trim() ? { sacCode: d.consultation.sacCode.trim() } : {}),
    },
  };
  const optional: Array<[keyof StoreConfig, number | undefined]> = [
    ['codFee', num(d.codFee)], ['codMaxOrderValue', num(d.codMaxOrderValue)], ['defaultLeadTimeDays', num(d.defaultLeadTimeDays)],
    ['customLeadTimeDays', num(d.customLeadTimeDays)], ['returnWindowDays', num(d.returnWindowDays)],
  ];
  for (const [key, value] of optional) if (value !== undefined) Object.assign(patch, { [key]: value });
  return patch;
}
