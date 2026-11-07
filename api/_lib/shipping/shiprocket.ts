/**
 * Shiprocket API v2 (https://apiv2.shiprocket.in/v1/external) implementation of ShippingProvider.
 *
 * Auth: POST /auth/login with an API user's email/password returns a bearer
 * token valid for 10 days. The token is cached in Firestore `integrations/shiprocket`
 * (server-only) for 9 days so serverless instances share it; a 401 refreshes once.
 *
 * Shipment booking runs the documented sequence, storing progress so a retry
 * resumes where it stopped instead of creating a duplicate Shiprocket order:
 *   POST /orders/create/adhoc → POST /courier/assign/awb → POST /courier/generate/pickup
 *   → POST /courier/generate/label → POST /manifests/generate
 *
 * Courier choice: GET /courier/serviceability/ (pickup_postcode, delivery_postcode, weight, cod,
 * declared_value, length, breadth, height) lists `data.available_courier_companies` with
 * courier_company_id, courier_name, rate, freight_charge, cod_charges, etd, estimated_delivery_days,
 * cod, rating, plus `data.recommended_courier_company_id`. The chosen id goes to POST /courier/assign/awb
 * as `courier_id`; omitted, Shiprocket auto-assigns its recommendation.
 * Bulk documents: POST /courier/generate/label {shipment_id: []} → label_url (one merged PDF);
 * POST /manifests/generate {shipment_id: []}; POST /manifests/print {order_ids: []} → manifest_url (one merged PDF).
 * Shiprocket publishes no per-request id cap for these, so requests are chunked conservatively (BULK_CHUNK_SIZE).
 * Sources: https://apidocs.shiprocket.in/ (Couriers and Shipments sections; the page is a client-rendered
 * Postman document, so field names were cross-checked against
 * https://support.shiprocket.in/support/solutions/articles/43000337456-shiprocket-api-document-helpsheet
 * and the open-source SDK https://github.com/ajitdas123/laravel-shiprocket). Not verified against the live API.
 */
import { ApiError } from '../errors';
import { paiseToRupees } from '../money';
import type { ShipmentRecord } from '../orders';
import type { DocStore } from '../store';
import type { FetchLike } from '../notifications/channels';
import {
  ShipmentStepError,
  type BulkDocumentBatch,
  type CourierRate,
  type CourierRateQuery,
  type CreateShipmentRequest,
  type ServiceabilityQuery,
  type ServiceabilityResult,
  type ShipmentUpdate,
  type ShippingProvider,
} from './types';

const BASE_URL = 'https://apiv2.shiprocket.in/v1/external';
const TOKEN_PATH = 'integrations/shiprocket';
const TOKEN_TTL_MS = 9 * 24 * 3600_000;
/** Shipments per label/manifest request; the API documents no cap, so stay well under typical gateway limits. */
export const BULK_CHUNK_SIZE = 50;

export interface ShiprocketConfig {
  email: string;
  password: string;
  /** Pickup location nickname exactly as configured in the Shiprocket panel. */
  pickupLocation: string;
  pickupPincode: string;
}

export const shiprocketTrackingUrl = (awb: string) => `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`;

const providerError = (detail: string) =>
  new ApiError(502, 'SHIPPING_PROVIDER_ERROR', 'The courier service could not complete this request. Please try again.', detail);

interface CourierCompany {
  courier_name?: string;
  courier_company_id?: number;
  estimated_delivery_days?: string | number;
  cod?: number;
  rating?: number | string;
  rate?: number | string;
  freight_charge?: number | string;
  cod_charges?: number | string;
  etd?: string;
  /** Delivery locality of the queried PIN, repeated on every courier entry. */
  city?: string;
  state?: string;
}

const finiteOrNull = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number.parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Pure: lists the couriers of a /courier/serviceability response, recommended first then cheapest. */
export function parseCourierRates(body: unknown, codOnly: boolean): CourierRate[] {
  const data = (body as { data?: { available_courier_companies?: CourierCompany[]; recommended_courier_company_id?: number; shiprocket_recommended_courier_id?: number } })?.data;
  const companies = Array.isArray(data?.available_courier_companies) ? data!.available_courier_companies! : [];
  const recommendedId = data?.recommended_courier_company_id ?? data?.shiprocket_recommended_courier_id ?? null;
  const rates = companies
    .filter(c => typeof c.courier_company_id === 'number' && c.courier_name)
    .map<CourierRate>(c => {
      const days = Number.parseInt(String(c.estimated_delivery_days ?? ''), 10);
      return {
        courierId: c.courier_company_id!,
        name: c.courier_name!,
        freightCharge: finiteOrNull(c.freight_charge),
        codCharge: finiteOrNull(c.cod_charges),
        totalCharge: finiteOrNull(c.rate),
        estimatedDays: Number.isFinite(days) && days > 0 ? days : null,
        etd: c.etd?.trim() || null,
        codAvailable: Number(c.cod) === 1,
        rating: finiteOrNull(c.rating),
        recommended: c.courier_company_id === recommendedId,
      };
    })
    .filter(r => !codOnly || r.codAvailable);
  const cost = (r: CourierRate) => r.totalCharge ?? r.freightCharge ?? Number.MAX_SAFE_INTEGER;
  return rates.sort((a, b) => Number(b.recommended) - Number(a.recommended) || cost(a) - cost(b));
}

