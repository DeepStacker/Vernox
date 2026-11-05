// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checkoutRequestSchema } from '../../api/_lib/checkout';
import { ApiError } from '../../api/_lib/errors';
import {
  CUSTOM_PRODUCT_ID,
  computeTotals,
  priceCatalogLine,
  priceCustomLine,
  priceLines,
  productFromDoc,
  stockRequirements,
} from '../../api/_lib/pricing';
import { defaultStoreConfig, mergeStoreConfig } from '../../api/_lib/storeConfig';
import { PRODUCT_CHEAP, PRODUCT_FRAME, TEST_CONFIG } from './support/serverFixtures';

const frame = productFromDoc('p-01', PRODUCT_FRAME)!;
const cheap = productFromDoc('p-11', PRODUCT_CHEAP)!;

function expectApiError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe(code);
    return;
  }
  throw new Error(`expected ApiError ${code}`);
}

describe('productFromDoc', () => {
  it('converts rupee prices and size deltas to paise', () => {
    expect(frame.basePricePaise).toBe(18_900);
    expect(frame.sizes[1].priceDeltaPaise).toBe(8_000);
    expect(frame.finishes).toEqual(['gold', 'brass', 'steel']);
  });

  it('refuses documents without a valid price instead of guessing', () => {
    expect(productFromDoc('x', null)).toBeNull();
    expect(productFromDoc('x', { name: 'No price' })).toBeNull();
    expect(productFromDoc('x', { price: -5 })).toBeNull();
  });

  it('treats a missing stock field as zero, never a default allowance', () => {
    expect(productFromDoc('x', { price: 10 })!.stock).toBe(0);
  });

  it('marks archived products as not purchasable', () => {
    expect(productFromDoc('x', { price: 10, status: 'archived' })!.purchasable).toBe(false);
  });
});

describe('catalog line pricing', () => {
  it('prices by size label from the product document', () => {
    const line = priceCatalogLine({ productId: 'p-01', sizeLabel: 'medium · 50CM', finish: 'Brass', quantity: 2 }, frame);
    expect(line.unitPricePaise).toBe(26_900);
    expect(line.lineTotalPaise).toBe(53_800);
    expect(line.finish).toBe('brass');
  });

  it('falls back to exact dimensions when no label is given', () => {
    const line = priceCatalogLine({ productId: 'p-01', widthMm: 300, heightMm: 300, finish: 'gold', quantity: 1 }, frame);
    expect(line.unitPricePaise).toBe(18_900);
  });

  it('rejects unknown sizes, finishes and products', () => {
    expectApiError(() => priceCatalogLine({ productId: 'p-01', sizeLabel: 'Huge', finish: 'gold', quantity: 1 }, frame), 'INVALID_ITEM');
    expectApiError(() => priceCatalogLine({ productId: 'p-01', sizeLabel: 'Small · 30cm', finish: 'copper', quantity: 1 }, frame), 'INVALID_ITEM');
    expectApiError(() => priceCatalogLine({ productId: 'nope', finish: 'steel', quantity: 1 }, null), 'INVALID_ITEM');
  });

  it('ignores any client-supplied unitPrice (the request schema strips it)', () => {
    const req = checkoutRequestSchema.parse({
      items: [{ productId: 'p-11', finish: 'steel', quantity: 1, unitPrice: 1 }],
      idempotencyKey: 'abcdefgh',
      customer: { email: 'a@b.co', name: 'A', phone: '9876543210', address: 'x', city: 'y', state: 'z', pincode: '560001', country: 'IN' },
    });
    expect(req.items[0]).not.toHaveProperty('unitPrice');
    const [line] = priceLines(req.items, new Map([['p-11', cheap]]), TEST_CONFIG);
    expect(line.unitPricePaise).toBe(8_900);
  });
});

