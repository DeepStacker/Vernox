/**
 * Shipment operations behind the admin actions CREATE_SHIPMENT, CANCEL_SHIPMENT,
 * GET_LABEL and UPDATE_DELIVERY_STATUS, and the courier tracking webhook.
 *
 * State model:
 *  - CREATE_SHIPMENT needs a `Packed` order. It first issues the GST invoice
 *    (time of supply = removal of goods, see gst/invoice.ts), then books the
 *    courier. Shiprocket: the order stays `Packed` with `shipment.status =
 *    'awb_assigned'` until the courier's pickup scan arrives by webhook and moves
 *    it to `Shipped`. Manual (staff entered courier + AWB): the parcel is handed
 *    over at entry, so the order moves to `Shipped` immediately.
 *  - Courier events (webhook, or UPDATE_DELIVERY_STATUS for manual shipments) move
 *    Shipped → Out_For_Delivery → Delivered, or → RTO_Initiated → RTO_Delivered.
 *    A COD order records `codCollectedPaise` when delivered.
 */
import { auditInTransaction, buildAuditEntry, recordAudit } from '../audit';
import { ApiError } from '../errors';
import { applyInvoice, planInvoice } from '../gst/invoice';
import { canTransition, type OrderStatus } from '../orderLifecycle';
import { applyStatusChange, planStatusChange } from '../orderTransitions';
import { asOrder, orderPath, type OrderDoc, type ShipmentRecord } from '../orders';
import { arrayUnion, type DocStore } from '../store';
import type { StoreConfig } from '../storeConfig';
import { paiseToRupees } from '../money';
import { ShipmentStepError, type CourierRate, type PackageDetails, type ShipmentUpdate, type ShippingProvider } from './types';

type Actor = Parameters<typeof buildAuditEntry>[0]['actor'];

export interface ManualShipmentDetails {
  courier: string;
  awb: string;
  trackingUrl?: string;
}

async function loadOrder(store: DocStore, orderId: string): Promise<OrderDoc> {
  const order = asOrder(await store.get(orderPath(orderId)));
  if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
  return order;
}

/** Issues the invoice (idempotent) and returns its number; the order must still be Packed. */
async function issueInvoiceForDispatch(store: DocStore, orderId: string, config: StoreConfig, actor: Actor, now: number) {
  return store.runTransaction(async tx => {
    const order = asOrder(await tx.get(orderPath(orderId)));
    if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
    if (order.status !== 'Packed') throw new ApiError(409, 'CONFLICT', `Only packed orders can be shipped (status is ${order.status}).`);
    const plan = await planInvoice(tx, order, config.seller, now);
    const fields = applyInvoice(tx, plan, order, config.seller, now);
    if (plan.reservation) {
      tx.update(orderPath(order.id), { ...fields, updatedAt: now });
      auditInTransaction(store, tx, buildAuditEntry({ actor, action: 'INVOICE_ISSUED', targetType: 'order', targetId: order.id, details: { number: fields.invoiceNumber }, now }));
    }
    return { order: { ...order, ...fields } as OrderDoc, invoiceNumber: (fields as { invoiceNumber?: string }).invoiceNumber ?? null };
  });
}

function shipmentRecord(update: ShipmentUpdate, previous: ShipmentRecord | null | undefined, now: number): ShipmentRecord {
  return { ...update, createdAt: previous?.createdAt ?? now, updatedAt: now };
}

