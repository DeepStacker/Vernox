/**
 * Money is handled as integer paise everywhere on the server. Rupee amounts
 * only exist at the edges: Firestore catalog/coupon/settings documents (edited
 * by staff in rupees) and the `pricing` object returned to the browser.
 */

/** Converts a rupee amount (may have up to 2 decimals) to integer paise. */
export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) throw new Error(`Invalid rupee amount: ${rupees}`);
  return Math.round(rupees * 100);
}

/** Converts integer paise to a rupee number for display payloads. */
export function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100;
}

const RUPEE_FORMAT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Customer-facing amount from integer paise, e.g. 123456 -> "₹1,234.56" (Indian digit grouping, 2 decimals). */
export function formatRupees(paise: number): string {
  return `₹${RUPEE_FORMAT.format(paiseToRupees(paise))}`;
}

export function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
