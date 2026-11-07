/**
 * Support ticket vocabulary shared by the API (api/_lib/tickets.ts), the contact form and the Support
 * console, so the three can never disagree about a topic, channel or status.
 */
export const TICKET_TOPICS = ['Order help', 'Custom or bulk order', 'Product question', 'Something else'] as const;
export type TicketTopic = (typeof TICKET_TOPICS)[number];

export const TICKET_STATUSES = ['open', 'waiting', 'resolved'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Where the request came in. `contact_form` tickets are created by the form only; staff log the rest. */
export const TICKET_CHANNELS = ['contact_form', 'email', 'whatsapp', 'phone'] as const;
export type TicketChannel = (typeof TICKET_CHANNELS)[number];
export const STAFF_TICKET_CHANNELS = ['email', 'whatsapp', 'phone'] as const satisfies readonly TicketChannel[];
export type StaffTicketChannel = (typeof STAFF_TICKET_CHANNELS)[number];
