/**
 * SVG path ⇄ polygon conversion. Parsing, arc/shorthand normalisation and affine
 * transforms are delegated to `svgpath`; this module only flattens curves into
 * polylines with a chord tolerance (adaptive subdivision) and serialises polylines.
 */
import svgpath from 'svgpath';

export interface Pt { x: number; y: number }
export type Ring = Pt[];
export type Rings = Ring[];

/** 2-D affine matrix [a, b, c, d, e, f] — x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function placementMatrix(x: number, y: number, rotationDeg: number, scaleX: number, scaleY: number): Matrix {
  const r = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cos * scaleX, sin * scaleX, -sin * scaleY, cos * scaleY, x, y];
}

export function applyMatrix(m: Matrix, p: Pt): Pt {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

export function transformPathData(d: string, m: Matrix): string {
  return svgpath(d).matrix(m).toString();
}

const MAX_DEPTH = 12;

function flattenCubic(out: Ring, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, tol: number, depth: number) {
  // Flatness: distance of control points from the chord.
  const dx = x3 - x0;
  const dy = y3 - y0;
  const d1 = Math.abs((x1 - x3) * dy - (y1 - y3) * dx);
  const d2 = Math.abs((x2 - x3) * dy - (y2 - y3) * dx);
  const len2 = dx * dx + dy * dy;
  if (depth >= MAX_DEPTH || (d1 + d2) * (d1 + d2) <= tol * tol * 16 * Math.max(len2, 1e-12)) {
    out.push({ x: x3, y: y3 });
    return;
  }
  const x01 = (x0 + x1) / 2, y01 = (y0 + y1) / 2;
  const x12 = (x1 + x2) / 2, y12 = (y1 + y2) / 2;
  const x23 = (x2 + x3) / 2, y23 = (y2 + y3) / 2;
  const xa = (x01 + x12) / 2, ya = (y01 + y12) / 2;
  const xb = (x12 + x23) / 2, yb = (y12 + y23) / 2;
  const xm = (xa + xb) / 2, ym = (ya + yb) / 2;
  flattenCubic(out, x0, y0, x01, y01, xa, ya, xm, ym, tol, depth + 1);
  flattenCubic(out, xm, ym, xb, yb, x23, y23, x3, y3, tol, depth + 1);
}

/**
 * Flattens path data into rings (one per sub-path). `tolerance` is the maximum chord
 * deviation in path units. Open sub-paths are returned as-is (callers decide whether to close).
 */
export function pathToRings(d: string, tolerance = 0.05, matrix?: Matrix): Rings {
  const rings: Rings = [];
  let current: Ring | null = null;
  let p = svgpath(d).abs().unarc().unshort();
  if (matrix) p = p.matrix(matrix);
  p.iterate((seg, _i, x, y) => {
    switch (seg[0]) {
      case 'M':
        if (current && current.length > 1) rings.push(current);
        current = [{ x: seg[1], y: seg[2] }];
        break;
      case 'L':
        (current ??= [{ x, y }]).push({ x: seg[1], y: seg[2] });
        break;
      case 'H':
        (current ??= [{ x, y }]).push({ x: seg[1], y });
        break;
      case 'V':
        (current ??= [{ x, y }]).push({ x, y: seg[1] });
        break;
      case 'C':
        current ??= [{ x, y }];
        flattenCubic(current, x, y, seg[1], seg[2], seg[3], seg[4], seg[5], seg[6], tolerance, 0);
        break;
      case 'Q': {
        current ??= [{ x, y }];
        // Elevate to cubic.
        const c1x = x + (2 / 3) * (seg[1] - x), c1y = y + (2 / 3) * (seg[2] - y);
        const c2x = seg[3] + (2 / 3) * (seg[1] - seg[3]), c2y = seg[4] + (2 / 3) * (seg[2] - seg[4]);
        flattenCubic(current, x, y, c1x, c1y, c2x, c2y, seg[3], seg[4], tolerance, 0);
        break;
      }
      case 'Z':
      case 'z':
        if (current && current.length > 1) rings.push(current);
        current = null;
        break;
      default:
        break;
    }
  });
  if (current && (current as Ring).length > 1) rings.push(current);
  return rings.map(dedupeRing).filter(r => r.length > 1);
}

function dedupeRing(ring: Ring): Ring {
  const out: Ring = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 1e-9 || Math.abs(last.y - p.y) > 1e-9) out.push(p);
  }
  if (out.length > 2) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) out.pop();
  }
  return out;
}

const fmt = (n: number, precision: number) => {
  const s = n.toFixed(precision);
  // Trim trailing zeros to keep stored designs compact.
  return s.includes('.') ? s.replace(/\.?0+$/, '') || '0' : s;
};

export function ringsToPathData(rings: Rings, closed = true, precision = 2): string {
  return rings
    .filter(r => r.length > 1)
    .map(r => `M${r.map(p => `${fmt(p.x, precision)} ${fmt(p.y, precision)}`).join('L')}${closed ? 'Z' : ''}`)
    .join('');
}

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

export function ringsBounds(rings: Rings): Bounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rings) for (const p of r) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

export function pathBounds(d: string, matrix?: Matrix): Bounds | null {
  return ringsBounds(pathToRings(d, 0.1, matrix));
}

/** Signed area (positive = counter-clockwise in a y-up frame). */
export function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j].x + ring[i].x) * (ring[j].y - ring[i].y);
  return -a / 2;
}

export function ringLength(ring: Ring, closed = true): number {
  let len = 0;
  for (let i = 1; i < ring.length; i++) len += Math.hypot(ring[i].x - ring[i - 1].x, ring[i].y - ring[i - 1].y);
  if (closed && ring.length > 2) len += Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y);
  return len;
}

/** Re-centres path data on the centre of its bounding box; returns the offset that was removed. */
export function centrePathData(d: string): { d: string; cx: number; cy: number; width: number; height: number } {
  const b = pathBounds(d);
  if (!b) return { d, cx: 0, cy: 0, width: 0, height: 0 };
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { d: svgpath(d).translate(-cx, -cy).round(3).toString(), cx, cy, width: b.maxX - b.minX, height: b.maxY - b.minY };
}
