/**
 * Staff-entered orders (admin action CREATE_STAFF_ORDER, api/_lib/staffOrders.ts): the vocabulary shared by
 * the API and the admin New order screen.
 */
/** Where the order was taken. `counter` is a walk-in sale at the workshop or store. */
export const STAFF_ORDER_CHANNELS = ['counter', 'phone', 'whatsapp', 'email', 'trade'] as const;
export type StaffOrderChannel = (typeof STAFF_ORDER_CHANNELS)[number];

export const STAFF_ORDER_CHANNEL_LABELS: Record<StaffOrderChannel, string> = {
  counter: 'Counter / walk-in',
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  email: 'Email',
  trade: 'Trade / bulk',
};

/** How the customer pays. `offline` = already taken in person; `payment_link` = Razorpay link sent to the customer. */
export const STAFF_PAYMENT_METHODS = ['offline', 'payment_link', 'cod'] as const;
export type StaffPaymentMethod = (typeof STAFF_PAYMENT_METHODS)[number];

export const OFFLINE_PAYMENT_MODES = ['cash', 'upi', 'card', 'bank_transfer'] as const;
export type OfflinePaymentMode = (typeof OFFLINE_PAYMENT_MODES)[number];

export const OFFLINE_PAYMENT_MODE_LABELS: Record<OfflinePaymentMode, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card (POS machine)',
  bank_transfer: 'Bank transfer (NEFT / RTGS / IMPS)',
};

/** How long a payment link (and the stock it holds) stays valid. */
export const PAYMENT_LINK_TTL_HOURS = 72;
