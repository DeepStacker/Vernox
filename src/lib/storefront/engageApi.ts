/**
 * Client for POST /api/engage (API.md): contact form, newsletter and review submission.
 * Review calls carry the signed-in customer's ID token; the contact and newsletter calls are public.
 */
import { auth } from '@/lib/firebase';

export const CONTACT_TOPICS = ['Order help', 'Custom or bulk order', 'Product question', 'Something else'] as const;

export interface ReviewEligibility {
  eligible: boolean;
  reason?: 'not_purchased' | 'already_reviewed';
  reviewStatus?: string;
}

async function post(action: string, payload: Record<string, unknown>, signedIn = false): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signedIn) {
    const user = auth.currentUser;
    if (!user) throw new Error('Please sign in to continue.');
    headers.Authorization = `Bearer ${await user.getIdToken()}`;
  }
  const res = await fetch('/api/engage', { method: 'POST', headers, body: JSON.stringify({ ...payload, action }) });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !body || body.success === false) {
    throw new Error((body?.message as string) || `Request failed (${res.status}).`);
  }
  return body;
}

export interface ContactInput {
  name: string;
  email: string;
  phone?: string;
  topic: (typeof CONTACT_TOPICS)[number];
  orderNumber?: string;
  message: string;
  /** Honeypot field value; always empty for people. */
  website: string;
}

export async function sendContactMessage(input: ContactInput): Promise<{ ref?: string }> {
  const body = await post('CONTACT', { ...input });
  return { ref: typeof body.ref === 'string' ? body.ref : undefined };
}

export async function subscribeToNewsletter(email: string, website: string): Promise<void> {
  await post('NEWSLETTER_SUBSCRIBE', { email, source: 'footer', website });
}

export async function unsubscribeFromNewsletter(emailHash: string, token: string): Promise<void> {
  await post('NEWSLETTER_UNSUBSCRIBE', { emailHash, token });
}

export async function fetchReviewEligibility(productId: string): Promise<ReviewEligibility> {
  const body = await post('REVIEW_STATUS', { productId }, true);
  return body as unknown as ReviewEligibility;
}

export async function submitReview(input: { productId: string; rating: number; comment: string }): Promise<void> {
  await post('SUBMIT_REVIEW', input, true);
}
