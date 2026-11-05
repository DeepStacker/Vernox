/** Customer-facing progress stages, derived from the order status (never invented). */
import type { OrderStatus } from './orderStateMachine';

export const FULFILMENT_STAGES = [
  { title: 'Order confirmed', desc: 'Payment received and order queued' },
  { title: 'Design check', desc: 'Artwork and dimensions are prepared for cutting' },
  { title: 'Cutting', desc: 'Your piece is being laser-cut' },
  { title: 'Finishing and inspection', desc: 'Surface finishing and quality check' },
  { title: 'Packed', desc: 'Packed and ready for dispatch' },
  { title: 'Shipped', desc: 'On its way with the courier' },
  { title: 'Delivered', desc: 'Delivered to your address' },
] as const;

/** Index of the stage the order has reached, or -1 when not confirmed or off the happy path. */
export function fulfilmentStageIndex(status: OrderStatus): number {
  switch (status) {
    case 'Paid': return 0;
    case 'In_Design': return 1;
    case 'Cutting': return 2;
    case 'Finishing': case 'Quality_Check': return 3;
    case 'Packed': return 4;
    case 'Shipped': case 'Out_For_Delivery': return 5;
    case 'Delivered': case 'Return_Requested': return 6;
    default: return -1;
  }
}

export const isOffPathStatus = (status: OrderStatus): boolean =>
  ['Cancelled', 'Returned', 'Partially_Refunded', 'Refunded', 'Expired', 'Payment_Failed'].includes(status);
