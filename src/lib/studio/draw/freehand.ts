/** Pencil strokes → smooth Bezier sub-paths (auto-closed when the stroke ends near its start). */
import type { Pt } from '../geometry/path';
import { fitCubics, simplifyRdp } from './curveFit';
import type { PathNode, SubPath } from './pathModel';

/** Smoothing slider (0…100) → fitting tolerance in screen pixels. */
export function smoothingTolerancePx(smoothing: number): number {
  const s = Math.max(0, Math.min(100, smoothing)) / 100;
  return 0.6 + s * 9.4;
}

export interface FreehandOptions {
  /** Maximum distance (mm) between the stroke and the fitted curve. */
  toleranceMm: number;
  /** A stroke ending within this distance (mm) of its start is closed. */
  closeDistanceMm: number;
}

function strokeLength(points: Pt[]): number {
  let l = 0;
  for (let i = 1; i < points.length; i++) l += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return l;
}

/** Converts raw pointer samples (plate mm) into one smooth sub-path, or null for a tap or a scribble too small to keep. */
export function freehandToSubPath(points: Pt[], opts: FreehandOptions): SubPath | null {
  if (points.length < 2) return null;
  const length = strokeLength(points);
  if (length < Math.max(opts.toleranceMm * 2, 1)) return null;
  const first = points[0], end = points[points.length - 1];
  const closed = points.length > 4 && Math.hypot(end.x - first.x, end.y - first.y) <= opts.closeDistanceMm && length > opts.closeDistanceMm * 4;
  const input = closed ? [...points.slice(0, -1), { ...first }] : points;
  const reduced = simplifyRdp(input, opts.toleranceMm * 0.25);
  const curves = fitCubics(reduced, opts.toleranceMm);
  if (curves.length === 0) return null;
  const nodes: PathNode[] = [{ ...curves[0][0], out: curves[0][1], type: 'corner' }];
  curves.forEach((c, i) => {
    const next = curves[i + 1];
    nodes.push({ ...c[3], in: c[2], ...(next ? { out: next[1] } : {}), type: next ? 'smooth' : 'corner' });
  });
  if (closed) {
    const last = nodes.pop() as PathNode;
    nodes[0].in = last.in;
  }
  if (nodes.length < 2 && !closed) return null;
  return { nodes, closed };
}
