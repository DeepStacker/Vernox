/**
 * Derives the physical part from a design document:
 *
 *   material = (plate region ∪ "add" objects) − "cut" objects
 *   material = material ∪ bridges            (when autoBridges is on)
 *   material = material − mounting holes     (auto-placed where they fit)
 *
 * Pure and synchronous so it runs identically in the geometry worker, the headless API,
 * tests and production. All coordinates are plate millimetres.
 */
import { area, circleRing, difference, normalise, offset, pieces, pointInRing, strokeOpen, union, type Piece } from './geometry/clipper';
import { pathToRings, placementMatrix, ringsBounds, transformPathData, type Bounds, type Pt, type Ring, type Rings } from './geometry/path';
import type { CutRules } from './materials';
import type { Plate, StudioDocument, StudioObject } from './schema';
import { studioShapePath } from './shapes';

/** Curve flattening tolerance for cut geometry (mm). */
export const CUT_TOLERANCE = 0.03;
/** Weld growth for "weld letters": fuses script letters that almost touch. */
const WELD_MM = 0.6;

export function plateRings(plate: Plate): Rings {
  if (plate.style === 'none') return [];
  const outline = normalise(pathToRings(studioShapePath(plate.shapeId, plate.widthMm, plate.heightMm, plate.cornerRadiusMm), CUT_TOLERANCE));
  if (plate.style === 'solid') return outline;
  const border = Math.min(plate.borderMm, Math.min(plate.widthMm, plate.heightMm) / 2 - 1);
  return border > 0 ? difference(outline, offset(outline, -border, 'miter')) : outline;
}

/** Outline of the plate shape regardless of style (used for "inside the plate" checks and previews). */
export function plateOutline(plate: Plate): Rings {
  return normalise(pathToRings(studioShapePath(plate.shapeId, plate.widthMm, plate.heightMm, plate.cornerRadiusMm), CUT_TOLERANCE));
}

/** Local outline (centred on 0,0) of an object as path data; null while a text outline is not shaped yet. */
export function objectLocalPath(obj: StudioObject): string | null {
  switch (obj.kind) {
    case 'text':
      return obj.outline ?? null;
    case 'shape': {
      const d = studioShapePath(obj.shapeId, obj.widthMm, obj.heightMm, obj.cornerRadiusMm);
      return transformPathData(d, [1, 0, 0, 1, -obj.widthMm / 2, -obj.heightMm / 2]);
    }
    case 'path':
      return obj.d;
    case 'hole': {
      const r = obj.diameterMm / 2;
      return `M${r} 0A${r} ${r} 0 1 1 ${-r} 0A${r} ${r} 0 1 1 ${r} 0Z`;
    }
  }
}

/** The object's geometry in plate coordinates (raw rings, not yet normalised). */
export function objectRings(obj: StudioObject, tolerance = CUT_TOLERANCE): Rings {
  const local = objectLocalPath(obj);
  if (!local) return [];
  const m = placementMatrix(obj.x, obj.y, obj.rotation, obj.scaleX, obj.scaleY);
  if (obj.kind === 'hole') {
    const r = (obj.diameterMm / 2) * Math.max(Math.abs(obj.scaleX), Math.abs(obj.scaleY));
    return [circleRing(obj.x, obj.y, r)];
  }
  const rings = pathToRings(local, tolerance, m);
  if (obj.kind === 'text' && obj.weld) return offset(normalise(rings), WELD_MM / 2, 'round');
  return rings;
}

export interface MountingHole { x: number; y: number; r: number }

export interface Composition {
  material: Rings;
  pieces: Piece[];
  bridges: Rings;
  mountingHoles: MountingHole[];
  /** Requested mounting holes that found no safe position. */
  mountingDropped: number;
  score: Rings;
  bounds: Bounds | null;
  /** Text objects whose outline is not available yet (font still loading). */
  pendingText: string[];
}

function mountingCandidates(plate: Plate, preset: StudioDocument['mounting']['preset'], inset: number): Pt[] {
  const { widthMm: w, heightMm: h } = plate;
  switch (preset) {
    case 'top-2': return [{ x: inset, y: inset }, { x: w - inset, y: inset }];
    case 'corners-4': return [{ x: inset, y: inset }, { x: w - inset, y: inset }, { x: w - inset, y: h - inset }, { x: inset, y: h - inset }];
    case 'center-1': return [{ x: w / 2, y: inset }];
    default: return [];
  }
}

/**
 * Places each requested hole at its preset position, sliding it towards the plate centre
 * until the hole plus the edge clearance sits fully in metal (circles, arches, rosettes…).
 */
export function placeMountingHoles(doc: StudioDocument, material: Rings, rules: CutRules): { holes: MountingHole[]; dropped: number } {
  const { preset, diameterMm, insetMm } = doc.mounting;
  const candidates = mountingCandidates(doc.plate, preset, insetMm);
  if (candidates.length === 0) return { holes: [], dropped: 0 };
  const r = diameterMm / 2;
  const safe = pieces(offset(material, -(r + rules.minEdgeMm), 'round'));
  const inSafe = (p: Pt) => safe.some(pc => pointInRing(p, pc.outer) && !pc.holes.some(hole => pointInRing(p, hole)));
  const c = { x: doc.plate.widthMm / 2, y: doc.plate.heightMm / 2 };
  const holes: MountingHole[] = [];
  let dropped = 0;
  for (const p of candidates) {
    let placed: Pt | null = null;
    for (let step = 0; step <= 24 && !placed; step++) {
      const t = step / 24 * 0.8;
      const q = { x: p.x + (c.x - p.x) * t, y: p.y + (c.y - p.y) * t };
      if (inSafe(q)) placed = q;
    }
    if (placed) holes.push({ x: placed.x, y: placed.y, r });
    else dropped++;
  }
  return { holes, dropped };
}

