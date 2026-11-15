/**
 * Where a pattern goes: the plate's fillable area, or the area of a selected object, and
 * whether the pattern becomes holes (cut) or the lattice that remains (add).
 */
import { objectRings, plateOutline } from '../compose';
import { normalise, offset } from '../geometry/clipper';
import type { Rings } from '../geometry/path';
import type { Plate, StudioObject } from '../schema';

/** The lattice of a frame fill reaches this far into the frame so the two weld into one piece. */
const FRAME_OVERLAP_MM = 1;

export interface FillTarget {
  region: Rings;
  /** 'cut': the pattern is holes cut out of the metal; 'add': it is the lattice, added metal. */
  mode: 'cut' | 'add';
}

/**
 * Solid plate: holes cut in the plate. Frame: a lattice filling the opening, welded to the
 * border. No plate: a free-standing perforated panel in the plate's shape.
 */
export function plateFillTarget(plate: Plate): FillTarget {
  const outline = plateOutline(plate);
  if (plate.style === 'solid') return { region: outline, mode: 'cut' };
  if (plate.style === 'none') return { region: outline, mode: 'add' };
  const border = Math.min(plate.borderMm, Math.min(plate.widthMm, plate.heightMm) / 2 - 1);
  return { region: border > FRAME_OVERLAP_MM ? offset(outline, -(border - FRAME_OVERLAP_MM), 'miter') : [], mode: 'add' };
}

/** The area of an object (cut-outs and solids alike): holes are cut inside it. */
export function objectFillTarget(obj: StudioObject): FillTarget {
  return { region: normalise(objectRings(obj)), mode: 'cut' };
}

/** Objects a pattern can fill: shapes, paths and text, not holes and not engrave lines. */
export const canFill = (obj: StudioObject | undefined): obj is StudioObject => Boolean(obj && obj.kind !== 'hole' && obj.op !== 'score');
