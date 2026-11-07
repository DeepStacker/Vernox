/**
 * Trade / bulk enquiries (`b2b_inquiries/{id}`) from the public Trade page, posted to /api/engage
 * (TRADE_ENQUIRY). Going through the API instead of a direct Firestore write keeps the Firestore SDK off
 * the guest storefront, adds the shared rate limit and honeypot, and lets the enquiry queue a
 * `trade_enquiry` alert for the support inbox in the same transaction, like a contact-form ticket.
 *
 * The stored shape is what the admin B2B console reads (src/lib/data/b2b.ts `normaliseInquiry`).
 */
import { z } from 'zod';
import { TRADE_FINISH_IDS, TRADE_PROJECT_TYPE_IDS, TRADE_TIMELINES, TRADE_VOLUMES } from '../../src/types/trade';
import { enqueueNotification, planNotification } from './notifications/outbox';
import type { DocStore } from './store';
import { supportInbox } from './tickets';

export const tradeEnquiryRequestSchema = z.object({
  action: z.literal('TRADE_ENQUIRY'),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  company: z.string().trim().max(200).default(''),
  phone: z.string().trim().max(20).default(''),
  projectType: z.enum(TRADE_PROJECT_TYPE_IDS),
  volume: z.enum(TRADE_VOLUMES),
  alloyPreference: z.enum(TRADE_FINISH_IDS),
  timeline: z.enum(TRADE_TIMELINES),
  notes: z.string().trim().max(4000).default(''),
  /** Honeypot: hidden from people, filled by bots. Any value means the submission is dropped silently. */
  website: z.string().max(200).optional(),
});
export type TradeEnquiryRequest = z.infer<typeof tradeEnquiryRequestSchema>;

/** Derived from the document id, so references cannot collide (the old client-side 4-digit one could). */
export const tradeEnquiryRef = (id: string) => `VNX-B2B-${id.slice(0, 6).toUpperCase()}`;

export async function createTradeEnquiry(store: DocStore, input: TradeEnquiryRequest, now = Date.now()): Promise<{ id: string; ref: string }> {
  const id = store.newId('b2b_inquiries');
  const ref = tradeEnquiryRef(id);
  const supportEmail = await supportInbox(store);
  const { action: _action, website: _website, ...fields } = input;
  await store.runTransaction(async tx => {
    const plan = await planNotification(tx, id, 'trade_enquiry');
    // createdAt stays an ISO string: the admin console sorts enquiries by it.
    tx.create(`b2b_inquiries/${id}`, { ...fields, refId: ref, createdAt: new Date(now).toISOString(), status: 'pending_review' });
    enqueueNotification(
      tx,
      plan,
      {
        orderId: id,
        orderNumber: ref,
        customerName: 'Vernox trade',
        email: supportEmail,
        phone: '',
        paymentMethod: 'prepaid',
        totalPaise: 0,
        note: `${input.name}${input.company ? ` (${input.company})` : ''} <${input.email}> asked about ${input.projectType}, quantity ${input.volume}, timeline ${input.timeline}.`,
      },
      now,
    );
  });
  return { id, ref };
}