const titleCase = (v: string) => v.toLowerCase().replace(/(^|[\s\-(])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());

/** First non-empty trimmed string among the courier entries' `field` (Shiprocket repeats the delivery city/state on each). */
function placeName(companies: CourierCompany[], field: 'city' | 'state'): string | null {
  for (const c of companies) {
    const v = typeof c[field] === 'string' ? c[field]!.trim() : '';
    if (v) return titleCase(v);
  }
  return null;
}

/** Pure: interprets a /courier/serviceability response. */
export function parseServiceability(body: unknown): ServiceabilityResult {
  const data = (body as { data?: { available_courier_companies?: CourierCompany[]; recommended_courier_company_id?: number } })?.data;
  const companies = Array.isArray(data?.available_courier_companies) ? data!.available_courier_companies! : [];
  if (companies.length === 0) return { serviceable: false, codAvailable: false, transitDays: null, courierName: null };
  const days = (c: CourierCompany) => {
    const n = Number.parseInt(String(c.estimated_delivery_days ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const recommended =
    companies.find(c => c.courier_company_id === data?.recommended_courier_company_id) ??
    [...companies].sort((a, b) => (days(a) ?? 99) - (days(b) ?? 99))[0];
  return {
    serviceable: true,
    codAvailable: companies.some(c => Number(c.cod) === 1),
    transitDays: days(recommended),
    courierName: recommended.courier_name ?? null,
    city: placeName(companies, 'city'),
    state: placeName(companies, 'state'),
  };
}

export class ShiprocketProvider implements ShippingProvider {
  readonly name = 'shiprocket' as const;
  readonly automated = true;

  constructor(
    private readonly config: ShiprocketConfig,
    private readonly store: DocStore,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
    private readonly now: () => number = Date.now,
  ) {}

  private async login(): Promise<string> {
    const res = await this.fetchImpl(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.config.email, password: this.config.password }),
    });
    const text = await res.text();
    const token = res.ok ? (JSON.parse(text) as { token?: string }).token : undefined;
    if (!token) throw providerError(`Shiprocket login failed: HTTP ${res.status}`);
    await this.store.set(TOKEN_PATH, { token, expiresAt: this.now() + TOKEN_TTL_MS, updatedAt: this.now() });
    return token;
  }

  private async token(forceRefresh: boolean): Promise<string> {
    if (!forceRefresh) {
      const cached = await this.store.get(TOKEN_PATH);
      if (typeof cached?.token === 'string' && typeof cached.expiresAt === 'number' && cached.expiresAt > this.now()) return cached.token;
    }
    return this.login();
  }

  /** Authenticated JSON call; retries once with a fresh token on 401. */
  async call<T>(method: 'GET' | 'POST', path: string, body?: unknown, retried = false): Promise<{ status: number; body: T }> {
    const token = await this.token(retried);
    let res;
    try {
      res = await this.fetchImpl(`${BASE_URL}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      throw providerError(`Shiprocket ${path} network error: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (res.status === 401 && !retried) return this.call<T>(method, path, body, true);
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text.slice(0, 300) };
    }
    if (!res.ok && res.status !== 404) throw providerError(`Shiprocket ${path} HTTP ${res.status}: ${text.slice(0, 300)}`);
    return { status: res.status, body: parsed as T };
  }

  async checkServiceability(query: ServiceabilityQuery): Promise<ServiceabilityResult> {
    const params = new URLSearchParams({
      pickup_postcode: this.config.pickupPincode,
      delivery_postcode: query.deliveryPincode,
      weight: String(query.weightKg ?? 0.5),
      cod: '0',
    });
    const { status, body } = await this.call<unknown>('GET', `/courier/serviceability/?${params.toString()}`);
    // Shiprocket answers 404 for a PIN no courier serves.
    if (status === 404) return { serviceable: false, codAvailable: false, transitDays: null, courierName: null };
    return parseServiceability(body);
  }

  async getCourierRates(query: CourierRateQuery): Promise<CourierRate[]> {
    const { package: pkg } = query;
    const params = new URLSearchParams({
      pickup_postcode: this.config.pickupPincode,
      delivery_postcode: query.deliveryPincode,
      weight: String(pkg.weightKg),
      length: String(pkg.lengthCm),
      breadth: String(pkg.breadthCm),
      height: String(pkg.heightCm),
      declared_value: String(query.declaredValue),
      cod: query.cod ? '1' : '0',
    });
    const { status, body } = await this.call<unknown>('GET', `/courier/serviceability/?${params.toString()}`);
    if (status === 404) return [];
    return parseCourierRates(body, query.cod);
  }

  /**
   * Amounts sent to Shiprocket are GST-inclusive so the COD amount the courier
   * collects (sub_total + shipping_charges + transaction_charges) equals the order total.
   */
  private adhocOrderBody(request: CreateShipmentRequest) {
    const { order, package: pkg } = request;
    const c = order.customer;
    const [first, ...rest] = c.name.trim().split(/\s+/);
    const cod = order.paymentMethod === 'cod';
    const istStamp = new Date(order.placedAt + 5.5 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
    const charges = order.amounts.taxBreakdown?.charges ?? [];
    const chargeGross = (kind: 'shipping' | 'cod_fee', base: number) => base + (charges.find(ch => ch.kind === kind)?.taxPaise ?? 0);
    const shippingGross = chargeGross('shipping', order.amounts.shippingPaise);
    const codFeeGross = chargeGross('cod_fee', order.amounts.codFeePaise ?? 0);
    const itemsGross = order.amounts.totalPaise - shippingGross - codFeeGross;
    return {
      order_id: order.orderNumber,
      order_date: istStamp,
      pickup_location: this.config.pickupLocation,
      billing_customer_name: first,
      billing_last_name: rest.join(' '),
      billing_address: c.address,
      billing_city: c.city,
      billing_pincode: c.pincode,
      billing_state: c.state,
      billing_country: 'India',
      billing_email: order.email,
      billing_phone: order.phoneKey || c.phone,
      shipping_is_billing: true,
      order_items: order.items.map(i => ({
        name: i.name.slice(0, 200),
        sku: `${i.productId}-${i.finish}-${i.sizeLabel ?? 'std'}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 50),
        units: i.quantity,
        selling_price: paiseToRupees(Math.round(((i.taxablePaise ?? i.lineTotalPaise) + (i.taxPaise ?? 0)) / i.quantity)),
        discount: 0,
        tax: (i.gstRateBps ?? order.amounts.gstRateBps) / 100,
        hsn: i.hsnCode ?? '',
      })),
      payment_method: cod ? 'COD' : 'Prepaid',
      shipping_charges: paiseToRupees(shippingGross),
      transaction_charges: paiseToRupees(codFeeGross),
      total_discount: 0,
      sub_total: paiseToRupees(itemsGross),
      ...(request.invoiceNumber ? { invoice_number: request.invoiceNumber } : {}),
      length: pkg.lengthCm,
      breadth: pkg.breadthCm,
      height: pkg.heightCm,
      weight: pkg.weightKg,
    };
  }

  async createShipment(request: CreateShipmentRequest): Promise<ShipmentUpdate> {
    const prior = request.existing;
    const progress: ShipmentUpdate = {
      provider: 'shiprocket',
      status: prior?.status ?? 'created',
      shipmentId: prior?.shipmentId ?? null,
      providerOrderId: prior?.providerOrderId ?? null,
      awb: prior?.awb ?? null,
      courier: prior?.courier ?? null,
      trackingUrl: prior?.trackingUrl ?? null,
      labelUrl: prior?.labelUrl ?? null,
      manifestUrl: prior?.manifestUrl ?? null,
      pickupScheduledAt: prior?.pickupScheduledAt ?? null,
      lastEvent: prior?.lastEvent ?? null,
      error: null,
    };
    const step = async (name: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (err) {
        const detail = err instanceof ApiError ? err.internalDetail ?? err.message : err instanceof Error ? err.message : String(err);
        throw new ShipmentStepError(`${name}: ${detail}`, { ...progress, error: `${name} failed` });
      }
    };

    if (!progress.shipmentId) {
      await step('create order', async () => {
        const { body } = await this.call<{ order_id?: number; shipment_id?: number; message?: string }>('POST', '/orders/create/adhoc', this.adhocOrderBody(request));
        if (!body?.shipment_id) throw new Error(body?.message ?? 'no shipment_id returned');
        progress.shipmentId = String(body.shipment_id);
        progress.providerOrderId = body.order_id ? String(body.order_id) : null;
      });
    }
    if (!progress.awb) {
      await step('assign AWB', async () => {
        const { body } = await this.call<{ awb_assign_status?: number; response?: { data?: { awb_code?: string; courier_name?: string } }; message?: string }>(
          'POST',
          '/courier/assign/awb',
          { shipment_id: progress.shipmentId, ...(request.courierId ? { courier_id: request.courierId } : {}) },
        );
        const awb = body?.response?.data?.awb_code;
        if (!awb) throw new Error(body?.message ?? 'no AWB assigned');
        progress.awb = awb;
        progress.courier = body.response?.data?.courier_name ?? null;
        progress.trackingUrl = shiprocketTrackingUrl(awb);
        progress.status = 'awb_assigned';
      });
    }
    if (!progress.pickupScheduledAt) {
      await step('schedule pickup', async () => {
        const { body } = await this.call<{ response?: { pickup_scheduled_date?: string } }>('POST', '/courier/generate/pickup', {
          shipment_id: [progress.shipmentId],
        });
        progress.pickupScheduledAt = body?.response?.pickup_scheduled_date ?? new Date(this.now()).toISOString();
      });
    }
    if (!progress.labelUrl) {
      await step('generate label', async () => {
        progress.labelUrl = await this.labelFor(progress.shipmentId!);
      });
    }
    if (!progress.manifestUrl) {
      await step('generate manifest', async () => {
        const { body } = await this.call<{ manifest_url?: string }>('POST', '/manifests/generate', { shipment_id: [progress.shipmentId] });
        progress.manifestUrl = body?.manifest_url ?? null;
      });
    }
    return { ...progress, status: progress.status === 'created' ? 'awb_assigned' : progress.status, error: null };
  }

  private async labelFor(shipmentId: string): Promise<string | null> {
    const { body } = await this.call<{ label_url?: string }>('POST', '/courier/generate/label', { shipment_id: [shipmentId] });
    return body?.label_url ?? null;
  }

  /**
   * Merged label and manifest PDFs for already-booked shipments, one request set per chunk.
   * A failing chunk is reported on its batch so the other chunks' documents are still usable.
   * Manifests are generated only for shipments that lack one (booking normally did), then printed together.
   */
  async getBulkDocuments(shipments: ShipmentRecord[]): Promise<BulkDocumentBatch[]> {
    const batches: BulkDocumentBatch[] = [];
    for (let i = 0; i < shipments.length; i += BULK_CHUNK_SIZE) {
      const chunk = shipments.slice(i, i + BULK_CHUNK_SIZE);
      const shipmentIds = chunk.map(s => s.shipmentId!);
      try {
        const { body: label } = await this.call<{ label_url?: string }>('POST', '/courier/generate/label', { shipment_id: shipmentIds.map(Number) });
        const unmanifested = chunk.filter(s => !s.manifestUrl).map(s => Number(s.shipmentId));
        if (unmanifested.length > 0) await this.call('POST', '/manifests/generate', { shipment_id: unmanifested });
        const orderIds = chunk.filter(s => s.providerOrderId).map(s => Number(s.providerOrderId));
        const { body: manifest } = orderIds.length > 0
          ? await this.call<{ manifest_url?: string }>('POST', '/manifests/print', { order_ids: orderIds })
          : { body: {} as { manifest_url?: string } };
        batches.push({ shipmentIds, labelUrl: label?.label_url ?? null, manifestUrl: manifest?.manifest_url ?? null, error: null });
      } catch (err) {
        const detail = err instanceof ApiError ? err.internalDetail ?? err.message : err instanceof Error ? err.message : String(err);
        console.error(`[shipping] bulk documents failed for ${shipmentIds.length} shipment(s): ${detail}`);
        batches.push({ shipmentIds, labelUrl: null, manifestUrl: null, error: 'The courier service could not produce these documents. Try again.' });
      }
    }
    return batches;
  }

  async cancelShipment(shipment: ShipmentRecord): Promise<void> {
    if (!shipment.providerOrderId) return;
    await this.call('POST', '/orders/cancel', { ids: [Number(shipment.providerOrderId)] });
  }

  async getLabel(shipment: ShipmentRecord): Promise<string | null> {
    if (!shipment.shipmentId) return null;
    return this.labelFor(shipment.shipmentId);
  }
}
