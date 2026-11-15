// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cartQuoteSchema, quoteCart } from '../../api/_lib/cartQuote';
import { checkoutRequestSchema, createCheckoutIntent } from '../../api/_lib/checkout';
import { ApiError } from '../../api/_lib/errors';
import { priceCustomLine } from '../../api/_lib/pricing';
import { mergeStoreConfig } from '../../api/_lib/storeConfig';
import {
  customPiecesSettingsProblem,
  DEFAULT_CUSTOM_FINISH_RATES,
  quoteCustomPiece,
  resolveCustomFinishRates,
  type QuoteCutWork,
} from '../lib/pricing/customPiece';
import { CUT_WORK_LIMITS, cutWorkFromDesignRef, measureCutWork, pricingDesignRef, pricingDesignRefFrom } from '../lib/pricing/cutWork';
import { CUSTOM_PRODUCT_ID } from '../types/products';
import { checkoutRequest, deps, NOW, seededStore, TEST_CONFIG } from './support/serverFixtures';

const square = (x: number, y: number, s: number) => `M${x} ${y}L${x + s} ${y}L${x + s} ${y + s}L${x} ${y + s}Z`;

/** A 300 × 300 plate with `holes` 10 mm square cut-outs (40 mm of cut each) in a grid, plus optional score lines. */
function plateWithHoles(holes: number, scoreMm = 0) {
  const contours = [] as { role: 'inner' | 'outer' | 'score'; d: string }[];
  for (let i = 0; i < holes; i++) contours.push({ role: 'inner', d: square(10 + (i % 20) * 14, 10 + Math.floor(i / 20) * 14, 10) });
  if (scoreMm > 0) contours.push({ role: 'score', d: `M20 290L${20 + scoreMm} 290` });
  contours.push({ role: 'outer', d: square(0, 0, 300) });
  return { contours, thicknessMm: 2 };
}

const designRef = (production: ReturnType<typeof plateWithHoles>) =>
  JSON.stringify({ schemaVersion: 4, id: 'd1', objects: [], production: { generatedAt: 1, widthMm: 300, heightMm: 300, kerfMm: 0.2, substrate: 'mild_steel', finish: 'steel', ...production } });

const customLine = (customDesignRef?: string, extra: Record<string, unknown> = {}) =>
  ({ productId: CUSTOM_PRODUCT_ID, widthMm: 300, heightMm: 300, finish: 'steel', quantity: 1, customDesignRef, ...extra });

function expectInvalidItem(fn: () => unknown, message: RegExp) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('INVALID_ITEM');
    expect((err as ApiError).message).toMatch(message);
    return;
  }
  throw new Error('expected INVALID_ITEM');
}

