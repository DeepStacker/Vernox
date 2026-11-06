/**
 * Support tickets (`tickets/{id}`), created from the public contact form and worked by staff.
 *
 * Clients cannot write tickets (firestore.rules); the contact form posts to /api/engage (CONTACT)
 * and staff change tickets through /api/admin (ADD_TICKET_MESSAGE, SET_TICKET_STATUS). Creating a
 * ticket also queues a `support_ticket` alert for the support inbox in the same transaction, so a
 * saved ticket always has its alert and a failed write leaves neither.
 */
import { isPlaceholderValue } from '../../src/types/settings';
import { z } from 'zod';
import { ApiError } from './errors';
import { enqueueNotification, planNotification } from './notifications/outbox';
import type { DocStore } from './store';

export const TICKET_TOPICS = ['Order help', 'Custom or bulk order', 'Product question', 'Something else'] as const;
export const TICKET_STATUSES = ['open', 'waiting', 'resolved'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
/** inbound = from the customer; reply = answer sent to the customer outside the system; note = internal. */
export type TicketDirection = 'inbound' | 'reply' | 'note';

export const MAX_TICKET_MESSAGES = 100;

export interface TicketMessage {
  at: number;
  by: string;
  direction: TicketDirection;
  text: string;
}

export interface TicketDoc {
  ref: string;
  channel: 'contact_form';
  topic: string;
  subject: string;
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

export const contactRequestSchema = z.object({
  action: z.literal('CONTACT'),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().max(20).optional(),
  topic: z.enum(TICKET_TOPICS),
  orderNumber: z.string().trim().max(40).optional(),
  message: z.string().trim().min(5).max(4000),
  /** Honeypot: hidden from people, filled by bots. Any value means the submission is dropped silently. */
  website: z.string().max(200).optional(),
});
export type ContactRequest = z.infer<typeof contactRequestSchema>;

export const ticketIdSchema = z.string().trim().regex(/^[A-Za-z0-9]{10,40}$/);

export const ticketRef = (id: string) => `T-${id.slice(0, 6).toUpperCase()}`;

export async function createTicket(store: DocStore, input: ContactRequest, now = Date.now()): Promise<{ id: string; ref: string }> {
  const id = store.newId('tickets');
  const ref = ticketRef(id);
  // The server config does not carry the storefront contact fields, so read the raw settings document.
  const rawSupportEmail = (await store.get('settings/store'))?.supportEmail;
  // The seeded placeholder address counts as unset, so alerts are skipped rather than sent to example.com.
  const supportEmail = typeof rawSupportEmail === 'string' && !isPlaceholderValue(rawSupportEmail) ? rawSupportEmail.trim().toLowerCase() : '';
  const ticket: TicketDoc = {
    ref,
    channel: 'contact_form',
    topic: input.topic,
    subject: input.topic,
    orderNumber: input.orderNumber || null,
    customerName: input.name,
    customerEmail: input.email,
    customerPhone: input.phone || null,
    status: 'open',
    assignedTo: null,
    messages: [{ at: now, by: input.email, direction: 'inbound', text: input.message }],
    createdAt: now,
    updatedAt: now,
  };
  await store.runTransaction(async tx => {
    const plan = await planNotification(tx, id, 'support_ticket');
    tx.create(`tickets/${id}`, ticket as unknown as Record<string, unknown>);
    enqueueNotification(
      tx,
      plan,
      {
        orderId: id,
        orderNumber: ref,
        customerName: 'Vernox support',
        email: supportEmail,
        phone: '',
        paymentMethod: 'prepaid',
        totalPaise: 0,
        note: `${input.name} <${input.email}> wrote about "${input.topic}"${ticket.orderNumber ? ` (order ${ticket.orderNumber})` : ''}.`,
      },
      now,
    );
  });
  return { id, ref };
}

async function mutateTicket(store: DocStore, id: string, change: (ticket: TicketDoc) => Partial<TicketDoc>): Promise<TicketDoc> {
  return store.runTransaction(async tx => {
    const current = (await tx.get(`tickets/${id}`)) as unknown as TicketDoc | null;
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    const next = { ...current, ...change(current) };
    tx.update(`tickets/${id}`, next as unknown as Record<string, unknown>);
    return next;
  });
}

/** Adds a staff reply or internal note. Logging a reply moves an open ticket to "waiting" (on the customer). */
export async function addTicketMessage(
  store: DocStore,
  params: { id: string; by: string; direction: 'reply' | 'note'; text: string },
  now = Date.now(),
): Promise<TicketDoc> {
  return mutateTicket(store, params.id, ticket => {
    if (ticket.messages.length >= MAX_TICKET_MESSAGES) {
      throw new ApiError(409, 'CONFLICT', 'This ticket has too many messages. Resolve it and ask the customer to write again.');
    }
    return {
      messages: [...ticket.messages, { at: now, by: params.by, direction: params.direction, text: params.text }],
      status: params.direction === 'reply' && ticket.status === 'open' ? 'waiting' : ticket.status,
      assignedTo: ticket.assignedTo ?? params.by,
      updatedAt: now,
    };
  });
}

export async function setTicketStatus(store: DocStore, params: { id: string; status: TicketStatus; by: string }, now = Date.now()): Promise<TicketDoc> {
  return mutateTicket(store, params.id, ticket => ({
    status: params.status,
    assignedTo: ticket.assignedTo ?? params.by,
    updatedAt: now,
  }));
}
