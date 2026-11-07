import { describe, expect, it } from 'vitest';
import { addLine, moveSavedToCart, saveLineForLater } from '../cartLines';
import type { CartItem } from '../cartContext';

const base = {
  productId: 'p-01', productName: 'Lotus', productSlug: 'lotus', shapeId: 'lotus', sizeLabel: 'Medium', widthMm: 500, heightMm: 500,
  finish: 'brass', unitPrice: 4000,
};
let n = 0;
const id = () => `id-${++n}`;
const line = (over: Partial<CartItem> = {}): CartItem => ({ ...base, id: id(), quantity: 1, ...over });

describe('addLine', () => {
  it('merges identical standard lines', () => {
    const out = addLine([line({ id: 'a', quantity: 2 })], { ...base, quantity: 3 }, id);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(5);
  });
  it('keeps a different size or finish separate', () => {
    expect(addLine([line()], { ...base, finish: 'copper' }, id)).toHaveLength(2);
    expect(addLine([line()], { ...base, sizeLabel: 'Large' }, id)).toHaveLength(2);
  });
  it('never merges custom designs', () => {
    const custom = { ...base, customDesignRef: '{"a":1}' };
    expect(addLine([line(custom)], custom, id)).toHaveLength(2);
  });
});

describe('save for later', () => {
  it('moves a line out of the cart and back with size, finish and design intact', () => {
    const custom = line({ id: 'c', customDesignRef: '{"layers":[]}', finish: 'corten', sizeLabel: 'XL', quantity: 2 });
    const start = { items: [custom, line({ id: 'x', productId: 'p-02' })], saved: [] };
    const saved = saveLineForLater(start, 'c', id);
    expect(saved.items.map(i => i.id)).toEqual(['x']);
    expect(saved.saved).toHaveLength(1);
    const back = moveSavedToCart(saved, saved.saved[0].id, id);
    expect(back.saved).toEqual([]);
    expect(back.items.at(-1)).toMatchObject({ customDesignRef: '{"layers":[]}', finish: 'corten', sizeLabel: 'XL', quantity: 2 });
  });
  it('merges quantity into a matching saved or cart line instead of duplicating', () => {
    const state = { items: [line({ id: 'a', quantity: 1 })], saved: [line({ id: 's', quantity: 2 })] };
    const back = moveSavedToCart(state, 's', id);
    expect(back.items).toHaveLength(1);
    expect(back.items[0].quantity).toBe(3);
    const again = saveLineForLater({ items: [line({ id: 'b', quantity: 1 })], saved: [line({ id: 't', quantity: 1 })] }, 'b', id);
    expect(again.saved).toHaveLength(1);
    expect(again.saved[0].quantity).toBe(2);
  });
  it('ignores unknown ids', () => {
    const state = { items: [line({ id: 'a' })], saved: [] };
    expect(saveLineForLater(state, 'zzz', id)).toEqual(state);
    expect(moveSavedToCart(state, 'zzz', id)).toEqual(state);
  });
});
