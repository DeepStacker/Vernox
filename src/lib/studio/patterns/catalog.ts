/**
 * Pattern (jali) catalogue: names and the numbers the UI needs to choose sensible defaults.
 * No geometry here (see cells.ts), so the panel can import it without the geometry engine.
 *
 * Every pattern is a set of nominal cells that never overlap (neighbours may touch); the
 * generator insets each cell by half the web width, so the metal between two holes is at
 * least the web width everywhere, whatever the cell shape.
 */
import type { Join } from '../geometry/clipper';

export type PatternId =
  | 'hexagon' | 'honeycomb' | 'diamond' | 'circles' | 'scales'
  | 'quatrefoil' | 'octagon' | 'waves' | 'triangles' | 'arabesque';

export interface PatternInfo {
  id: PatternId;
  name: string;
  blurb: string;
  /** Width of the smallest part of a hole as a fraction of the pattern size (before the web is taken off). */
  holeFactor: number;
  /** Cells per square of side = pattern size (estimates the cell count before generating). */
  density: number;
  join: Join;
  /** Corner radius of the holes as a fraction of the pattern size (0 = sharp). */
  rounding?: number;
  /** Long bands rather than separate cells: clipping them never leaves a scrap to drop. */
  continuous?: boolean;
}

export const PATTERNS: readonly PatternInfo[] = [
  { id: 'hexagon', name: 'Hexagon', blurb: 'Flat-topped hexagons', holeFactor: 1, density: 1.16, join: 'miter' },
  { id: 'honeycomb', name: 'Honeycomb', blurb: 'Rounded, pointy-topped cells', holeFactor: 0.95, density: 1.16, join: 'miter', rounding: 0.1 },
  { id: 'diamond', name: 'Diamond lattice', blurb: 'Classic jali diamonds', holeFactor: 1, density: 1, join: 'miter' },
  { id: 'circles', name: 'Circles', blurb: 'Staggered round holes', holeFactor: 1, density: 1.16, join: 'round' },
  { id: 'scales', name: 'Scales', blurb: 'Overlapping fish-scale arcs', holeFactor: 0.55, density: 2, join: 'round' },
  { id: 'quatrefoil', name: 'Moroccan quatrefoil', blurb: 'Four-lobed flowers with dots', holeFactor: 0.54, density: 2, join: 'round' },
  { id: 'octagon', name: 'Star & cross', blurb: 'Octagons joined by small diamonds', holeFactor: 0.41, density: 2, join: 'miter' },
  { id: 'waves', name: 'Waves', blurb: 'Flowing wave bands', holeFactor: 0.8, density: 0.01, join: 'round', continuous: true },
  { id: 'triangles', name: 'Triangles', blurb: 'Triangular tiling', holeFactor: 0.577, density: 2.31, join: 'miter' },
  { id: 'arabesque', name: 'Arabesque', blurb: 'Interlocking pointed arches', holeFactor: 0.4, density: 2, join: 'miter' },
];

export const patternInfo = (id: PatternId): PatternInfo => PATTERNS.find(p => p.id === id) ?? PATTERNS[0];

/** Most cells one fill may generate; beyond that the UI asks for a bigger pattern size. */
export const MAX_PATTERN_CELLS = 6000;
export const MIN_PATTERN_SIZE_MM = 8;
export const MAX_PATTERN_SIZE_MM = 300;

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** Web width that passes the thin-metal check with a margin: 25 % over the minimum, in 0.5 mm steps. */
export const defaultWebMm = (minWebMm: number) => Math.max(roundTo(minWebMm * 1.25, 0.5), minWebMm + 0.5);

/** Smallest pattern size whose holes stay above the minimum hole after the web is taken off. */
export function minPatternSizeMm(info: PatternInfo, webMm: number, minHoleMm: number): number {
  return Math.max(MIN_PATTERN_SIZE_MM, Math.ceil(((minHoleMm * 1.25 + webMm) / info.holeFactor) * 1.05));
}

/** A comfortable default size: at least 20 mm and well above the minimum. */
export function defaultPatternSizeMm(info: PatternInfo, webMm: number, minHoleMm: number): number {
  return Math.max(20, Math.ceil(minPatternSizeMm(info, webMm, minHoleMm) * 1.3));
}

/**
 * Clear metal kept around a fill. With mounting holes it also leaves room for them (the hole,
 * the edge clearance and a web) so pattern cut-outs never run into the screw holes.
 */
export function defaultMarginMm(mounting: { preset: string; insetMm: number; diameterMm: number }, minEdgeMm: number, webMm: number): number {
  if (mounting.preset === 'none') return Math.max(10, Math.ceil(webMm * 3));
  return Math.ceil(mounting.insetMm + mounting.diameterMm / 2 + minEdgeMm + webMm);
}

/** Estimated number of cells for a region of the given size. */
export const estimateCells = (info: PatternInfo, widthMm: number, heightMm: number, sizeMm: number) =>
  Math.ceil(((widthMm + sizeMm) * (heightMm + sizeMm) * info.density) / (sizeMm * sizeMm));
