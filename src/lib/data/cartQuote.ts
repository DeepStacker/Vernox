/**
 * The server's price of a basket (POST /api/cart-quote): line totals, volume discount, coupon outcome, shipping, GST
 * and total in paise. The cart and the studio batch show these figures as they are, so what they show is what checkout
 * charges; nothing here computes a discount or rounds a price. Checkout prices everything again anyway.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CartItem } from '@/lib/cartContext';
import { toCheckoutItems } from '@/lib/checkout/checkoutItems';
import { pricingDesignRefFrom } from '@/lib/pricing/cutWork';
import type { CartQuote } from '@/types/cartQuote';

export type { CartQuote } from '@/types/cartQuote';

export interface CartQuoteItem {
  productId: string;
  sizeLabel?: string;
  widthMm?: number;
  heightMm?: number;
  finish: string;
  quantity: number;
  /** Studio lines: the production snapshot only (pricingDesignRef), which the server measures for the cutting price. */
  customDesignRef?: string;
}

export interface CartQuoteRequest {
  items: CartQuoteItem[];
  couponCode?: string;
  customerEmail?: string;
}

/**
 * Cart lines for the quote. A studio line carries only its production snapshot (contours and thickness), which is
 * what the server measures for the cutting part of the price; the rest of the design JSON is dropped to keep the
 * request small.
 */
export function cartQuoteItems(items: CartItem[]): CartQuoteItem[] {
  return toCheckoutItems(items).map(({ customDesignRef, ...line }) => {
    const design = pricingDesignRefFrom(customDesignRef);
    return design ? { ...line, customDesignRef: design } : line;
  });
}

export async function fetchCartQuote(request: CartQuoteRequest): Promise<CartQuote> {
  const res = await fetch('/api/cart-quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const data = (await res.json().catch(() => null)) as (CartQuote & { message?: string }) | { success: false; message?: string } | null;
  if (!res.ok || !data || data.success !== true) {
    throw new Error(data && typeof data.message === 'string' && data.message ? data.message : `Prices are unavailable right now (${res.status}).`);
  }
  return data;
}

const DEBOUNCE_MS = 400;

/**
 * Quote for `request` (null = nothing to price), re-fetched 400 ms after it stops changing. The previous quote stays
 * visible while the next one loads; `isFetching` says it is out of date.
 */
export function useCartQuote(request: CartQuoteRequest | null) {
  const key = useMemo(() => (request && request.items.length > 0 ? JSON.stringify(request) : ''), [request]);
  const [settled, setSettled] = useState(key);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(key), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [key]);
  const query = useQuery({
    queryKey: ['cart-quote', settled],
    queryFn: () => fetchCartQuote(JSON.parse(settled) as CartQuoteRequest),
    enabled: settled !== '',
    staleTime: 30_000,
    retry: false,
    placeholderData: previous => previous,
  });
  return { quote: key ? query.data ?? null : null, error: query.error as Error | null, pending: key !== settled || query.isFetching };
}
