/**
 * Courier integration port. ShiprocketProvider (shiprocket.ts) automates AWB,
 * pickup, label and manifest; ManualShippingProvider (manual.ts) is used when
 * Shiprocket credentials are absent: every valid Indian PIN is serviceable with a
 * configured transit estimate, and staff enter the courier and AWB themselves.
 */
import type { OrderDoc, ShipmentRecord } from '../orders';

export interface ServiceabilityQuery {
  deliveryPincode: string;
  /** Declared package weight in kg (default 0.5 when unknown). */
  weightKg?: number;
}

export interface ServiceabilityResult {
  serviceable: boolean;
  codAvailable: boolean;
  /** Courier transit days, or null when the provider gave no estimate. */
  transitDays: number | null;
  courierName: string | null;
  /** Delivery city and state as the provider names them (display only); absent when it gives none. Cached results may predate these fields. */
  city?: string | null;
  state?: string | null;
}

export interface PackageDetails {
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  weightKg: number;
}

/** One courier option for a parcel, as listed by the provider at booking. Amounts are rupees. */
export interface CourierRate {
  courierId: number;
  name: string;
  /** Freight only; null when the provider gave no breakdown. */
  freightCharge: number | null;
  /** Courier COD handling fee; 0 for prepaid. */
  codCharge: number | null;
  /** What the provider bills in total (freight + COD fee + surcharges), when given. */
  totalCharge: number | null;
  estimatedDays: number | null;
  /** Provider's estimated delivery date label (e.g. "Nov 10, 2026"), when given. */
  etd: string | null;
  codAvailable: boolean;
  rating: number | null;
  /** The provider's own recommendation (what auto-assignment would pick). */
  recommended: boolean;
}

export interface CourierRateQuery {
  deliveryPincode: string;
  package: PackageDetails;
  cod: boolean;
  /** Declared (insured) value in rupees. */
  declaredValue: number;
}

/** Documents for one provider request; a large selection is split into several of these. */
export interface BulkDocumentBatch {
  shipmentIds: string[];
  labelUrl: string | null;
  manifestUrl: string | null;
  error: string | null;
}

export interface CreateShipmentRequest {
  order: OrderDoc;
  package: PackageDetails;
  /** Courier chosen from the rate list; omitted lets the provider auto-assign its recommended courier. */
  courierId?: number;
  invoiceNumber: string | null;
  /** A previous partial attempt (e.g. order created, AWB failed) to resume instead of duplicating. */
  existing: ShipmentRecord | null;
}

export type ShipmentUpdate = Omit<ShipmentRecord, 'createdAt' | 'updatedAt'>;

export interface ShippingProvider {
  readonly name: 'shiprocket' | 'manual';
  /** True when the provider books couriers itself (AWB, pickup, label). */
  readonly automated: boolean;
  checkServiceability(query: ServiceabilityQuery): Promise<ServiceabilityResult>;
  /**
   * Books the shipment. On a partial failure it throws a ShipmentStepError carrying
   * the progress made so far, which the caller stores so a retry resumes.
   */
  createShipment(request: CreateShipmentRequest): Promise<ShipmentUpdate>;
  cancelShipment(shipment: ShipmentRecord): Promise<void>;
  /** Courier options with charges and ETA; empty when the provider cannot list them (manual). */
  getCourierRates(query: CourierRateQuery): Promise<CourierRate[]>;
  /** One combined label PDF and manifest PDF per chunk of shipments; manual provider returns no batches. */
  getBulkDocuments(shipments: ShipmentRecord[]): Promise<BulkDocumentBatch[]>;
  /** Fresh label URL (provider URLs can expire). */
  getLabel(shipment: ShipmentRecord): Promise<string | null>;
}

export class ShipmentStepError extends Error {
  constructor(
    message: string,
    readonly progress: ShipmentUpdate,
  ) {
    super(message);
    this.name = 'ShipmentStepError';
  }
}
