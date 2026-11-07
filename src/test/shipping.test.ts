// @vitest-environment node
import type { VercelRequest } from '@vercel/node';
import { describe, expect, it } from 'vitest';
import { createCheckoutIntent } from '../../api/_lib/checkout';
import { ApiError } from '../../api/_lib/errors';
import { orderPath, type ShipmentRecord } from '../../api/_lib/orders';
import { buildDeliveryEstimate, istDatePlusDays, serviceabilityFor } from '../../api/_lib/shipping';
import { ManualShippingProvider } from '../../api/_lib/shipping/manual';
import { bulkShipmentDocuments, cancelShipment, courierRatesFor, createShipment } from '../../api/_lib/shipping/shipments';
import { BULK_CHUNK_SIZE, parseCourierRates, parseServiceability, ShiprocketProvider } from '../../api/_lib/shipping/shiprocket';
import { mapCourierStatus } from '../../api/_lib/shipping/statusMap';
import { processCourierEvent, verifyCourierWebhookToken } from '../../api/_lib/shipping/trackingWebhook';
import { checkoutRequest, deps, NOW, paidOrder, scriptedFetch, seededStore, SELLER_CONFIG, setStatus, STAFF_ACTOR } from './support/serverFixtures';
import type { MemoryStore } from './support/memoryStore';

const SR_CONFIG = { email: 'api@vernox.in', password: 'secret', pickupLocation: 'Workshop', pickupPincode: '560058' };
const PACKAGE = { lengthCm: 60, breadthCm: 60, heightCm: 8, weightKg: 3 };

const bookingResponses = () => [
  { match: /auth\/login/, body: { token: 'tok_1' } },
  { match: /orders\/create\/adhoc/, body: { order_id: 9001, shipment_id: 7001, status: 'NEW' } },
  { match: /courier\/assign\/awb/, body: { awb_assign_status: 1, response: { data: { awb_code: 'SR123456789', courier_name: 'Delhivery Surface' } } } },
  { match: /courier\/generate\/pickup/, body: { pickup_status: 1, response: { pickup_scheduled_date: '2026-11-06 10:00:00' } } },
  { match: /courier\/generate\/label/, body: { label_created: 1, label_url: 'https://sr.example/label.pdf' } },
  { match: /manifests\/generate/, body: { manifest_url: 'https://sr.example/manifest.pdf' } },
];

async function packedOrder(store: MemoryStore, overrides: Record<string, unknown> = {}) {
  const res = await paidOrder(store, overrides);
  setStatus(store, res.orderId, 'Packed');
  return res;
}

describe('courier status mapping', () => {
  it.each([
    ['PICKED UP', undefined, 'Shipped'],
    ['In Transit', undefined, 'Shipped'],
    ['OUT FOR DELIVERY', undefined, 'Out_For_Delivery'],
    ['Delivered', undefined, 'Delivered'],
    ['RTO INITIATED', undefined, 'RTO_Initiated'],
    ['RTO_DELIVERED', undefined, 'RTO_Delivered'],
    ['UNDELIVERED', 21, null],
    ['PICKUP SCHEDULED', 19, null],
    ['', 7, 'Delivered'],
    ['SOMETHING NEW', 17, 'Out_For_Delivery'],
  ])('%s (%s) → %s', (status, id, expected) => {
    expect(mapCourierStatus(status, id)).toBe(expected);
  });
});

