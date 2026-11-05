import type { Point, Quad } from './types';

/** Row-major 3x3 matrix as 9 numbers. */
export type Matrix3 = [number, number, number, number, number, number, number, number, number];

/** Solves A x = b by Gaussian elimination with partial pivoting. Returns null when singular. */
function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = col + 1; r < n; r++) {
      const f = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r][n];
    for (let c = r + 1; c < n; c++) s -= m[r][c] * x[c];
    x[r] = s / m[r][r];
  }
  return x;
}

/** Homography mapping the four `src` points onto the four `dst` points. Null if degenerate (e.g. collinear points). */
export function solveHomography(src: Quad, dst: Quad): Matrix3 | null {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinear(a, b);
  return h ? [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1] : null;
}

export function applyHomography(h: Matrix3, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

export function invertMatrix3(m: Matrix3): Matrix3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-14) return null;
  const inv = 1 / det;
  return [
    A * inv, -(b * i - c * h) * inv, (b * f - c * e) * inv,
    B * inv, (a * i - c * g) * inv, -(a * f - c * d) * inv,
    C * inv, -(a * h - b * g) * inv, (a * e - b * d) * inv,
  ];
}

/** Homography taking the wall rectangle (cm, origin top-left, y down) to image pixels. */
export function wallToImage(corners: Quad, widthCm: number, heightCm: number): Matrix3 | null {
  const rect: Quad = [{ x: 0, y: 0 }, { x: widthCm, y: 0 }, { x: widthCm, y: heightCm }, { x: 0, y: heightCm }];
  return solveHomography(rect, corners);
}

/**
 * Local pixels-per-centimetre at a wall point: the length in image pixels of a 1 cm step, averaged over x and y.
 * Perspective makes this vary across the wall, so it is evaluated where the piece sits.
 */
export function localScale(h: Matrix3, at: Point): number {
  const p0 = applyHomography(h, at);
  const px = applyHomography(h, { x: at.x + 1, y: at.y });
  const py = applyHomography(h, { x: at.x, y: at.y + 1 });
  return (Math.hypot(px.x - p0.x, px.y - p0.y) + Math.hypot(py.x - p0.x, py.y - p0.y)) / 2;
}
