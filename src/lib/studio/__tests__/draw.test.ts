// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { objectRings } from '../compose';
import { createDocument, createPath, createShape } from '../document';
import { drawnPathObject, editedPathPatch } from '../draw/objects';
import { fitCubics, simplifyRdp } from '../draw/curveFit';
import { freehandToSubPath } from '../draw/freehand';
import { EMPTY_PEN, penDown, penFinish, penMove, penUndoPoint, penUp, type PenDraft } from '../draw/pen';
import {
  cubicAt, deleteNode, getNode, insertNode, moveHandle, nearestSegment, parsePathData, segmentCubic, serializePath, setNodeType,
  type SubPath,
} from '../draw/pathModel';
import { area, normalise } from '../geometry/clipper';
import { applyMatrix, invertMatrix, pathToRings, placementMatrix, ringsBounds, type Pt } from '../geometry/path';
import { analyzeDocument } from '../manufacturability';
import { resolveCutRules } from '../materials';
import { convertToPath } from '../operations';
import type { PathObject } from '../schema';

/** Same geometry: equal flattened outlines (bounds and filled area). */
function expectSameShape(a: string, b: string) {
  const ra = pathToRings(a, 0.01), rb = pathToRings(b, 0.01);
  const ba = ringsBounds(ra)!, bb = ringsBounds(rb)!;
  for (const k of ['minX', 'minY', 'maxX', 'maxY'] as const) expect(ba[k]).toBeCloseTo(bb[k], 2);
  const aa = Math.abs(area(normalise(ra))), ab = Math.abs(area(normalise(rb)));
  expect(Math.abs(aa - ab) / Math.max(ab, 1)).toBeLessThan(1e-3);
}

describe('path model', () => {
  it('round-trips lines, cubics, quadratics, arcs and several sub-paths', () => {
    const d = 'M0 0L40 0C50 0 60 10 60 20Q60 40 40 40H0Z M100 100 A20 20 0 1 1 140 100 A20 20 0 1 1 100 100Z M200 0L220 30';
    const p = parsePathData(d);
    expect(p).toHaveLength(3);
    expect(p[0].closed).toBe(true);
    expect(p[2].closed).toBe(false);
    const again = serializePath(p);
    expectSameShape(d, again);
    // Serialising a parsed serialisation is stable.
    expect(serializePath(parsePathData(again))).toBe(again);
  });

  it('merges an explicit curved closing segment into the first anchor', () => {
    const p = parsePathData('M0 0C10 -10 30 -10 40 0C30 10 10 10 0 0Z');
    expect(p[0].nodes).toHaveLength(2);
    expect(p[0].nodes[0].in).toEqual({ x: 10, y: 10 });
    expectSameShape(serializePath(p), 'M0 0C10 -10 30 -10 40 0C30 10 10 10 0 0Z');
  });

  it('classifies collinear handles as smooth and others as corners', () => {
    const p = parsePathData('M0 0C0 -10 20 -10 20 0C20 10 40 10 40 0L60 20');
    expect(p[0].nodes[1].type).toBe('smooth');
    expect(p[0].nodes[2].type).toBe('corner');
  });

  it('adds a point on a curve without changing its shape', () => {
    const d = 'M0 0C0 -40 60 -40 60 0C60 40 0 40 0 0Z';
    const p = parsePathData(d);
    const before = segmentCubic(p[0], 0);
    const { path, ref } = insertNode(p, 0, 0, 0.3);
    expect(path[0].nodes).toHaveLength(3);
    expect(ref).toEqual({ sub: 0, index: 1 });
    expect(getNode(path, ref)?.x).toBeCloseTo(cubicAt(before, 0.3).x, 6);
    // The two halves trace the original curve.
    const left = segmentCubic(path[0], 0), right = segmentCubic(path[0], 1);
    for (const t of [0.25, 0.5, 0.75]) {
      const a = cubicAt(left, t), b = cubicAt(before, 0.3 * t);
      expect(a.x).toBeCloseTo(b.x, 6);
      expect(a.y).toBeCloseTo(b.y, 6);
      const c = cubicAt(right, t), e = cubicAt(before, 0.3 + 0.7 * t);
      expect(c.x).toBeCloseTo(e.x, 6);
      expect(c.y).toBeCloseTo(e.y, 6);
    }
    expectSameShape(serializePath(path), d);
  });

  it('adds a corner point on a straight segment and finds the nearest segment', () => {
    const p = parsePathData('M0 0L100 0L100 100Z');
    const hit = nearestSegment(p, { x: 30, y: 2 })!;
    expect(hit.seg).toBe(0);
    expect(hit.t).toBeCloseTo(0.3, 3);
    expect(hit.dist).toBeCloseTo(2, 3);
    const { path } = insertNode(p, hit.sub, hit.seg, hit.t);
    expect(path[0].nodes[1].x).toBeCloseTo(30, 4);
    expect(path[0].nodes[1]).toMatchObject({ y: 0, type: 'corner' });
    expect(path[0].nodes[1].in).toBeUndefined();
  });

  it('deletes points and drops a sub-path left with one point', () => {
    const p = parsePathData('M0 0L10 0L10 10L0 10Z M50 50L60 60');
    const one = deleteNode(p, { sub: 0, index: 2 });
    expect(one[0].nodes).toHaveLength(3);
    expect(p[0].nodes).toHaveLength(4); // immutable
    const two = deleteNode(one, { sub: 1, index: 0 });
    expect(two).toHaveLength(1);
  });

  it('toggles corner ⇄ smooth and keeps smooth handles collinear when one is dragged', () => {
    const p = parsePathData('M0 0L50 50L100 0');
    const smooth = setNodeType(p, { sub: 0, index: 1 }, 'smooth');
    const n = smooth[0].nodes[1];
    expect(n.type).toBe('smooth');
    expect(n.in!.y).toBeCloseTo(50, 6); // tangent parallel to the neighbours' chord
    expect(n.out!.y).toBeCloseTo(50, 6);
    const dragged = moveHandle(smooth, { sub: 0, index: 1 }, 'out', { x: 50, y: 80 });
    const m = dragged[0].nodes[1];
    expect(m.in!.x).toBeCloseTo(50, 6);
    expect(m.in!.y).toBeLessThan(50);
    const corner = setNodeType(smooth, { sub: 0, index: 1 }, 'corner');
    expect(corner[0].nodes[1].in).toBeUndefined();
    expect(serializePath(corner)).toBe('M0 0L50 50L100 0');
  });

  it('inverts placement matrices', () => {
    const m = placementMatrix(10, 20, 33, 2, -0.5);
    const inv = invertMatrix(m)!;
    const p = applyMatrix(inv, applyMatrix(m, { x: 3, y: -7 }));
    expect(p.x).toBeCloseTo(3, 9);
    expect(p.y).toBeCloseTo(-7, 9);
    expect(invertMatrix([0, 0, 0, 0, 1, 1])).toBeNull();
  });
});

