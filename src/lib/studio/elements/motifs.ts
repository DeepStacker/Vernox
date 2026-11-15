/**
 * Decorative motifs, authored here as small compositions of primitives (leaves, circles,
 * bars, polygons) in a 100-unit box, y down. Original, simple, stylised designs.
 *
 * Rules every motif follows, so it cuts cleanly at a typical size (about 150 mm across on
 * 2 mm metal, where 1 unit is 1.5 mm): one connected silhouette without enclosed islands
 * (so a cut-out leaves no loose metal and a solid piece has no inner holes to bridge), no
 * feature or gap thinner than about 4 units except tapering tips, which a laser cuts fine.
 * `__tests__/elements.test.ts` cuts every motif out of a plate and as a free-standing piece
 * and requires zero manufacturability issues.
 */
import { area, circleRing, difference, union } from '../geometry/clipper';
import { ringsToPathData, type Pt, type Ring, type Rings } from '../geometry/path';

export type ElementCategory = 'nature' | 'festive' | 'animals' | 'symbols' | 'borders';

export interface ElementDef {
  id: string;
  name: string;
  category: ElementCategory;
  /** Silhouette as rings in the 100-unit box. */
  build: () => Rings;
  /** How a new element is sized and placed; default: 40 % of the plate's shorter side, centred. */
  place?: ElementPlacement;
}

export interface ElementPlacement {
  /** Which plate dimension `share` refers to. */
  span: 'width' | 'min';
  /** The element's longer side as a share of that dimension. */
  share: number;
  /** Border pieces sit against the plate edge: top centre, or the top-left corner (flip for the others). */
  anchor?: 'top' | 'top-left';
}

// ---------- primitives ----------

const ccw = (ring: Ring): Ring => (area([ring]) < 0 ? [...ring].reverse() : ring);
const rad = (deg: number) => (deg * Math.PI) / 180;

const poly = (...pts: [number, number][]): Ring => ccw(pts.map(([x, y]) => ({ x, y })));
const circle = (cx: number, cy: number, r: number): Ring => ccw(circleRing(cx, cy, r, 0.1));
const ellipse = (cx: number, cy: number, rx: number, ry: number, rotDeg = 0): Ring => {
  const c = Math.cos(rad(rotDeg)), s = Math.sin(rad(rotDeg));
  return ccw(Array.from({ length: 48 }, (_, i) => {
    const a = (2 * Math.PI * i) / 48;
    const x = rx * Math.cos(a), y = ry * Math.sin(a);
    return { x: cx + x * c - y * s, y: cy + x * s + y * c };
  }));
};

/** Leaf from a base point to a tip, widest in the middle. */
const leaf = (bx: number, by: number, tx: number, ty: number, width: number): Ring => {
  const dx = tx - bx, dy = ty - by, len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len;
  const n = 16;
  const side = (sign: 1 | -1) => Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const w = (width / 2) * Math.pow(Math.sin(Math.PI * t), 0.85) * sign;
    return { x: bx + dx * t + nx * w, y: by + dy * t + ny * w };
  });
  return ccw([...side(1), ...side(-1).reverse().slice(1, -1)]);
};

/** Leaf from a base point, `angleDeg` clockwise from straight up. */
const leafAt = (bx: number, by: number, length: number, angleDeg: number, width: number): Ring =>
  leaf(bx, by, bx + length * Math.sin(rad(angleDeg)), by - length * Math.cos(rad(angleDeg)), width);

/** Straight bar of thickness `t` between two points (square ends). */
const bar = (x0: number, y0: number, x1: number, y1: number, t: number): Ring => {
  const len = Math.hypot(x1 - x0, y1 - y0), nx = (-(y1 - y0) / len) * (t / 2), ny = ((x1 - x0) / len) * (t / 2);
  return poly([x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]);
};

/** Band of the given half-widths along a quadratic curve. */
const curve = (p0: Pt, p1: Pt, p2: Pt, halfStart: number, halfEnd: number): Ring => {
  const n = 24;
  const at = (t: number): Pt => ({ x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x, y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y });
  const left: Pt[] = [], right: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = at(t), b = at(Math.min(1, t + 0.01)), c = at(Math.max(0, t - 0.01));
    const dx = b.x - c.x, dy = b.y - c.y, len = Math.hypot(dx, dy) || 1;
    const w = halfStart + (halfEnd - halfStart) * t;
    left.push({ x: a.x - (dy / len) * w, y: a.y + (dx / len) * w });
    right.push({ x: a.x + (dy / len) * w, y: a.y - (dx / len) * w });
  }
  return ccw([...left, ...right.reverse()]);
};

