/**
 * Nominal cells of each pattern, covering a bounding box. Cells of one pattern never overlap
 * (neighbours may touch), which is what lets the generator guarantee the web width by insetting
 * every cell by half of it. `size` is the pattern size in mm (see each function for what it
 * measures). Rings are returned counter-clockwise (positive area) for Clipper.
 */
import { area, circleRing, difference, strokeOpen, union } from '../geometry/clipper';
import type { Bounds, Pt, Ring, Rings } from '../geometry/path';
import type { PatternId } from './catalog';

const SQRT3 = Math.sqrt(3);
const polar = (cx: number, cy: number, r: number, deg: number): Pt => ({ x: cx + r * Math.cos((deg * Math.PI) / 180), y: cy + r * Math.sin((deg * Math.PI) / 180) });

const ccw = (ring: Ring): Ring => (area([ring]) < 0 ? [...ring].reverse() : ring);
const regular = (cx: number, cy: number, r: number, sides: number, startDeg: number): Ring =>
  Array.from({ length: sides }, (_, i) => polar(cx, cy, r, startDeg + (360 / sides) * i));

/** Index range of lattice nodes whose cells can touch `b` (one extra step each side). */
function span(min: number, max: number, step: number, offset = 0): number[] {
  const from = Math.floor((min - offset) / step) - 1, to = Math.ceil((max - offset) / step) + 1;
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

const transpose = (rings: Rings): Rings => rings.map(r => ccw(r.map(p => ({ x: p.y, y: p.x }))));
const transposeBounds = (b: Bounds): Bounds => ({ minX: b.minY, minY: b.minX, maxX: b.maxY, maxY: b.maxX });

/** Flat-topped hexagons; `size` is the distance across flats. */
function hexagons(b: Bounds, size: number): Rings {
  const r = size / SQRT3;
  const out: Rings = [];
  for (const i of span(b.minX, b.maxX, 1.5 * r)) {
    for (const j of span(b.minY, b.maxY, size, (i & 1 ? size / 2 : 0))) {
      out.push(regular(i * 1.5 * r, j * size + (i & 1 ? size / 2 : 0), r, 6, 0));
    }
  }
  return out.map(ccw);
}

/** Squares turned 45°; `size` is the side. */
function diamonds(b: Bounds, size: number): Rings {
  const d = size * Math.SQRT2;
  const out: Rings = [];
  for (const j of span(b.minY, b.maxY, d / 2)) {
    for (const i of span(b.minX, b.maxX, d, (j & 1 ? d / 2 : 0))) {
      out.push(regular(i * d + (j & 1 ? d / 2 : 0), (j * d) / 2, d / 2, 4, 0));
    }
  }
  return out.map(ccw);
}

/** Circles of diameter `size` on a staggered lattice, so neighbours touch. */
function circles(b: Bounds, size: number): Rings {
  const out: Rings = [];
  const rowH = (size * SQRT3) / 2;
  for (const j of span(b.minY, b.maxY, rowH)) {
    for (const i of span(b.minX, b.maxX, size, (j & 1 ? size / 2 : 0))) {
      out.push(circleRing(i * size + (j & 1 ? size / 2 : 0), j * rowH, size / 2, 0.06));
    }
  }
  return out.map(ccw);
}

/** Fish scales: circles of diameter `size`, each lower row hiding the part of the row above it. */
function scales(b: Bounds, size: number): Rings {
  const r = size / 2;
  const out: Rings = [];
  for (const j of span(b.minY, b.maxY, r)) {
    for (const i of span(b.minX, b.maxX, size, (j & 1 ? r : 0))) {
      const cx = i * size + (j & 1 ? r : 0), cy = j * r;
      const below = [circleRing(cx - r, cy + r, r, 0.06), circleRing(cx + r, cy + r, r, 0.06)].map(ccw);
      out.push(...difference([ccw(circleRing(cx, cy, r, 0.06))], below));
    }
  }
  return out;
}

/** Four-lobed flowers on a square grid of pitch `size`, with a round dot between each four. */
function quatrefoil(b: Bounds, size: number): Rings {
  const lobe = 0.3 * size, reach = 0.2 * size;
  const out: Rings = [];
  for (const i of span(b.minX, b.maxX, size)) {
    for (const j of span(b.minY, b.maxY, size)) {
      const cx = i * size, cy = j * size;
      const circlesOf = [[reach, 0], [-reach, 0], [0, reach], [0, -reach]].map(([dx, dy]) => ccw(circleRing(cx + dx, cy + dy, lobe, 0.06)));
      out.push(...union(circlesOf));
      out.push(ccw(circleRing(cx + size / 2, cy + size / 2, 0.27 * size, 0.06)));
    }
  }
  return out;
}

/** Octagons of width `size` (across flats) with a small diamond in every gap (the 4.8.8 tiling). */
function octagons(b: Bounds, size: number): Rings {
  const out: Rings = [];
  const circum = size / 2 / Math.cos(Math.PI / 8);
  const half = (size * Math.SQRT2) / (2 * (1 + Math.SQRT2));
  for (const i of span(b.minX, b.maxX, size)) {
    for (const j of span(b.minY, b.maxY, size)) {
      out.push(ccw(regular(i * size, j * size, circum, 8, 22.5)));
      out.push(ccw(regular((i + 0.5) * size, (j + 0.5) * size, half, 4, 0)));
    }
  }
  return out;
}

/** Wave bands; `size` is the pitch between bands. */
function waves(b: Bounds, size: number): Rings {
  const length = size * 2.4, amplitude = length * 0.1;
  const thickness = size * Math.cos(Math.atan(2 * Math.PI * (amplitude / length)));
  const step = length / 14;
  const out: Rings = [];
  const x0 = b.minX - length, x1 = b.maxX + length;
  for (const j of span(b.minY - amplitude, b.maxY + amplitude, size)) {
    const line: Ring = [];
    for (let x = x0; x <= x1 + step; x += step) line.push({ x, y: j * size + amplitude * Math.sin(((2 * Math.PI) / length) * x) });
    out.push(...strokeOpen(line, thickness).map(ccw));
  }
  return out;
}

/** Equilateral triangles of side `size`. */
function triangles(b: Bounds, size: number): Rings {
  const h = (size * SQRT3) / 2;
  const out: Rings = [];
  for (const j of span(b.minY, b.maxY, h)) {
    const shift = j & 1 ? size / 2 : 0;
    const top = j * h, bottom = top + h;
    for (const i of span(b.minX, b.maxX, size, shift)) {
      const x = i * size + shift;
      out.push([{ x, y: bottom }, { x: x + size, y: bottom }, { x: x + size / 2, y: top }]);
      out.push([{ x: x + size / 2, y: top }, { x: x + size * 1.5, y: top }, { x: x + size, y: bottom }]);
    }
  }
  return out.map(ccw);
}

/** A pointed arch (lens) with tips `2a` apart and widest `2b`, upright or turned sideways. */
function lens(cx: number, cy: number, a: number, b: number, upright: boolean): Ring {
  const rho = (a * a + b * b) / (2 * b);
  const theta = Math.asin(a / rho);
  const steps = 14;
  const point = (u: number, v: number): Pt => (upright ? { x: cx + u, y: cy + v } : { x: cx + v, y: cy + u });
  const arc = (t: number) => ({ u: -(rho - b) + rho * Math.cos(t), v: rho * Math.sin(t) });
  const ring: Ring = [];
  for (let k = 0; k <= steps; k++) { const p = arc(-theta + (2 * theta * k) / steps); ring.push(point(p.u, p.v)); }
  for (let k = 1; k < steps; k++) { const p = arc(theta - (2 * theta * k) / steps); ring.push(point(-p.u, p.v)); }
  return ccw(ring);
}

/** Upright and sideways pointed arches interlocking on a square grid of pitch `size`. */
function arabesque(b: Bounds, size: number): Rings {
  const out: Rings = [];
  for (const i of span(b.minX, b.maxX, size)) {
    for (const j of span(b.minY, b.maxY, size)) {
      out.push(lens(i * size, j * size, 0.46 * size, 0.2 * size, true));
      out.push(lens((i + 0.5) * size, (j + 0.5) * size, 0.46 * size, 0.2 * size, false));
    }
  }
  return out;
}

export function patternCells(id: PatternId, b: Bounds, size: number): Rings {
  switch (id) {
    case 'hexagon': return hexagons(b, size);
    case 'honeycomb': return transpose(hexagons(transposeBounds(b), size));
    case 'diamond': return diamonds(b, size);
    case 'circles': return circles(b, size);
    case 'scales': return scales(b, size);
    case 'quatrefoil': return quatrefoil(b, size);
    case 'octagon': return octagons(b, size);
    case 'waves': return waves(b, size);
    case 'triangles': return triangles(b, size);
    case 'arabesque': return arabesque(b, size);
  }
}
