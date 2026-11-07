/**
 * Support tickets (`tickets`). Created by the public contact form through /api/engage, or logged by
 * staff for requests that came in by email, WhatsApp or phone (CREATE_TICKET); staff read
 * them straight from Firestore (`tickets.read`, firestore.rules) and change them only through the
 * admin API (`tickets.write`), which audits every change.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { adminAction } from './adminApi';
import { TICKET_CHANNELS, TICKET_STATUSES, type StaffTicketChannel, type TicketChannel, type TicketStatus, type TicketTopic } from '@/types/tickets';
import { useOptimisticMutation } from './optimistic';

export { STAFF_TICKET_CHANNELS, TICKET_STATUSES, TICKET_TOPICS, type StaffTicketChannel, type TicketChannel, type TicketStatus } from '@/types/tickets';
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = { open: 'Open', waiting: 'Waiting on customer', resolved: 'Resolved' };

export const TICKET_CHANNEL_LABELS: Record<TicketChannel, string> = { contact_form: 'Contact form', email: 'Email', whatsapp: 'WhatsApp', phone: 'Phone' };

export interface TicketMessage {
  at: number;
  by: string;
  direction: 'inbound' | 'reply' | 'note';
  text: string;
}

export interface Ticket {
  id: string;
  ref: string;
  channel: TicketChannel;
  topic: string;
  orderNumber: string | null;
  customerName: string;
  /** '' when the customer gave no email (WhatsApp / phone); replies cannot be emailed then. */
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
    channel: (TICKET_CHANNELS as readonly unknown[]).includes(raw.channel) ? (raw.channel as TicketChannel) : 'contact_form',
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

export interface NewStaffTicket {
  channel: StaffTicketChannel;
  topic: TicketTopic;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  orderNumber?: string;
  message: string;
}

/** Logs an email / WhatsApp / phone request as a ticket. Errors (unknown order, no contact) surface to the form. */
export function useCreateTicket() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: NewStaffTicket) => adminAction<{ id: string; ref: string }>('CREATE_TICKET', { ...input }),
    onSuccess: () => client.invalidateQueries({ queryKey: TICKETS_KEY }),
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