const star = (cx: number, cy: number, outer: number, inner: number, points: number, startDeg = -90): Ring =>
  ccw(Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner, a = rad(startDeg + (180 / points) * i);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }));

const heart = (cx: number, cy: number, size: number): Ring =>
  ccw(Array.from({ length: 64 }, (_, i) => {
    const t = (2 * Math.PI * i) / 64;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    return { x: cx + (x * size) / 32, y: cy + (y * size) / 32 };
  }));

/** Flat-sided diamond. */
const diamond = (cx: number, cy: number, halfW: number, halfH: number): Ring => poly([cx, cy - halfH], [cx + halfW, cy], [cx, cy + halfH], [cx - halfW, cy]);

// ---------- motifs ----------

export const ELEMENTS: readonly ElementDef[] = [
  {
    id: 'lotus', name: 'Lotus', category: 'nature',
    build: () => [
      ...[[0, 72, 22], [-38, 60, 19], [38, 60, 19], [-72, 46, 16], [72, 46, 16]].map(([a, l, w]) => leafAt(50, 86, l, a, w)),
      ellipse(50, 90, 30, 6),
    ],
  },
  {
    id: 'peacock', name: 'Peacock', category: 'animals',
    build: () => [
      ...[[-78, 56], [-52, 62], [-26, 66], [26, 66], [52, 62], [78, 56]].map(([a, l]) => leafAt(50, 74, l, a, 13)),
      ellipse(50, 80, 12, 16),
      poly([45, 58], [55, 58], [58, 76], [42, 76]),
      circle(50, 52, 7),
      leafAt(50, 48, 18, 0, 6),
      poly([52, 50], [60, 53], [52, 56]),
    ],
  },
  {
    id: 'tree-of-life', name: 'Tree of life', category: 'nature',
    build: () => [
      circle(50, 28, 19), circle(28, 38, 14), circle(72, 38, 14), circle(36, 20, 12), circle(64, 20, 12),
      poly([43, 96], [57, 96], [54, 38], [46, 38]),
      leafAt(46, 90, 22, -62, 7), leafAt(54, 90, 22, 62, 7),
      ellipse(50, 96, 22, 4),
    ],
  },
  {
    id: 'branch', name: 'Leaf branch', category: 'nature',
    build: () => [
      curve({ x: 50, y: 96 }, { x: 44, y: 55 }, { x: 52, y: 14 }, 2.5, 1.2),
      ...[80, 60, 40].flatMap(y => [leafAt(49 - (80 - y) * 0.05, y, 28, -52, 12), leafAt(49 - (80 - y) * 0.05, y, 28, 52, 12)]),
      leafAt(52, 22, 20, 0, 11),
    ],
  },
  {
    id: 'sun', name: 'Sun', category: 'symbols',
    build: () => [
      circle(50, 50, 17),
      ...Array.from({ length: 8 }, (_, i) => leafAt(50, 50, 46, i * 45, 12)),
    ],
  },
  {
    id: 'moon', name: 'Crescent moon', category: 'symbols',
    build: () => difference([circle(50, 50, 42)], [circle(64, 44, 34)]),
  },
  { id: 'star', name: 'Star', category: 'symbols', build: () => [star(50, 53, 46, 19, 5)] },
  { id: 'heart', name: 'Heart', category: 'symbols', build: () => [heart(50, 48, 92)] },
  {
    id: 'arrow', name: 'Arrow', category: 'symbols',
    build: () => [poly([8, 38], [56, 38], [56, 18], [94, 50], [56, 82], [56, 62], [8, 62])],
  },
  {
    id: 'arrow-curved', name: 'Curved arrow', category: 'symbols',
    build: () => [curve({ x: 10, y: 80 }, { x: 14, y: 22 }, { x: 62, y: 26 }, 7, 7), poly([56, 4], [94, 26], [60, 52])],
  },
  {
    id: 'bird', name: 'Bird', category: 'animals',
    build: () => [
      ellipse(48, 58, 24, 11, -14),
      circle(74, 46, 8),
      poly([79, 42], [95, 47], [79, 52]),
      leaf(30, 62, 6, 76, 11),
      leaf(46, 54, 22, 8, 22),
      bar(44, 66, 40, 86, 4), bar(54, 66, 52, 86, 4),
    ],
  },
  {
    id: 'elephant', name: 'Elephant', category: 'animals',
    build: () => [
      ellipse(46, 50, 32, 22),
      circle(80, 42, 15),
      ellipse(68, 50, 9, 14),
      curve({ x: 90, y: 50 }, { x: 98, y: 74 }, { x: 88, y: 88 }, 6, 3),
      ...[20, 36, 56, 70].map(x => poly([x - 5, 62], [x + 5, 62], [x + 5, 92], [x - 5, 92])),
      bar(14, 42, 8, 62, 4),
    ],
  },
  {
    id: 'diya', name: 'Diya', category: 'festive',
    build: () => [
      ellipse(50, 68, 38, 22),
      poly([12, 68], [88, 68], [88, 56], [12, 56]),
      leaf(50, 62, 50, 8, 24),
      poly([86, 60], [98, 54], [90, 68]),
      bar(30, 92, 70, 92, 6),
    ],
  },
  {
    id: 'kalash', name: 'Kalash', category: 'festive',
    build: () => [
      ellipse(50, 70, 26, 22),
      poly([38, 52], [62, 52], [60, 44], [40, 44]),
      poly([32, 44], [68, 44], [68, 36], [32, 36]),
      leafAt(50, 38, 26, -50, 12), leafAt(50, 38, 28, 0, 12), leafAt(50, 38, 26, 50, 12),
      circle(50, 22, 9),
      poly([34, 96], [66, 96], [62, 88], [38, 88]),
    ],
  },
  {
    id: 'paisley', name: 'Paisley', category: 'festive',
    build: () => [
      circle(42, 64, 28),
      curve({ x: 56, y: 44 }, { x: 96, y: 40 }, { x: 78, y: 6 }, 12, 1.5),
    ],
  },
  {
    id: 'rosette', name: 'Mandala rosette', category: 'festive',
    build: () => [
      circle(50, 50, 12),
      ...Array.from({ length: 8 }, (_, i) => leafAt(50, 50, 40, i * 45, 17)),
      ...Array.from({ length: 8 }, (_, i) => leafAt(50, 50, 48, i * 45 + 22.5, 7)),
    ],
  },
  {
    id: 'floral-corner', name: 'Floral corner', category: 'borders',
    place: { span: 'min', share: 0.3, anchor: 'top-left' },
    build: () => {
      const arc: Ring = curve({ x: 4, y: 88 }, { x: 4, y: 4 }, { x: 88, y: 4 }, 3, 3);
      const petals = Array.from({ length: 5 }, (_, i) => leafAt(25, 25, 19, i * 72, 13));
      return [arc, ...petals, circle(25, 25, 8), leaf(7, 58, 34, 68, 11), leaf(58, 7, 68, 34, 11), circle(5, 88, 5), circle(88, 5, 5)];
    },
  },
  {
    id: 'border-straight', name: 'Border strip', category: 'borders',
    place: { span: 'width', share: 0.8, anchor: 'top' },
    build: () => [
      poly([0, 0], [100, 0], [100, 7], [0, 7]),
      ...[10, 30, 50, 70, 90].map(x => diamond(x, 17, 7, 12)),
    ],
  },
  {
    id: 'border-corner', name: 'Border corner', category: 'borders',
    place: { span: 'min', share: 0.3, anchor: 'top-left' },
    build: () => [
      poly([0, 0], [100, 0], [100, 7], [7, 7], [7, 100], [0, 100]),
      diamond(14, 14, 16, 16),
      ...[52, 80].map(x => diamond(x, 17, 7, 12)),
      ...[52, 80].map(y => diamond(17, y, 12, 7)),
    ],
  },
];

export const elementById = (id: string): ElementDef | undefined => ELEMENTS.find(e => e.id === id);

const pathCache = new Map<string, string>();

/** The silhouette as one clean region (overlaps merged), in 100-unit box coordinates. */
export function elementRings(id: string): Rings {
  const def = elementById(id);
  return def ? union(def.build()) : [];
}

/** Path data of a motif in its 100-unit box (memoised: thumbnails and placement share it). */
export function elementPathData(id: string): string {
  let d = pathCache.get(id);
  if (d === undefined) {
    d = ringsToPathData(elementRings(id), true, 2);
    pathCache.set(id, d);
  }
  return d;
}
