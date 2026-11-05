const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Whole-rupee display, Indian digit grouping: ₹12,499. */
export const formatINR = (amount: number) => `₹${inr.format(Math.round(amount))}`;

/** Two-decimal rupees, for amounts that can carry paise (coupon discounts). */
export const formatINRExact = (amount: number) => `₹${inrExact.format(amount)}`;
