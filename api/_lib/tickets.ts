/**
 * Support tickets (`tickets/{id}`), created from the public contact form or logged by staff for a
 * request that arrived by email, WhatsApp or phone, and worked by staff.
 *
 * Clients cannot write tickets (firestore.rules); the contact form posts to /api/engage (CONTACT)
 * and staff use /api/admin (CREATE_TICKET, ADD_TICKET_MESSAGE, SET_TICKET_STATUS). A contact-form
 * ticket also queues a `support_ticket` alert for the support inbox in the same transaction, so a
 * saved ticket always has its alert and a failed write leaves neither. Staff-logged tickets need no
 * alert: the person logging it is already handling it.
 */
import { isPlaceholderValue } from '../../src/types/settings';
import { STAFF_TICKET_CHANNELS, TICKET_STATUSES, TICKET_TOPICS, type TicketChannel, type TicketStatus } from '../../src/types/tickets';
import { z } from 'zod';
import { ApiError } from './errors';
import { enqueueNotification, planNotification } from './notifications/outbox';
import type { DocStore } from './store';

export { TICKET_STATUSES, TICKET_TOPICS };
/** inbound = from the customer; reply = staff answer, emailed to the customer; note = internal. */
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
  channel: TicketChannel;
  topic: string;
  subject: string;
  orderNumber: string | null;
  /** Set when the order number matched an order (staff-logged tickets). */
  orderId?: string | null;
  customerName: string;
  /** '' when the customer reached us by WhatsApp or phone and gave no email; replies then cannot be emailed. */
  customerEmail: string;
  customerPhone: string | null;
  status: TicketStatus;
  assignedTo: string | null;
  messages: TicketMessage[];
  createdAt: number;
  updatedAt: number;
  /** Staff member who logged an email / WhatsApp / phone ticket. */
  loggedBy?: string;
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

export const staffTicketSchema = z.object({
  channel: z.enum(STAFF_TICKET_CHANNELS),
  topic: z.enum(TICKET_TOPICS),
  customerName: z.string().trim().max(120).optional(),
  customerEmail: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal('')),
  customerPhone: z.string().trim().regex(/^[+0-9 ()-]{6,20}$/, 'Enter a valid phone number').optional().or(z.literal('')),
  orderNumber: z.string().trim().max(40).optional(),
  message: z.string().trim().min(1).max(4000),
});
export type StaffTicketInput = z.infer<typeof staffTicketSchema>;

/**
 * Logs a ticket for a request that came in by email, WhatsApp or phone. An order number must match an
 * order; its customer fills any name, email or phone left blank, so the ticket links to the order and
 * replies can be emailed. The ticket needs an email or a phone to be answerable.
 */
export async function createStaffTicket(store: DocStore, input: StaffTicketInput, by: string, now = Date.now()): Promise<{ id: string; ref: string }> {
  let name = input.customerName || '';
  let email = input.customerEmail || '';
  let phone = input.customerPhone || '';
  let orderId: string | null = null;
  const orderNumber = input.orderNumber?.toUpperCase() || null;
  if (orderNumber) {
    const [match] = await store.query('orders', { where: [{ field: 'orderNumber', op: '==', value: orderNumber }], limit: 1 });
    if (!match) throw new ApiError(404, 'NOT_FOUND', `No order ${orderNumber}. Check the number or leave it blank.`);
    const order = match.data as { customer?: { name?: unknown; phone?: unknown }; email?: unknown };
    orderId = match.id;
    name ||= typeof order.customer?.name === 'string' ? order.customer.name : '';
    email ||= typeof order.email === 'string' ? order.email : '';
    phone ||= typeof order.customer?.phone === 'string' ? order.customer.phone : '';
  }
  if (!email && !phone) throw new ApiError(400, 'VALIDATION_ERROR', 'Enter the customer\'s email or phone so the ticket can be answered.');

  const id = store.newId('tickets');
  const ref = ticketRef(id);
  const ticket: TicketDoc = {
    ref,
    channel: input.channel,
    topic: input.topic,
    subject: input.topic,
    orderNumber,
    orderId,
    customerName: name || email || phone,
    customerEmail: email,
    customerPhone: phone || null,
    status: 'open',
    assignedTo: by,
    messages: [{ at: now, by: email || phone, direction: 'inbound', text: input.message }],
    createdAt: now,
    updatedAt: now,
    loggedBy: by,
  };
  await store.create(`tickets/${id}`, ticket as unknown as Record<string, unknown>);
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

/**
 * Adds a staff reply or internal note. A reply is emailed to the customer through the outbox in the same
 * transaction (one outbox entry per message index, so a retried request never sends twice) and moves an
 * open ticket to "waiting" (on the customer). Notes stay internal.
 */
export async function addTicketMessage(
  store: DocStore,
  params: { id: string; by: string; direction: 'reply' | 'note'; text: string },
  now = Date.now(),
): Promise<TicketDoc> {
  return store.runTransaction(async tx => {
    const ticket = (await tx.get(`tickets/${params.id}`)) as unknown as TicketDoc | null;
    if (!ticket) throw new ApiError(404, 'NOT_FOUND', 'Ticket not found.');
    if (params.direction === 'reply' && !ticket.customerEmail) {
      throw new ApiError(409, 'CONFLICT', 'This customer has no email address. Answer them on WhatsApp or phone and log it as a note.');
    }
    if (ticket.messages.length >= MAX_TICKET_MESSAGES) {
      throw new ApiError(409, 'CONFLICT', 'This ticket has too many messages. Resolve it and ask the customer to write again.');
    }
    const index = ticket.messages.length;
    const plan = params.direction === 'reply' ? await planNotification(tx, params.id, 'ticket_reply', String(index)) : null;
    const next: TicketDoc = {
      ...ticket,
      messages: [...ticket.messages, { at: now, by: params.by, direction: params.direction, text: params.text }],
      status: params.direction === 'reply' && ticket.status === 'open' ? 'waiting' : ticket.status,
      assignedTo: ticket.assignedTo ?? params.by,
      updatedAt: now,
    };
    tx.update(`tickets/${params.id}`, next as unknown as Record<string, unknown>);
    if (plan) {
      enqueueNotification(tx, plan, {
        orderId: params.id,
        orderNumber: ticket.ref,
        customerName: ticket.customerName,
        email: ticket.customerEmail,
        phone: '', // replies go by email only; SMS templates need DLT approval per message type
        paymentMethod: 'prepaid',
        totalPaise: 0,
        note: params.text,
      }, now);
    }
    return next;
  });
}

export async function setTicketStatus(store: DocStore, params: { id: string; status: TicketStatus; by: string }, now = Date.now()): Promise<TicketDoc> {
  return mutateTicket(store, params.id, ticket => ({
    status: params.status,
    assignedTo: ticket.assignedTo ?? params.by,
    updatedAt: now,
  }));
}
