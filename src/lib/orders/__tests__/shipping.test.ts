import { describe, expect, it } from 'vitest';
import type { OrderOps, ShipmentView } from '@/types/orderOps';
import type { Order } from '@/types/store';
import { recordPackage } from '../orderNotes';
import type { OrderStatus } from '../orderStateMachine';
import { packageForShipment, shippingActions } from '../shipping';

const ship = (over: Partial<ShipmentView> = {}): ShipmentView => ({
  provider: 'manual', status: 'in_transit', awb: 'AB1234', courier: 'DTDC', trackingUrl: null, labelUrl: null, manifestUrl: null, error: null, ...over,
});
const order = (status: OrderStatus, shipment: ShipmentView | null, extra: Partial<Order> = {}): Order => ({
  id: 'o', email: 'a@b.in', status, placedAt: 0, items: [], subtotal: 0, discountTotal: 0, shippingTotal: 0, taxTotal: 0, total: 0, statusHistory: [],
  ops: { shipment } as OrderOps, ...extra,
});

describe('shipping actions', () => {
  it('offers booking for a packed order with no active shipment, including after a cancelled one', () => {
    expect(shippingActions(order('Packed', null)).canCreate).toBe(true);
    expect(shippingActions(order('Packed', ship({ status: 'cancelled' }))).canCreate).toBe(true);
    expect(shippingActions(order('Packed', ship({ provider: 'shiprocket', status: 'awb_assigned' }))).canCreate).toBe(false);
  });

  it('allows cancelling a shipment only while the order is still packed', () => {
    expect(shippingActions(order('Packed', ship({ provider: 'shiprocket', status: 'awb_assigned' }))).canCancelShipment).toBe(true);
    expect(shippingActions(order('Shipped', ship({ provider: 'shiprocket' }))).canCancelShipment).toBe(false);
  });

  it('gives manual shipments the next delivery statuses and leaves Shiprocket ones to the webhook', () => {
    expect(shippingActions(order('Shipped', ship())).nextStatuses).toEqual(['Out_For_Delivery', 'Delivered', 'RTO_Initiated']);
    expect(shippingActions(order('RTO_Initiated', ship())).nextStatuses).toEqual(['RTO_Delivered', 'Delivered']);
    expect(shippingActions(order('Shipped', ship({ provider: 'shiprocket' }))).nextStatuses).toEqual([]);
  });

  it('offers cancel-and-refund only once the parcel is back', () => {
    expect(shippingActions(order('RTO_Delivered', ship())).canCancelOrder).toBe(true);
    expect(shippingActions(order('RTO_Initiated', ship())).canCancelOrder).toBe(false);
  });

  it('reads the packed dimensions for Shiprocket (width becomes breadth)', () => {
    const notes = recordPackage(undefined, { lengthCm: 60, widthCm: 40, heightCm: 6, weightKg: 2.5 }, 'qc', 1);
    expect(packageForShipment(order('Packed', null, { adminNotes: notes }))).toEqual({ lengthCm: 60, breadthCm: 40, heightCm: 6, weightKg: 2.5 });
    expect(packageForShipment(order('Packed', null))).toBeNull();
  });
});
