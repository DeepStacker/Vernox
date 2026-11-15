/**
 * Cart quote for POST /api/cart-quote: the checkout pricing engine (quoteItems), read-only, for the cart page and the
 * studio batch. It answers in paise with the volume discount and coupon outcome, so the browser never re-derives a
 * discount or rounds a unit price itself. Advisory: checkout-intent prices everything again in its transaction.
 */
import { z } from 'zod';
import type { CartQuote } from '../../src/types/cartQuote';
import { ORDER_LIMITS } from '../../src/lib/pricing/orderLimits';
import { nextVolumeTier } from '../../src/lib/pricing/volumeDiscount';
import { itemSchema, quoteItems } from './checkout';
import type { CheckoutItemInput } from './pricing';
import type { DocStore } from './store';
import type { StoreConfig } from './storeConfig';

export interface CartQuoteRequest {
  items: CheckoutItemInput[];
  couponCode?: string;
  customerEmail?: string;
}

// Designs are not needed to price a line (width, height and finish are); they are dropped, and the client does not send them.
export const cartQuoteSchema = z.object({
  items: z.array(itemSchema.omit({ customDesignRef: true })).min(1).max(ORDER_LIMITS.maxLines),
  couponCode: z.string().trim().max(40).optional().transform(v => (v ? v : undefined)),
  customerEmail: z.string().trim().toLowerCase().email().max(254).optional(),
}) as unknown as z.ZodType<CartQuoteRequest>;

export async function quoteCart(store: DocStore, config: StoreConfig, req: CartQuoteRequest, now = Date.now()): Promise<CartQuote> {
  const { evaluation, totals, lines } = await quoteItems(store, config, req.items, { couponCode: req.couponCode, customerEmail: req.customerEmail, now });
  const parts = totals.discountParts;
  const volume = parts?.volume ?? null;
  const units = lines.filter(l => !l.isService).reduce((sum, l) => sum + l.quantity, 0);
  const next = nextVolumeTier(units, config.volumeDiscounts);
  const invalid = evaluation && 'errorCode' in evaluation ? evaluation : null;
  return {
    success: true,
    lines: lines.map(l => ({ unitPricePaise: l.unitPricePaise, lineTotalPaise: l.lineTotalPaise, quantity: l.quantity })),
    subtotalPaise: totals.subtotalPaise,
    discountPaise: totals.discountPaise,
    couponDiscountPaise: parts?.couponPaise ?? 0,
    coupon: invalid ? 'invalid' : parts?.coupon ?? 'none',
    couponMessage: invalid ? invalid.message : null,
    volumeDiscount: volume ? { ...volume } : null,
    nextVolumeTier: next ? { minUnits: next.tier.minUnits, percent: next.tier.percent, unitsToGo: next.unitsToGo } : null,
    shippingPaise: totals.shippingPaise,
    taxPaise: totals.taxPaise,
    totalPaise: totals.totalPaise,
  };
}
