/**
 * The guest's email for the order-confirmation page. It used to travel in the URL (?email=), which put it in browser
 * history, server and proxy logs and Referer headers. Now checkout keeps it in this tab's session storage, keyed by
 * order id; a reload still finds it, other tabs and later visits use Track order instead.
 */
import { safeSession } from '@/lib/safeStorage';

const KEY = 'vernox:confirmation-emails';
const MAX = 5;

export function rememberConfirmationEmail(orderId: string, email: string) {
  const saved = safeSession.getJson<Record<string, string>>(KEY, {});
  const kept = Object.entries(saved).filter(([id]) => id !== orderId).slice(-(MAX - 1));
  safeSession.setJson(KEY, Object.fromEntries([...kept, [orderId, email]]));
}

export function confirmationEmail(orderId: string | undefined): string | undefined {
  return orderId ? safeSession.getJson<Record<string, string>>(KEY, {})[orderId] : undefined;
}