describe('custom piece pricing', () => {
  it('uses setup fee + area × finish rate, rounded to whole paise', () => {
    const steel = priceCustomLine({ productId: CUSTOM_PRODUCT_ID, widthMm: 300, heightMm: 300, finish: 'steel', quantity: 1 }, TEST_CONFIG);
    expect(steel.unitPricePaise).toBe(14_900 + 900 * 2.5);
    const brass = priceCustomLine({ productId: CUSTOM_PRODUCT_ID, widthMm: 600, heightMm: 400, finish: 'brass', quantity: 3 }, TEST_CONFIG);
    expect(brass.unitPricePaise).toBe(14_900 + 2_400 * 4.5);
    expect(brass.lineTotalPaise).toBe(brass.unitPricePaise * 3);
    expect(brass.isCustom).toBe(true);
  });

  it('applies the per-finish minimum', () => {
    const config = mergeStoreConfig(TEST_CONFIG, { customPieces: { steel: { minimum: 500 } } });
    const line = priceCustomLine({ productId: CUSTOM_PRODUCT_ID, widthMm: 100, heightMm: 100, finish: 'steel', quantity: 1 }, config);
    expect(line.unitPricePaise).toBe(50_000);
  });

  it('rejects missing/out-of-range dimensions and unknown finishes', () => {
    const base = { productId: CUSTOM_PRODUCT_ID, finish: 'steel', quantity: 1 };
    expectApiError(() => priceCustomLine({ ...base }, TEST_CONFIG), 'INVALID_ITEM');
    expectApiError(() => priceCustomLine({ ...base, widthMm: 50, heightMm: 300 }, TEST_CONFIG), 'INVALID_ITEM');
    expectApiError(() => priceCustomLine({ ...base, widthMm: 5000, heightMm: 300 }, TEST_CONFIG), 'INVALID_ITEM');
    expectApiError(() => priceCustomLine({ ...base, widthMm: 300, heightMm: 300, finish: 'unobtainium' }, TEST_CONFIG), 'INVALID_ITEM');
  });

  it('excludes custom pieces from stock requirements', () => {
    const lines = priceLines(
      [
        { productId: 'p-01', sizeLabel: 'Small · 30cm', finish: 'gold', quantity: 1 },
        { productId: 'p-01', sizeLabel: 'Medium · 50cm', finish: 'gold', quantity: 2 },
        { productId: CUSTOM_PRODUCT_ID, widthMm: 300, heightMm: 300, finish: 'steel', quantity: 4 },
      ],
      new Map([['p-01', frame]]),
      TEST_CONFIG,
    );
    expect([...stockRequirements(lines)]).toEqual([['p-01', 3]]);
  });
});

describe('order totals', () => {
  const line = (paise: number) => priceCatalogLine({ productId: 'x', finish: 'steel', quantity: 1 }, productFromDoc('x', { price: paise / 100 }));

  it('charges shipping below the threshold and computes GST on the discounted subtotal', () => {
    const totals = computeTotals([line(8_900)], 0, TEST_CONFIG);
    expect(totals).toMatchObject({ subtotalPaise: 8_900, shippingPaise: 4_000, taxPaise: 1_602, totalPaise: 14_502 });
  });

  it('gives free shipping at exactly the threshold (>=)', () => {
    expect(computeTotals([line(15_000)], 0, TEST_CONFIG).shippingPaise).toBe(0);
    expect(computeTotals([line(14_999)], 0, TEST_CONFIG).shippingPaise).toBe(4_000);
  });

  it('clamps discounts to the subtotal and keeps integer paise', () => {
    const totals = computeTotals([line(53_800)], 99_999_999, TEST_CONFIG);
    expect(totals.discountPaise).toBe(53_800);
    expect(totals.taxPaise).toBe(0);
    const t2 = computeTotals([line(53_801)], 1_234, TEST_CONFIG);
    expect(Number.isInteger(t2.taxPaise)).toBe(true);
    expect(t2.totalPaise).toBe(53_801 - 1_234 + t2.shippingPaise + t2.taxPaise);
  });
});

describe('store config', () => {
  it('reads env defaults', () => {
    const config = defaultStoreConfig({ STORE_GST_RATE_PERCENT: '12', STORE_SHIPPING_FEE_INR: '99', STORE_FREE_SHIPPING_THRESHOLD_INR: '2000' } as NodeJS.ProcessEnv);
    expect(config).toMatchObject({ gstRateBps: 1_200, shippingFeePaise: 9_900, freeShippingThresholdPaise: 200_000 });
  });

  it('lets settings/store override env defaults and ignores invalid values', () => {
    const config = mergeStoreConfig(TEST_CONFIG, { gstRatePercent: 5, shippingFee: 'free', freeShippingThreshold: -1 });
    expect(config.gstRateBps).toBe(500);
    expect(config.shippingFeePaise).toBe(TEST_CONFIG.shippingFeePaise);
    expect(config.freeShippingThresholdPaise).toBe(TEST_CONFIG.freeShippingThresholdPaise);
  });
});
