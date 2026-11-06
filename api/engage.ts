/**
 * POST /api/engage — the storefront's customer-engagement writes. One function instead of three
 * because the deployment is close to its function limit; the actions share nothing but their shape.
 * Body: { action, ...params }:
 *   CONTACT                { name, email, phone?, topic, orderNumber?, message, website }  -> support ticket (public)
 *   NEWSLETTER_SUBSCRIBE   { email, source?, website }                                     -> subscriber (public)
 *   NEWSLETTER_UNSUBSCRIBE { emailHash, token }                                            -> unsubscribe link (public)
 *   REVIEW_STATUS          { productId }                          -> may this customer review it? (signed in)
 *   SUBMIT_REVIEW          { productId, rating, comment }         -> pending review, needs a Delivered order (signed in)
 * `website` is a honeypot: a non-empty value is answered with success and nothing is stored.
 * See API.md.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ZodType, ZodTypeDef } from 'zod';
import { requireUser } from './_lib/auth';
import { badRequest, sendError } from './_lib/errors';
import { getAdminAuth, getStore } from './_lib/firebaseAdmin';
import { assertMethod, parseBody } from './_lib/http';
import { subscribe, subscribeRequestSchema, unsubscribe, unsubscribeRequestSchema } from './_lib/newsletter';
import { enforceRateLimit, RATE_LIMITS, type RateLimitRule } from './_lib/rateLimit';
import { reviewEligibility, reviewStatusRequestSchema, submitReview, submitReviewRequestSchema } from './_lib/reviewSubmission';
import { contactRequestSchema, createTicket } from './_lib/tickets';
import type { DocStore } from './_lib/store';

interface ActionContext {
  req: VercelRequest;
  store: DocStore;
}

interface EngageAction<T> {
  schema: ZodType<T, ZodTypeDef, unknown>;
  limit: RateLimitRule;
  run(ctx: ActionContext, input: T): Promise<Record<string, unknown>>;
}

const action = <T>(a: EngageAction<T>) => a as unknown as EngageAction<unknown>;

const ACTIONS: Record<string, EngageAction<unknown>> = {
  CONTACT: action({
    schema: contactRequestSchema,
    limit: RATE_LIMITS.contact,
    async run({ store }, input) {
      if (input.website) return { success: true }; // honeypot: look accepted, store nothing
      const { ref } = await createTicket(store, input);
      return { success: true, ref };
    },
  }),

  NEWSLETTER_SUBSCRIBE: action({
    schema: subscribeRequestSchema,
    limit: RATE_LIMITS.newsletter,
    async run({ store }, input) {
      if (input.website) return { success: true };
      await subscribe(store, input);
      // Same answer for new and existing subscribers, so the endpoint does not reveal who is on the list.
      return { success: true };
    },
  }),

  NEWSLETTER_UNSUBSCRIBE: action({
    schema: unsubscribeRequestSchema,
    limit: RATE_LIMITS.newsletter,
    async run({ store }, input) {
      await unsubscribe(store, input);
      return { success: true };
    },
  }),

  REVIEW_STATUS: action({
    schema: reviewStatusRequestSchema,
    limit: RATE_LIMITS.review,
    async run({ req, store }, input) {
      const user = await requireUser(req, getAdminAuth());
      return { success: true, ...(await reviewEligibility(store, user, input.productId)) };
    },
  }),

  SUBMIT_REVIEW: action({
    schema: submitReviewRequestSchema,
    limit: RATE_LIMITS.review,
    async run({ req, store }, input) {
      const user = await requireUser(req, getAdminAuth());
      await submitReview(store, user, input);
      return { success: true };
    },
  }),
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['POST']);
    const name = typeof req.body?.action === 'string' ? req.body.action : '';
    const definition = ACTIONS[name];
    if (!definition) throw badRequest(`Unknown action "${name}".`);
    const input = parseBody(req, definition.schema);
    const store = getStore();
    await enforceRateLimit(store, req, definition.limit);
    const result = await definition.run({ req, store }, input);
    return res.status(200).json(result);
  } catch (err) {
    return sendError(res, err, 'engage');
  }
}