describe('cut work measured from production contours', () => {
  it('counts closed contours as cut length and pierces, score lines as engraving only', () => {
    const r = measureCutWork(plateWithHoles(3, 50).contours, 2);
    expect(r).toEqual({ ok: true, work: { cutLengthMm: 1200 + 3 * 40, pierces: 4, scoreLengthMm: 50, widthMm: 300, heightMm: 300, thicknessMm: 2 } });
  });

  it('closes a closed contour even when its last point is not repeated, and reads several sub-paths', () => {
    const r = measureCutWork([{ role: 'inner', d: 'M0 0L3 0L3 4ZM10 10L20 10L20 20L10 20Z' }]);
    expect(r).toMatchObject({ ok: true, work: { cutLengthMm: 12 + 40, pierces: 2 } });
  });

  it('rejects anything that is not an absolute M/L/Z polyline', () => {
    for (const d of ['m0 0l10 0z', 'M0 0C1 1 2 2 3 3Z', 'M0 0L10Z', 'M0 0 L10 0 L oops Z', 'L10 10Z', 'Z']) {
      expect(measureCutWork([{ role: 'outer', d }]), d).toEqual({ ok: false, problem: 'malformed' });
    }
  });

  it('bounds the work it accepts', () => {
    const many = Array.from({ length: CUT_WORK_LIMITS.maxContours + 1 }, () => ({ role: 'inner', d: 'M0 0L1 0L1 1Z' }));
    expect(measureCutWork(many)).toEqual({ ok: false, problem: 'too-complex' });
    expect(measureCutWork([{ role: 'outer', d: `M0 0${'L1 1'.repeat(CUT_WORK_LIMITS.maxPathChars / 4)}Z` }])).toEqual({ ok: false, problem: 'too-complex' });
  });

  it('reads only the production snapshot of a design reference', () => {
    expect(cutWorkFromDesignRef(undefined)).toEqual({ kind: 'none' });
    expect(cutWorkFromDesignRef('WhatsApp file gate.dxf, 12 Nov')).toEqual({ kind: 'none' });
    expect(cutWorkFromDesignRef(JSON.stringify({ version: '3.0.0', layers: [] }))).toEqual({ kind: 'none' }); // legacy, no snapshot
    expect(cutWorkFromDesignRef('{not json')).toEqual({ kind: 'invalid', problem: 'malformed' });
    expect(cutWorkFromDesignRef(JSON.stringify({ production: { contours: 'x' } }))).toEqual({ kind: 'invalid', problem: 'malformed' });
    expect(cutWorkFromDesignRef(JSON.stringify({ production: { contours: [{ role: 'laser', d: 'M0 0L1 0Z' }] } }))).toEqual({ kind: 'invalid', problem: 'malformed' });
    expect(cutWorkFromDesignRef(designRef(plateWithHoles(2)))).toMatchObject({ kind: 'measured', work: { pierces: 3, thicknessMm: 2 } });
  });

  it('the pricing-only reference measures exactly like the full one', () => {
    const full = designRef(plateWithHoles(25, 120));
    const small = pricingDesignRefFrom(full)!;
    expect(small.length).toBeLessThan(full.length);
    expect(cutWorkFromDesignRef(small)).toEqual(cutWorkFromDesignRef(full));
    expect(pricingDesignRefFrom('plain text')).toBeUndefined();
    expect(pricingDesignRefFrom('{broken')).toBe('{broken'); // fails at the quote exactly as at checkout
  });
});

