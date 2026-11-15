/**
 * Shape outlines for plates and shape objects. Reuses the storefront shape library
 * (src/lib/shapes.ts, shared with product thumbnails) and adds a few parametric
 * generators the studio needs (rounded rectangle, arch, rosette/mandala ring, swastik).
 */
import { getShapeById, shapeDefinitions } from '@/lib/shapes';

export interface StudioShape {
  id: string;
  name: string;
  /** Path in (0,0)–(w,h). */
  path: (w: number, h: number, cornerRadius?: number) => string;
}

function roundedRect(w: number, h: number, r = 0): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr === 0) return `M0 0L${w} 0L${w} ${h}L0 ${h}Z`;
  return `M${rr} 0L${w - rr} 0A${rr} ${rr} 0 0 1 ${w} ${rr}L${w} ${h - rr}A${rr} ${rr} 0 0 1 ${w - rr} ${h}L${rr} ${h}A${rr} ${rr} 0 0 1 0 ${h - rr}L0 ${rr}A${rr} ${rr} 0 0 1 ${rr} 0Z`;
}

/** Rectangle with a semicircular (or elliptical) top — common for house signs. */
function arch(w: number, h: number): string {
  const rx = w / 2;
  const ry = Math.min(rx, h * 0.6);
  return `M0 ${h}L0 ${ry}A${rx} ${ry} 0 0 1 ${w} ${ry}L${w} ${h}Z`;
}

/** Teardrop: a round bottom with a point at the top (the tip is tangent to the circle). */
function teardrop(w: number, h: number): string {
  const r = w / 2;
  const d = Math.max(h - r, r * 1.05);
  const alpha = Math.acos(r / d);
  const cx = w / 2, cy = h - r;
  const px = r * Math.sin(alpha), py = r * Math.cos(alpha);
  return `M${cx} 0L${cx + px} ${cy - py}A${r} ${r} 0 1 1 ${cx - px} ${cy - py}Z`;
}

/** A petal rosette: n lobes around the centre (mandala/Om frames). */
function rosette(w: number, h: number, petals = 16): string {
  const cx = w / 2, cy = h / 2;
  const R = Math.min(w, h) / 2;
  const r = R * 0.86;
  const parts: string[] = [];
  for (let i = 0; i < petals; i++) {
    const a0 = (2 * Math.PI * i) / petals;
    const a1 = (2 * Math.PI * (i + 1)) / petals;
    const am = (a0 + a1) / 2;
    const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
    const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
    const c = [cx + (R * 1.07) * Math.cos(am), cy + (R * 1.07) * Math.sin(am)];
    parts.push(`${i === 0 ? `M${p0[0]} ${p0[1]}` : ''}Q${c[0]} ${c[1]} ${p1[0]} ${p1[1]}`);
  }
  return `${parts.join('')}Z`;
}

/**
 * Swastik (right-facing, the Hindu auspicious symbol): a single 5 × 5 cell polygon with
 * one-cell-wide arms, so the part stays one solid piece with generous metal at every bend.
 */
function swastik(w: number, h: number): string {
  const grid = [[2, 0], [5, 0], [5, 1], [3, 1], [3, 2], [5, 2], [5, 5], [4, 5], [4, 3], [3, 3], [3, 5], [0, 5], [0, 4], [2, 4], [2, 3], [0, 3], [0, 0], [1, 0], [1, 2], [2, 2]];
  return `${grid.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${(x * w) / 5} ${(y * h) / 5}`).join('')}Z`;
}

const GENERATORS: StudioShape[] = [
  { id: 'rectangle', name: 'Rectangle', path: roundedRect },
  { id: 'square', name: 'Square', path: roundedRect },
  { id: 'arch', name: 'Arch', path: arch },
  { id: 'teardrop', name: 'Teardrop', path: teardrop },
  { id: 'rosette', name: 'Rosette', path: (w, h) => rosette(w, h) },
  { id: 'swastik', name: 'Swastik', path: swastik },
];

const FROM_LIBRARY = shapeDefinitions
  .filter(s => !GENERATORS.some(g => g.id === s.id))
  .map<StudioShape>(s => ({ id: s.id, name: s.name, path: (w, h) => s.getPath(w, h) }));

export const STUDIO_SHAPES: readonly StudioShape[] = [...GENERATORS, ...FROM_LIBRARY];

/** Plate shapes offered first in Simple mode. */
export const SIMPLE_PLATE_SHAPES = ['rectangle', 'arch', 'circle', 'oval', 'rosette', 'hexagon', 'shield', 'house'] as const;

export function studioShapePath(shapeId: string, w: number, h: number, cornerRadius = 0): string {
  const gen = GENERATORS.find(g => g.id === shapeId);
  if (gen) return gen.path(w, h, cornerRadius);
  const lib = getShapeById(shapeId);
  return lib ? lib.getPath(w, h) : roundedRect(w, h, cornerRadius);
}