describe('courier webhook', () => {
  const req = (key?: string) => ({ headers: key === undefined ? {} : { 'x-api-key': key } }) as unknown as VercelRequest;

  it('checks the x-api-key token', () => {
    expect(verifyCourierWebhookToken(req('tok-abc'), 'tok-abc')).toBe(true);
    expect(verifyCourierWebhookToken(req('tok-abd'), 'tok-abc')).toBe(false);
    expect(verifyCourierWebhookToken(req(''), 'tok-abc')).toBe(false);
    expect(verifyCourierWebhookToken(req(), 'tok-abc')).toBe(false);
  });

  it('moves a Shiprocket order from Packed through delivery, idempotently, and records COD cash', async () => {
    const store = seededStore();
    const res = await createCheckoutIntent(deps(store), checkoutRequest({ paymentMethod: 'cod' }), null);
    setStatus(store, res.orderId, 'Packed');
    const sr = scriptedFetch(bookingResponses());
    await createShipment(store, new ShiprocketProvider(SR_CONFIG, store, sr.impl, () => NOW), SELLER_CONFIG, { orderId: res.orderId, package: PACKAGE, actor: STAFF_ACTOR, now: NOW });
    expect(store.read(orderPath(res.orderId))).toMatchObject({ status: 'Packed', shipment: { status: 'awb_assigned', awb: 'SR123456789' } });

    const event = (current_status: string, ts: string) => ({ awb: 'SR123456789', current_status, current_timestamp: ts });
    expect(await processCourierEvent(store, event('PICKED UP', '06 11 2026 11:00:00'), NOW)).toBe('applied');
    expect(await processCourierEvent(store, event('PICKED UP', '06 11 2026 11:00:00'), NOW)).toBe('duplicate_event');
    expect(await processCourierEvent(store, event('IN TRANSIT', '06 11 2026 18:00:00'), NOW)).toBe('ignored');
    expect(await processCourierEvent(store, event('OUT FOR DELIVERY', '09 11 2026 08:00:00'), NOW)).toBe('applied');
    expect(await processCourierEvent(store, event('DELIVERED', '09 11 2026 14:00:00'), NOW)).toBe('applied');
    const order = store.read(orderPath(res.orderId))!;
    expect(order).toMatchObject({ status: 'Delivered', deliveredAt: NOW, codCollectedPaise: order.amounts && (order.amounts as { totalPaise: number }).totalPaise });
    const events = store.collection('notifications_outbox').map(n => n.data.event).sort();
    expect(events).toEqual(['delivered', 'order_confirmed', 'out_for_delivery', 'shipped']);
  });

  it('implies the pickup scan when a later event arrives first, and handles RTO', async () => {
    const store = seededStore();
    const res = await packedOrder(store);
    const sr = scriptedFetch(bookingResponses());
    await createShipment(store, new ShiprocketProvider(SR_CONFIG, store, sr.impl, () => NOW), SELLER_CONFIG, { orderId: res.orderId, package: PACKAGE, actor: STAFF_ACTOR, now: NOW });
    expect(await processCourierEvent(store, { awb: 'SR123456789', current_status: 'RTO INITIATED', current_timestamp: 't1' }, NOW)).toBe('applied');
    expect(await processCourierEvent(store, { awb: 'SR123456789', current_status: 'RTO DELIVERED', current_timestamp: 't2' }, NOW)).toBe('applied');
    const order = store.read(orderPath(res.orderId))!;
    expect((order.statusHistory as Array<{ status: string }>).map(h => h.status).slice(-3)).toEqual(['Shipped', 'RTO_Initiated', 'RTO_Delivered']);
    expect(order.shipment).toMatchObject({ status: 'rto' });
  });

  it('stores events for unknown AWBs and unmapped statuses without failing', async () => {
    const store = seededStore();
    expect(await processCourierEvent(store, { awb: 'NOPE12345', current_status: 'DELIVERED', current_timestamp: 't' }, NOW)).toBe('unmatched');
    expect(await processCourierEvent(store, { current_status: 'DELIVERED' }, NOW)).toBe('invalid');
    expect(store.collection('courier_events')).toHaveLength(1);
  });
});