export async function createShipment(
  store: DocStore,
  provider: ShippingProvider,
  config: StoreConfig,
  params: { orderId: string; package?: PackageDetails; courierId?: number; manual?: ManualShipmentDetails; actor: Actor; now?: number },
): Promise<ShipmentRecord> {
  const now = params.now ?? Date.now();
  const current = await loadOrder(store, params.orderId);
  if (current.shipment?.awb && current.shipment.status !== 'cancelled') return current.shipment; // already booked
  if (!params.manual && !provider.automated) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Courier booking is not automated here. Enter the courier, AWB and tracking URL.');
  }
  if (!params.manual && !params.package) throw new ApiError(400, 'VALIDATION_ERROR', 'Package dimensions and weight are required.');

  const { order, invoiceNumber } = await issueInvoiceForDispatch(store, params.orderId, config, params.actor, now);
  const previous = order.shipment?.status === 'cancelled' ? null : order.shipment ?? null;

  let update: ShipmentUpdate;
  if (params.manual) {
    update = {
      provider: 'manual',
      status: 'in_transit',
      shipmentId: null,
      providerOrderId: null,
      awb: params.manual.awb,
      courier: params.manual.courier,
      trackingUrl: params.manual.trackingUrl ?? null,
      labelUrl: null,
      manifestUrl: null,
      pickupScheduledAt: null,
      lastEvent: null,
      error: null,
    };
  } else {
    try {
      update = await provider.createShipment({ order, package: params.package!, courierId: params.courierId, invoiceNumber, existing: previous });
    } catch (err) {
      if (err instanceof ShipmentStepError) {
        // Keep the progress so a retry resumes instead of booking twice.
        await store.update(orderPath(order.id), { shipment: shipmentRecord(err.progress, previous, now), updatedAt: now });
        throw new ApiError(502, 'SHIPPING_PROVIDER_ERROR', `Courier booking stopped at "${err.progress.error}". Retry to continue.`, err.message);
      }
      throw err;
    }
  }
  const shipment = shipmentRecord(update, previous, now);

  await store.runTransaction(async tx => {
    const fresh = asOrder(await tx.get(orderPath(order.id)));
    if (!fresh) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
    const fields = {
      shipment,
      shipmentAwb: shipment.awb,
      tracking: { carrier: shipment.courier ?? '', trackingNumber: shipment.awb ?? '', url: shipment.trackingUrl ?? '' },
    };
    const plan = params.manual && fresh.status === 'Packed' ? await planStatusChange(tx, fresh, { to: 'Shipped', by: params.actor.uid }) : null;
    if (plan) applyStatusChange(tx, plan, fresh, now, fields);
    else tx.update(orderPath(fresh.id), { ...fields, updatedAt: now });
    auditInTransaction(
      store,
      tx,
      buildAuditEntry({ actor: params.actor, action: 'SHIPMENT_CREATED', targetType: 'order', targetId: fresh.id, details: { provider: shipment.provider, awb: shipment.awb, courier: shipment.courier }, now }),
    );
  });
  return shipment;
}

export async function cancelShipment(
  store: DocStore,
  provider: ShippingProvider,
  params: { orderId: string; reason: string; actor: Actor; now?: number },
): Promise<void> {
  const now = params.now ?? Date.now();
  const order = await loadOrder(store, params.orderId);
  const shipment = order.shipment;
  if (!shipment || shipment.status === 'cancelled') throw new ApiError(409, 'CONFLICT', 'This order has no active shipment.');
  if (order.status !== 'Packed') throw new ApiError(409, 'CONFLICT', 'The courier has already picked this order up; it cannot be cancelled here.');
  if (shipment.provider === 'shiprocket' && provider.name === 'shiprocket') await provider.cancelShipment(shipment);
  await store.runTransaction(async tx => {
    const fresh = asOrder(await tx.get(orderPath(order.id)));
    if (!fresh?.shipment || fresh.shipment.status === 'cancelled') return;
    tx.update(orderPath(fresh.id), {
      shipment: { ...fresh.shipment, status: 'cancelled', error: null, updatedAt: now },
      shipmentAwb: null,
      cancelledShipments: arrayUnion({ awb: fresh.shipment.awb, courier: fresh.shipment.courier, at: now, reason: params.reason }),
      updatedAt: now,
    });
    auditInTransaction(store, tx, buildAuditEntry({ actor: params.actor, action: 'SHIPMENT_CANCELLED', targetType: 'order', targetId: fresh.id, details: { awb: fresh.shipment.awb, reason: params.reason }, now }));
  });
}

export async function getLabel(store: DocStore, provider: ShippingProvider, orderId: string, now = Date.now()) {
  const order = await loadOrder(store, orderId);
  const shipment = order.shipment;
  if (!shipment || shipment.status === 'cancelled') throw new ApiError(409, 'CONFLICT', 'This order has no active shipment.');
  if (shipment.provider !== 'shiprocket' || provider.name !== 'shiprocket') return { labelUrl: null, manifestUrl: null };
  const labelUrl = (await provider.getLabel(shipment)) ?? shipment.labelUrl;
  if (labelUrl && labelUrl !== shipment.labelUrl) {
    await store.update(orderPath(order.id), { shipment: { ...shipment, labelUrl, updatedAt: now }, updatedAt: now });
  }
  return { labelUrl, manifestUrl: shipment.manifestUrl };
}

const SHIPMENT_STATUS_FOR: Partial<Record<OrderStatus, ShipmentRecord['status']>> = {
  Shipped: 'in_transit',
  Out_For_Delivery: 'in_transit',
  Delivered: 'delivered',
  RTO_Initiated: 'rto',
  RTO_Delivered: 'rto',
};

export type CourierStatusOutcome = 'applied' | 'ignored' | 'no_shipment';

/**
 * Moves an order on a courier event. A pickup scan that never arrived is implied
 * by a later event (Packed → Shipped → Out_For_Delivery in one update); events
 * that would move an order backwards or sideways are ignored.
 */
