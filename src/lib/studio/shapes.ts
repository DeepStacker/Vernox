/**
 * Shape outlines for plates and shape objects. Reuses the storefront shape library
 * (src/lib/shapes.ts, shared with product thumbnails) and adds a few parametric
 * generators the studio needs (rounded rectangle, arch, rosette/mandala ring).
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

const GENERATORS: StudioShape[] = [
  { id: 'rectangle', name: 'Rectangle', path: roundedRect },
  { id: 'square', name: 'Square', path: roundedRect },
  { id: 'arch', name: 'Arch', path: arch },
  { id: 'rosette', name: 'Rosette', path: (w, h) => rosette(w, h) },
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