// ---------- bridges ----------

interface Candidate { dist: number; a: Pt; b: Pt }

function nearestOnSegment(p: Pt, s: Pt, e: Pt): Pt {
  const dx = e.x - s.x, dy = e.y - s.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.y - s.y) * dy) / len2)) : 0;
  return { x: s.x + t * dx, y: s.y + t * dy };
}

function boundsDistance(p: Pt, b: Bounds): number {
  const dx = Math.max(b.minX - p.x, 0, p.x - b.maxX);
  const dy = Math.max(b.minY - p.y, 0, p.y - b.maxY);
  return Math.hypot(dx, dy);
}

/** For each vertex of `ring`, the nearest point on any of `targets`. */
function vertexCandidates(ring: Ring, targets: { ring: Ring; bounds: Bounds }[]): Candidate[] {
  const step = Math.max(1, Math.floor(ring.length / 300));
  const out: Candidate[] = [];
  for (let i = 0; i < ring.length; i += step) {
    const p = ring[i];
    let best: Candidate | null = null;
    for (const t of targets) {
      if (best && boundsDistance(p, t.bounds) >= best.dist) continue;
      const tr = t.ring;
      for (let j = 0, k = tr.length - 1; j < tr.length; k = j++) {
        const q = nearestOnSegment(p, tr[k], tr[j]);
        const dist = Math.hypot(q.x - p.x, q.y - p.y);
        if (!best || dist < best.dist) best = { dist, a: p, b: q };
      }
    }
    if (best) out.push(best);
  }
  return out;
}

function bridgeBand(c: Candidate, width: number): Rings {
  const dx = c.b.x - c.a.x, dy = c.b.y - c.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  // Extend into the metal on both sides so the union always overlaps.
  const ext = width / 2 + 0.3;
  return strokeOpen([{ x: c.a.x - ux * ext, y: c.a.y - uy * ext }, { x: c.b.x + ux * ext, y: c.b.y + uy * ext }], width);
}

function centroid(ring: Ring): Pt {
  let x = 0, y = 0;
  for (const p of ring) { x += p.x; y += p.y; }
  return { x: x / ring.length, y: y / ring.length };
}

/**
 * Connects every loose piece to its nearest neighbour with straight bridges until the
 * part is one piece. A piece enclosed by another (a letter counter) gets two opposite
 * bridges so it cannot pivot; side-by-side pieces get one.
 */
export function connectLoosePieces(material: Rings, width: number, maxPasses = 8): { material: Rings; bridges: Rings } {
  let current = material;
  const bridges: Rings = [];
  for (let pass = 0; pass < maxPasses; pass++) {
    const ps = pieces(current);
    if (ps.length <= 1) break;
    const mainIndex = ps.reduce((best, p, i) => (p.area > ps[best].area ? i : best), 0);
    const added: Rings = [];
    ps.forEach((piece, i) => {
      if (i === mainIndex) return;
      const targets = ps.flatMap((other, j) =>
        j === i ? [] : [other.outer, ...other.holes].map(ring => ({ ring, bounds: ringsBounds([ring]) as Bounds })),
      );
      const cands = vertexCandidates(piece.outer, targets);
      if (cands.length === 0) return;
      const best = cands.reduce((a, b) => (b.dist < a.dist ? b : a));
      added.push(...bridgeBand(best, width));
      if (piece.depth > 0) {
        const c = centroid(piece.outer);
        const ang = (p: Pt) => Math.atan2(p.y - c.y, p.x - c.x);
        const a0 = ang(best.a);
        const opposite = cands
          .filter(k => {
            const d = Math.abs(((ang(k.a) - a0 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
            return d < Math.PI / 3; // within 60° of the opposite direction
          })
          .reduce<Candidate | null>((a, b) => (!a || b.dist < a.dist ? b : a), null);
        if (opposite) added.push(...bridgeBand(opposite, width));
      }
    });
    if (added.length === 0) break;
    bridges.push(...added);
    current = union(current, added);
  }
  return { material: current, bridges };
}

// ---------- composition ----------

export function composeDocument(doc: StudioDocument, rules: CutRules): Composition {
  const adds: Rings = [];
  const cuts: Rings = [];
  const score: Rings = [];
  const pendingText: string[] = [];
  for (const obj of doc.objects) {
    if (obj.hidden) continue;
    if (obj.kind === 'text' && !obj.outline) {
      if (obj.text.trim()) pendingText.push(obj.id);
      continue;
    }
    const rings = objectRings(obj);
    if (rings.length === 0) continue;
    // Normalise each object on its own: fonts and imports disagree on contour orientation.
    if (obj.kind === 'hole' || obj.op === 'cut') cuts.push(...normalise(rings));
    else if (obj.op === 'add') adds.push(...normalise(rings));
    else score.push(...rings);
  }

  let material = union(plateRings(doc.plate), adds);
  material = difference(material, cuts);

  let bridges: Rings = [];
  if (doc.manufacturing.autoBridges && material.length > 0) {
    const width = doc.manufacturing.bridgeWidthMm ?? rules.bridgeMm;
    ({ material, bridges } = connectLoosePieces(material, width));
  }

  const { holes, dropped } = placeMountingHoles(doc, material, rules);
  if (holes.length > 0) material = difference(material, holes.map(h => circleRing(h.x, h.y, h.r)));

  const ps = pieces(material);
  return {
    material,
    pieces: ps,
    bridges,
    mountingHoles: holes,
    mountingDropped: dropped,
    score,
    bounds: ringsBounds(material.length ? material : score),
    pendingText,
  };
}

export function materialArea(c: Composition): number {
  return Math.abs(area(c.material));
}
