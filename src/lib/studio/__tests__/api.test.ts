// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { exportProductionDXF } from '@/lib/exportCAM';
import {
  addImage, addText, applyTemplate, createDocument, exportDXF, getDesignOutlineForPreview, price, serializeForOrder,
  setTemplateField, toCartLine, validate, MAX_DESIGN_REF_CHARS,
} from '../api';
import { importDxf } from '../import/importVector';
import { listTemplates } from '../templates/registry';
import { traceImage } from '../trace/traceCore';
import { pathBounds } from '../geometry/path';
import { useDiskFonts } from './testFonts';

beforeAll(() => useDiskFonts());

/** Synthetic image: black square ring on white (a frame with a hole). */
function ringImage(size = 120) {
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const inOuter = x >= 20 && x < 100 && y >= 20 && y < 100;
    const inInner = x >= 45 && x < 75 && y >= 45 && y < 75;
    if (inOuter && !inInner) { const i = (y * size + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; }
  }
  return { width: size, height: size, data };
}

describe('headless studio API', () => {
  it('every registered template builds an orderable design', async () => {
    expect(listTemplates().length).toBeGreaterThanOrEqual(6);
    for (const t of listTemplates()) {
      const doc = await applyTemplate(t.id);
      const { analysis } = validate(doc);
      const blocking = analysis.issues.filter(i => i.severity === 'error').map(i => i.rule);
      // Loose pieces are fixed by auto-bridges on frame/no-plate templates; solid plates may need the one-click fix.
      expect(blocking.filter(r => r !== 'loose-pieces'), t.id).toEqual([]);
    }
  });

  it('template fields update bound text and keep the design valid', async () => {
    let doc = await applyTemplate('house-name', { name: 'The Iyers' }, { finish: 'brass' });
    expect(doc.material.finish).toBe('brass');
    const before = doc.objects.find(o => o.kind === 'text' && o.binding === 'name');
    doc = await setTemplateField(doc, 'name', 'The Iyer Family');
    const after = doc.objects.find(o => o.kind === 'text' && o.binding === 'name');
    expect(after && after.kind === 'text' && after.text).toBe('The Iyer Family');
    expect(after?.kind === 'text' && after.outline).toBeTruthy();
    expect(after?.x).toBe(before?.x);
  });

  it('produces a cart line priced like the server, within the order size limit', async () => {
    const doc = await applyTemplate('office-plaque');
    const line = toCartLine(doc, 2);
    expect(line.productId).toBe('custom-bespoke');
    expect(line.quantity).toBe(2);
    expect(line.customDesignRef.length).toBeLessThan(MAX_DESIGN_REF_CHARS);
    expect((line.customDesignThumb ?? '').length).toBeLessThanOrEqual(15_000);
    const p = price(doc);
    expect(line.widthMm).toBe(p.widthMm);
    expect('unitPricePaise' in p.quote && p.quote.unitPricePaise / 100).toBe(line.unitPrice);
    const stored = JSON.parse(line.customDesignRef);
    expect(stored.production.contours.length).toBeGreaterThan(4);
    // Production export uses the frozen geometry.
    expect(exportProductionDXF(stored.production)).toContain('AC1009');
  });

  it('adds Devanagari text and exports DXF', async () => {
    const doc = await addText(createDocument(), { text: 'स्वागत', fontId: 'yatra-one', sizeMm: 40 });
    expect(doc.objects[0].kind === 'text' && doc.objects[0].outline).toBeTruthy();
    expect(exportDXF(doc)).toMatch(/1_CUT_INNER/);
    expect(serializeForOrder(doc).length).toBeLessThan(MAX_DESIGN_REF_CHARS);
  });

  it('traces an image into a ring with a hole, despeckled', async () => {
    const r = traceImage(ringImage(), { threshold: null, smoothing: 0.3, despeckle: 16, invert: false });
    const b = pathBounds(r.d)!;
    expect(b.maxX - b.minX).toBeGreaterThan(75);
    expect(b.maxX - b.minX).toBeLessThan(85);
    expect((r.d.match(/M/g) ?? []).length).toBe(2);
    const doc = await addImage(createDocument({ mounting: { preset: 'none' } }), ringImage(), { widthMm: 100 });
    const obj = doc.objects[0];
    expect(obj.kind).toBe('path');
    const ob = pathBounds(obj.kind === 'path' ? obj.d : '')!;
    expect(ob.maxX - ob.minX).toBeCloseTo(100, 0);
  });

  it('exposes the outline for the wall preview', async () => {
    const doc = await applyTemplate('om-mandala');
    const o = getDesignOutlineForPreview(doc);
    expect(o.widthMm).toBeGreaterThan(250);
    expect(o.svgPath.startsWith('M')).toBe(true);
  });

  it('imports DXF entities (polyline with bulge, circle, lines) in millimetres', async () => {
    const dxf = [
      '0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '5', '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'CIRCLE', '8', '0', '10', '0', '20', '0', '30', '0', '40', '1',
      '0', 'LINE', '8', '0', '10', '3', '20', '0', '30', '0', '11', '5', '21', '0', '31', '0',
      '0', 'LINE', '8', '0', '10', '5', '20', '0', '30', '0', '11', '5', '21', '2', '31', '0',
      '0', 'LINE', '8', '0', '10', '5', '20', '2', '30', '0', '11', '3', '21', '0', '31', '0',
      '0', 'ENDSEC', '0', 'EOF',
    ].join('\n');
    const v = await importDxf(dxf);
    // Units are cm ($INSUNITS 5): circle spans -1…1 cm, the line triangle reaches x = 5, y = 2 cm.
    expect(v.widthMm).toBeCloseTo(60, 0);
    expect(v.heightMm).toBeCloseTo(30, 0);
    expect((v.d.match(/M/g) ?? []).length).toBe(2);
  });
});