describe('freehand smoothing', () => {
  const circle = (n: number, r: number, jitter = 0): Pt[] =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const j = jitter * Math.sin(i * 7.3);
      return { x: (r + j) * Math.cos(a), y: (r + j) * Math.sin(a) };
    });

  it('RDP drops collinear points', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i, y: i * 0.5 }));
    expect(simplifyRdp(line, 0.01)).toHaveLength(2);
  });

  it('fits few cubics that stay within tolerance', () => {
    const pts = circle(200, 50).slice(0, 120);
    const curves = fitCubics(pts, 0.2);
    expect(curves.length).toBeGreaterThan(0);
    expect(curves.length).toBeLessThan(12);
    // Every curve sample is close to the circle.
    for (const c of curves) for (let t = 0; t <= 1; t += 0.1) {
      const p = cubicAt(c, t);
      expect(Math.abs(Math.hypot(p.x, p.y) - 50)).toBeLessThan(0.6);
    }
    expect(curves[0][0]).toEqual(pts[0]);
    expect(curves[curves.length - 1][3]).toEqual(pts[pts.length - 1]);
  });

  it('auto-closes a stroke that ends near its start and smooths jitter', () => {
    const pts = [...circle(150, 40, 0.3), { x: 40.5, y: -0.5 }];
    const sub = freehandToSubPath(pts, { toleranceMm: 1, closeDistanceMm: 3 })!;
    expect(sub.closed).toBe(true);
    expect(sub.nodes.length).toBeLessThan(20);
    const b = ringsBounds(pathToRings(serializePath([sub])))!;
    expect(b.maxX - b.minX).toBeGreaterThan(78);
    expect(b.maxX - b.minX).toBeLessThan(82);
  });

  it('keeps an open stroke open and ignores taps', () => {
    const line = Array.from({ length: 30 }, (_, i) => ({ x: i * 2, y: Math.sin(i / 3) * 5 }));
    expect(freehandToSubPath(line, { toleranceMm: 0.5, closeDistanceMm: 3 })?.closed).toBe(false);
    expect(freehandToSubPath([{ x: 0, y: 0 }, { x: 0.1, y: 0 }], { toleranceMm: 0.5, closeDistanceMm: 3 })).toBeNull();
  });
});

describe('pen tool', () => {
  const click = (d: PenDraft, x: number, y: number) => {
    const s = penDown(d, { x, y }, 2);
    return { draft: penUp(s.draft), result: s.result };
  };

  it('click, click-drag, click on the first point → closed path with a smooth point', () => {
    let d = click(EMPTY_PEN, 0, 0).draft;
    let s = penDown(d, { x: 50, y: 0 }, 2);
    d = penUp(penMove(s.draft, { x: 60, y: 20 }, 1));
    expect(d.nodes[1]).toMatchObject({ type: 'smooth', out: { x: 60, y: 20 }, in: { x: 40, y: -20 } });
    d = click(d, 50, 60).draft;
    s = penDown(d, { x: 1, y: 1 }, 2);
    expect(s.draft.nodes).toHaveLength(0);
    expect(s.result?.closed).toBe(true);
    expect(s.result?.nodes).toHaveLength(3);
  });

  it('clicking the last point (double-click) or Enter finishes an open path; Backspace removes a point', () => {
    let d = click(EMPTY_PEN, 0, 0).draft;
    d = click(d, 30, 0).draft;
    d = click(d, 30, 30).draft;
    d = penUndoPoint(d);
    expect(d.nodes).toHaveLength(2);
    const done = click(d, 30.5, 0.5);
    expect(done.result).toMatchObject({ closed: false });
    expect(done.result?.nodes).toHaveLength(2);
    expect(penFinish(click(EMPTY_PEN, 0, 0).draft)).toBeNull();
  });
});

