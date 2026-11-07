/**
 * COD orders created without SMS confirmation carry the `COD_UNVERIFIED` flag until staff have phoned the
 * customer (admin action CONFIRM_COD_ORDER, see api/_lib/codOtp.ts). The flag never blocks the order state
 * machine; the consoles only surface it so nobody starts or ships an unconfirmed order unaware. Dependency-free
 * because the API imports this file too.
 */
/** Shared with the API (api/_lib/codOtp.ts imports it), so the flag name has one source. */
export const COD_UNVERIFIED_FLAG = 'COD_UNVERIFIED';

const CLOSED = new Set(['Cancelled', 'Expired', 'Delivered', 'RTO_Delivered']);

/** True while the order still waits for a confirmation call. */
export const awaitsCodConfirmation = (order: { status: string; ops?: { flags: string[] } | null }): boolean =>
  Boolean(order.ops?.flags.includes(COD_UNVERIFIED_FLAG)) && !CLOSED.has(order.status);

/** `tel:` target for the customer's number, or null when it is not a dialable number. */
export function telHref(phone: string | undefined): string | null {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  return /^\+?\d{8,15}$/.test(digits) ? `tel:${digits}` : null;
}
