/**
 * Design consultation data access (browser). Reads go straight to Firestore under firestore.rules
 * (customers: their own; designers and admins: all); every change goes through the API, which owns
 * the workflow: /api/consultation for customers, /api/admin for staff. Firestore loads on first read
 * (appFirestore): the cart and checkout use this module for every visitor, guests included.
 */
import { useQuery } from '@tanstack/react-query';
import { appFirestore } from '@/lib/appFirestore';
import { postJson, openRazorpay, verifyPayment, type CheckoutIntent } from '@/lib/checkout/checkoutApi';
import { adminAction } from '@/lib/data/adminApi';
import type { ConsultationDoc, ProposalDraft, ProposalItem } from '@/types/consultation';

type Raw = Record<string, unknown>;

export function normalizeConsultation(id: string, raw: Raw): ConsultationDoc {
  return { ...(raw as unknown as ConsultationDoc), id, walls: Array.isArray(raw.walls) ? (raw.walls as ConsultationDoc['walls']) : [] };
}

export const myConsultationsKey = (uid: string | undefined) => ['consultations', 'mine', uid ?? 'none'] as const;
export const consultationKey = (id: string | undefined) => ['consultations', 'one', id ?? 'none'] as const;
export const ADMIN_CONSULTATIONS_KEY = ['admin', 'consultations'] as const;

export function useMyConsultations(uid: string | undefined) {
  return useQuery({
    queryKey: myConsultationsKey(uid),
    enabled: !!uid,
    staleTime: 30_000,
    queryFn: async () => {
      const { db, collection, getDocs, query, where } = await appFirestore();
      const snap = await getDocs(query(collection(db, 'consultations'), where('userId', '==', uid)));
      return snap.docs.map(d => normalizeConsultation(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt);
    },
  });
}

export function useConsultation(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: consultationKey(id),
    enabled: !!id && enabled,
    staleTime: 10_000,
    retry: false, // a consultation that is not yours reads as permission-denied; show that at once
    queryFn: async () => {
      const { db, doc, getDoc } = await appFirestore();
      const snap = await getDoc(doc(db, 'consultations', id!));
      return snap.exists() ? normalizeConsultation(snap.id, snap.data()) : null;
    },
  });
}

/** The designer queue: newest first. A single-field order, so no composite index is needed; filtering is in the UI. */
export function useAdminConsultations(enabled: boolean) {
  return useQuery({
    queryKey: ADMIN_CONSULTATIONS_KEY,
    enabled,
    staleTime: 15_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { db, collection, getDocs, limit, orderBy, query } = await appFirestore();
      const snap = await getDocs(query(collection(db, 'consultations'), orderBy('createdAt', 'desc'), limit(200)));
      return snap.docs.map(d => normalizeConsultation(d.id, d.data()));
    },
  });
}

export function useProposalDraft(id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'consultation-draft', id ?? 'none'],
    enabled: !!id,
    staleTime: 0,
    queryFn: async () => {
      const { db, doc, getDoc } = await appFirestore();
      const snap = await getDoc(doc(db, 'consultations', id!, 'private', 'draft'));
      return snap.exists() ? (snap.data() as unknown as ProposalDraft) : null;
    },
  });
}

// ---------------------------------------------------------------- customer actions

export interface PurchaseDetails {
  spaceId: string;
  name: string;
  phone: string;
  state: string;
  email: string;
  idempotencyKey: string;
}

/**
 * Buys a consultation for a space: server prices it and creates the Razorpay order, the customer pays in
 * Razorpay Checkout, the server verifies the signature and creates the consultation. Returns its id (the
 * order id), or null when the customer closed the payment window.
 */
export async function purchaseConsultation(details: PurchaseDetails, opts: { storeName: string; onPaymentFailed: (message: string) => void }): Promise<string | null> {
  const data = await postJson('/api/consultation', {
    action: 'PURCHASE', spaceId: details.spaceId, idempotencyKey: details.idempotencyKey, name: details.name, phone: details.phone, state: details.state,
  });
  const intent = data as unknown as CheckoutIntent;
  const outcome = await openRazorpay(intent, {
    storeName: opts.storeName,
    description: 'Design consultation',
    customer: { email: details.email, name: details.name, phone: details.phone, address: '', city: '', state: details.state, pincode: '', country: 'India' },
    onPaymentFailed: opts.onPaymentFailed,
  });
  if (outcome.kind === 'dismissed') return null;
  const verified = await verifyPayment(outcome.payment);
  return verified.orderId;
}

export const requestRevision = (consultationId: string, message: string) =>
  postJson('/api/consultation', { action: 'REQUEST_REVISION', consultationId, message });

export const closeConsultation = (consultationId: string, outcome: 'accepted' | 'declined') =>
  postJson('/api/consultation', { action: 'CLOSE', consultationId, outcome });

// ---------------------------------------------------------------- staff actions

export const claimConsultation = (consultationId: string) => adminAction('CLAIM_CONSULTATION', { consultationId });
export const saveProposalDraft = (consultationId: string, items: ProposalItem[], note: string) =>
  adminAction('SAVE_PROPOSAL_DRAFT', { consultationId, draft: { items, note } });
export const sendProposal = (consultationId: string) => adminAction('SEND_PROPOSAL', { consultationId });
