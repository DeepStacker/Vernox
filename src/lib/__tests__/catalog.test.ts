import { describe, expect, it } from 'vitest';
import { defaultStoreConfig } from '../../../api/_lib/storeConfig';
import { priceCatalogLine, productFromDoc } from '../../../api/_lib/pricing';
import { discountPercent, mrpFor, products, unitPrice } from '../catalog';
import { applyFilters, parseFilters, sortProducts, toSearchParams } from '../storefront/listing';

describe('sample catalogue', () => {
  it('has unique slugs and ids and is flagged as sample data', () => {
    expect(new Set(products.map(p => p.slug)).size).toBe(products.length);
    expect(new Set(products.map(p => p.id)).size).toBe(products.length);
    expect(products.every(p => p.isSample)).toBe(true);
  });

  it('is priceable by the server for every size and finish, at the price the storefront shows', () => {
    for (const p of products) {
      const record = productFromDoc(p.id, { ...p } as never);
      expect(record, p.slug).not.toBeNull();
      for (const size of p.sizes) {
        for (const finish of p.finishes) {
          const line = priceCatalogLine({ productId: p.id, sizeLabel: size.label, finish, quantity: 1 }, record);
          expect(line.unitPricePaise, `${p.slug} ${size.label}`).toBe(unitPrice(p, size) * 100);
        }
      }
    }
  });

  it('only uses finishes the server knows for custom pieces', () => {
    const known = Object.keys(defaultStoreConfig().customPieces.finishes);
    for (const p of products) {
      for (const f of p.finishes) expect(known, `${p.slug}: ${f}`).toContain(f);
    }
  });

  it('has an MRP above the price with a consistent discount across sizes', () => {
    for (const p of products) {
      expect(p.mrp).toBeGreaterThan(p.price);
      expect(discountPercent(p)).toBeGreaterThan(0);
      for (const s of p.sizes) {
        const off = 1 - unitPrice(p, s) / (mrpFor(p, s) as number);
        expect(Math.abs(off - (1 - p.price / (p.mrp as number)))).toBeLessThan(0.01);
      }
    }
  });
});

describe('listing filters', () => {
  it('round-trips filters through the URL', () => {
    const f = parseFilters(new URLSearchParams('room=pooja&finish=brass,gold&price=3000-5000&sort=price-asc&ready=1'));
    expect(f.room).toBe('pooja');
    expect(f.finishes).toEqual(['brass', 'gold']);
    expect(toSearchParams(f).toString()).toBe(new URLSearchParams('room=pooja&finish=brass%2Cgold&price=3000-5000&ready=1&sort=price-asc').toString());
  });

  it('filters by room and category and sorts by price', () => {
    const pooja = applyFilters(products, parseFilters(new URLSearchParams('room=pooja')));
    expect(pooja.length).toBeGreaterThan(0);
    expect(pooja.every(p => p.rooms?.includes('pooja'))).toBe(true);

    const spiritual = applyFilters(products, parseFilters(new URLSearchParams('category=spiritual')));
    const sorted = sortProducts(spiritual, 'price-asc', new Map());
    expect(sorted.map(p => p.price)).toEqual([...sorted.map(p => p.price)].sort((a, b) => a - b));
  });
});
