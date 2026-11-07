/**
 * Fallback when Shiprocket is not configured: any valid Indian PIN is
 * serviceable with `settings/store.manualTransitDays`, COD follows the store COD
 * switch, and shipments are booked by staff outside the system (CREATE_SHIPMENT
 * with `manual: { courier, awb, trackingUrl }`).
 */
import { ApiError } from '../errors';
import type { BulkDocumentBatch, CourierRate, ServiceabilityQuery, ServiceabilityResult, ShipmentUpdate, ShippingProvider } from './types';

export const INDIAN_PINCODE = /^[1-9][0-9]{5}$/;

export class ManualShippingProvider implements ShippingProvider {
  readonly name = 'manual' as const;
  readonly automated = false;

  constructor(private readonly options: { transitDays: number; codEnabled: boolean }) {}

  async checkServiceability(query: ServiceabilityQuery): Promise<ServiceabilityResult> {
    const serviceable = INDIAN_PINCODE.test(query.deliveryPincode);
    return {
      serviceable,
      codAvailable: serviceable && this.options.codEnabled,
      transitDays: serviceable ? this.options.transitDays : null,
      courierName: null,
    };
  }

  async createShipment(): Promise<ShipmentUpdate> {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Courier booking is not automated. Enter the courier, AWB and tracking URL.');
  }

  async cancelShipment(): Promise<void> {
    // Nothing booked through us; staff cancel with the courier directly.
  }

  async getCourierRates(): Promise<CourierRate[]> {
    return [];
  }

  async getBulkDocuments(): Promise<BulkDocumentBatch[]> {
    return [];
  }

  async getLabel(): Promise<string | null> {
    return null;
  }
}