describe('Shiprocket provider', () => {
  it('caches the auth token and parses serviceability', async () => {
    const store = seededStore();
    const sr = scriptedFetch([
      { match: /auth\/login/, body: { token: 'tok_1' } },
      {
        match: /courier\/serviceability/,
        body: { data: { recommended_courier_company_id: 2, available_courier_companies: [{ courier_company_id: 1, courier_name: 'Slow', estimated_delivery_days: '7', cod: 1 }, { courier_company_id: 2, courier_name: 'Fast', estimated_delivery_days: '3', cod: 0 }] } },
      },
      { match: /courier\/serviceability/, status: 404, body: { message: 'not serviceable' } },
    ]);
    const provider = new ShiprocketProvider(SR_CONFIG, store, sr.impl, () => NOW);
    expect(await provider.checkServiceability({ deliveryPincode: '560001' })).toEqual({ serviceable: true, codAvailable: true, transitDays: 3, courierName: 'Fast', city: null, state: null });
    expect(await provider.checkServiceability({ deliveryPincode: '799999' })).toMatchObject({ serviceable: false });
    expect(sr.calls.filter(c => c.url.includes('auth/login'))).toHaveLength(1);
    expect(sr.calls[1].init.headers.Authorization).toBe('Bearer tok_1');
    expect(store.read('integrations/shiprocket')).toMatchObject({ token: 'tok_1' });
  });

  it('refreshes an expired token once on 401', async () => {
    const store = seededStore();
    store.seed('integrations/shiprocket', { token: 'stale', expiresAt: NOW + 1000 });
    const sr = scriptedFetch([
      { match: /serviceability/, status: 401, body: {} },
      { match: /auth\/login/, body: { token: 'fresh' } },
      { match: /serviceability/, body: { data: { available_courier_companies: [] } } },
    ]);
    const provider = new ShiprocketProvider(SR_CONFIG, store, sr.impl, () => NOW);
    expect(await provider.checkServiceability({ deliveryPincode: '560001' })).toMatchObject({ serviceable: false });
    expect(sr.calls[2].init.headers.Authorization).toBe('Bearer fresh');
  });

  it('sends GST-inclusive amounts so the COD collectable equals the order total', async () => {
    const store = seededStore();
    const res = await createCheckoutIntent(deps(store), checkoutRequest({ paymentMethod: 'cod' }), null);
    setStatus(store, res.orderId, 'Packed');
    const sr = scriptedFetch(bookingResponses());
    await createShipment(store, new ShiprocketProvider(SR_CONFIG, store, sr.impl, () => NOW), SELLER_CONFIG, { orderId: res.orderId, package: PACKAGE, actor: STAFF_ACTOR, now: NOW });
    const body = JSON.parse(sr.calls.find(c => c.url.includes('create/adhoc'))!.init.body!);
    expect(body).toMatchObject({ payment_method: 'COD', order_id: res.orderNumber, invoice_number: 'VX/26-27/000001', weight: 3 });
    expect(Math.round((body.sub_total + body.shipping_charges + body.transaction_charges) * 100)).toBe(Math.round(res.pricing.total * 100));
  });

  it('resumes after a failed AWB step instead of creating a second Shiprocket order', async () => {
    const store = seededStore();
    const res = await packedOrder(store);
    const first = scriptedFetch([
      { match: /auth\/login/, body: { token: 'tok_1' } },
      { match: /orders\/create\/adhoc/, body: { order_id: 9001, shipment_id: 7001 } },
      { match: /courier\/assign\/awb/, status: 500, body: { message: 'courier down' } },
    ]);
    const err = await createShipment(store, new ShiprocketProvider(SR_CONFIG, store, first.impl, () => NOW), SELLER_CONFIG, { orderId: res.orderId, package: PACKAGE, actor: STAFF_ACTOR, now: NOW }).catch(e => e);
    expect((err as ApiError).code).toBe('SHIPPING_PROVIDER_ERROR');
    expect(store.read(orderPath(res.orderId))!.shipment).toMatchObject({ shipmentId: '7001', awb: null });

    const second = scriptedFetch(bookingResponses().filter(r => !/adhoc|login/.test(String(r.match))));
    const shipment = await createShipment(store, new ShiprocketProvider(SR_CONFIG, store, second.impl, () => NOW), SELLER_CONFIG, { orderId: res.orderId, package: PACKAGE, actor: STAFF_ACTOR, now: NOW });
    expect(shipment).toMatchObject({ shipmentId: '7001', awb: 'SR123456789', labelUrl: 'https://sr.example/label.pdf', manifestUrl: 'https://sr.example/manifest.pdf' });
    expect(second.calls.some(c => c.url.includes('create/adhoc'))).toBe(false);
    expect(store.collection('invoices')).toHaveLength(1);
  });

  it('cancels a booked shipment only before pickup', async () => {
    const store = seededStore();
    const res = await packedOrder(store);
    const sr = scriptedFetch([...bookingResponses(), { match: /orders\/cancel/, body: { status: 200 } }]);
    const provider = new ShiprocketProvider(SR_CONFIG, store, sr.impl, () => NOW);
    await createShipment(store, provider, SELLER_CONFIG, { orderId: res.orderId, package: PACKAGE, actor: STAFF_ACTOR, now: NOW });
    await cancelShipment(store, provider, { orderId: res.orderId, reason: 'wrong box', actor: STAFF_ACTOR, now: NOW });
    expect(store.read(orderPath(res.orderId))).toMatchObject({ shipment: { status: 'cancelled' }, shipmentAwb: null, status: 'Packed' });
    expect(JSON.parse(sr.calls.at(-1)!.init.body!)).toEqual({ ids: [9001] });
  });
});