describe('custom piece formula', () => {
  const steel = DEFAULT_CUSTOM_FINISH_RATES.steel;
  const size = { widthMm: 300, heightMm: 300, finish: 'steel' };
  const plate = steel.setupFeePaise + Math.round(900 * steel.ratePaisePerCm2);
  const included = steel.includedCutMm + steel.includedCutMmPerM2 * 0.09;
  const quote = (work: QuoteCutWork | null) => {
    const q = quoteCustomPiece({ ...size, work }, DEFAULT_CUSTOM_FINISH_RATES);
    if (!('breakdown' in q)) throw new Error(q.problem);
    return q;
  };
  const work = (w: Partial<QuoteCutWork>): QuoteCutWork => ({ cutLengthMm: 0, pierces: 1, scoreLengthMm: 0, thicknessMm: null, ...w });

  it('without geometry is the area formula, unchanged', () => {
    expect(quote(null).unitPricePaise).toBe(Math.max(steel.minimumPaise, plate));
    expect(quote(null).breakdown).toMatchObject({ platePaise: plate, cuttingPaise: 0, holesPaise: 0, engravingPaise: 0, work: null });
  });

  it('charges nothing up to the included cut length and pierces, then per metre and per pierce', () => {
    expect(quote(work({ cutLengthMm: included, pierces: steel.includedPierces })).unitPricePaise).toBe(plate);
    const over = quote(work({ cutLengthMm: included + 1000, pierces: steel.includedPierces + 1 }));
    expect(over.breakdown).toMatchObject({ cuttingPaise: steel.cutPaisePerMetre, holesPaise: steel.piercePaise });
    expect(over.unitPricePaise).toBe(plate + steel.cutPaisePerMetre + steel.piercePaise);
  });

  it('charges engraving per metre with no allowance', () => {
    expect(quote(work({ scoreLengthMm: 2000 })).breakdown.engravingPaise).toBe(2 * steel.scorePaisePerMetre);
  });

  it('scales the cutting parts by the thickness factor, never the plate', () => {
    const w = { cutLengthMm: included + 10_000, pierces: steel.includedPierces + 10 };
    const at2 = quote(work({ ...w, thicknessMm: 2 }));
    const at3 = quote(work({ ...w, thicknessMm: 3 }));
    expect(at3.breakdown.platePaise).toBe(at2.breakdown.platePaise);
    expect(at3.breakdown.cuttingPaise).toBe(Math.round(at2.breakdown.cuttingPaise * steel.thicknessFactors['3']));
    expect(at3.breakdown.work?.thicknessFactor).toBe(1.6);
  });

  it('tops up to the minimum and the parts always add up to the unit price', () => {
    const small = quoteCustomPiece({ widthMm: 100, heightMm: 100, finish: 'steel', work: work({ pierces: 45 }) }, DEFAULT_CUSTOM_FINISH_RATES);
    if (!('breakdown' in small)) throw new Error('unpriced');
    const b = small.breakdown;
    expect(small.unitPricePaise).toBe(steel.minimumPaise);
    expect(b.platePaise + b.cuttingPaise + b.engravingPaise + b.holesPaise + b.minimumTopUpPaise).toBe(small.unitPricePaise);
  });

  it('settings override every rate in rupees and metres', () => {
    const rates = resolveCustomFinishRates({ steel: { cutRatePerMetre: 40, includedCutMetres: 1, includedCutMetresPerM2: 0, pierceRate: 5, includedPierces: 0, scoreRatePerMetre: 2, thicknessFactors: { '3': 2 } } });
    expect(rates.steel).toMatchObject({ cutPaisePerMetre: 4000, includedCutMm: 1000, includedCutMmPerM2: 0, piercePaise: 500, includedPierces: 0, scorePaisePerMetre: 200, thicknessFactors: { 3: 2 } });
    // A new finish with only the plate fields gets the default cutting rates.
    const added = resolveCustomFinishRates({ titanium: { setupFee: 900, ratePerCm2: 3, minimum: 2000 } });
    expect(added.titanium).toMatchObject({ cutPaisePerMetre: 2500, includedPierces: 40, thicknessFactors: {} });
  });

  it('the settings save refuses typos and malformed values with a message', () => {
    expect(customPiecesSettingsProblem({ steel: { cutRatePerMetre: 30 } })).toBeNull();
    expect(customPiecesSettingsProblem({ steel: { cutRate: 30 } })).toMatch(/cutRate is not a custom piece setting/);
    expect(customPiecesSettingsProblem({ steel: { includedPierces: 2.5 } })).toMatch(/whole number/);
    expect(customPiecesSettingsProblem({ steel: { thicknessFactors: { thick: 2 } } })).toMatch(/thicknessFactors/);
    expect(customPiecesSettingsProblem({ steel: { thicknessFactors: { 3: 0 } } })).toMatch(/thicknessFactors/);
    expect(customPiecesSettingsProblem({ titanium: { setupFee: 900 } })).toMatch(/new finish/);
    expect(customPiecesSettingsProblem([])).toMatch(/object/);
  });
});

