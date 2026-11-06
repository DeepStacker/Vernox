import type { ConsultationSettings } from './consultation';

/**
 * `settings/store` document shape, shared by the storefront, admin UI, seed
 * script and API (api/_lib/storeConfig.ts parses it). Dependency-free so the
 * server can import it.
 */

/** Supplier block printed on GST invoices (`settings/store.seller`). Public business details only. */
export interface SellerSettings {
  legalName: string;
  tradeName: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  /** Two-digit GST state code; must equal the first two characters of the GSTIN. */
  stateCode: string;
  pincode: string;
  email: string;
  phone: string;
}

/**
 * Placeholder business details seeded for UAT so every flow works before the real ones are entered
 * (Admin → Settings). The GSTIN is well-formed but fictitious: while it is set, invoices are issued
 * as SPECIMEN documents in their own number series (api/_lib/gst/numbering.ts), and the storefront
 * never shows any placeholder value. Replacing it switches to real, gap-free invoice numbering.
 */
export const PLACEHOLDER_GSTIN = '27AAAAA0000A1Z5';

export const PLACEHOLDER_SELLER: SellerSettings = {
  legalName: 'Vernox (placeholder legal name)',
  tradeName: 'Vernox',
  gstin: PLACEHOLDER_GSTIN,
  address: 'Placeholder address, update in Settings',
  city: 'Mumbai',
  state: 'Maharashtra',
  stateCode: '27',
  pincode: '400001',
  email: 'accounts@example.com',
  phone: '+91 00000 00000',
};

export const PLACEHOLDER_CONTACT = {
  supportEmail: 'support@example.com',
  supportPhone: '+91 00000 00000',
  whatsappNumber: '',
  supportHours: 'Mon to Sat, 10 am to 6 pm IST',
  workshopAddress: '',
  grievanceOfficerName: 'Placeholder name, update in Settings',
  grievanceOfficerEmail: 'grievance@example.com',
} as const;

const PLACEHOLDER_VALUES: ReadonlySet<string> = new Set([
  ...Object.values(PLACEHOLDER_SELLER).filter(v => v !== 'Vernox' && v !== 'Mumbai' && v !== 'Maharashtra' && v !== '27' && v !== '400001'),
  PLACEHOLDER_CONTACT.supportEmail, PLACEHOLDER_CONTACT.supportPhone,
  PLACEHOLDER_CONTACT.grievanceOfficerName, PLACEHOLDER_CONTACT.grievanceOfficerEmail,
]);

/** True for a value that is still one of the seeded placeholders (never shown to customers). */
export const isPlaceholderValue = (value: string | undefined | null): boolean => Boolean(value) && PLACEHOLDER_VALUES.has(value!.trim());

/** Seller still on placeholder details: invoices are specimens and the launch checklist stays open. */
export const isPlaceholderSeller = (seller: Partial<SellerSettings> | undefined | null): boolean => seller?.gstin?.trim().toUpperCase() === PLACEHOLDER_GSTIN;

/**
 * Shape of the Firestore document `settings/store` (rupee amounts). It is
 * world-readable (firestore.rules), so it must never hold secrets: API keys,
 * passwords and webhook tokens live only in server environment variables.
 * Server parsing and defaults: api/_lib/storeConfig.ts.
 */
export interface StoreSettingsDoc {
  gstRatePercent: number;
  shippingFee: number;
  freeShippingThreshold: number;
  codEnabled: boolean;
  codFee: number;
  codMaxOrderValue: number;
  codMaxOpenOrdersPerPhone: number;
  returnWindowDays: number;
  defaultLeadTimeDays: number;
  customLeadTimeDays: number;
  manualTransitDays: number;
  /** HSN for products without `hsnCode`; the owner must confirm the classification. */
  defaultHsnCode: string;
  seller: SellerSettings;
  whatsappNumber: string;
  supportPhone: string;
  supportEmail: string;
  supportHours: string;
  workshopAddress: string;
  /** Grievance officer named on the policy pages; contact falls back to supportEmail. */
  grievanceOfficerName?: string;
  grievanceOfficerEmail?: string;
  /** Paid design consultation (Stage 2); absent = disabled with defaults. */
  consultation?: Partial<ConsultationSettings>;
  customPieces?: Record<string, { label?: string; setupFee?: number; ratePerCm2?: number; minimum?: number }>;
  updatedAt?: number;
}