describe('manual shipping and delivery estimate', () => {
  it('serves any valid Indian PIN and needs staff-entered AWBs', async () => {
    const manual = new ManualShippingProvider({ transitDays: 5, codEnabled: true });
    expect(await manual.checkServiceability({ deliveryPincode: '110001' })).toEqual({ serviceable: true, codAvailable: true, transitDays: 5, courierName: null });
    expect(await manual.checkServiceability({ deliveryPincode: '012345' })).toMatchObject({ serviceable: false });
    const store = seededStore();
    const res = await packedOrder(store);
    expect(((await createShipment(store, manual, SELLER_CONFIG, { orderId: res.orderId, package: PACKAGE, actor: STAFF_ACTOR }).catch(e => e)) as ApiError).code).toBe('VALIDATION_ERROR');
    await createShipment(store, manual, SELLER_CONFIG, { orderId: res.orderId, manual: { courier: 'India Post', awb: 'EE123456789IN', trackingUrl: 'https://www.indiapost.gov.in' }, actor: STAFF_ACTOR });
    expect(store.read(orderPath(res.orderId))).toMatchObject({ status: 'Shipped', tracking: { carrier: 'India Post', trackingNumber: 'EE123456789IN' } });
  });

  it('refuses to ship an order that is not packed', async () => {
    const store = seededStore();
    const res = await paidOrder(store);
    const manual = new ManualShippingProvider({ transitDays: 5, codEnabled: true });
    const err = await createShipment(store, manual, SELLER_CONFIG, { orderId: res.orderId, manual: { courier: 'DTDC', awb: 'D1234567' }, actor: STAFF_ACTOR }).catch(e => e);
    expect((err as ApiError).code).toBe('CONFLICT');
  });

  it('adds production lead time to transit, and caches serviceability per PIN', async () => {
    const store = seededStore();
    const manual = new ManualShippingProvider({ transitDays: 5, codEnabled: true });
    const s = await serviceabilityFor(store, manual, '560001', NOW);
    expect(store.read('serviceability_cache/manual_560001')).toBeTruthy();
    const estimate = buildDeliveryEstimate({ serviceability: s, leadTimeDays: 7, codAllowedForItem: false, config: SELLER_CONFIG, now: NOW });
    expect(estimate).toEqual({ serviceable: true, codAvailable: false, estimatedDispatchDays: 7, estimatedDeliveryDate: istDatePlusDays(NOW, 12), courierName: null, city: null, state: null });
    expect(istDatePlusDays(Date.parse('2026-11-05T23:30:00+05:30'), 0)).toBe('2026-11-05');
  });

  it('parses an empty serviceability answer as not serviceable', () => {
    expect(parseServiceability({ data: { available_courier_companies: [] } })).toMatchObject({ serviceable: false });
    // City and state of the delivery PIN come from the courier entries, tidied to title case.
    expect(parseServiceability({ data: { available_courier_companies: [{ courier_company_id: 1, courier_name: 'A', city: 'NAVI MUMBAI', state: ' maharashtra ' }] } }))
      .toMatchObject({ city: 'Navi Mumbai', state: 'Maharashtra' });
    expect(parseServiceability({ data: { available_courier_companies: [{ courier_company_id: 1, courier_name: 'A' }] } }))
      .toMatchObject({ city: null, state: null });
  });
});

const RATES_BODY = {
  data: {
    recommended_courier_company_id: 2,
    available_courier_companies: [
      { courier_company_id: 1, courier_name: 'Cheap Surface', rate: 90.5, freight_charge: 80, cod_charges: 10.5, estimated_delivery_days: '6', etd: 'Nov 13, 2026', cod: 1, rating: 3.9 },
      { courier_company_id: 2, courier_name: 'Fast Air', rate: 150, freight_charge: 140, cod_charges: 10, estimated_delivery_days: '2', etd: 'Nov 9, 2026', cod: 1, rating: 4.6 },
      { courier_company_id: 3, courier_name: 'Prepaid Only', rate: 70, freight_charge: 70, cod_charges: 0, estimated_delivery_days: '5', cod: 0, rating: '4.0' },
    ],
  },
};

