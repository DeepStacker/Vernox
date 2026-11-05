import { describe, expect, it } from 'vitest';
import { addShape, createDocument, getDesignOutlineForPreview, parseStudioDocument, serializeForOrder, toCartLine } from '@/lib/studio/api';

/**
 * A designer attaches a studio design to a proposal as the JSON `serializeForOrder` produces; the customer's
 * "Add to cart" turns that JSON back into a priced custom cart line. This is the round trip between the two.
 */
describe('custom design in a proposal', () => {
  it('survives the round trip from studio document to proposal JSON to cart line', () => {
    const doc = addShape(createDocument({ name: 'Plaque', plate: { shapeId: 'rectangle', widthMm: 300, heightMm: 200, cornerRadiusMm: 0 }, material: { finish: 'brass' } }), { shapeId: 'circle', widthMm: 60, heightMm: 60 });
    const outline = getDesignOutlineForPreview(doc);
    expect(outline.widthMm).toBeGreaterThan(0);
    expect(outline.svgPath.length).toBeGreaterThan(10);

    const designRef = serializeForOrder(doc);
    const line = toCartLine(parseStudioDocument(JSON.parse(designRef)));
    expect(line).toMatchObject({ productId: 'custom-bespoke', finish: 'brass', widthMm: outline.widthMm, heightMm: outline.heightMm, quantity: 1 });
    expect(line.unitPrice).toBeGreaterThan(0);
    expect(line.customDesignRef).toBeTruthy();
  });
});
