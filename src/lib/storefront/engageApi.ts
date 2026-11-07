/**
 * Client for POST /api/engage (API.md): contact form, trade enquiry, newsletter (double opt-in), COD SMS code and review submission.
 * Review calls carry the signed-in customer's ID token; the other calls are public.
 */
import { auth } from '@/lib/firebase';
import { TICKET_TOPICS } from '@/types/tickets';

export const CONTACT_TOPICS = TICKET_TOPICS;

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

export interface TradeEnquiryInput {
  name: string;
  email: string;
  company: string;
  phone: string;
  projectType: string;
  volume: string;
  alloyPreference: string;
  timeline: string;
  notes: string;
  /** Honeypot field value; always empty for people. */
  website: string;
}

export async function sendTradeEnquiry(input: TradeEnquiryInput): Promise<{ ref?: string }> {
  const body = await post('TRADE_ENQUIRY', { ...input });
  return { ref: typeof body.ref === 'string' ? body.ref : undefined };
}

export async function subscribeToNewsletter(email: string, website: string): Promise<void> {
  await post('NEWSLETTER_SUBSCRIBE', { email, source: 'footer', website });
}

export async function unsubscribeFromNewsletter(emailHash: string, token: string): Promise<void> {
  await post('NEWSLETTER_UNSUBSCRIBE', { emailHash, token });
}

export async function confirmNewsletterSubscription(emailHash: string, token: string): Promise<void> {
  await post('NEWSLETTER_CONFIRM', { emailHash, token });
}

/** Is an SMS code needed to place a COD order? False when the store has no OTP provider configured. */
export async function fetchCodOtpStatus(): Promise<boolean> {
  const body = await post('COD_OTP_STATUS', {});
  return body.required === true;
}

/** Texts a code to a 10-digit mobile; resolves with the seconds until another code may be requested. */
export async function sendCodOtp(phone: string): Promise<number> {
  const body = await post('COD_OTP_SEND', { phone });
  return typeof body.resendSeconds === 'number' ? body.resendSeconds : 30;
}

/** Exchanges the code for the single-use token that checkout-intent requires. */
export async function verifyCodOtp(phone: string, code: string): Promise<string> {
  const body = await post('COD_OTP_VERIFY', { phone, code });
  return String(body.verificationToken);
}

export async function fetchReviewEligibility(productId: string): Promise<ReviewEligibility> {
  const body = await post('REVIEW_STATUS', { productId }, true);
  return body as unknown as ReviewEligibility;
}

export async function submitReview(input: { productId: string; rating: number; comment: string; photoPaths?: string[] }): Promise<void> {
  await post('SUBMIT_REVIEW', input, true);
}