describe('courier rates at booking', () => {
  it('lists couriers recommended first then cheapest, and drops non-COD couriers for COD parcels', () => {
    const all = parseCourierRates(RATES_BODY, false);
    expect(all.map(r => r.name)).toEqual(['Fast Air', 'Prepaid Only', 'Cheap Surface']);
    expect(all[0]).toEqual({ courierId: 2, name: 'Fast Air', freightCharge: 140, codCharge: 10, totalCharge: 150, estimatedDays: 2, etd: 'Nov 9, 2026', codAvailable: true, rating: 4.6, recommended: true });
    expect(all[1]).toMatchObject({ rating: 4, etd: null });
    expect(parseCourierRates(RATES_BODY, true).map(r => r.name)).toEqual(['Fast Air', 'Cheap Surface']);
    expect(parseCourierRates({ data: {} }, false)).toEqual([]);
  });

  it('queries serviceability with the parcel, COD flag and declared value of the order', async () => {
    const store = seededStore();
    const res = await packedOrder(store, { paymentMethod: 'cod' });
    const sr = scriptedFetch([{ match: /auth\/login/, body: { token: 'tok_1' } }, { match: /courier\/serviceability/, body: RATES_BODY }]);
    const out = await courierRatesFor(store, new ShiprocketProvider(SR_CONFIG, store, sr.impl, () => NOW), { orderId: res.orderId, package: PACKAGE });
    expect(out.automated).toBe(true);
    expect(out.rates).toHaveLength(2);
    const q = new URL(sr.calls[1].url).searchParams;
    expect(Object.fromEntries(q)).toMatchObject({ pickup_postcode: '560058', delivery_postcode: '560001', weight: '3', length: '60', breadth: '60', height: '8', cod: '1' });
    expect(Number(q.get('declared_value'))).toBeCloseTo(res.pricing.total, 2);
  });

  it('answers "not automated" without calling a courier when Shiprocket is not configured', async () => {
    const store = seededStore();
    const res = await packedOrder(store);
    const manual = new ManualShippingProvider({ transitDays: 5, codEnabled: true });
    expect(await courierRatesFor(store, manual, { orderId: res.orderId, package: PACKAGE })).toEqual({ automated: false, rates: [] });
  });

  it('refuses rates for an order that is not packed', async () => {
    const store = seededStore();
    const res = await paidOrder(store);
    const err = await courierRatesFor(store, new ManualShippingProvider({ transitDays: 5, codEnabled: true }), { orderId: res.orderId, package: PACKAGE }).catch(e => e);
    expect((err as ApiError).code).toBe('CONFLICT');
  });

  it('sends the chosen courier_id to AWB assignment, and none when auto', async () => {
    const store = seededStore();
    const res = await packedOrder(store);
    const sr = scriptedFetch(bookingResponses());
    await createShipment(store, new ShiprocketProvider(SR_CONFIG, store, sr.impl, () => NOW), SELLER_CONFIG, { orderId: res.orderId, package: PACKAGE, courierId: 2, actor: STAFF_ACTOR, now: NOW });
    expect(JSON.parse(sr.calls.find(c => c.url.includes('assign/awb'))!.init.body!)).toEqual({ shipment_id: '7001', courier_id: 2 });

    const auto = seededStore();
    const res2 = await packedOrder(auto);
    const sr2 = scriptedFetch(bookingResponses());
    await createShipment(auto, new ShiprocketProvider(SR_CONFIG, auto, sr2.impl, () => NOW), SELLER_CONFIG, { orderId: res2.orderId, package: PACKAGE, actor: STAFF_ACTOR, now: NOW });
    expect(JSON.parse(sr2.calls.find(c => c.url.includes('assign/awb'))!.init.body!)).toEqual({ shipment_id: '7001' });
  });
});

