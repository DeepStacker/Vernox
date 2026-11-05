// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { area, circleRing, difference, normalise, offset, pieces, union } from '../geometry/clipper';
import { pathToRings, ringsBounds } from '../geometry/path';
import { composeDocument, connectLoosePieces } from '../compose';
import { createDocument, createHole, createShape } from '../document';
import { analyzeDocument } from '../manufacturability';
import { resolveCutRules } from '../materials';
import { booleanObjects, offsetOutline } from '../operations';

const square = (x: number, y: number, s: number) => pathToRings(`M${x} ${y}H${x + s}V${y + s}H${x}Z`);
const rules = resolveCutRules('black_patina', 2);

describe('booleans and offsets (Clipper2)', () => {
  it('unions, subtracts and offsets regions', () => {
    expect(Math.abs(area(union(square(0, 0, 10), square(5, 0, 10))))).toBeCloseTo(150, 3);
    expect(Math.abs(area(difference(square(0, 0, 10), square(5, 0, 10))))).toBeCloseTo(50, 3);
    // Rounded offset: 100² + perimeter·5 + π·5²
    expect(Math.abs(area(offset(square(0, 0, 100), 5, 'round')))).toBeCloseTo(10000 + 400 * 5 + Math.PI * 25, 0);
  });

  it('normalises opposite windings so overlapping objects do not cancel', () => {
    const cw = square(0, 0, 10);
    const ccw = [square(5, 5, 10)[0].slice().reverse()];
    expect(Math.abs(area(union(normalise(cw), normalise(ccw))))).toBeCloseTo(175, 3);
  });

  it('booleanObjects and offsetOutline produce path objects', () => {
    const a = createShape({ shapeId: 'rectangle', widthMm: 20, heightMm: 20, x: 10, y: 10 });
    const b = createShape({ shapeId: 'rectangle', widthMm: 20, heightMm: 20, x: 20, y: 10 });
    const u = booleanObjects([a, b], 'union')!;
    expect(u.kind).toBe('path');
    const ub = ringsBounds(pathToRings(u.d))!;
    expect(ub.maxX - ub.minX).toBeCloseTo(30, 2);
    expect(u.x).toBeCloseTo(15, 2);
    const o = offsetOutline(a, 5)!;
    const ob = ringsBounds(pathToRings(o.d))!;
    expect(ob.maxX - ob.minX).toBeCloseTo(30, 1);
  });
});

describe('island detection and bridges', () => {
  it('finds the counter of a cut-out ring as a loose piece', () => {
    const doc = createDocument({
      plate: { style: 'solid', shapeId: 'rectangle', widthMm: 200, heightMm: 200, cornerRadiusMm: 0 },
      mounting: { preset: 'none' },
      objects: [
        // A ring: big circle minus small circle, cut out of the plate → the inner disc falls out.
        { id: 'ring', kind: 'path', op: 'cut', x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1,
          d: 'M50 0A50 50 0 1 1 -50 0A50 50 0 1 1 50 0ZM30 0A30 30 0 1 0 -30 0A30 30 0 1 0 30 0Z' },
      ],
    });
    doc.manufacturing.autoBridges = false;
    const { composition, analysis } = analyzeDocument(doc, rules);
    expect(composition.pieces).toHaveLength(2);
    const loose = analysis.issues.find(i => i.rule === 'loose-pieces')!;
    expect(loose.severity).toBe('error');
    expect(loose.fix).toBe('add-bridges');
    expect(analysis.orderable).toBe(false);

    const bridged = analyzeDocument({ ...doc, manufacturing: { autoBridges: true } }, rules);
    expect(bridged.composition.pieces).toHaveLength(1);
    // Enclosed counter → two opposite bridges.
    expect(bridged.composition.bridges.length).toBeGreaterThanOrEqual(2);
    expect(bridged.analysis.issues.some(i => i.rule === 'loose-pieces')).toBe(false);
  });

  it('welds free-standing pieces into one part', () => {
    const material = [...square(0, 0, 20), ...square(40, 0, 20), ...square(0, 50, 20)];
    expect(pieces(material)).toHaveLength(3);
    const { material: joined, bridges } = connectLoosePieces(material, 3);
    expect(pieces(joined)).toHaveLength(1);
    expect(bridges.length).toBeGreaterThan(0);
  });
});

describe('manufacturability rules', () => {
  it('flags metal webs thinner than the minimum feature', () => {
    const doc = createDocument({
      plate: { style: 'solid', shapeId: 'rectangle', widthMm: 200, heightMm: 120, cornerRadiusMm: 0 },
      mounting: { preset: 'none' },
      objects: [
        createShape({ shapeId: 'rectangle', widthMm: 60, heightMm: 60, x: 60, y: 60 }),
        // 1 mm web between the two cut-outs (min web for 2 mm steel is 2 mm).
        createShape({ shapeId: 'rectangle', widthMm: 60, heightMm: 60, x: 121, y: 60 }),
      ],
    });
    const { analysis } = analyzeDocument(doc, rules);
    const thin = analysis.issues.find(i => i.rule === 'thin-feature');
    expect(thin?.severity).toBe('warning');
    expect(thin?.at?.minX).toBeGreaterThan(85);
    expect(thin?.at?.maxX).toBeLessThan(95);
  });

  it('flags holes below the minimum hole size and oversize parts', () => {
    const doc = createDocument({
      plate: { style: 'solid', shapeId: 'rectangle', widthMm: 3200, heightMm: 200 },
      mounting: { preset: 'none' },
      objects: [createHole({ x: 100, y: 100, diameterMm: 1 })],
    });
    const rules = resolveCutRules('black_patina', 2);
    const { analysis } = analyzeDocument(doc, rules);
    expect(analysis.issues.map(i => i.rule)).toEqual(expect.arrayContaining(['small-hole', 'too-large']));
    expect(analysis.orderable).toBe(false);
  });

  it('places mounting holes inside a round plate', () => {
    const doc = createDocument({ plate: { style: 'solid', shapeId: 'circle', widthMm: 300, heightMm: 300 }, mounting: { preset: 'corners-4', insetMm: 15, diameterMm: 5 } });
    const c = composeDocument(doc, rules);
    expect(c.mountingHoles).toHaveLength(4);
    for (const h of c.mountingHoles) {
      // Every hole sits fully inside the circle with edge clearance.
      expect(Math.hypot(h.x - 150, h.y - 150) + h.r + rules.minEdgeMm).toBeLessThanOrEqual(150 + 0.5);
    }
    expect(c.pieces[0].holes).toHaveLength(4);
  });

  it('auto-bridges never shrink the part below the original material', () => {
    const plate = square(0, 0, 100);
    const cut = [circleRing(50, 50, 30), circleRing(50, 50, 15).reverse()];
    const mat = difference(plate, normalise(cut));
    const { material } = connectLoosePieces(mat, 3);
    expect(Math.abs(area(material))).toBeGreaterThan(Math.abs(area(mat)));
  });
});
