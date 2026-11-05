/**
 * `refunds/{refundId}` — one document per refund (server-only).
 *
 * Lifecycle: `pending` (written, with the amount reserved on the order as
 * `refundPendingPaise`, before the provider is called) → `processed` (recordRefund
 * in payments.ts, from the API response, the refund.processed webhook or a manual
 * refund) or `failed` (provider rejected it; the reservation is released).
 */
export type RefundMethod = 'razorpay' | 'manual';

export interface RefundDoc {
  id: string;
  orderId: string;
  amountPaise: number;
  reason: string;
  method: RefundMethod;
  /** `staff` (CREATE_REFUND), `customer_cancel`, `external` (seen only via webhook). */
  source: 'staff' | 'customer_cancel' | 'external';
  status: 'pending' | 'processed' | 'failed';
  requestedBy: string;
  /** Razorpay refund id, or for manual refunds the bank/UPI reference staff entered. */
  providerRefundId: string | null;
  createdAt: number;
  processedAt: number | null;
  updatedAt: number;
  error: string | null;
  creditNoteId: string | null;
  creditNoteNumber: string | null;
}

export const refundPath = (id: string) => `refunds/${id}`;
