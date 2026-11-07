/**
 * Trade / B2B enquiries (`b2b_inquiries`). Created only by the API from the public Trade form
 * (api/_lib/tradeEnquiry.ts); read and status-updated by `b2b.read` roles.
 */
import { useQuery } from '@tanstack/react-query';
import { collection, doc, getDocs, limit, query, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firestoreDb';
import { logAudit } from './adminApi';
import { useOptimisticMutation } from './optimistic';

export const B2B_STATUSES = ['pending_review', 'contacted', 'quoted', 'won', 'lost'] as const;
export type B2bStatus = (typeof B2B_STATUSES)[number];

export const B2B_STATUS_LABELS: Record<B2bStatus, string> = {
  pending_review: 'New', contacted: 'Contacted', quoted: 'Quoted', won: 'Won', lost: 'Lost',
};

export interface B2bInquiry {
  id: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  projectType?: string;
  volume?: string;
  alloyPreference?: string;
  timeline?: string;
  notes?: string;
  refId?: string;
  createdAt?: string;
  status: B2bStatus;
}

export const B2B_KEY = ['admin', 'b2b'] as const;
const MAX_INQUIRIES = 300;

const text = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export function normaliseInquiry(id: string, raw: Record<string, unknown>): B2bInquiry {
  const status = (B2B_STATUSES as readonly unknown[]).includes(raw.status) ? (raw.status as B2bStatus) : 'pending_review';
  return {
    id, status,
    name: text(raw.name) ?? '', email: text(raw.email) ?? '',
    company: text(raw.company), phone: text(raw.phone), projectType: text(raw.projectType), volume: text(raw.volume),
    alloyPreference: text(raw.alloyPreference), timeline: text(raw.timeline), notes: text(raw.notes),
    refId: text(raw.refId), createdAt: text(raw.createdAt),
  };
}

/** Newest first; `createdAt` is an ISO string written by the Trade form. */
export const newestInquiryFirst = (a: B2bInquiry, b: B2bInquiry): number => (b.createdAt ?? '').localeCompare(a.createdAt ?? '');

export function useB2bInquiries(enabled: boolean) {
  return useQuery({
    queryKey: B2B_KEY,
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'b2b_inquiries'), limit(MAX_INQUIRIES)));
      return snap.docs.map(d => normaliseInquiry(d.id, d.data())).sort(newestInquiryFirst);
    },
  });
}

export function useB2bMutations() {
  const setStatus = useOptimisticMutation<B2bInquiry[], { id: string; status: B2bStatus }>({
    queryKey: B2B_KEY,
    mutationFn: async ({ id, status }) => {
      await updateDoc(doc(db, 'b2b_inquiries', id), { status });
      logAudit('B2B_STATUS_UPDATED', 'customer', id, { status });
    },
    apply: (cur = [], { id, status }) => cur.map(i => (i.id === id ? { ...i, status } : i)),
    failureMessage: 'Could not update the enquiry',
  });
  return { setInquiryStatus: setStatus.run };
}
