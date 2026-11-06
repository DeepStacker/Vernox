/**
 * Support tickets (`tickets`). Created by the public contact form through /api/engage; staff read
 * them straight from Firestore (`tickets.read`, firestore.rules) and change them only through the
 * admin API (`tickets.write`), which audits every change.
 */
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { adminAction } from './adminApi';
import { useOptimisticMutation } from './optimistic';

export const TICKET_STATUSES = ['open', 'waiting', 'resolved'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = { open: 'Open', waiting: 'Waiting on customer', resolved: 'Resolved' };

export interface TicketMessage {
  at: number;
  by: string;
  direction: 'inbound' | 'reply' | 'note';
  text: string;
}

export interface Ticket {
  id: string;
  ref: string;
  topic: string;
  orderNumber: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  status: TicketStatus;
  assignedTo: string | null;
  messages: TicketMessage[];
  createdAt: number;
  updatedAt: number;
}

export const TICKETS_KEY = ['admin', 'tickets'] as const;
const MAX_TICKETS = 300;

export function normaliseTicket(id: string, raw: Record<string, unknown>): Ticket {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const num = (v: unknown) => (typeof v === 'number' ? v : 0);
  const status = (TICKET_STATUSES as readonly unknown[]).includes(raw.status) ? (raw.status as TicketStatus) : 'open';
  return {
    id,
    ref: str(raw.ref) || id,
    topic: str(raw.topic),
    orderNumber: str(raw.orderNumber) || null,
    customerName: str(raw.customerName),
    customerEmail: str(raw.customerEmail),
    customerPhone: str(raw.customerPhone) || null,
    status,
    assignedTo: str(raw.assignedTo) || null,
    messages: Array.isArray(raw.messages) ? (raw.messages as TicketMessage[]) : [],
    createdAt: num(raw.createdAt),
    updatedAt: num(raw.updatedAt),
  };
}

export function useTickets(enabled: boolean) {
  return useQuery({
    queryKey: TICKETS_KEY,
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'tickets'), orderBy('updatedAt', 'desc'), limit(MAX_TICKETS)));
      return snap.docs.map(d => normaliseTicket(d.id, d.data()));
    },
  });
}

export function useTicketMutations() {
  const setStatus = useOptimisticMutation<Ticket[], { id: string; status: TicketStatus }>({
    queryKey: TICKETS_KEY,
    mutationFn: ({ id, status }) => adminAction('SET_TICKET_STATUS', { ticketId: id, status }),
    apply: (cur = [], { id, status }) => cur.map(t => (t.id === id ? { ...t, status } : t)),
    failureMessage: 'Could not change the ticket status',
  });
  const addMessage = useOptimisticMutation<Ticket[], { id: string; direction: 'reply' | 'note'; text: string }>({
    queryKey: TICKETS_KEY,
    mutationFn: ({ id, direction, text }) => adminAction('ADD_TICKET_MESSAGE', { ticketId: id, direction, text }),
    failureMessage: 'Could not save the message',
    successMessage: 'Saved',
  });
  return { setTicketStatus: setStatus.run, addTicketMessage: addMessage.run };
}
