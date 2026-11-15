/**
 * Cart lines in the shape every pricing endpoint accepts (checkout-intent, validate-coupon, cart-quote); prices are
 * never sent. Kept free of Firebase so the studio and the cart quote can use it without loading the auth SDK.
 */
import type { CartItem } from '@/lib/cartContext';

export function toCheckoutItems(items: CartItem[]) {
  return items.map(i => ({
    productId: i.productId,
    sizeLabel: i.sizeLabel || undefined,
    widthMm: i.widthMm || undefined,
    heightMm: i.heightMm || undefined,
    finish: i.finish,
    quantity: i.quantity,
    customDesignRef: i.customDesignRef,
  }));
}
