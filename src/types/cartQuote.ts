/**
 * Response of POST /api/cart-quote (api/_lib/cartQuote.ts): the server's price of a basket, in paise, so the cart and
 * the studio batch show exactly what checkout will charge. Dependency-free so the API can import it.
 */
export interface CartQuoteVolumeDiscount {
  minUnits: number;
  percent: number;
  /** Pieces counted for the tier. */
  units: number;
  discountPaise: number;
}

export interface CartQuote {
  success: true;
  /** GST-inclusive line prices as checkout prices them, in request order. */
  lines: Array<{ unitPricePaise: number; lineTotalPaise: number; quantity: number }>;
  subtotalPaise: number;
  /** All discounts together (what checkout takes off). */
  discountPaise: number;
  couponDiscountPaise: number;
  /** none: no code sent; applied; superseded: the volume discount is at least as large, so the coupon would not be used; invalid. */
  coupon: 'none' | 'applied' | 'superseded' | 'invalid';
  /** Why the coupon is invalid, in the server's words. */
  couponMessage: string | null;
  volumeDiscount: CartQuoteVolumeDiscount | null;
  /** The next tier up and the pieces still needed; null at the top tier or when volume discounts are off. */
  nextVolumeTier: { minUnits: number; percent: number; unitsToGo: number } | null;
  shippingPaise: number;
  /** GST included in totalPaise. */
  taxPaise: number;
  /** Prepaid total (a COD fee is added at checkout if chosen). */
  totalPaise: number;
}
