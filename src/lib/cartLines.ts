/**
 * Pure cart-line operations shared by the cart store and its tests: adding a line (merging identical standard items)
 * and moving a line between the cart and the "Saved for later" list. A saved line is a full CartItem, so size, finish
 * and custom Studio designs come back exactly as they were; the wishlist only keeps product ids and cannot do that.
 */
import type { CartItem } from './cartContext';

export type NewCartLine = Omit<CartItem, 'id' | 'quantity'> & { quantity?: number };

const isCustomLine = (i: Pick<CartItem, 'customDesignRef' | 'customDesignThumb'>) => Boolean(i.customDesignRef || i.customDesignThumb);

const sameStandardLine = (a: CartItem, b: Omit<CartItem, 'id' | 'quantity'>) =>
  a.productId === b.productId && a.shapeId === b.shapeId && a.sizeLabel === b.sizeLabel && a.finish === b.finish
  && !isCustomLine(a) && !isCustomLine(b);

/** Adds a line; a standard (non-custom) line with the same product, shape, size and finish only raises the quantity. */
export function addLine(lines: CartItem[], item: NewCartLine, newId: () => string): CartItem[] {
  const quantity = item.quantity ?? 1;
  if (!isCustomLine(item)) {
    const at = lines.findIndex(l => sameStandardLine(l, item));
    if (at > -1) return lines.map((l, i) => (i === at ? { ...l, quantity: l.quantity + quantity } : l));
  }
  return [...lines, { ...item, id: newId(), quantity }];
}

export interface CartAndSaved { items: CartItem[]; saved: CartItem[] }

/** Moves one cart line (by id) to the saved list; unknown ids change nothing. A matching saved line absorbs the quantity. */
export function saveLineForLater({ items, saved }: CartAndSaved, id: string, newId: () => string): CartAndSaved {
  const line = items.find(i => i.id === id);
  if (!line) return { items, saved };
  return { items: items.filter(i => i.id !== id), saved: addLine(saved, line, newId) };
}

/** Moves one saved line (by id) back into the cart, merging with an identical cart line. */
export function moveSavedToCart({ items, saved }: CartAndSaved, id: string, newId: () => string): CartAndSaved {
  const line = saved.find(i => i.id === id);
  if (!line) return { items, saved };
  return { items: addLine(items, line, newId), saved: saved.filter(i => i.id !== id) };
}
