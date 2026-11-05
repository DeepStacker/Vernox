// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { priceCustomLine } from '../../../../api/_lib/pricing';
import { defaultStoreConfig, mergeStoreConfig } from '../../../../api/_lib/storeConfig';
import { CUSTOM_PRODUCT_ID } from '@/types/products';
import { DEFAULT_CUSTOM_FINISH_RATES, resolveCustomFinishRates } from '@/lib/pricing/customPiece';
import { createDocument } from '../document';
import { price } from '../api';

const sizes: [number, number][] = [[100, 100], [300, 200], [457, 333], [1200, 800], [3000, 1500]];

describe('studio price equals the server price (same paise)', () => {
  const server = defaultStoreConfig({});
  for (const finish of Object.keys(DEFAULT_CUSTOM_FINISH_RATES)) {
    it(`default rates — ${finish}`, () => {
      for (const [w, h] of sizes) {
        const doc = createDocument({ plate: { style: 'solid', shapeId: 'rectangle', widthMm: w, heightMm: h, cornerRadiusMm: 0 }, material: { finish }, mounting: { preset: 'none' } });
        const studio = price(doc);
        const line = priceCustomLine({ productId: CUSTOM_PRODUCT_ID, widthMm: studio.widthMm, heightMm: studio.heightMm, finish, quantity: 1 }, server);
        expect(studio.widthMm).toBe(w);
        expect(studio.heightMm).toBe(h);
        expect('unitPricePaise' in studio.quote && studio.quote.unitPricePaise).toBe(line.unitPricePaise);
      }
    });
  }

  it('settings/store overrides are applied identically', () => {
    const overrides = { brass: { setupFee: 250, ratePerCm2: 0.061, minimum: 600 }, steel: { label: 'Black steel', ratePerCm2: 0.03 }, bogus: { minimum: 1 } };
    const server = mergeStoreConfig(defaultStoreConfig({}), { customPieces: overrides });
    const rates = resolveCustomFinishRates(overrides);
    for (const finish of ['brass', 'steel']) {
      for (const [w, h] of sizes) {
        const doc = createDocument({ plate: { style: 'solid', shapeId: 'rectangle', widthMm: w, heightMm: h, cornerRadiusMm: 0 }, material: { finish }, mounting: { preset: 'none' } });
        const studio = price(doc, { rates });
        const line = priceCustomLine({ productId: CUSTOM_PRODUCT_ID, widthMm: w, heightMm: h, finish, quantity: 1 }, server);
        expect('unitPricePaise' in studio.quote && studio.quote.unitPricePaise).toBe(line.unitPricePaise);
      }
    }
  });

  it('bills the part bounding box rounded up to whole millimetres', () => {
    const doc = createDocument({ plate: { style: 'solid', shapeId: 'rectangle', widthMm: 250.4, heightMm: 120.01, cornerRadiusMm: 0 }, mounting: { preset: 'none' } });
    const p = price(doc);
    expect([p.widthMm, p.heightMm]).toEqual([251, 121]);
  });
});
