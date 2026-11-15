/**
 * Thin-metal and narrow-slot detection. Thin metal by morphological opening: shrink the metal by w/2, grow it back, and
 * report what did not come back (strips and necks narrower than the minimum web w).
 *
 * A laser cuts an acute tip fine, so the sharp end of a wedge of metal (the metal inside a
 * cut-out M, N, W, V, a star point, a leaf tip) must not count as thin. Both offsets are
 * mitered with a high miter limit: a wedge shrinks to a smaller similar wedge and grows back
 * to the original, apex included, so tapering tips leave no residue. Strips and necks of
 * near-constant width vanish when shrunk and are reported. Only tips sharper than
 * TIP_MIN_ANGLE_DEG are bevelled by the limit; what is left of them is a needle, which is
 * fragile, and the residue filters below report it once it is big enough to matter (about 7°
 * and sharper at the minimum web).
 */
import { difference, offset, pieces } from './geometry/clipper';
import { ringsBounds, type Bounds, type Rings } from './geometry/path';

/** Apex angle below which a tip counts as a needle rather than a point. */
export const TIP_MIN_ANGLE_DEG = 10;
export const MITER_LIMIT = 1 / Math.sin((TIP_MIN_ANGLE_DEG / 2) * (Math.PI / 180));

const extent = (b: Bounds) => Math.max(b.maxX - b.minX, b.maxY - b.minY);

/** Bounding boxes of metal thinner than `minFeatureMm`, ignoring corner slivers and tapering tips. */
export function findThinFeatures(material: Rings, minFeatureMm: number): Bounds[] {
  const r = minFeatureMm / 2;
  const opened = offset(offset(material, -r, 'miter', MITER_LIMIT), r, 'miter', MITER_LIMIT);
  return pieces(difference(material, opened))
    // Corner rounding leaves tiny slivers; ignore those.
    .filter(p => p.area >= r * r * 1.5 && extent(ringsBounds([p.outer]) as Bounds) >= minFeatureMm * 1.5)
    .map(p => ringsBounds([p.outer]) as Bounds);
}

/**
 * Bounding boxes of gaps narrower than `minHoleMm` (the closing residue: grow the cuts, shrink
 * back). The same miter limit keeps the sharp end of a cut-out (a star point, a lens tip) from
 * counting as a narrow slot.
 */
export function findNarrowSlots(material: Rings, minHoleMm: number): Bounds[] {
  const s = minHoleMm / 2;
  const closed = offset(offset(material, s, 'miter', MITER_LIMIT), -s, 'miter', MITER_LIMIT);
  return pieces(difference(closed, material))
    .filter(p => p.area >= s * s * 1.5 && extent(ringsBounds([p.outer]) as Bounds) >= minHoleMm * 1.5)
    .map(p => ringsBounds([p.outer]) as Bounds);
}
