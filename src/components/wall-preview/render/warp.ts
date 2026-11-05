import type { Point } from '@/lib/wallPreview/types';

/** Maps a point in the source sprite (pixels) to a point on the destination canvas (pixels). */
export type PointMap = (p: Point) => Point;

/** True when the mapping has no perspective, so one affine transform draws the whole sprite exactly. */
export function isAffine(map: PointMap, w: number, h: number): boolean {
  const a = map({ x: 0, y: 0 }), b = map({ x: w, y: 0 }), c = map({ x: 0, y: h }), d = map({ x: w, y: h });
  const dx = d.x - (b.x + c.x - a.x);
  const dy = d.y - (b.y + c.y - a.y);
  return Math.hypot(dx, dy) < 0.25;
}

/**
 * Draws `src` through `map`. Canvas 2D has no projective transform, so the sprite is cut into a grid and every
 * triangle is drawn with the affine transform that fits its three corners. With no perspective (a photo taken
 * square-on) a single transform is used.
 */
export function drawWarped(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, map: PointMap, grid = 10): void {
  const w = src.width, h = src.height;
  if (isAffine(map, w, h)) {
    const o = map({ x: 0, y: 0 }), ex = map({ x: w, y: 0 }), ey = map({ x: 0, y: h });
    ctx.save();
    ctx.setTransform((ex.x - o.x) / w, (ex.y - o.y) / w, (ey.x - o.x) / h, (ey.y - o.y) / h, o.x, o.y);
    ctx.drawImage(src, 0, 0);
    ctx.restore();
    return;
  }
  const pts: Point[][] = [];
  for (let j = 0; j <= grid; j++) {
    const row: Point[] = [];
    for (let i = 0; i <= grid; i++) row.push(map({ x: (w * i) / grid, y: (h * j) / grid }));
    pts.push(row);
  }
  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      const s0 = { x: (w * i) / grid, y: (h * j) / grid };
      const s1 = { x: (w * (i + 1)) / grid, y: s0.y };
      const s2 = { x: s0.x, y: (h * (j + 1)) / grid };
      const s3 = { x: s1.x, y: s2.y };
      const d0 = pts[j][i], d1 = pts[j][i + 1], d2 = pts[j + 1][i], d3 = pts[j + 1][i + 1];
      drawTriangle(ctx, src, [s0, s1, s2], [d0, d1, d2]);
      drawTriangle(ctx, src, [s1, s3, s2], [d1, d3, d2]);
    }
  }
}

function drawTriangle(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, s: Point[], d: Point[]): void {
  const det = (s[1].x - s[0].x) * (s[2].y - s[0].y) - (s[2].x - s[0].x) * (s[1].y - s[0].y);
  if (Math.abs(det) < 1e-9) return;
  // Solve the affine transform taking s -> d.
  const a = ((d[1].x - d[0].x) * (s[2].y - s[0].y) - (d[2].x - d[0].x) * (s[1].y - s[0].y)) / det;
  const b = ((d[1].y - d[0].y) * (s[2].y - s[0].y) - (d[2].y - d[0].y) * (s[1].y - s[0].y)) / det;
  const c = ((d[2].x - d[0].x) * (s[1].x - s[0].x) - (d[1].x - d[0].x) * (s[2].x - s[0].x)) / det;
  const dd = ((d[2].y - d[0].y) * (s[1].x - s[0].x) - (d[1].y - d[0].y) * (s[2].x - s[0].x)) / det;
  const e = d[0].x - a * s[0].x - c * s[0].y;
  const f = d[0].y - b * s[0].x - dd * s[0].y;

  // Grow the clip triangle ~0.6px from its centroid so neighbours overlap and no hairline seams show.
  const cx = (d[0].x + d[1].x + d[2].x) / 3, cy = (d[0].y + d[1].y + d[2].y) / 3;
  ctx.save();
  ctx.beginPath();
  d.forEach((p, i) => {
    const len = Math.hypot(p.x - cx, p.y - cy) || 1;
    const x = p.x + ((p.x - cx) / len) * 0.6, y = p.y + ((p.y - cy) / len) * 0.6;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, dd, e, f);
  ctx.drawImage(src, 0, 0);
  ctx.restore();
}
