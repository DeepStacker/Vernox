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

export function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
