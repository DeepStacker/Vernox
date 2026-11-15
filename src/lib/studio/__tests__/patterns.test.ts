// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validate } from '../api';
import { createDocument, createPath, createShape } from '../document';
import { plateOutline } from '../compose';
import { area, union } from '../geometry/clipper';
import { pathToRings, type Bounds } from '../geometry/path';
import { resolveCutRules } from '../materials';
import { defaultMarginMm, defaultPatternSizeMm, defaultWebMm, MAX_PATTERN_CELLS, PATTERNS, patternInfo, type PatternId } from '../patterns/catalog';
import { patternCells } from '../patterns/cells';
import { objectFillTarget, plateFillTarget } from '../patterns/region';
import { generatePattern, type PatternRequest } from '../patterns/generate';
import type { StudioDocument } from '../schema';

function requestFor(doc: StudioDocument, patternId: PatternId, mode: 'cut' | 'add' = 'cut', overrides: Partial<PatternRequest> = {}): PatternRequest {
  const rules = resolveCutRules(doc.material.finish, doc.material.thicknessMm);
  const web = defaultWebMm(rules.minFeatureMm);
  return {
    patternId,
    region: plateOutline(doc.plate),
    sizeMm: defaultPatternSizeMm(patternInfo(patternId), web, rules.minHoleMm),
    webMm: web,
    marginMm: defaultMarginMm(doc.mounting, rules.minEdgeMm, web),
    minHoleMm: rules.minHoleMm,
    mode,
    ...overrides,
  };
}

function filled(doc: StudioDocument, req: PatternRequest): StudioDocument {
  const r = generatePattern(req);
  if (r.ok === false) throw new Error(`pattern failed: ${r.reason}`);
  return { ...doc, objects: [createPath({ d: r.d, x: r.centre.x, y: r.centre.y, op: req.mode === 'cut' ? 'cut' : 'add' })] };
}

const issues = (doc: StudioDocument) => validate(doc).analysis.issues.map(i => `${i.rule}(${JSON.stringify(i.params ?? {})})`);

describe('pattern cells', () => {
  const box: Bounds = { minX: 0, minY: 0, maxX: 120, maxY: 90 };
  for (const p of PATTERNS) {
    it(`${p.id}: nominal cells never overlap (so the inset guarantees the web)`, () => {
      const cells = patternCells(p.id, box, 24);
      expect(cells.length).toBeGreaterThan(4);
      const sum = cells.reduce((a, c) => a + Math.abs(area([c])), 0);
      const merged = Math.abs(area(union(cells)));
      // Touching cells are fine, overlapping ones would make the union smaller than the sum.
      expect(merged).toBeGreaterThan(sum * 0.999);
    });
  }
});

