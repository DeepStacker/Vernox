// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { priceCustomLine } from '../../../../api/_lib/pricing';
import { defaultStoreConfig } from '../../../../api/_lib/storeConfig';
import { quoteCustomPiece, DEFAULT_CUSTOM_FINISH_RATES } from '@/lib/pricing/customPiece';
import { pricingDesignRefFrom } from '@/lib/pricing/cutWork';
import { CUSTOM_PRODUCT_ID } from '@/types/products';
import { applyTemplate, price, toCartLine } from '../api';
import { plateOutline } from '../compose';
import { createPath } from '../document';
import { computeGeometryResult } from '../geometryResult';
import { resolveCutRules } from '../materials';
import { defaultMarginMm, defaultPatternSizeMm, defaultWebMm, patternInfo, type PatternId } from '../patterns/catalog';
import { generatePattern } from '../patterns/generate';
import type { StudioDocument } from '../schema';
import { listTemplates } from '../templates/registry';
import { useDiskFonts } from './testFonts';

// Client and server must agree to the paisa for the same geometry: the studio measures the production it is about to
// freeze, the server measures the frozen copy inside customDesignRef (src/lib/pricing/cutWork.ts).
beforeAll(() => useDiskFonts());

const server = defaultStoreConfig({});

/** The price the server charges for a studio cart line (full design reference, as checkout receives it). */
function serverPrice(doc: StudioDocument) {
  const line = toCartLine(doc);
  const priced = priceCustomLine({ productId: CUSTOM_PRODUCT_ID, widthMm: line.widthMm, heightMm: line.heightMm, finish: line.finish, quantity: 1, customDesignRef: line.customDesignRef }, server);
  return { line, priced };
}

/** Today's size-only price (the formula before cutting work was priced). */
function areaOnly(doc: StudioDocument) {
  const p = price(doc);
  const q = quoteCustomPiece({ widthMm: p.widthMm, heightMm: p.heightMm, finish: doc.material.finish }, DEFAULT_CUSTOM_FINISH_RATES);
  if (!('unitPricePaise' in q)) throw new Error(q.problem);
  return q.unitPricePaise;
}

function withPattern(doc: StudioDocument, patternId: PatternId): StudioDocument {
  const rules = resolveCutRules(doc.material.finish, doc.material.thicknessMm);
  const web = defaultWebMm(rules.minFeatureMm);
  const r = generatePattern({
    patternId, region: plateOutline(doc.plate), sizeMm: defaultPatternSizeMm(patternInfo(patternId), web, rules.minHoleMm),
    webMm: web, marginMm: defaultMarginMm(doc.mounting, rules.minEdgeMm, web), minHoleMm: rules.minHoleMm, mode: 'cut',
  });
  if (r.ok === false) throw new Error(r.reason);
  // Replace the text with the fill (a jali panel in the house-name plate's size and finish).
  return { ...doc, objects: [createPath({ d: r.d, x: r.centre.x, y: r.centre.y, op: 'cut' })] };
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

describe('cut-work pricing: studio and server agree', () => {
  it('every template: same paise on both sides, and within 10% of the size-only price (drift report)', async () => {
    const rows: string[] = ['| Template | Size (mm) | Finish | Cut (m) | Pierces | Before | After | Change |', '| --- | --- | --- | --- | --- | --- | --- | --- |'];
    for (const t of listTemplates()) {
      const doc = await applyTemplate(t.id);
      const studio = price(doc);
      const { line, priced } = serverPrice(doc);
      if (!('unitPricePaise' in studio.quote)) throw new Error(`${t.id}: ${studio.quote.problem}`);
      expect(studio.quote.unitPricePaise, t.id).toBe(priced.unitPricePaise);
      expect(line.unitPrice * 100, t.id).toBe(priced.unitPricePaise);
      // The worker's figures (live price) match too.
      const geometry = computeGeometryResult(doc, resolveCutRules(doc.material.finish, doc.material.thicknessMm));
      expect(geometry.cutWork).toEqual(studio.work);

      const before = areaOnly(doc);
      const change = (priced.unitPricePaise - before) / before;
      expect(change, `${t.id} drifted ${Math.round(change * 100)}%`).toBeLessThanOrEqual(0.1);
      expect(change).toBeGreaterThanOrEqual(0);
      const w = studio.work!;
      rows.push(`| ${t.id} | ${studio.widthMm} × ${studio.heightMm} | ${doc.material.finish} | ${(w.cutLengthMm / 1000).toFixed(2)} | ${w.pierces} | ${rupees(before)} | ${rupees(priced.unitPricePaise)} | ${(change * 100).toFixed(1)}% |`);
    }
    console.log(`Template price drift (default rates):\n${rows.join('\n')}`);
  }, 60_000);

  it('a jali fill costs more than the plain plate, in proportion to the cutting work', async () => {
    const plate = await applyTemplate('house-name');
    const rows: string[] = [];
    let previous: { cut: number; price: number } | null = null;
    for (const patternId of ['hexagon', 'triangles'] as const) {
      const jali = withPattern(plate, patternId);
      const { priced } = serverPrice(jali);
      const before = areaOnly(jali);
      const w = priced.customPricing!.work!;
      expect(priced.unitPricePaise, patternId).toBeGreaterThan(before * 1.2);
      expect(priced.customPricing!.cuttingPaise + priced.customPricing!.holesPaise).toBeGreaterThan(0);
      if (previous) expect(w.cutLengthMm > previous.cut).toBe(priced.unitPricePaise > previous.price);
      previous = { cut: w.cutLengthMm, price: priced.unitPricePaise };
      rows.push(`${patternId} on ${jali.plate.widthMm} × ${jali.plate.heightMm} ${jali.material.finish}: ${(w.cutLengthMm / 1000).toFixed(1)} m, ${w.pierces} pierces — before ${rupees(before)}, after ${rupees(priced.unitPricePaise)}`);
    }
    console.log(`Jali examples:\n${rows.join('\n')}`);
  }, 60_000);

  it('a batch variant, the cart quote reference and checkout give the same price', async () => {
    const doc = withPattern(await applyTemplate('house-name'), 'circles');
    const rules = resolveCutRules(doc.material.finish, doc.material.thicknessMm);
    const geometry = computeGeometryResult(doc, rules, undefined, { withPricingRef: true });
    const { line, priced } = serverPrice(doc);
    const fromBatchRef = priceCustomLine({ productId: CUSTOM_PRODUCT_ID, ...geometry.size, finish: doc.material.finish, quantity: 1, customDesignRef: geometry.pricingRef }, server);
    const fromCartRef = priceCustomLine({ productId: CUSTOM_PRODUCT_ID, widthMm: line.widthMm, heightMm: line.heightMm, finish: line.finish, quantity: 1, customDesignRef: pricingDesignRefFrom(line.customDesignRef) }, server);
    expect(fromBatchRef.unitPricePaise).toBe(priced.unitPricePaise);
    expect(fromCartRef.unitPricePaise).toBe(priced.unitPricePaise);
  }, 60_000);
});
