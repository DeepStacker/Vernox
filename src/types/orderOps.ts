/**
 * Operational (staff-only) view of an order document: money in paise, payment ids, shipment
 * and refund state. Staff read these fields straight from `orders/{id}` (firestore.rules lets
 * `orders.read` roles read the whole document); they are never shown to customers.
 * Dependency-free so pure finance logic and tests can import it.
 */
export type PaymentMethod = 'prepaid' | 'cod' | 'replacement';

export interface ShipmentView {
  provider: 'shiprocket' | 'manual';
  status: 'created' | 'awb_assigned' | 'pickup_scheduled' | 'in_transit' | 'delivered' | 'rto' | 'cancelled';
  awb: string | null;
  courier: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  manifestUrl: string | null;
  error: string | null;
}

export interface OrderRefundEntry {
  refundId: string;
  amountPaise: number;
  at: number;
}

export interface OrderOps {
  paymentMethod: PaymentMethod;
  razorpayPaymentId: string | null;
  paidAt: number | null;
  subtotalPaise: number;
  /** All discounts; volumeDiscount is the bulk part of it (null when none or on orders before volume discounts). */
  discountPaise: number;
  volumeDiscount?: { minUnits: number; percent: number; units: number; discountPaise: number } | null;
  shippingPaise: number;
  codFeePaise: number;
  /** GST inside totalPaise when pricesIncludeTax; GST added to reach it on older orders. */
  taxPaise: number;
  totalPaise: number;
  /** Server marker `pricesIncludeTax` (orders since 2026-11-15): item and fee amounts include GST. */
  pricesIncludeTax: boolean;
  refundedPaise: number;
  /** Requested from the provider but not yet confirmed by the refund webhook. */
  refundPendingPaise: number;
  /** Money taken in person or by a balance link that cancellation left for a manual refund (REFUND_MANUAL_DUE). */
  manualRefundDuePaise: number;
  refunds: OrderRefundEntry[];
  codCollectedPaise: number;
  codCollectedAt: number | null;
  deliveredAt: number | null;
  invoiceNumber: string | null;
  flags: string[];
  shipment: ShipmentView | null;
  parentOrderId: string | null;
}
