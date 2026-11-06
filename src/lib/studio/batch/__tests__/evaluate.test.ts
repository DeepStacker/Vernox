// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CUSTOM_FINISH_RATES } from '@/lib/pricing/customPiece';
import { addText, applyTemplate, price, toCartLine } from '../../api';
import { useDiskFonts } from '../../__tests__/testFonts';
import { BatchEvaluator, evaluateVariant, materialiseVariant, type BatchContext, type VariantEval } from '../evaluate';
import { GeometryRunner } from '../geometryRunner';
import { checkRows, groupVariants } from '../plan';

beforeAll(() => useDiskFonts());

const ctx: BatchContext = { rates: DEFAULT_CUSTOM_FINISH_RATES };

/** A 300 x 120 mm plate with one text, bound to {name}. */
async function plateWithText() {
  let doc = await applyTemplate('house-name', {}, { widthMm: 300, heightMm: 120 });
  doc = { ...doc, objects: doc.objects.filter(o => o.kind !== 'text'), template: undefined };
  doc = await addText(doc, { text: 'Placeholder', sizeMm: 30 });
  const text = doc.objects.find(o => o.kind === 'text')!;
  return { doc, id: text.id };
}

describe('batch evaluation', () => {
  it('prices each variant with the shared quote and previews it', async () => {
    const { doc, id } = await plateWithText();
    const runner = new GeometryRunner();
    const ev = await evaluateVariant(doc, { [id]: 'Room 12' }, ctx, runner);
    expect(ev.state).toBe('ok');
    expect(ev.previewD).toBeTruthy();
    expect(ev.viewBox).toMatch(/^[\d.-]+ [\d.-]+ [\d.]+ [\d.]+$/);
    // The batch quote equals the single-design quote the cart line carries.
    const variantDoc = await materialiseVariant(doc, { [id]: 'Room 12' });
    const single = price(variantDoc, ctx);
    expect('problem' in single.quote).toBe(false);
    expect(ev.unitPricePaise).toBe('problem' in single.quote ? undefined : single.quote.unitPricePaise);
    expect(toCartLine(variantDoc, 7, ctx)).toMatchObject({ quantity: 7, customDesignRef: expect.stringContaining('Room 12') });
    runner.dispose();
  });

  it('flags text that is too long for the plate', async () => {
    const { doc, id } = await plateWithText();
    const runner = new GeometryRunner();
    const ev = await evaluateVariant(doc, { [id]: 'Conference Room Number Twelve' }, ctx, runner);
    expect(ev.state).toBe('error');
    expect(ev.problems[0]).toMatchObject({ code: 'too-long' });
    runner.dispose();
  });

  it('evaluates distinct designs once and reports every result', async () => {
    const { doc, id } = await plateWithText();
    const checks = checkRows(['name', 'qty'], [['A1', '2'], ['A2', ''], ['A1', '3']], { [id]: '{name}' });
    const variants = groupVariants(checks);
    expect(variants).toHaveLength(2);
    const got = new Map<string, VariantEval>();
    const evaluator = new BatchEvaluator({ doc, variants, ctx, onResult: (k, r) => got.set(k, r) });
    evaluator.setPriority([variants[1].key]);
    await evaluator.run();
    expect([...got.keys()][0]).toBe(variants[1].key); // visible rows first
    expect(got.size).toBe(2);
    expect([...got.values()].every(r => r.state === 'ok')).toBe(true);
    evaluator.dispose();
  });
});
