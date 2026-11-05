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
}

export interface PackageDetails {
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  weightKg: number;
}

export interface CreateShipmentRequest {
  order: OrderDoc;
  package: PackageDetails;
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
