import { describe, expect, it } from 'vitest';
import { products } from '@/lib/catalog';
import { matchesProductFilter, matchesProductSearch } from '../productFilters';
import { buildProduct, draftFromProduct, emptyDraft, FINISH_IDS, parseDraft, previewSizes, type ProductDraft } from '../productForm';

const valid = (over: Partial<ProductDraft> = {}): ProductDraft => ({
  ...emptyDraft(), name: 'Om Mandala', slug: 'om-mandala', price: '2999', ...over,
});

describe('product form', () => {
  it('defaults new products to valid current category and finishes', () => {
    const d = emptyDraft();
    expect(d.category).toBe('geometric');
    d.finishes.forEach(f => expect(FINISH_IDS).toContain(f));
  });

  it('accepts a valid draft and converts numbers', () => {
    const r = parseDraft(valid({ mrp: '3999', leadTimeDays: '10', thicknessMm: '1.5', hsnCode: '9403' }));
    expect('fields' in r).toBe(true);
    if ('fields' in r) {
      expect(r.fields).toMatchObject({ price: 2999, mrp: 3999, leadTimeDays: 10, thicknessMm: 1.5, stock: 10, hsnCode: '9403' });
      expect(r.fields.sizes[0]).toEqual({ label: '45 × 45 cm', widthMm: 450, heightMm: 450, priceDelta: 0 });
    }
  });

  it('reports field errors by path', () => {
    const r = parseDraft(valid({ slug: 'Bad Slug', price: '0', mrp: '100', finishes: [], stock: '1.5', imageUrl: 'javascript:alert(1)' }));
    expect('errors' in r && r.errors).toMatchObject({
      slug: expect.any(String), price: expect.any(String), finishes: expect.any(String), stock: expect.any(String), imageUrl: expect.any(String),
    });
  });

  it('rejects MRP not above price, unknown finishes, bad sizes and duplicate labels', () => {
    expect('errors' in parseDraft(valid({ mrp: '2999' }))).toBe(true);
    expect('errors' in parseDraft({ ...valid(), finishes: ['rainbow' as never] })).toBe(true);
    const sizes = [
      { label: 'A', widthMm: '10', heightMm: '450', priceDelta: '0' },
      { label: 'a', widthMm: '450', heightMm: '450', priceDelta: '-5000' },
    ];
    const r = parseDraft(valid({ sizes }));
    expect('errors' in r && r.errors).toMatchObject({ 'sizes.0.widthMm': expect.any(String), 'sizes.1.priceDelta': expect.any(String), 'sizes.1.label': expect.any(String) });
  });

  it('previews unit price, MRP and discount per size, tolerating half-typed rows', () => {
    const preview = previewSizes({
      price: '1000', mrp: '2000',
      sizes: [{ label: 'S', widthMm: '1', heightMm: '1', priceDelta: '0' }, { label: 'L', widthMm: '1', heightMm: '1', priceDelta: '500' }, { label: 'x', widthMm: '', heightMm: '', priceDelta: '' }],
    });
    expect(preview[0]).toMatchObject({ price: 1000, mrp: 2000, discountPercent: 50 });
    expect(preview[1]).toMatchObject({ price: 1500, mrp: 3000, discountPercent: 50 });
    expect(preview[2].price).toBeNull();
  });

  it('round-trips an existing product and clears emptied optional fields', () => {
    const p = { ...products[0], mrp: 9999, hsnCode: '1234' };
    const r = parseDraft({ ...draftFromProduct(p), mrp: '', hsnCode: '' });
    expect('fields' in r).toBe(true);
    if ('fields' in r) {
      const saved = buildProduct(r.fields, p, 1);
      expect(saved.id).toBe(p.id);
      expect(saved.mrp).toBeUndefined();
      expect(saved.hsnCode).toBeUndefined();
      expect(saved.createdAt).toBe(p.createdAt ?? 1);
    }
  });

  it('every seed product passes validation (catches schema drift)', () => {
    for (const p of products) {
      const r = parseDraft(draftFromProduct(p));
      expect('fields' in r, `${p.slug}: ${'errors' in r ? JSON.stringify(r.errors) : ''}`).toBe(true);
    }
  });
});

describe('product filters', () => {
  const p = { ...products[0], stock: 0, trackInventory: true, isSample: true };
  it('finds sample, out of stock and untracked products correctly', () => {
    expect(matchesProductFilter(p, 'sample')).toBe(true);
    expect(matchesProductFilter(p, 'out_of_stock')).toBe(true);
    expect(matchesProductFilter({ ...p, trackInventory: false }, 'out_of_stock')).toBe(false);
    expect(matchesProductFilter({ ...p, stock: 3 }, 'low_stock')).toBe(true);
    expect(matchesProductSearch(p, p.slug.slice(0, 4))).toBe(true);
  });
});
