/**
 * Production geometry: the frozen, font-independent cut contours stored with an order
 * (`StudioDocument.production`) and the cut-ordering / kerf logic shared by every export.
 *
 * Cut order: a contour is always cut before any contour that encloses it (deepest first),
 * so loose parts never shift before their surroundings are cut; score lines come before
 * the final outer perimeters; within a level contours are chained nearest-neighbour to
 * shorten rapid travel.
 */
import { normaliseEvenOdd, offset, pieces } from './geometry/clipper';
import { pathToRings, ringsBounds, ringsToPathData, type Pt, type Ring, type Rings } from './geometry/path';
import type { Composition } from './compose';
import type { CutRules } from './materials';
import type { ProductionContour, ProductionGeometry } from './schema';

export interface OrderedContour {
  role: 'inner' | 'outer' | 'score';
  ring: Ring;
  closed: boolean;
}

function nearestChain(rings: Ring[], start: Pt): { ordered: Ring[]; end: Pt } {
  const left = rings.slice();
  const ordered: Ring[] = [];
  let at = start;
  while (left.length) {
    let bi = 0;
    let bd = Infinity;
    left.forEach((r, i) => {
      const d = Math.hypot(r[0].x - at.x, r[0].y - at.y);
      if (d < bd) { bd = d; bi = i; }
    });
    const [r] = left.splice(bi, 1);
    ordered.push(r);
    at = r[0];
  }
  return { ordered, end: at };
}

/** Orders the contours of a region (and optional score lines) for cutting. */
export function orderContours(region: Rings, score: Rings = []): OrderedContour[] {
  // level: piece outer = 2·depth, its holes = 2·depth + 1. Deeper is cut first.
  const byLevel = new Map<number, Ring[]>();
  for (const p of pieces(region)) {
    const add = (level: number, ring: Ring) => byLevel.set(level, [...(byLevel.get(level) ?? []), ring]);
    add(p.depth * 2, p.outer);
    p.holes.forEach(h => add(p.depth * 2 + 1, h));
  }
  const levels = [...byLevel.keys()].sort((a, b) => b - a);
  const out: OrderedContour[] = [];
  let at: Pt = { x: 0, y: 0 };
  for (const level of levels) {
    if (level === 0) continue; // top-level outer perimeters go last
    const chain = nearestChain(byLevel.get(level) ?? [], at);
    at = chain.end;
    chain.ordered.forEach(ring => out.push({ role: 'inner', ring, closed: true }));
  }
  const s = nearestChain(score, at);
  at = s.end;
  s.ordered.forEach(ring => out.push({ role: 'score', ring, closed: false }));
  nearestChain(byLevel.get(0) ?? [], at).ordered.forEach(ring => out.push({ role: 'outer', ring, closed: true }));
  return out;
}

export function buildProduction(c: Composition, rules: CutRules, finish: string): ProductionGeometry {
  const ordered = orderContours(c.material, c.score);
  const b = c.bounds;
  // Normalise to the part's own bounding box so (0,0) is its top-left corner.
  const dx = b ? -b.minX : 0;
  const dy = b ? -b.minY : 0;
  const shift = (ring: Ring) => ring.map(p => ({ x: p.x + dx, y: p.y + dy }));
  const contours: ProductionContour[] = ordered.map(o => ({ role: o.role, d: ringsToPathData([shift(o.ring)], o.closed) }));
  return {
    generatedAt: Date.now(),
    widthMm: b ? Math.max(1e-3, b.maxX - b.minX) : 1,
    heightMm: b ? Math.max(1e-3, b.maxY - b.minY) : 1,
    contours,
    kerfMm: rules.kerfMm,
    substrate: rules.substrate,
    thicknessMm: rules.thicknessMm,
    finish,
  };
}

/** Rebuilds the cut region and score lines from stored contours. */
export function productionRegion(prod: Pick<ProductionGeometry, 'contours'>): { region: Rings; score: Rings } {
  const closed: Rings = [];
  const score: Rings = [];
  for (const c of prod.contours) {
    const rings = pathToRings(c.d, 0.01);
    if (c.role === 'score') score.push(...rings);
    else closed.push(...rings);
  }
  return { region: normaliseEvenOdd(closed), score };
}

/**
 * Contours ready for the machine. With kerf compensation the part grows by kerf/2 on every
 * edge (outer perimeters move out, holes shrink) so the finished part has nominal size.
 */
export function machineContours(prod: ProductionGeometry, applyKerf: boolean): OrderedContour[] {
  const { region, score } = productionRegion(prod);
  const r = applyKerf && prod.kerfMm > 0 ? offset(region, prod.kerfMm / 2, 'miter') : region;
  return orderContours(r, score);
}

export function contoursBounds(contours: OrderedContour[]) {
  return ringsBounds(contours.map(c => c.ring));
}
