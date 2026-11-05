/**
 * Which shipping actions the console offers for an order. The server decides what is allowed
 * (API.md: CREATE_SHIPMENT, CANCEL_SHIPMENT, UPDATE_DELIVERY_STATUS); this only keeps buttons in
 * step with the shared state machine so staff are not offered moves that will be refused.
 */
import { ORDER_TRANSITIONS, type OrderStatus } from '@/types/orderStatus';
import type { Order } from '@/types/store';
import type { PackageInfo } from './orderNotes';
import { parseNotes } from './orderNotes';

/** Statuses UPDATE_DELIVERY_STATUS accepts. */
export const DELIVERY_STATUS_TARGETS = ['Shipped', 'Out_For_Delivery', 'Delivered', 'RTO_Initiated', 'RTO_Delivered'] as const;
export type DeliveryStatusTarget = (typeof DELIVERY_STATUS_TARGETS)[number];

export const SHIPPING_STAGES = ['Packed', 'Shipped', 'Out_For_Delivery', 'RTO_Initiated', 'RTO_Delivered'] as const satisfies readonly OrderStatus[];

export type ShippingQueue = 'ready' | 'in_transit' | 'rto';

export const SHIPPING_QUEUES: ReadonlyArray<{ id: ShippingQueue; label: string; statuses: readonly OrderStatus[] }> = [
  { id: 'ready', label: 'Ready to ship', statuses: ['Packed'] },
  { id: 'in_transit', label: 'In transit', statuses: ['Shipped', 'Out_For_Delivery'] },
  { id: 'rto', label: 'Returning to sender', statuses: ['RTO_Initiated', 'RTO_Delivered'] },
];

export function hasActiveShipment(order: Order): boolean {
  const s = order.ops?.shipment;
  return Boolean(s && s.status !== 'cancelled' && s.awb);
}

export interface ShippingActions {
  canCreate: boolean;
  /** Only before the courier's pickup scan, i.e. while the order is still Packed. */
  canCancelShipment: boolean;
  /** Manual shipments are moved by staff; Shiprocket shipments by the courier webhook. */
  nextStatuses: DeliveryStatusTarget[];
  canCancelOrder: boolean;
}

export function shippingActions(order: Order): ShippingActions {
  const shipment = order.ops?.shipment ?? null;
  const manual = shipment?.provider === 'manual' || (!shipment && Boolean(order.tracking?.trackingNumber));
  const nextStatuses = manual
    ? ORDER_TRANSITIONS[order.status].filter((s): s is DeliveryStatusTarget => (DELIVERY_STATUS_TARGETS as readonly string[]).includes(s) && s !== 'Shipped')
    : [];
  return {
    canCreate: order.status === 'Packed' && !hasActiveShipment(order),
    canCancelShipment: order.status === 'Packed' && hasActiveShipment(order),
    nextStatuses,
    canCancelOrder: order.status === 'RTO_Delivered',
  };
}

/** Package saved at QC/packing (orders.notes block), in the shape CREATE_SHIPMENT expects. */
export function packageForShipment(order: Order): { lengthCm: number; breadthCm: number; heightCm: number; weightKg: number } | null {
  const p: PackageInfo | undefined = parseNotes(order.adminNotes).data.package;
  return p ? { lengthCm: p.lengthCm, breadthCm: p.widthCm, heightCm: p.heightCm, weightKg: p.weightKg } : null;
}

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatusTarget, string> = {
  Shipped: 'Shipped',
  Out_For_Delivery: 'Out for delivery',
  Delivered: 'Delivered',
  RTO_Initiated: 'Return to sender started',
  RTO_Delivered: 'Back at workshop',
};