describe('pattern fill', () => {
  const finishes: [string, number][] = [['black_patina', 2], ['brass', 1.5], ['stainless', 3], ['copper', 2]];
  for (const p of PATTERNS) {
    for (const [finish, thicknessMm] of finishes) {
      it(`${p.id} on ${finish} ${thicknessMm} mm: defaults pass every manufacturability check`, () => {
        const doc = createDocument({ plate: { widthMm: 400, heightMm: 300 }, material: { finish, thicknessMm } });
        const out = filled(doc, requestFor(doc, p.id));
        expect(issues(out)).toEqual([]);
        expect(generatePattern(requestFor(doc, p.id))).toMatchObject({ ok: true });
      });
    }

    it(`${p.id}: lattice mode on a frame plate is also clean`, () => {
      const doc = createDocument({ plate: { style: 'none', widthMm: 300, heightMm: 200, cornerRadiusMm: 10 }, material: { finish: 'black_patina', thicknessMm: 2 } });
      const out = filled(doc, requestFor(doc, p.id, 'add', { marginMm: 12 }));
      expect(issues(out)).toEqual([]);
    });
  }

  it('keeps the margin clear of the plate edge', () => {
    const doc = createDocument({ plate: { widthMm: 400, heightMm: 300 } });
    const r = generatePattern(requestFor(doc, 'hexagon', 'cut', { marginMm: 40 }));
    if (r.ok === false) throw new Error(r.reason);
    const rings = pathToRings(r.d, 0.05);
    const xs = rings.flat().map(p => p.x + r.centre.x), ys = rings.flat().map(p => p.y + r.centre.y);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(40 - 0.2);
    expect(Math.max(...xs)).toBeLessThanOrEqual(360 + 0.2);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(40 - 0.2);
    expect(Math.max(...ys)).toBeLessThanOrEqual(260 + 0.2);
  });

  it('refuses a fill with too many cells and a region with no room', () => {
    const doc = createDocument({ plate: { widthMm: 900, heightMm: 600 } });
    const dense = generatePattern(requestFor(doc, 'hexagon', 'cut', { sizeMm: 8, webMm: 2 }));
    expect(dense).toMatchObject({ ok: false, reason: 'too-many-cells' });
    expect((dense as { cells: number }).cells).toBeGreaterThan(MAX_PATTERN_CELLS);
    const none = generatePattern(requestFor(createDocument({ plate: { widthMm: 40, heightMm: 40 } }), 'hexagon', 'cut', { marginMm: 25 }));
    expect(none).toMatchObject({ ok: false, reason: 'no-room' });
  });

  it('is fast on a 900 x 600 mm panel at the default size', () => {
    const doc = createDocument({ plate: { widthMm: 900, heightMm: 600 } });
    for (const id of ['hexagon', 'circles', 'scales', 'arabesque', 'waves'] as const) {
      const t0 = performance.now();
      const r = generatePattern(requestFor(doc, id));
      const ms = performance.now() - t0;
      expect(r.ok, id).toBe(true);
      expect(ms, `${id} took ${Math.round(ms)} ms`).toBeLessThan(4000);
    }
  });
});

describe('fill targets', () => {
  it('a frame plate gets a lattice that welds into the border (one piece, no issues)', () => {
    const doc = createDocument({ plate: { style: 'frame', widthMm: 300, heightMm: 200, borderMm: 15, cornerRadiusMm: 0 }, mounting: { preset: 'none' } });
    doc.manufacturing.autoBridges = false;
    const target = plateFillTarget(doc.plate);
    expect(target.mode).toBe('add');
    const out = filled(doc, requestFor(doc, 'hexagon', 'add', { region: target.region, marginMm: 6 }));
    expect(validate(out).composition.pieces).toHaveLength(1);
    expect(issues(out)).toEqual([]);
  });

  it('a solid plate gets holes; no plate gets a perforated panel', () => {
    expect(plateFillTarget(createDocument().plate).mode).toBe('cut');
    expect(plateFillTarget(createDocument({ plate: { style: 'none' } }).plate).mode).toBe('add');
  });

  it('fills a selected shape: holes only inside it, the shape stays as solid metal', () => {
    let doc = createDocument({ plate: { style: 'none', widthMm: 300, heightMm: 300 }, mounting: { preset: 'none' } });
    doc.manufacturing.autoBridges = false;
    const shape = createShape({ shapeId: 'circle', widthMm: 200, heightMm: 200, x: 150, y: 150, op: 'add' });
    const target = objectFillTarget(shape);
    expect(target.mode).toBe('cut');
    const r = generatePattern(requestFor(doc, 'circles', 'cut', { region: target.region, marginMm: 8 }));
    if (r.ok === false) throw new Error(r.reason);
    doc = { ...doc, objects: [shape, createPath({ d: r.d, x: r.centre.x, y: r.centre.y, op: 'cut' })] };
    const out = validate(doc);
    expect(out.analysis.issues).toEqual([]);
    expect(out.composition.pieces).toHaveLength(1);
    expect(out.composition.pieces[0].holes.length).toBeGreaterThan(10);
  });
});