describe('bulk labels and manifest', () => {
  const bookedShipment = (id: number, extra: Record<string, unknown> = {}) => ({
    provider: 'shiprocket', status: 'awb_assigned', shipmentId: String(id), providerOrderId: String(id + 1000), awb: `AWB${id}`, courier: 'X',
    trackingUrl: null, labelUrl: null, manifestUrl: null, pickupScheduledAt: null, lastEvent: null, error: null, createdAt: NOW, updatedAt: NOW, ...extra,
  });

  it('merges labels and the printed manifest in chunks, generating manifests only where missing', async () => {
    const store = seededStore();
    const a = await packedOrder(store);
    const b = await packedOrder(store, { idempotencyKey: 'idem-key-0002' });
    store.seed(orderPath(a.orderId), { ...store.read(orderPath(a.orderId))!, shipment: bookedShipment(11, { manifestUrl: 'https://sr.example/m11.pdf' }) });
    store.seed(orderPath(b.orderId), { ...store.read(orderPath(b.orderId))!, shipment: bookedShipment(12) });
    const sr = scriptedFetch([
      { match: /auth\/login/, body: { token: 'tok_1' } },
      { match: /courier\/generate\/label/, body: { label_url: 'https://sr.example/all-labels.pdf' } },
      { match: /manifests\/generate/, body: {} },
      { match: /manifests\/print/, body: { manifest_url: 'https://sr.example/all-manifest.pdf' } },
    ]);
    const out = await bulkShipmentDocuments(store, new ShiprocketProvider(SR_CONFIG, store, sr.impl, () => NOW), { orderIds: [a.orderId, b.orderId], actor: STAFF_ACTOR, now: NOW });
    expect(out.skipped).toEqual([]);
    expect(out.batches).toEqual([{ orderIds: [a.orderId, b.orderId], labelUrl: 'https://sr.example/all-labels.pdf', manifestUrl: 'https://sr.example/all-manifest.pdf', error: null }]);
    expect(JSON.parse(sr.calls.find(c => c.url.includes('generate/label'))!.init.body!)).toEqual({ shipment_id: [11, 12] });
    expect(JSON.parse(sr.calls.find(c => c.url.includes('manifests/generate'))!.init.body!)).toEqual({ shipment_id: [12] });
    expect(JSON.parse(sr.calls.find(c => c.url.includes('manifests/print'))!.init.body!)).toEqual({ order_ids: [1011, 1012] });
    expect(store.collection('audit_logs').some(l => l.data.action === 'SHIPMENT_DOCUMENTS_BULK')).toBe(true);
  });

  it('splits a large selection into chunks and reports a failing chunk without losing the others', async () => {
    const shipments = Array.from({ length: BULK_CHUNK_SIZE + 1 }, (_, i) => bookedShipment(100 + i, { manifestUrl: 'https://sr.example/m.pdf' })) as unknown as ShipmentRecord[];
    const sr = scriptedFetch([
      { match: /auth\/login/, body: { token: 'tok_1' } },
      { match: /courier\/generate\/label/, body: { label_url: 'https://sr.example/l1.pdf' } },
      { match: /manifests\/print/, body: { manifest_url: 'https://sr.example/m1.pdf' } },
      { match: /courier\/generate\/label/, status: 500, body: { message: 'boom' } },
    ]);
    const batches = await new ShiprocketProvider(SR_CONFIG, seededStore(), sr.impl, () => NOW).getBulkDocuments(shipments);
    expect(batches.map(b => b.shipmentIds.length)).toEqual([BULK_CHUNK_SIZE, 1]);
    expect(batches[0]).toMatchObject({ labelUrl: 'https://sr.example/l1.pdf', error: null });
    expect(batches[1].error).toBeTruthy();
    expect(batches[1].error).not.toContain('boom');
  });

  it('skips manual, unbooked and unknown orders with a reason, and needs Shiprocket for the rest', async () => {
    const store = seededStore();
    const unbooked = await packedOrder(store);
    const manualOrder = await packedOrder(store, { idempotencyKey: 'idem-key-0002' });
    store.seed(orderPath(manualOrder.orderId), { ...store.read(orderPath(manualOrder.orderId))!, shipment: bookedShipment(0, { provider: 'manual', shipmentId: null, providerOrderId: null }) });
    const manual = new ManualShippingProvider({ transitDays: 5, codEnabled: true });
    const out = await bulkShipmentDocuments(store, manual, { orderIds: [unbooked.orderId, manualOrder.orderId, 'doesnotexist00'], actor: STAFF_ACTOR });
    expect(out.batches).toEqual([]);
    expect(out.skipped.map(s => s.orderId)).toEqual([unbooked.orderId, manualOrder.orderId, 'doesnotexist00']);

    const booked = await packedOrder(store, { idempotencyKey: 'idem-key-0003' });
    store.seed(orderPath(booked.orderId), { ...store.read(orderPath(booked.orderId))!, shipment: bookedShipment(21) });
    const err = await bulkShipmentDocuments(store, manual, { orderIds: [booked.orderId], actor: STAFF_ACTOR }).catch(e => e);
    expect((err as ApiError).code).toBe('VALIDATION_ERROR');
  });
});
