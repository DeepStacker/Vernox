/**
 * Parametric shape generators for the "Custom shape" builder: regular polygon, star, ring and
 * spiral. Each returns path data in mm centred on (0,0), sized by its bounding circle diameter.
 * Rounded rectangles, arches and teardrops are ordinary shapes (shapes.ts) with their own size.
 */
import { formatCoord } from '../geometry/path';

export type ParametricKind = 'polygon' | 'star' | 'ring' | 'spiral';

export interface ParametricParams {
  /** Polygon sides (3 to 24). */
  sides: number;
  /** Star points (3 to 24). */
  points: number;
  /** Star: inner radius as a share of the outer radius (0.2 to 0.9). */
  innerRatio: number;
  /** Ring: band width as a share of the outer radius (0.1 to 0.8). */
  bandRatio: number;
  /** Spiral: full turns (1 to 8). */
  turns: number;
}

export const DEFAULT_PARAMETRIC: ParametricParams = { sides: 6, points: 5, innerRatio: 0.45, bandRatio: 0.25, turns: 3 };

export const PARAMETRIC_LIMITS = {
  sides: { min: 3, max: 24 },
  points: { min: 3, max: 24 },
  innerRatio: { min: 0.2, max: 0.9 },
  bandRatio: { min: 0.1, max: 0.8 },
  turns: { min: 1, max: 8 },
} as const;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
const fmt = (n: number) => formatCoord(n, 2);
const polygonData = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L')}Z`;

/** Points at equal angles on a circle, first vertex straight up. */
const onCircle = (count: number, radius: number, offsetRad = 0): [number, number][] =>
  Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + offsetRad + (2 * Math.PI * i) / count;
    return [radius * Math.cos(a), radius * Math.sin(a)];
  });

/** A circle as four arcs (compact path data), counter-clockwise or clockwise. */
const circleData = (r: number, clockwise: boolean) => {
  const sweep = clockwise ? 1 : 0;
  return `M${fmt(r)} 0A${fmt(r)} ${fmt(r)} 0 1 ${sweep} ${fmt(-r)} 0A${fmt(r)} ${fmt(r)} 0 1 ${sweep} ${fmt(r)} 0Z`;
};

/** Path data and the op that suits it: a spiral is a score line, the rest are closed outlines. */
export function parametricShape(kind: ParametricKind, diameterMm: number, params: Partial<ParametricParams> = {}): { d: string; op: 'default' | 'score' } {
  const p = { ...DEFAULT_PARAMETRIC, ...params };
  const R = Math.max(1, diameterMm) / 2;
  const L = PARAMETRIC_LIMITS;
  switch (kind) {
    case 'polygon':
      return { d: polygonData(onCircle(Math.round(clamp(p.sides, L.sides.min, L.sides.max)), R)), op: 'default' };
    case 'star': {
      const n = Math.round(clamp(p.points, L.points.min, L.points.max));
      const inner = R * clamp(p.innerRatio, L.innerRatio.min, L.innerRatio.max);
      const outerPts = onCircle(n, R), innerPts = onCircle(n, inner, Math.PI / n);
      return { d: polygonData(outerPts.flatMap((pt, i) => [pt, innerPts[i]])), op: 'default' };
    }
    case 'ring': {
      const inner = R * (1 - clamp(p.bandRatio, L.bandRatio.min, L.bandRatio.max));
      return { d: `${circleData(R, false)}${circleData(inner, true)}`, op: 'default' };
    }
    case 'spiral': {
      const turns = clamp(p.turns, L.turns.min, L.turns.max);
      const steps = Math.ceil(turns * 48);
      const pts: [number, number][] = Array.from({ length: steps + 1 }, (_, i) => {
        const t = i / steps, a = t * turns * 2 * Math.PI;
        return [R * t * Math.cos(a), R * t * Math.sin(a)];
      });
      return { d: `M${pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L')}`, op: 'score' };
    }
  }
}
