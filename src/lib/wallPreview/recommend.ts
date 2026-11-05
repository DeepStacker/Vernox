export const EYE_LEVEL_CENTRE_CM = 145;
/** Art is easiest on the eye at about 57-60% of the width of the wall it hangs on. */
export const WALL_FILL_RANGE = { min: 0.5, ideal: 0.58, max: 0.66 } as const;
/** ...and about 2/3 of the width of the furniture beneath it. */
export const FURNITURE_FILL = { min: 0.55, ideal: 0.66, max: 0.8 } as const;

export interface SizeLike {
  widthMm: number;
  heightMm: number;
}

export type SizeVerdict = 'small' | 'good' | 'large' | 'toobig';

export interface Recommendation {
  /** Width range in cm that suits the wall (and furniture, when given). */
  minWidthCm: number;
  maxWidthCm: number;
  idealWidthCm: number;
  /** Index into the sizes array of the closest size to ideal, or -1 when no size fits. */
  bestIndex: number;
  verdicts: SizeVerdict[];
}

export function recommendSizes(
  sizes: SizeLike[],
  wallWidthCm: number,
  wallHeightCm?: number,
  furnitureWidthCm?: number,
): Recommendation {
  const w = Math.max(1, wallWidthCm);
  let min = w * WALL_FILL_RANGE.min;
  let max = w * WALL_FILL_RANGE.max;
  let ideal = w * WALL_FILL_RANGE.ideal;
  if (furnitureWidthCm && furnitureWidthCm > 0) {
    // Art above furniture is judged against the furniture, but never wider than the wall allows.
    max = Math.min(w * 0.9, furnitureWidthCm * FURNITURE_FILL.max);
    min = Math.min(max, furnitureWidthCm * FURNITURE_FILL.min);
    ideal = Math.min(max, furnitureWidthCm * FURNITURE_FILL.ideal);
  }
  const verdicts = sizes.map((s): SizeVerdict => {
    const sw = s.widthMm / 10;
    const sh = s.heightMm / 10;
    if (sw > wallWidthCm || (wallHeightCm !== undefined && sh > wallHeightCm * 0.85)) return 'toobig';
    if (sw < min) return 'small';
    if (sw > max) return 'large';
    return 'good';
  });
  let bestIndex = -1;
  let bestDelta = Infinity;
  sizes.forEach((s, i) => {
    if (verdicts[i] === 'toobig') return;
    const d = Math.abs(s.widthMm / 10 - ideal);
    if (d < bestDelta) {
      bestDelta = d;
      bestIndex = i;
    }
  });
  return { minWidthCm: Math.round(min), maxWidthCm: Math.round(max), idealWidthCm: Math.round(ideal), bestIndex, verdicts };
}

/** Distance from the floor to the piece's centre, given its centre y in wall coordinates (top-down). */
export function heightFromFloorCm(centreYCm: number, wallHeightCm: number): number {
  return Math.round(wallHeightCm - centreYCm);
}

export function centreYForHeightCm(heightFromFloor: number, wallHeightCm: number): number {
  return wallHeightCm - heightFromFloor;
}
