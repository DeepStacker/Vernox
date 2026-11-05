/**
 * Auto-fit for template-bound text: when a customer types a long name, the letters shrink
 * so the line stays inside the plate (with a margin). Shaping is linear in size, so the
 * cached outline is scaled exactly instead of re-shaped.
 */
import { pathBounds, transformPathData } from '../geometry/path';
import type { Plate, TextObject } from '../schema';

export function plateTextMargin(plate: Plate): number {
  return Math.max(12, Math.min(plate.widthMm, plate.heightMm) * 0.08) + (plate.style === 'frame' ? plate.borderMm : 0);
}

/** Returns the object shrunk to fit the plate width, or the same object when it already fits. */
export function autoFitBoundText(obj: TextObject, plate: Plate): TextObject {
  if (!obj.binding || !obj.outline) return obj;
  const b = pathBounds(obj.outline);
  if (!b) return obj;
  const width = (b.maxX - b.minX) * Math.abs(obj.scaleX);
  const maxWidth = plate.widthMm - 2 * plateTextMargin(plate);
  if (width <= maxWidth || maxWidth <= 0) return obj;
  const k = maxWidth / width;
  return {
    ...obj,
    sizeMm: Math.round(obj.sizeMm * k * 100) / 100,
    letterSpacingMm: obj.letterSpacingMm * k,
    outline: transformPathData(obj.outline, [k, 0, 0, k, 0, 0]),
  };
}