export async function applyCourierStatus(
  store: DocStore,
  params: { orderId: string; target: OrderStatus; event: { status: string; at: string }; by: string; now?: number },
): Promise<CourierStatusOutcome> {
  const now = params.now ?? Date.now();
  return store.runTransaction(async tx => {
    const order = asOrder(await tx.get(orderPath(params.orderId)));
    if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
    if (!order.shipment || order.shipment.status === 'cancelled') return 'no_shipment';
    const path: OrderStatus[] =
      order.status === 'Packed' && params.target !== 'Shipped' && canTransition('Shipped', params.target) ? ['Shipped', params.target] : [params.target];
    let from: OrderStatus = order.status;
    for (const step of path) {
      if (!canTransition(from, step)) {
        tx.update(orderPath(order.id), { shipment: { ...order.shipment, lastEvent: params.event, updatedAt: now }, updatedAt: now });
        return 'ignored';
      }
      from = step;
    }
    const plan = await planStatusChange(tx, order, { to: path, by: params.by, note: `courier: ${params.event.status}`.slice(0, 200) });
    const delivered = params.target === 'Delivered';
    applyStatusChange(tx, plan, order, now, {
      shipment: { ...order.shipment, status: SHIPMENT_STATUS_FOR[params.target] ?? order.shipment.status, lastEvent: params.event, updatedAt: now },
      ...(delivered ? { deliveredAt: now } : {}),
      ...(delivered && order.paymentMethod === 'cod' ? { codCollectedPaise: order.amounts.totalPaise, codCollectedAt: now, codRemittance: { status: 'pending' } } : {}),
    });
    return 'applied';
  });
}

export type CourierRatesResult = {
  /** False when the provider cannot list couriers (manual fallback); the caller shows a note instead of a list. */
  automated: boolean;
  rates: CourierRate[];
}

/** Couriers, charges and ETA for a Packed order's parcel, before booking. Nothing is stored or booked. */
export async function courierRatesFor(
  store: DocStore,
  provider: ShippingProvider,
  params: { orderId: string; package: PackageDetails },
): Promise<CourierRatesResult> {
  const order = await loadOrder(store, params.orderId);
  if (order.status !== 'Packed') throw new ApiError(409, 'CONFLICT', `Courier rates are listed for packed orders (status is ${order.status}).`);
  if (!provider.automated) return { automated: false, rates: [] };
  const rates = await provider.getCourierRates({
    deliveryPincode: order.customer.pincode,
    package: params.package,
    cod: order.paymentMethod === 'cod',
    declaredValue: paiseToRupees(order.amounts.totalPaise),
  });
  return { automated: true, rates };
}

export type BulkDocumentsResult = {
  /** One merged PDF per chunk of shipments. */
  batches: Array<{ orderIds: string[]; labelUrl: string | null; manifestUrl: string | null; error: string | null }>;
  /** Orders left out, with the reason (no active Shiprocket shipment, or unknown order). */
  skipped: Array<{ orderId: string; reason: string }>;
}

/** Combined label and manifest PDFs for several booked Shiprocket shipments (see ShiprocketProvider.getBulkDocuments). */
export async function bulkShipmentDocuments(
  store: DocStore,
  provider: ShippingProvider,
  params: { orderIds: string[]; actor: Actor; now?: number },
): Promise<BulkDocumentsResult> {
  const now = params.now ?? Date.now();
  const skipped: BulkDocumentsResult['skipped'] = [];
  const eligible: Array<{ orderId: string; shipment: ShipmentRecord }> = [];
  for (const orderId of [...new Set(params.orderIds)]) {
    const order = asOrder(await store.get(orderPath(orderId)));
    const shipment = order?.shipment;
    if (!order) skipped.push({ orderId, reason: 'Order not found.' });
    else if (!shipment || shipment.status === 'cancelled' || !shipment.awb) skipped.push({ orderId, reason: 'No booked shipment.' });
    else if (shipment.provider !== 'shiprocket' || !shipment.shipmentId) skipped.push({ orderId, reason: 'Manual shipment: print its label from the card.' });
    else eligible.push({ orderId, shipment });
  }
  if (eligible.length > 0 && provider.name !== 'shiprocket') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Courier documents are not available: Shiprocket is not configured.');
  }
  const batches = (await provider.getBulkDocuments(eligible.map(e => e.shipment))).map(b => ({
    orderIds: eligible.filter(e => b.shipmentIds.includes(e.shipment.shipmentId!)).map(e => e.orderId),
    labelUrl: b.labelUrl,
    manifestUrl: b.manifestUrl,
    error: b.error,
  }));
  if (eligible.length > 0) {
    await recordAudit(store, buildAuditEntry({
      actor: params.actor, action: 'SHIPMENT_DOCUMENTS_BULK', targetType: 'order', targetId: eligible[0].orderId,
      details: { orderIds: eligible.map(e => e.orderId), batches: batches.length, failedBatches: batches.filter(b => b.error).length }, now,
    }));
  }
  return { batches, skipped };
}
