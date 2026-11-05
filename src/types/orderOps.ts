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
  discountPaise: number;
  shippingPaise: number;
  codFeePaise: number;
  taxPaise: number;
  totalPaise: number;
  refundedPaise: number;
  /** Requested from the provider but not yet confirmed by the refund webhook. */
  refundPendingPaise: number;
  refunds: OrderRefundEntry[];
  codCollectedPaise: number;
  codCollectedAt: number | null;
  deliveredAt: number | null;
  invoiceNumber: string | null;
  flags: string[];
  shipment: ShipmentView | null;
  parentOrderId: string | null;
}
