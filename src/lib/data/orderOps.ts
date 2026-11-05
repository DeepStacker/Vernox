/**
 * Typed client for the staff order actions in /api/admin (API.md: shipments, cancellation, refunds,
 * returns, documents, notes). The server enforces permissions and the order state machine; these
 * wrappers only shape requests and results. `useOpsRunner` runs one action with a busy flag,
 * refreshes the admin order feeds afterwards and hands the error back to the caller so dialogs can
 * show it inline.
 */
import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/firebase';
import type { ShipmentView } from '@/types/orderOps';
import { AdminApiError, adminAction } from './adminApi';

export interface PackageInput { lengthCm: number; breadthCm: number; heightCm: number; weightKg: number }
export interface ManualShipmentInput { courier: string; awb: string; trackingUrl?: string }
export type DeliveryStatus = 'Shipped' | 'Out_For_Delivery' | 'Delivered' | 'RTO_Initiated' | 'RTO_Delivered';
export type RefundMethod = 'razorpay' | 'manual';

export interface RefundView {
  id: string;
  amountPaise: number;
  reason: string;
  method: RefundMethod;
  source: 'staff' | 'customer_cancel' | 'external';
  status: 'pending' | 'processed' | 'failed';
  providerRefundId: string | null;
  createdAt: number;
  processedAt: number | null;
  error: string | null;
  creditNoteId: string | null;
  creditNoteNumber: string | null;
}

export interface ReturnView {
  orderId: string;
  status: 'requested' | 'approved' | 'rejected' | 'received';
  reason: string;
  details: string;
  photoPaths: string[];
  resolution: 'refund' | 'replacement' | null;
  decisionNote: string | null;
  replacementOrderId: string | null;
  requestedAt: number;
  decidedAt: number | null;
  receivedAt: number | null;
}

export interface TaxDocumentSummary {
  id: string;
  number: string;
  issuedAt: number;
  totals: { taxablePaise?: number; cgstPaise?: number; sgstPaise?: number; igstPaise?: number; totalPaise?: number };
}

export interface OrderDocuments {
  invoice: (TaxDocumentSummary & { supplyType: 'intra_state' | 'inter_state' }) | null;
  creditNotes: Array<TaxDocumentSummary & { refundId: string | null }>;
  refunds: RefundView[];
  return: ReturnView | null;
  refundablePaise: number;
  shipment: ShipmentView | null;
}

export const orderDocumentsKey = (orderId: string) => ['admin', 'order-documents', orderId] as const;

export const opsApi = {
  createShipment: (orderId: string, input: { package: PackageInput } | { manual: ManualShipmentInput }) =>
    adminAction<{ shipment: ShipmentView; status: string | null; invoiceNumber: string | null }>('CREATE_SHIPMENT', { orderId, ...input }),
  cancelShipment: (orderId: string, reason: string) => adminAction('CANCEL_SHIPMENT', { orderId, reason }),
  getLabel: (orderId: string) => adminAction<{ labelUrl: string | null; manifestUrl: string | null }>('GET_LABEL', { orderId }),
  updateDeliveryStatus: (orderId: string, status: DeliveryStatus, note?: string) => adminAction('UPDATE_DELIVERY_STATUS', { orderId, status, note }),
  cancelOrder: (orderId: string, reason: string, refund: boolean) =>
    adminAction<{ status: string; refund: RefundView | null; refundError: string | null }>('CANCEL_ORDER', { orderId, reason, refund }),
  createRefund: (input: { orderId: string; amount: number; reason: string; method: RefundMethod; reference?: string; idempotencyKey: string }) =>
    adminAction<{ refund: RefundView }>('CREATE_REFUND', input),
  getOrderDocuments: (orderId: string) => adminAction<OrderDocuments>('GET_ORDER_DOCUMENTS', { orderId }),
  approveReturn: (orderId: string, resolution: 'refund' | 'replacement', note?: string) => adminAction('APPROVE_RETURN', { orderId, resolution, note }),
  rejectReturn: (orderId: string, reason: string) => adminAction('REJECT_RETURN', { orderId, reason }),
  markReturnReceived: (orderId: string, restock: boolean, note?: string) =>
    adminAction<{ status: string; replacementOrderId: string | null; replacementOrderNumber: string | null }>('MARK_RETURN_RECEIVED', { orderId, restock, note }),
  addOrderNote: (orderId: string, note: string) => adminAction('ADD_ORDER_NOTE', { orderId, note }),
};

/** Refund requests are retried safely with the same key; each new attempt gets a fresh one. */
export const newIdempotencyKey = (): string => `ui_${crypto.randomUUID().replace(/-/g, '')}`;

export function useOrderDocuments(orderId: string | null, enabled = true) {
  return useQuery({
    queryKey: orderDocumentsKey(orderId ?? ''),
    queryFn: () => opsApi.getOrderDocuments(orderId as string),
    enabled: enabled && Boolean(orderId),
    staleTime: 10_000,
  });
}

/** Both branches carry every key so callers can read `error` without narrowing (the app tsconfig is not strict). */
export type OpsResult<T> = { ok: true; value: T; error?: undefined; code?: undefined } | { ok: false; error: string; code?: string; value?: undefined };

/** Runs one staff action; refreshes order feeds and documents on success; returns the error text on failure. */
export function useOpsRunner() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<OpsResult<T>> => {
    setBusy(true);
    try {
      const value = await action();
      return { ok: true, value };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'The action failed. Please try again.', code: err instanceof AdminApiError ? err.code : undefined };
    } finally {
      // A failed provider step may still have stored progress, so refresh either way.
      await qc.invalidateQueries({ queryKey: ['admin'] });
      setBusy(false);
    }
  }, [qc]);
  return { run, busy };
}

/** Downloads a tax invoice or credit note PDF with the staff token (GET /api/invoice accepts orders.read staff). */
export async function downloadTaxDocument(orderId: string, filename: string, creditNoteId?: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new AdminApiError('You are signed out. Please sign in again.', 401);
  const params = new URLSearchParams({ orderId });
  if (creditNoteId) params.set('creditNoteId', creditNoteId);
  const res = await fetch(`/api/invoice?${params.toString()}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new AdminApiError(body?.message ?? `The document could not be loaded (${res.status}).`, res.status);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
