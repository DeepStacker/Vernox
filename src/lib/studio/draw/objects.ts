/**
 * Bridges between editable paths and `path` objects: drawn paths become objects centred on
 * (0,0) in local mm (the schema invariant), and node edits are written back re-centred with
 * the object's placement adjusted so nothing on the plate moves.
 */
import { createPath, defaultOpFor } from '../document';
import { applyMatrix, centrePathData, placementMatrix } from '../geometry/path';
import type { PathObject, PlateStyle } from '../schema';
import { serializePath, type EditablePath, type SubPath } from './pathModel';

/** A freshly drawn sub-path (plate mm) as a path object: closed shapes cut/add by plate style, open lines engrave. */
export function drawnPathObject(sub: SubPath, plateStyle: PlateStyle): PathObject | null {
  const d = serializePath([sub]);
  if (!d) return null;
  const c = centrePathData(d);
  if (c.width < 1e-3 && c.height < 1e-3) return null;
  return createPath(
    { d: c.d, x: c.cx, y: c.cy, source: 'draw', name: sub.closed ? 'Drawn shape' : 'Drawn line' },
    sub.closed ? defaultOpFor(plateStyle) : 'score',
  );
}

/** The patch that stores an edited (local mm) path on its object, or null when nothing is left. */
export function editedPathPatch(obj: Pick<PathObject, 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY'>, path: EditablePath): Pick<PathObject, 'd' | 'x' | 'y'> | null {
  const d = serializePath(path);
  if (!d) return null;
  const c = centrePathData(d);
  const at = applyMatrix(placementMatrix(obj.x, obj.y, obj.rotation, obj.scaleX, obj.scaleY), { x: c.cx, y: c.cy });
  return { d: c.d, x: at.x, y: at.y };
}