describe('drawn path objects', () => {
  const sub: SubPath = { closed: true, nodes: [{ x: 100, y: 100, type: 'corner' }, { x: 140, y: 100, type: 'corner' }, { x: 140, y: 130, type: 'corner' }] };

  it('are centred in local mm, placed on the plate, cut when closed and engraved when open', () => {
    const closed = drawnPathObject(sub, 'solid')!;
    expect(closed).toMatchObject({ kind: 'path', source: 'draw', op: 'cut', x: 120, y: 115 });
    expect(ringsBounds(pathToRings(closed.d))).toEqual({ minX: -20, minY: -15, maxX: 20, maxY: 15 });
    expect(drawnPathObject(sub, 'frame')!.op).toBe('add');
    expect(drawnPathObject({ ...sub, closed: false }, 'solid')!.op).toBe('score');
  });

  it('write node edits back without moving the rest of a rotated, scaled object', () => {
    const obj = { ...drawnPathObject(sub, 'solid')!, rotation: 30, scaleX: 2, scaleY: 1.5 } as PathObject;
    const before = objectRings(obj);
    const path = parsePathData(obj.d);
    // Move the first point; the others must stay where they are on the plate.
    const moved = { ...obj, ...editedPathPatch(obj, [{ ...path[0], nodes: [{ ...path[0].nodes[0], x: path[0].nodes[0].x - 10 }, ...path[0].nodes.slice(1)] }])! };
    const after = objectRings(moved);
    expect(ringsBounds(pathToRings(moved.d))!.minX).toBeCloseTo(-ringsBounds(pathToRings(moved.d))!.maxX, 6);
    for (const i of [1, 2]) {
      expect(after[0][i].x).toBeCloseTo(before[0][i].x, 2);
      expect(after[0][i].y).toBeCloseTo(before[0][i].y, 2);
    }
  });

  it('convert to path keeps a shape exactly where it was', () => {
    const shape = createShape({ shapeId: 'heart', x: 80, y: 60, widthMm: 50, heightMm: 40, rotation: 20, scaleX: -1 });
    const path = convertToPath(shape)!;
    expect(path.kind).toBe('path');
    expectSameShape(
      objectRings(path).map(r => `M${r.map(p => `${p.x} ${p.y}`).join('L')}Z`).join(''),
      objectRings(shape).map(r => `M${r.map(p => `${p.x} ${p.y}`).join('L')}Z`).join(''),
    );
  });
});

describe('manufacturability on drawn paths', () => {
  const rules = resolveCutRules('black_patina', 2);
  const draw = (nodes: [number, number][], plate: 'solid' | 'frame' | 'none' = 'solid') =>
    drawnPathObject({ closed: true, nodes: nodes.map(([x, y]) => ({ x, y, type: 'corner' as const })) }, plate)!;

  it('flags a loose island and auto-bridges connect it', () => {
    // A ring cut out of the plate (outer contour plus a reversed inner one, as from an "O").
    const ring = createPath({ d: 'M-100 -50H100V50H-100Z M-50 -20V20H50V-20Z', x: 150, y: 100, source: 'draw' }, 'cut');
    const doc = createDocument({ objects: [ring] });
    const off = analyzeDocument({ ...doc, manufacturing: { autoBridges: false } }, rules);
    expect(off.analysis.issues.map(i => i.rule)).toContain('loose-pieces');
    const on = analyzeDocument(doc, rules);
    expect(on.composition.bridges.length).toBeGreaterThan(0);
    expect(on.composition.pieces).toHaveLength(1);
  });

  it('warns about thin metal between two drawn cut-outs', () => {
    const a = draw([[50, 50], [149.7, 50], [149.7, 150], [50, 150]]);
    const b = draw([[150.3, 50], [250, 50], [250, 150], [150.3, 150]]);
    const { analysis } = analyzeDocument(createDocument({ objects: [a, b] }), rules);
    expect(analysis.issues.map(i => i.rule)).toContain('thin-feature');
  });

  it('keeps open drawn lines as score contours', () => {
    const line = drawnPathObject({ closed: false, nodes: [{ x: 20, y: 20, type: 'corner' }, { x: 120, y: 60, type: 'corner' }] }, 'solid')!;
    const { composition } = analyzeDocument(createDocument({ objects: [line] }), rules);
    expect(composition.score).toHaveLength(1);
  });
});
