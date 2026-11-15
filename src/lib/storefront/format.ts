const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Whole-rupee display, Indian digit grouping: ₹12,499. */
export const formatINR = (amount: number) => `₹${inr.format(Math.round(amount))}`;

/** Two-decimal rupees, for amounts that can carry paise (coupon discounts). */
export const formatINRExact = (amount: number) => `₹${inrExact.format(amount)}`;

/** An amount in paise exactly as charged: whole rupees when it has no paise (₹8,140), else two decimals (₹8,138.75). */
export const formatPaise = (paise: number) => (paise % 100 === 0 ? formatINR(paise / 100) : formatINRExact(paise / 100));
