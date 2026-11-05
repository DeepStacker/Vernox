/**
 * Thin, typed facade over Clipper2 (@countertype/clipper2-ts): booleans, offsets,
 * simplification and piece (polytree) extraction in millimetres. Every boolean runs at
 * 3-decimal precision (1 µm), far below the laser's ±0.03 mm positional accuracy.
 */
import { Clipper, ClipType, EndType, FillRule, JoinType, PointInPolygonResult, PolyTreeD, type PathsD, type PolyPathD } from '@countertype/clipper2-ts';
import type { Pt, Ring, Rings } from './path';

const PRECISION = 3;
const ARC_TOLERANCE = 0.02;

/** Normalises arbitrary rings (any orientation, self-overlapping) into a clean region. */
export function normalise(rings: Rings): Rings {
  if (rings.length === 0) return [];
  return Clipper.booleanOpD(ClipType.Union, rings as PathsD, null, FillRule.NonZero, PRECISION);
}

/** Region from contours of unknown orientation (imports, legacy designs): even-odd fill. */
export function normaliseEvenOdd(rings: Rings): Rings {
  if (rings.length === 0) return [];
  return Clipper.booleanOpD(ClipType.Union, rings as PathsD, null, FillRule.EvenOdd, PRECISION);
}

export function union(a: Rings, b: Rings = []): Rings {
  if (a.length === 0 && b.length === 0) return [];
  return Clipper.booleanOpD(ClipType.Union, a as PathsD, b as PathsD, FillRule.NonZero, PRECISION);
}

export function difference(a: Rings, b: Rings): Rings {
  if (a.length === 0) return [];
  if (b.length === 0) return a;
  return Clipper.booleanOpD(ClipType.Difference, a as PathsD, b as PathsD, FillRule.NonZero, PRECISION);
}

export function intersection(a: Rings, b: Rings): Rings {
  if (a.length === 0 || b.length === 0) return [];
  return Clipper.booleanOpD(ClipType.Intersection, a as PathsD, b as PathsD, FillRule.NonZero, PRECISION);
}

export function xor(a: Rings, b: Rings): Rings {
  return Clipper.booleanOpD(ClipType.Xor, a as PathsD, b as PathsD, FillRule.NonZero, PRECISION);
}

export type Join = 'round' | 'miter';

/** Grows (delta > 0) or shrinks (delta < 0) a region. */
export function offset(rings: Rings, delta: number, join: Join = 'round'): Rings {
  if (rings.length === 0 || delta === 0) return rings;
  return Clipper.inflatePathsD(
    rings as PathsD,
    delta,
    join === 'round' ? JoinType.Round : JoinType.Miter,
    EndType.Polygon,
    3,
    PRECISION,
    ARC_TOLERANCE,
  );
}

/** Turns an open polyline into a band of the given width with square-cut ends. */
export function strokeOpen(line: Ring, width: number): Rings {
  return Clipper.inflatePathsD([line] as PathsD, width / 2, JoinType.Miter, EndType.Butt, 3, PRECISION, ARC_TOLERANCE);
}

export function simplify(rings: Rings, epsilon: number): Rings {
  if (epsilon <= 0) return rings;
  return Clipper.simplifyPathsD(rings as PathsD, epsilon, true).filter(r => r.length > 2);
}

export function area(rings: Rings): number {
  return Clipper.areaPathsD(rings as PathsD);
}

export function ringAreaAbs(ring: Ring): number {
  return Math.abs(Clipper.areaD(ring as PathsD[number]));
}

export function pointInRing(pt: Pt, ring: Ring): boolean {
  return Clipper.pointInPolygonD(pt, ring as PathsD[number], PRECISION) === PointInPolygonResult.IsInside;
}

export function circleRing(cx: number, cy: number, r: number, tolerance = 0.02): Ring {
  const segments = Math.max(16, Math.min(256, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - tolerance / Math.max(r, 1e-6))))));
  const ring: Ring = [];
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    ring.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return ring;
}

/** One connected piece of metal: an outer contour and its holes. `depth` 0 = top level. */
export interface Piece {
  outer: Ring;
  holes: Ring[];
  area: number;
  /** Number of enclosing pieces (a counter inside the "O" of a cut-out letter has depth 1). */
  depth: number;
}

/** Splits a region into connected pieces using Clipper's polytree. */
export function pieces(rings: Rings): Piece[] {
  if (rings.length === 0) return [];
  const tree = new PolyTreeD();
  Clipper.booleanOpDWithPolyTree(ClipType.Union, rings as PathsD, null, tree, FillRule.NonZero, PRECISION);
  const out: Piece[] = [];
  const visitOuter = (node: PolyPathD, depth: number) => {
    const outer = node.poly as Ring;
    const holes: Ring[] = [];
    let holeArea = 0;
    for (let i = 0; i < node.count; i++) {
      const hole = node.child(i);
      holes.push(hole.poly as Ring);
      holeArea += ringAreaAbs(hole.poly as Ring);
    }
    out.push({ outer, holes, area: ringAreaAbs(outer) - holeArea, depth });
    for (let i = 0; i < node.count; i++) {
      const hole = node.child(i);
      for (let j = 0; j < hole.count; j++) visitOuter(hole.child(j), depth + 1);
    }
  };
  for (let i = 0; i < tree.count; i++) visitOuter(tree.child(i), 0);
  return out;
}