describe('server prices custom lines from the frozen geometry', () => {
  it('a line without a snapshot (staff or legacy) keeps the area price', () => {
    const plain = priceCustomLine(customLine('job 4411'), TEST_CONFIG);
    const legacy = priceCustomLine(customLine(JSON.stringify({ version: '3.0.0' })), TEST_CONFIG);
    const steel = DEFAULT_CUSTOM_FINISH_RATES.steel;
    expect(plain.unitPricePaise).toBe(steel.setupFeePaise + Math.round(900 * steel.ratePaisePerCm2));
    expect(legacy.unitPricePaise).toBe(plain.unitPricePaise);
    expect(plain.customPricing?.work).toBeNull();
  });

  it('more cut-outs cost more, in proportion to the extra work', () => {
    const plain = priceCustomLine(customLine(designRef(plateWithHoles(0))), TEST_CONFIG).unitPricePaise;
    const jali = priceCustomLine(customLine(designRef(plateWithHoles(200))), TEST_CONFIG);
    const steel = DEFAULT_CUSTOM_FINISH_RATES.steel;
    // 200 holes × 40 mm = 8 m + 1.2 m outline − 7.5 m included; 201 pierces − 40 included.
    const expectedExtra = Math.round(((9200 - (steel.includedCutMm + steel.includedCutMmPerM2 * 0.09)) / 1000) * steel.cutPaisePerMetre) + 161 * steel.piercePaise;
    expect(jali.unitPricePaise - plain).toBe(expectedExtra);
    expect(jali.customPricing).toMatchObject({ work: { pierces: 201, cutLengthMm: 9200 } });
  });

  it('refuses a damaged snapshot and a design larger than its stated size', () => {
    expectInvalidItem(() => priceCustomLine(customLine('{"production":{"contours":[{"role":"outer","d":"m0 0l1 1z"}]}}'), TEST_CONFIG), /damaged/);
    expectInvalidItem(() => priceCustomLine(customLine(designRef(plateWithHoles(1)), { widthMm: 200 }), TEST_CONFIG), /larger than its stated size/);
  });

  it('ignores any client-sent price: the checkout schema drops it and the server measures the contours', async () => {
    const dense = designRef(plateWithHoles(200));
    const parsed = checkoutRequestSchema.parse(checkoutRequest({ items: [{ ...customLine(dense), unitPrice: 1, unitPricePaise: 100, cutLengthMm: 0, pierces: 0 }] }));
    expect(parsed.items[0]).not.toHaveProperty('unitPrice');
    expect(parsed.items[0]).not.toHaveProperty('pierces');
    const store = seededStore();
    const res = await createCheckoutIntent(deps(store), parsed, null);
    const expected = priceCustomLine(customLine(dense), TEST_CONFIG).unitPricePaise;
    expect(res.pricing.items[0].unitPrice).toBe(expected / 100);
    const order = store.read(`orders/${res.orderId}`)!;
    expect((order.items as Array<Record<string, unknown>>)[0]).toMatchObject({ unitPricePaise: expected, customPricing: { work: { pierces: 201 } } });
  });

  it('a repeated checkout with the same design is the same order; a different design is not', async () => {
    const store = seededStore();
    const d = deps(store);
    const req = checkoutRequest({ items: [customLine(designRef(plateWithHoles(20)))] });
    const first = await createCheckoutIntent(d, req, null);
    expect(await createCheckoutIntent(d, checkoutRequest({ items: [customLine(designRef(plateWithHoles(20)))] }), null)).toEqual(first);
    await expect(createCheckoutIntent(d, checkoutRequest({ items: [customLine(designRef(plateWithHoles(21)))] }), null)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('the cart quote prices the pricing-only snapshot exactly as checkout prices the full design', async () => {
    const full = designRef(plateWithHoles(120, 250));
    const store = seededStore();
    const body = cartQuoteSchema.parse({ items: [{ ...customLine(pricingDesignRefFrom(full)), quantity: 3 }] });
    const q = await quoteCart(store, TEST_CONFIG, body, NOW);
    const checkoutLine = priceCustomLine({ ...customLine(full), quantity: 3 }, TEST_CONFIG);
    expect(q.lines[0]).toEqual({ unitPricePaise: checkoutLine.unitPricePaise, lineTotalPaise: checkoutLine.lineTotalPaise, quantity: 3 });
    expect(pricingDesignRef(plateWithHoles(1))).toContain('"production"');
  });

  it('settings change the server price and the shared quote the same way', () => {
    const overrides = { steel: { cutRatePerMetre: 60, pierceRate: 8 } };
    const config = mergeStoreConfig(TEST_CONFIG, { customPieces: overrides });
    const ref = designRef(plateWithHoles(150));
    const work = cutWorkFromDesignRef(ref);
    if (work.kind !== 'measured') throw new Error('unmeasured');
    const shared = quoteCustomPiece({ widthMm: 300, heightMm: 300, finish: 'steel', work: work.work }, resolveCustomFinishRates(overrides));
    expect('unitPricePaise' in shared && shared.unitPricePaise).toBe(priceCustomLine(customLine(ref), config).unitPricePaise);
  });
});

describe('design without its frozen contours', () => {
  it('refuses a studio document stripped of production instead of pricing it by area', async () => {
    const { cutWorkFromDesignRef } = await import('../lib/pricing/cutWork');
    expect(cutWorkFromDesignRef(JSON.stringify({ schemaVersion: 4, objects: [], plate: {} }))).toEqual({ kind: 'invalid', problem: 'malformed' });
    expect(cutWorkFromDesignRef('WhatsApp file IMG_2041.jpg')).toEqual({ kind: 'none' });
    expect(cutWorkFromDesignRef(JSON.stringify({ note: 'legacy' }))).toEqual({ kind: 'none' });
  });
});
