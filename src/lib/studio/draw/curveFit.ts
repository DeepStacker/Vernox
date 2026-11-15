/**
 * Freehand smoothing: Ramer–Douglas–Peucker point reduction, then least-squares fitting of
 * cubic Beziers (Philip J. Schneider, "An Algorithm for Automatically Fitting Digitized
 * Curves", Graphics Gems, 1990). Small, dependency-free and deterministic.
 */
import type { Pt } from '../geometry/path';
import type { Cubic } from './pathModel';

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const len = (a: Pt) => Math.hypot(a.x, a.y);
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (a: Pt): Pt => {
  const l = len(a);
  return l > 1e-12 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};

function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-24) return dist(p, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return dist(p, add(a, mul(ab, t)));
}

/** Ramer–Douglas–Peucker: keeps the points needed to stay within `epsilon` of the input polyline. */
export function simplifyRdp(points: Pt[], epsilon: number): Pt[] {
  if (points.length < 3 || epsilon <= 0) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop() as [number, number];
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segmentDistance(points[i], points[s], points[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx >= 0 && maxD > epsilon) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function bezierAt(c: Cubic, t: number): Pt {
  const u = 1 - t;
  return add(add(mul(c[0], u * u * u), mul(c[1], 3 * u * u * t)), add(mul(c[2], 3 * u * t * t), mul(c[3], t * t * t)));
}

function bezierD1(c: Cubic, t: number): Pt {
  const u = 1 - t;
  return add(add(mul(sub(c[1], c[0]), 3 * u * u), mul(sub(c[2], c[1]), 6 * u * t)), mul(sub(c[3], c[2]), 3 * t * t));
}

function bezierD2(c: Cubic, t: number): Pt {
  return add(mul(add(sub(c[2], mul(c[1], 2)), c[0]), 6 * (1 - t)), mul(add(sub(c[3], mul(c[2], 2)), c[1]), 6 * t));
}

function chordLengthParameterize(points: Pt[]): number[] {
  const u = [0];
  for (let i = 1; i < points.length; i++) u.push(u[i - 1] + dist(points[i], points[i - 1]));
  const total = u[u.length - 1] || 1;
  return u.map(v => v / total);
}

function generateBezier(points: Pt[], u: number[], t1: Pt, t2: Pt): Cubic {
  const first = points[0], last = points[points.length - 1];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i < points.length; i++) {
    const t = u[i], v = 1 - t;
    const a1 = mul(t1, 3 * v * v * t), a2 = mul(t2, 3 * v * t * t);
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);
    const tmp = sub(points[i], bezierAt([first, first, last, last], t));
    x0 += dot(a1, tmp);
    x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let alphaL = 0, alphaR = 0;
  if (Math.abs(det) > 1e-12) {
    alphaL = (x0 * c11 - x1 * c01) / det;
    alphaR = (c00 * x1 - c01 * x0) / det;
  }
  const segLen = dist(first, last);
  const eps = 1e-6 * segLen;
  if (alphaL < eps || alphaR < eps) {
    // Fall back to the Wu/Barsky heuristic: handles a third of the chord along the tangents.
    alphaL = alphaR = segLen / 3;
  }
  return [first, add(first, mul(t1, alphaL)), add(last, mul(t2, alphaR)), last];
}

function reparameterize(c: Cubic, points: Pt[], u: number[]): number[] {
  return u.map((t, i) => {
    const d = sub(bezierAt(c, t), points[i]);
    const d1 = bezierD1(c, t), d2 = bezierD2(c, t);
    const den = dot(d1, d1) + dot(d, d2);
    if (Math.abs(den) < 1e-12) return t;
    return Math.max(0, Math.min(1, t - dot(d, d1) / den));
  });
}

function maxError(points: Pt[], c: Cubic, u: number[]): { error: number; split: number } {
  let error = 0, split = Math.floor(points.length / 2);
  for (let i = 1; i < points.length - 1; i++) {
    const d = dist(bezierAt(c, u[i]), points[i]);
    if (d > error) { error = d; split = i; }
  }
  return { error, split };
}

function fitCubic(points: Pt[], t1: Pt, t2: Pt, tolerance: number, depth: number): Cubic[] {
  const first = points[0], last = points[points.length - 1];
  if (points.length === 2) {
    const l = dist(first, last) / 3;
    return [[first, add(first, mul(t1, l)), add(last, mul(t2, l)), last]];
  }
  let u = chordLengthParameterize(points);
  let c = generateBezier(points, u, t1, t2);
  let { error, split } = maxError(points, c, u);
  if (error <= tolerance) return [c];
  if (error <= tolerance * 4) {
    for (let it = 0; it < 20; it++) {
      u = reparameterize(c, points, u);
      c = generateBezier(points, u, t1, t2);
      ({ error, split } = maxError(points, c, u));
      if (error <= tolerance) return [c];
    }
  }
  if (depth > 40) return [c];
  let centre = unit(sub(points[split - 1], points[split + 1]));
  if (len(centre) === 0) centre = unit(sub(points[split - 1], points[split]));
  return [
    ...fitCubic(points.slice(0, split + 1), t1, centre, tolerance, depth + 1),
    ...fitCubic(points.slice(split), mul(centre, -1), t2, tolerance, depth + 1),
  ];
}

/** Fits a chain of cubic Beziers through `points`, staying within `tolerance` of every point. */
export function fitCubics(points: Pt[], tolerance: number): Cubic[] {
  const pts = points.filter((p, i) => i === 0 || dist(p, points[i - 1]) > 1e-9);
  if (pts.length < 2) return [];
  const t1 = unit(sub(pts[1], pts[0]));
  const t2 = unit(sub(pts[pts.length - 2], pts[pts.length - 1]));
  return fitCubic(pts, t1, t2, Math.max(tolerance, 1e-6), 0);
}
