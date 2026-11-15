import { describe, expect, it } from 'vitest';
import type { Product } from '@/lib/catalog';
import { recommendProducts, relevance } from '@/lib/storefront/recommend';

const p = (id: string, extra: Partial<Product> = {}): Product => ({
  id, slug: id, name: id, tagline: '', description: '', category: 'spiritual', price: 2000, shapeId: 'x',
  finishes: ['brass'], sizes: [], stock: 5, ...extra,
} as Product);

describe('recommendProducts', () => {
  const om = p('om', { themes: ['spiritual'], rooms: ['pooja'] });
  const catalog = [
    om,
    p('tree', { category: 'nature', themes: ['nature'], rooms: ['living'], price: 2100 }),
    p('ganesha', { themes: ['spiritual'], rooms: ['pooja'], price: 2400 }),
    p('sold-out', { themes: ['spiritual'], rooms: ['pooja'], stock: 0 }),
    p('made-to-order', { themes: ['spiritual'], stock: 0, trackInventory: false, price: 9000 }),
  ];

  it('ranks what shares category, theme and room first and never suggests the seed or sold-out items', () => {
    const ids = recommendProducts(catalog, [om]).map(x => x.id);
    expect(ids[0]).toBe('ganesha');
    expect(ids).not.toContain('om');
    expect(ids).not.toContain('sold-out');
    expect(ids).toContain('made-to-order');
  });

  it('prefers a similar budget', () => {
    expect(relevance(p('a', { price: 2100 }), [om])).toBeGreaterThan(relevance(p('b', { price: 9000 }), [om]));
  });

  it('honours exclusions and the limit, and still suggests with no seeds', () => {
    expect(recommendProducts(catalog, [om], { exclude: ['ganesha'], limit: 1 }).map(x => x.id)).not.toContain('ganesha');
    expect(recommendProducts(catalog, [], { limit: 2 })).toHaveLength(2);
  });
});
