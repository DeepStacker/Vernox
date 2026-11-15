/**
 * Pattern fill: clips a pattern to a region (the plate or a selected shape) with a margin and
 * turns it into path data ready to become one path object. Pure and synchronous; the UI runs
 * it in the pattern worker (patternWorker.ts) so a 900 x 600 mm panel stays responsive.
 *
 * Steps: shrink the region by the margin; generate the nominal cells over it; inset every
 * cell by half the web (so metal between holes is at least the web wide); clip to the region,
 * dropping cells cut to less than half; open by the minimum hole so thin slivers disappear.
 */
import { difference, intersection, normalise, offset, pointInRing, ringAreaAbs } from '../geometry/clipper';
import { centrePathData, ringsBounds, ringsToPathData, type Bounds, type Ring, type Rings } from '../geometry/path';
import { MITER_LIMIT } from '../thinFeatures';
import { estimateCells, MAX_PATTERN_CELLS, patternInfo, type PatternId } from './catalog';
import { patternCells } from './cells';

export interface PatternRequest {
  patternId: PatternId;
  /** The area to fill, plate mm (outer rings and holes, any orientation). */
  region: Rings;
  /** Pattern size: the cell pitch, see cells.ts. */
  sizeMm: number;
  webMm: number;
  /** Clear metal kept between the pattern and the region's edge. */
  marginMm: number;
  minHoleMm: number;
  /**
   * 'cut': the result is the holes (for a solid plate, where objects are cut out).
   * 'add': the result is the lattice, region minus holes (for a frame or free-standing panel).
   */
  mode: 'cut' | 'add';
}

export type PatternFailure = 'no-room' | 'too-many-cells' | 'empty' | 'bad-input';

export type PatternResult =
  | {
    ok: true;
    /** Path data centred on (0,0); place the object at `centre`. */
    d: string;
    centre: { x: number; y: number };
    widthMm: number;
    heightMm: number;
    holes: number;
    /** Size of the path data; a very large fill may not fit a cart line (see ORDER_LIMITS). */
    chars: number;
  }
  | { ok: false; reason: PatternFailure; cells?: number };

/** Path data length above which the UI warns that the fill may be too detailed to order online. */
export const HEAVY_PATTERN_CHARS = 70_000;

/** A cell cut by the region's edge is kept when at least this share of it is left; smaller scraps make sharp slivers of metal. */
const MIN_FRAGMENT_SHARE = 0.5;

const isConvex = (ring: Ring) => {
  let sign = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], c = ring[(i + 2) % ring.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return true;
};

/**
 * Keeps whole cells, trims cells cut by the region's edge and drops small scraps. Cells well
 * inside a convex region are recognised by their bounding box, so only edge cells meet Clipper.
 */
function clipToRegion(cells: Rings, region: Rings, keepAnyShare: boolean): Rings {
  const single = region.length === 1 && isConvex(region[0]) ? region[0] : null;
  const out: Rings = [];
  for (const cell of cells) {
    const b = ringsBounds([cell]) as Bounds;
    if (single && [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]].every(([x, y]) => pointInRing({ x, y }, single))) {
      out.push(cell);
      continue;
    }
    const part = intersection([cell], region);
    const share = part.reduce((a, r) => a + ringAreaAbs(r), 0) / ringAreaAbs(cell);
    if (keepAnyShare || share >= MIN_FRAGMENT_SHARE) out.push(...part);
  }
  return out;
}

export function generatePattern(req: PatternRequest): PatternResult {
  const { patternId, sizeMm, webMm, marginMm, minHoleMm } = req;
  if (![sizeMm, webMm, marginMm, minHoleMm].every(Number.isFinite) || sizeMm <= 0 || webMm <= 0 || marginMm < 0 || sizeMm <= webMm) return { ok: false, reason: 'bad-input' };
  const info = patternInfo(patternId);
  const region = normalise(req.region);
  const inner = marginMm > 0 ? offset(region, -marginMm, 'miter') : region;
  const box = ringsBounds(inner) as Bounds | null;
  if (!box) return { ok: false, reason: 'no-room' };

  const estimate = estimateCells(info, box.maxX - box.minX, box.maxY - box.minY, sizeMm);
  if (estimate > MAX_PATTERN_CELLS) return { ok: false, reason: 'too-many-cells', cells: estimate };

  const cells = patternCells(patternId, box, sizeMm);
  const radius = (info.rounding ?? 0) * sizeMm;
  // Rounded holes: pull the sharp cell in by the web plus the radius, then grow back by the radius.
  const inset = offset(cells, -(webMm / 2 + radius), info.rounding ? 'miter' : info.join, info.rounding ? MITER_LIMIT : 3);
  const shaped = radius > 0 ? offset(inset, radius, 'round') : inset;
  const clipped = clipToRegion(shaped, inner, Boolean(info.continuous));
  const m = minHoleMm / 2;
  const holes = m > 0 ? offset(offset(clipped, -m, 'miter', MITER_LIMIT), m, 'miter', MITER_LIMIT) : clipped;
  if (holes.length === 0) return { ok: false, reason: 'empty' };

  const result = req.mode === 'cut' ? holes : difference(region, holes);
  const d = ringsToPathData(result, true, 1);
  const centred = centrePathData(d);
  return {
    ok: true,
    d: centred.d,
    centre: { x: centred.cx, y: centred.cy },
    widthMm: centred.width,
    heightMm: centred.height,
    holes: holes.length,
    chars: centred.d.length,
  };
}
