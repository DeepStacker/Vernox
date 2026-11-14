/**
 * Orders entered by staff (admin actions QUOTE_STAFF_ORDER and CREATE_STAFF_ORDER, permission `orders.create`):
 * a counter (walk-in) sale, or an order taken by phone, WhatsApp, email or from a trade enquiry.
 *
 * The order is created by the storefront checkout engine (createCheckoutIntent with `options.staff`), so prices,
 * GST, stock, coupons and idempotency are exactly the storefront's. Staff choose how the customer pays:
 *   offline       cash / UPI / card / bank transfer already taken: the order starts `Paid`;
 *                 with `handover` (counter only) it is `Delivered` and the GST invoice is issued at once.
 *   payment_link  a Razorpay payment link is sent to the customer; the order is `Pending_Payment` until paid.
 *   cod           cash on delivery, with the storefront's COD rules (catalogue only, PIN, value and per-phone limits).
 * A counter handover needs no delivery address: the buyer is recorded at the seller's address, which makes the
 * sale intra-state for GST (place of supply of goods handed over at the counter is the seller's location).
 */
import { z } from 'zod';
import { ORDER_LIMITS } from '../../src/lib/pricing/orderLimits';
import { CUSTOM_PRODUCT_ID } from '../../src/types/products';
import { OFFLINE_PAYMENT_MODES, STAFF_ORDER_CHANNELS } from '../../src/types/staffOrders';
import { createCheckoutIntent, customerSchema, itemSchema, quoteItems, type CheckoutDeps, type StaffCheckoutResponse } from './checkout';
import type { CheckoutItemInput } from './pricing';
import { ApiError } from './errors';
import { asOrder, phoneKey, type CustomerDetails } from './orders';
import type { DocStore } from './store';
import type { StoreConfig } from './storeConfig';

const phoneField = z.string().trim().regex(/^\+?[0-9][0-9\s-]{8,15}$/, 'Enter a valid phone number');
const optionalText = (max: number) => z.string().trim().max(max).optional().transform(v => v || undefined);

const staffCustomerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: phoneField,
  email: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal('')).transform(v => v || undefined),
  address: optionalText(500),
  city: optionalText(100),
  state: optionalText(100),
  pincode: optionalText(12),
  country: z.string().trim().min(2).max(56).default('India'),
});

const paymentSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('offline'),
    mode: z.enum(OFFLINE_PAYMENT_MODES),
    reference: z.string().trim().max(80).default(''),
  }),
  z.object({ method: z.literal('payment_link') }),
  z.object({ method: z.literal('cod') }),
]);

const CUSTOM_HANDOVER_MESSAGE = 'Custom pieces are made to order, so they cannot be handed over at the counter. Untick "Customer takes the pieces now".';

/**
 * Custom (Studio) lines entered by staff. The customer's design is not in the Studio, so the line carries a plain-text
 * design reference (file name, WhatsApp message, job number) in `customDesignRef`; a value starting with "{" would be
 * read by production as a Studio design document, so it is refused. Size, finish and price are validated and priced
 * by the checkout engine (api/_lib/pricing.ts), never taken from the client.
 */
const MAX_STAFF_DESIGN_REF_CHARS = 300;
type IssueFn = (path: (string | number)[], message: string) => void;
function checkCustomLines(items: z.infer<typeof itemSchema>[], handover: boolean, issue: IssueFn) {
  items.forEach((item, i) => {
    if (item.productId !== CUSTOM_PRODUCT_ID) {
      if (item.customDesignRef) issue(['items', i, 'customDesignRef'], 'Only a custom piece carries a design reference.');
      return;
    }
    const ref = item.customDesignRef?.trim() ?? '';
    if (!ref) issue(['items', i, 'customDesignRef'], 'Enter where the design is (file name, WhatsApp message or job number) so the workshop can find it.');
    else if (ref.length > MAX_STAFF_DESIGN_REF_CHARS || ref.startsWith('{')) {
      issue(['items', i, 'customDesignRef'], `The design reference must be plain text of at most ${MAX_STAFF_DESIGN_REF_CHARS} characters.`);
    }
    if (handover) issue(['items', i], CUSTOM_HANDOVER_MESSAGE);
  });
}

export const staffOrderSchema = z
  .object({
    channel: z.enum(STAFF_ORDER_CHANNELS),
    items: z.array(itemSchema).min(1).max(ORDER_LIMITS.maxLines),
    couponCode: optionalText(40),
    customer: staffCustomerSchema,
    payment: paymentSchema,
    handover: z.boolean().default(false),
    /** The customer agreed to order updates on WhatsApp. */
    whatsappOptIn: z.boolean().default(false),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/, 'must be 8-128 characters of [A-Za-z0-9_-]'),
    note: optionalText(1000),
    /** The trade enquiry this order came from; it is marked won. */
    tradeEnquiryId: z.string().trim().regex(/^[A-Za-z0-9]{10,40}$/).optional(),
  })
  .superRefine((o, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    checkCustomLines(o.items, o.handover, issue);
    if (o.handover) {
      if (o.channel !== 'counter') issue(['handover'], 'Only a counter sale can be handed over at once.');
      if (o.payment.method !== 'offline') issue(['handover'], 'Take the payment before handing the pieces over.');
    } else {
      for (const key of ['address', 'city', 'state', 'pincode'] as const) {
        if (!o.customer[key]) issue(['customer', key], 'is required for delivery');
      }
    }
    if (o.payment.method === 'offline' && o.payment.mode !== 'cash' && !o.payment.reference) {
      issue(['payment', 'reference'], 'Enter the UPI, card or bank transaction reference.');
    }
    if (o.couponCode && !o.customer.email) issue(['couponCode'], 'A coupon needs the customer email (coupons are limited per customer).');
  });
