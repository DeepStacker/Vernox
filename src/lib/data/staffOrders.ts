/**
 * Staff-entered orders through /api/admin (QUOTE_STAFF_ORDER, CREATE_STAFF_ORDER; api/_lib/staffOrders.ts).
 * The server prices everything; the quote only previews what the order will be created with.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { OfflinePaymentMode, StaffOrderChannel } from '@/types/staffOrders';
import { adminAction } from './adminApi';

export interface StaffOrderItem {
  productId: string;
  sizeLabel?: string;
  finish: string;
  quantity: number;
}

export interface StaffOrderQuote {
  lines: Array<{ productId: string; name: string; sizeLabel: string | null; finish: string; quantity: number; unitPricePaise: number; lineTotalPaise: number }>;
  coupon: { ok: true; discountPaise: number } | { ok: false; message: string } | null;
  totals: { subtotalPaise: number; discountPaise: number; shippingPaise: number; codFeePaise: number; taxPaise: number; totalPaise: number };
}

export type StaffOrderPayment = { method: 'offline'; mode: OfflinePaymentMode; reference: string } | { method: 'payment_link' } | { method: 'cod' };

export interface NewStaffOrder {
  channel: StaffOrderChannel;
  items: StaffOrderItem[];
  couponCode?: string;
  customer: { name: string; phone: string; email?: string; address?: string; city?: string; state?: string; pincode?: string };
  payment: StaffOrderPayment;
  handover: boolean;
  whatsappOptIn: boolean;
  idempotencyKey: string;
  note?: string;
  tradeEnquiryId?: string;
}

export interface StaffOrderCreated {
  orderId: string;
  orderNumber: string;
  status: string;
  paymentLink: { id: string; url: string; expiresAt: number } | null;
  invoiceNumber: string | null;
}

export type CustomerLookup =
  | { found: false }
  | { found: true; orderCount: number; lastOrderNumber: string; name: string; email: string; address: { address: string; city: string; state: string; pincode: string } | null };

export const findCustomerByPhone = (phone: string) => adminAction<CustomerLookup>('FIND_CUSTOMER_BY_PHONE', { phone });

export const quoteStaffOrder = (input: { items: StaffOrderItem[]; couponCode?: string; customerEmail?: string; cod: boolean; handover: boolean }) =>
  adminAction<StaffOrderQuote>('QUOTE_STAFF_ORDER', input);

export function useCreateStaffOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewStaffOrder) => adminAction<StaffOrderCreated>('CREATE_STAFF_ORDER', { ...input }),
    // Orders, stock and trade enquiries all change.
    onSuccess: () => void qc.invalidateQueries(),
  });
}
