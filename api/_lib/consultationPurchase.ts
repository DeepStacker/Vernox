/**
 * Starts a design-consultation purchase: snapshots the customer's space, then runs the standard
 * prepaid checkout with the consultation service line (checkout.ts). Kept apart from
 * consultations.ts because it depends on checkout.ts, which depends on payments.ts, which depends
 * on consultations.ts.
 */
import { z } from 'zod';
import type { AuthenticatedUser } from './auth';
import { createCheckoutIntent, type CheckoutDeps, type PrepaidCheckoutResponse } from './checkout';
import { loadConsultationPurchase } from './consultations';
import { ApiError } from './errors';

export interface PurchaseRequest {
  spaceId: string;
  idempotencyKey: string;
  name: string;
  phone: string;
  /** Buyer's state, for the GST place of supply. */
  state: string;
}

export const purchaseRequestSchema = z.object({
  spaceId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,40}$/),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/, 'must be 8-128 characters of [A-Za-z0-9_-]'),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(/^\+?[0-9][0-9\s-]{8,15}$/, 'must be a valid phone number'),
  state: z.string().trim().min(1).max(100),
}) as unknown as z.ZodType<PurchaseRequest, z.ZodTypeDef, unknown>;

export async function purchaseConsultation(
  deps: CheckoutDeps,
  user: AuthenticatedUser,
  req: PurchaseRequest,
): Promise<PrepaidCheckoutResponse> {
  if (!user.email) throw new ApiError(400, 'VALIDATION_ERROR', 'Your account needs an email address to buy a consultation.');
  const purchase = await loadConsultationPurchase(deps.store, deps.config, { uid: user.uid, spaceId: req.spaceId, customerName: req.name });
  const result = await createCheckoutIntent(
    deps,
    {
      items: [],
      idempotencyKey: req.idempotencyKey,
      paymentMethod: 'prepaid',
      // A service has no delivery address; the order keeps these placeholders and the buyer's state.
      customer: {
        email: user.email,
        name: req.name,
        phone: req.phone,
        address: 'Online service',
        city: req.state,
        state: req.state,
        pincode: '000000',
        country: 'India',
      },
    },
    user.uid,
    { consultation: purchase },
  );
  return result as PrepaidCheckoutResponse;
}
