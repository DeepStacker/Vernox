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
  /** Paid design consultation (Stage 2); absent = disabled with defaults. */
  consultation?: Partial<ConsultationSettings>;
  customPieces?: Record<string, { label?: string; setupFee?: number; ratePerCm2?: number; minimum?: number }>;
  updatedAt?: number;
}
