// @vitest-environment node
import { DEFAULT_CUSTOM_FINISH_RATES } from '../lib/pricing/customPiece';
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
  splitInclusiveTax,
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

  it('keeps negative size price differences and drops only a size that would not price above zero', () => {
    const product = productFromDoc('x', {
      price: 100,
      sizes: [
        { label: 'Small', widthMm: 200, heightMm: 200, priceDelta: -20.5 },
        { label: 'Broken', widthMm: 100, heightMm: 100, priceDelta: -100 },
        { label: 'Big', widthMm: 500, heightMm: 500, priceDelta: 50 },
      ],
    })!;
    expect(product.sizes.map(s => [s.label, s.priceDeltaPaise])).toEqual([['Small', -2_050], ['Big', 5_000]]);
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
    const line = priceCatalogLine({ productId: 'p-01', sizeLabel: 'medium · 50CM', finish: 'Brass', quantity: 2 }, frame, TEST_CONFIG);
    expect(line.unitPricePaise).toBe(26_900);
    expect(line.lineTotalPaise).toBe(53_800);
    expect(line.finish).toBe('brass');
  });

  it('falls back to exact dimensions when no label is given', () => {
    const line = priceCatalogLine({ productId: 'p-01', widthMm: 300, heightMm: 300, finish: 'gold', quantity: 1 }, frame, TEST_CONFIG);
    expect(line.unitPricePaise).toBe(18_900);
  });

  it('rejects unknown sizes, finishes and products', () => {
    expectApiError(() => priceCatalogLine({ productId: 'p-01', sizeLabel: 'Huge', finish: 'gold', quantity: 1 }, frame, TEST_CONFIG), 'INVALID_ITEM');
    expectApiError(() => priceCatalogLine({ productId: 'p-01', sizeLabel: 'Small · 30cm', finish: 'copper', quantity: 1 }, frame, TEST_CONFIG), 'INVALID_ITEM');
    expectApiError(() => priceCatalogLine({ productId: 'nope', finish: 'steel', quantity: 1 }, null, TEST_CONFIG), 'INVALID_ITEM');
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
    const std = DEFAULT_CUSTOM_FINISH_RATES.steel;
    const premium = DEFAULT_CUSTOM_FINISH_RATES.brass;
    expect(steel.unitPricePaise).toBe(Math.max(std.minimumPaise, Math.round(std.setupFeePaise + 900 * std.ratePaisePerCm2)));
    const brass = priceCustomLine({ productId: CUSTOM_PRODUCT_ID, widthMm: 600, heightMm: 400, finish: 'brass', quantity: 3 }, TEST_CONFIG);
    expect(brass.unitPricePaise).toBe(Math.round(premium.setupFeePaise + 2_400 * premium.ratePaisePerCm2));
    expect(brass.lineTotalPaise).toBe(brass.unitPricePaise * 3);
    expect(brass.isCustom).toBe(true);
  });

  it('applies the per-finish minimum', () => {
    const config = mergeStoreConfig(TEST_CONFIG, { customPieces: { steel: { minimum: 5_000 } } });
    const line = priceCustomLine({ productId: CUSTOM_PRODUCT_ID, widthMm: 100, heightMm: 100, finish: 'steel', quantity: 1 }, config);
    expect(line.unitPricePaise).toBe(500_000);
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
  const line = (paise: number) => priceCatalogLine({ productId: 'x', finish: 'steel', quantity: 1 }, productFromDoc('x', { price: paise / 100 }), TEST_CONFIG);

  it('charges shipping below the threshold and splits it at the goods rate (composite supply)', () => {
    const totals = computeTotals([line(8_900)], 0, TEST_CONFIG);
    // Prices include GST: ₹89 holds 89 × 18/118 = 13.576 → ₹13.58; ₹40 shipping holds 6.102 → ₹6.10.
    expect(totals).toMatchObject({ subtotalPaise: 8_900, shippingPaise: 4_000, taxPaise: 1_358 + 610, totalPaise: 12_900 });
    expect(totals.taxBreakdown.lines).toEqual([{ discountPaise: 0, taxablePaise: 7_542, gstRateBps: 1_800, taxPaise: 1_358 }]);
    expect(totals.taxBreakdown.charges).toEqual([{ kind: 'shipping', taxablePaise: 3_390, gstRateBps: 1_800, taxPaise: 610 }]);
  });

  it('makes the total exactly the inclusive amounts the customer saw, never adding GST on top', () => {
    const totals = computeTotals([line(53_800), line(8_900)], 0, TEST_CONFIG);
    expect(totals.totalPaise).toBe(53_800 + 8_900);
    totals.taxBreakdown.lines.forEach((l, idx) => expect(l.taxablePaise + l.taxPaise).toBe([53_800, 8_900][idx]));
  });

  it('splits a discounted order after allocating the discount to the inclusive line amounts', () => {
    const totals = computeTotals([line(53_800), line(26_900)], 8_070, TEST_CONFIG);
    expect(totals.taxBreakdown.lines.map(l => l.discountPaise)).toEqual([5_380, 2_690]);
    expect(totals.taxBreakdown.lines[0]).toMatchObject({ taxablePaise: 41_034, taxPaise: 7_386 }); // 48,420 incl.
    expect(totals.taxBreakdown.lines[1]).toMatchObject({ taxablePaise: 20_517, taxPaise: 3_693 }); // 24,210 incl.
    expect(totals.totalPaise).toBe(53_800 + 26_900 - 8_070);
    expect(totals.taxPaise).toBe(7_386 + 3_693);
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
    expect(t2.totalPaise).toBe(53_801 - 1_234 + t2.shippingPaise);
  });
});

describe('splitInclusiveTax (GST inside an inclusive amount)', () => {
  it('takes 5% GST out of ₹2,499: taxable ₹2,380.00, GST ₹119.00', () => {
    expect(splitInclusiveTax(249_900, 500)).toEqual({ taxablePaise: 238_000, taxPaise: 11_900 });
  });

  it('rounds half up and always returns taxable + tax == the inclusive amount', () => {
    for (const rate of [0, 300, 500, 1_200, 1_800, 2_800]) {
      for (let paise = 0; paise <= 20_000; paise += 7) {
        const { taxablePaise, taxPaise } = splitInclusiveTax(paise, rate);
        expect(taxablePaise + taxPaise).toBe(paise);
        expect(Number.isInteger(taxPaise)).toBe(true);
        // Within half a paisa of the exact share.
        expect(Math.abs(taxPaise - (paise * rate) / (10_000 + rate))).toBeLessThanOrEqual(0.5);
      }
    }
    // 1 paisa at 5% holds 0.048 → 0; 11 paise hold 0.524 → 1.
    expect(splitInclusiveTax(1, 500).taxPaise).toBe(0);
    expect(splitInclusiveTax(11, 500).taxPaise).toBe(1);
  });

  it('rejects fractional paise or rates', () => {
    expect(() => splitInclusiveTax(10.5, 500)).toThrow();
    expect(() => splitInclusiveTax(100, -1)).toThrow();
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
