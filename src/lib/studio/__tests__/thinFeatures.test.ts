// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { addPath, addText, validate } from '../api';
import { createDocument } from '../document';
import { useDiskFonts } from './testFonts';

beforeAll(() => useDiskFonts());

const thinIssues = (doc: ReturnType<typeof createDocument>) => validate(doc).analysis.issues.filter(i => i.rule === 'thin-feature');
const rect = (w: number, h: number) => `M${-w / 2} ${-h / 2}L${w / 2} ${-h / 2}L${w / 2} ${h / 2}L${-w / 2} ${h / 2}Z`;

describe('thin metal check: tapering tips', () => {
  // Cut-out lettering on 2 mm black steel (minimum web 2 mm): the metal wedge inside M, N, W, V ends in a point.
  for (const text of ['Vivek', 'AARAV', 'Welcome', 'MWNV', 'Nawaz', 'vwmn']) {
    it(`"${text}" cut out of the plate has no thin-metal issue`, async () => {
      const doc = await addText(createDocument({ plate: { widthMm: 400, heightMm: 120 } }), { text, fontId: 'poppins-semibold', sizeMm: 24 });
      expect(thinIssues(doc)).toEqual([]);
    });
  }

  it('still flags a 1 mm wide strip of metal', () => {
    // A solid plate with two slits leaves a 1 mm strip between them.
    let doc = createDocument({ plate: { widthMm: 200, heightMm: 100, cornerRadiusMm: 0 }, mounting: { preset: 'none' } });
    doc = addPath(doc, { d: rect(80, 10), x: 100, y: 45 });
    doc = addPath(doc, { d: rect(80, 10), x: 100, y: 56 });
    expect(thinIssues(doc)).toHaveLength(1);
  });

  it('still flags a thin neck joining two larger regions', () => {
    // Two big cut-outs separated by a 1 mm neck of plate: metal on both sides stays wide.
    let doc = createDocument({ plate: { widthMm: 200, heightMm: 100, cornerRadiusMm: 0 }, mounting: { preset: 'none' } });
    doc = addPath(doc, { d: rect(80, 60), x: 50, y: 50 });
    doc = addPath(doc, { d: rect(80, 60), x: 131, y: 50 });
    expect(thinIssues(doc)).toHaveLength(1);
  });

  it('still flags a thin stub that does not taper', () => {
    // A 1 mm wide, 6 mm long tab of plate between two cut-outs, open at one end.
    let doc = createDocument({ plate: { widthMm: 200, heightMm: 100, cornerRadiusMm: 0 }, mounting: { preset: 'none' } });
    doc = addPath(doc, { d: 'M-30 -20L-0.5 -20L-0.5 6L0.5 6L0.5 -20L30 -20L30 20L-30 20Z', x: 100, y: 50 });
    expect(thinIssues(doc).length).toBeGreaterThan(0);
  });

  it('reports a long needle (a very acute wedge) as fragile', () => {
    let doc = createDocument({ plate: { widthMm: 200, heightMm: 100, cornerRadiusMm: 0 }, mounting: { preset: 'none' } });
    // Metal wedge 40 mm long narrowing to a point: about 5 degrees.
    doc = addPath(doc, { d: 'M-40 -20L40 -20L40 20L-40 20L-40 1.75L0 0L-40 -1.75Z', x: 100, y: 50 });
    expect(thinIssues(doc).length).toBeGreaterThan(0);
  });
});
