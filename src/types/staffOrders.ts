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

/**
 * Design files staff attach to a custom (Studio) line of a staff-entered order. They are uploaded to Storage before the
 * order exists, under a client-generated draft id (`staff-designs/{draftId}/{file}`, storage.rules), and the order line
 * stores the paths. Mirrors storage.rules; the server re-validates every path (api/_lib/staffOrders.ts).
 */
export const STAFF_DESIGN_FILE_TYPES = {
  'image/svg+xml': 'svg',
  'application/dxf': 'dxf',
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const;
export type StaffDesignContentType = keyof typeof STAFF_DESIGN_FILE_TYPES;
export const STAFF_DESIGN_CONTENT_TYPES = Object.keys(STAFF_DESIGN_FILE_TYPES) as [StaffDesignContentType, ...StaffDesignContentType[]];
export const MAX_STAFF_DESIGN_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_STAFF_DESIGN_FILES_PER_LINE = 5;
export const STAFF_DESIGN_DRAFT_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
export const STAFF_DESIGN_FILE_NAME_PATTERN = /^[A-Za-z0-9_-]{1,60}[.](svg|dxf|pdf|png|jpg|webp)$/;

/** A design file stored on an order line (`designFiles`). `name` is the file's original name, for display only. */
export interface DesignFile {
  path: string;
  name: string;
  contentType: StaffDesignContentType;
}