export type StaffOrderInput = z.infer<typeof staffOrderSchema>;

export const staffQuoteSchema = z
  .object({
    items: z.array(itemSchema).min(1).max(ORDER_LIMITS.maxLines),
    couponCode: optionalText(40),
    customerEmail: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal('')).transform(v => v || undefined),
    cod: z.boolean().default(false),
    /** Counter handover: no shipping. */
    handover: z.boolean().default(false),
  })
  .superRefine((q, ctx) => {
    // The quote checks only what changes the price or the rules; the design reference is required at creation.
    if (!q.handover) return;
    q.items.forEach((item, i) => {
      if (item.productId === CUSTOM_PRODUCT_ID) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items', i], message: CUSTOM_HANDOVER_MESSAGE });
    });
  });
export type StaffQuoteInput = z.infer<typeof staffQuoteSchema>;

export async function quoteStaffOrder(store: DocStore, config: StoreConfig, input: StaffQuoteInput) {
  // Casts: the app tsconfig (non-strict) also type-checks this file via tests, where z.infer fields are optional.
  const { evaluation, totals, lines } = await quoteItems(store, config, input.items as CheckoutItemInput[], {
    couponCode: input.couponCode,
    customerEmail: input.customerEmail,
    cod: input.cod,
    collected: input.handover,
  });
  return {
    lines: lines.map(l => ({ productId: l.productId, name: l.name, sizeLabel: l.sizeLabel, finish: l.finish, quantity: l.quantity, unitPricePaise: l.unitPricePaise, lineTotalPaise: l.lineTotalPaise })),
    coupon: evaluation ? ('errorCode' in evaluation ? { ok: false, message: evaluation.message } : { ok: true, discountPaise: evaluation.discountPaise }) : null,
    totals: {
      subtotalPaise: totals.subtotalPaise,
      discountPaise: totals.discountPaise,
      shippingPaise: totals.shippingPaise,
      codFeePaise: totals.codFeePaise,
      taxPaise: totals.taxPaise,
      totalPaise: totals.totalPaise,
    },
  };
}

const COUNTER_ADDRESS = 'Collected at the counter';

export const customerLookupSchema = z.object({ phone: phoneField });

/**
 * A returning customer's details from their most recent order with this mobile number, so staff do not retype
 * the name, email and address. Counter handovers are skipped as an address source (they carry the seller's).
 */
export async function findCustomerByPhone(store: DocStore, phone: string) {
  const docs = await store.query('orders', { where: [{ field: 'phoneKey', op: '==', value: phoneKey(phone) }], limit: 50 });
  const orders = docs.map(d => asOrder(d.data)!).filter(Boolean).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  if (orders.length === 0) return { found: false as const };
  const latest = orders[0];
  const withAddress = orders.find(o => o.customer?.address && o.customer.address !== COUNTER_ADDRESS);
  return {
    found: true as const,
    orderCount: orders.length,
    lastOrderNumber: latest.orderNumber,
    name: latest.customer?.name ?? '',
    email: orders.find(o => o.email)?.email ?? '',
    address: withAddress ? { address: withAddress.customer.address, city: withAddress.customer.city, state: withAddress.customer.state, pincode: withAddress.customer.pincode } : null,
  };
}

/** Customer details for checkout; a counter handover is recorded at the seller's address. */
function checkoutCustomer(input: StaffOrderInput, config: StoreConfig): CustomerDetails {
  const c = input.customer;
  if (input.handover) {
    const s = config.seller;
    if (!s.state || !s.pincode) {
      throw new ApiError(409, 'CONFLICT', 'Save the business address in Settings before recording counter sales.');
    }
    return { name: c.name, phone: c.phone, email: c.email ?? '', address: COUNTER_ADDRESS, city: s.city || s.state, state: s.state, pincode: s.pincode, country: 'India' };
  }
  // Same address rules as the storefront (6-digit PIN for India).
  const parsed = customerSchema.safeParse({ ...c, email: c.email ?? 'no-email@invalid.example' });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ApiError(400, 'VALIDATION_ERROR', `customer.${first.path.join('.')}: ${first.message}`);
  }
  return { ...(parsed.data as CustomerDetails), email: c.email ?? '' };
}

export async function createStaffOrder(deps: CheckoutDeps, input: StaffOrderInput, actor: string): Promise<StaffCheckoutResponse> {
  const customer = checkoutCustomer(input, deps.config);
  const payment = input.payment;
  if (payment.method === 'payment_link' && !deps.paymentLinks?.isConfigured()) {
    throw new ApiError(409, 'CONFLICT', 'Payment links need the Razorpay keys (see Settings > Launch setup). Take the payment offline or by COD for now.');
  }
  const now = (deps.now ?? Date.now)();
  const response = await createCheckoutIntent(
    deps,
    {
      items: input.items as CheckoutItemInput[],
      couponCode: input.couponCode,
      idempotencyKey: input.idempotencyKey,
      customer,
      paymentMethod: payment.method === 'cod' ? 'cod' : 'prepaid',
      whatsappOptIn: input.whatsappOptIn,
    },
    null,
    {
      staff: {
        source: { channel: input.channel, by: actor },
        offlinePayment: payment.method === 'offline' ? { mode: payment.mode, reference: payment.reference, receivedBy: actor, at: now } : undefined,
        handover: input.handover,
        note: input.note,
      },
    },
  );
  const result = response as StaffCheckoutResponse;
  if (input.tradeEnquiryId && (await deps.store.get(`b2b_inquiries/${input.tradeEnquiryId}`))) {
    await deps.store.update(`b2b_inquiries/${input.tradeEnquiryId}`, { status: 'won', orderId: result.orderId, orderNumber: result.orderNumber });
  }
  return result;
}
