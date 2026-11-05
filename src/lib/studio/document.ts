/**
 * Document and object factories with the studio's smart defaults. Pure: no React, no DOM.
 */
import { DEFAULT_FINISH, finishPreset } from './materials';
import {
  STUDIO_SCHEMA_VERSION,
  type HoleObject,
  type MaterialChoice,
  type Mounting,
  type ObjectOp,
  type PathObject,
  type Plate,
  type PlateStyle,
  type ShapeObject,
  type StudioDocument,
  type StudioObject,
  type TextObject,
} from './schema';

export function newId(prefix = 'o'): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rnd}`;
}

export interface CreateDocumentOptions {
  name?: string;
  plate?: Partial<Plate>;
  material?: Partial<MaterialChoice>;
  mounting?: Partial<Mounting>;
  objects?: StudioObject[];
}

/** The op an object gets by default: cut out of a solid plate, otherwise added as metal. */
export function defaultOpFor(style: PlateStyle): ObjectOp {
  return style === 'solid' ? 'cut' : 'add';
}

export function createDocument(opts: CreateDocumentOptions = {}): StudioDocument {
  const now = Date.now();
  const style = opts.plate?.style ?? 'solid';
  const finish = opts.material?.finish ?? DEFAULT_FINISH;
  return {
    schemaVersion: STUDIO_SCHEMA_VERSION,
    id: newId('d'),
    name: opts.name ?? '',
    createdAt: now,
    updatedAt: now,
    plate: {
      style,
      shapeId: 'rectangle',
      widthMm: 300,
      heightMm: 200,
      cornerRadiusMm: 6,
      borderMm: 15,
      ...opts.plate,
    },
    material: { finish, thicknessMm: opts.material?.thicknessMm ?? finishPreset(finish).defaultThicknessMm },
    mounting: { preset: style === 'solid' ? 'corners-4' : 'none', diameterMm: 5, insetMm: 15, ...opts.mounting },
    // Smart default: loose pieces (letter counters, floating parts) are bridged automatically.
    manufacturing: { autoBridges: true },
    objects: opts.objects ?? [],
  };
}

type Placement = Partial<Pick<StudioObject, 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY' | 'op' | 'name' | 'locked' | 'hidden' | 'groupId'>>;

const placed = (p: Placement, op: ObjectOp) => ({
  x: p.x ?? 0,
  y: p.y ?? 0,
  rotation: p.rotation ?? 0,
  scaleX: p.scaleX ?? 1,
  scaleY: p.scaleY ?? 1,
  op: p.op ?? op,
  ...(p.name ? { name: p.name } : {}),
  ...(p.locked ? { locked: true } : {}),
  ...(p.hidden ? { hidden: true } : {}),
  ...(p.groupId ? { groupId: p.groupId } : {}),
});

export function createText(opts: Placement & Partial<Pick<TextObject, 'text' | 'fontId' | 'sizeMm' | 'letterSpacingMm' | 'lineHeight' | 'align' | 'weld' | 'binding'>>, defaultOp: ObjectOp = 'cut'): TextObject {
  return {
    id: newId('t'),
    kind: 'text',
    ...placed(opts, defaultOp),
    text: opts.text ?? 'Your text',
    fontId: opts.fontId ?? 'poppins-semibold',
    sizeMm: opts.sizeMm ?? 30,
    letterSpacingMm: opts.letterSpacingMm ?? 0,
    lineHeight: opts.lineHeight ?? 1.25,
    align: opts.align ?? 'center',
    weld: opts.weld ?? false,
    ...(opts.binding ? { binding: opts.binding } : {}),
  };
}

export function createShape(opts: Placement & Partial<Pick<ShapeObject, 'shapeId' | 'widthMm' | 'heightMm' | 'cornerRadiusMm'>>, defaultOp: ObjectOp = 'cut'): ShapeObject {
  return {
    id: newId('s'),
    kind: 'shape',
    ...placed(opts, defaultOp),
    shapeId: opts.shapeId ?? 'circle',
    widthMm: opts.widthMm ?? 40,
    heightMm: opts.heightMm ?? 40,
    cornerRadiusMm: opts.cornerRadiusMm ?? 0,
  };
}

export function createPath(opts: Placement & Pick<PathObject, 'd'> & Partial<Pick<PathObject, 'source'>>, defaultOp: ObjectOp = 'cut'): PathObject {
  return { id: newId('p'), kind: 'path', ...placed(opts, defaultOp), d: opts.d, ...(opts.source ? { source: opts.source } : {}) };
}

export function createHole(opts: Placement & Partial<Pick<HoleObject, 'diameterMm'>>): HoleObject {
  return { id: newId('h'), kind: 'hole', ...placed(opts, 'cut'), op: 'cut', diameterMm: opts.diameterMm ?? 5 };
}

/** Deep copy with fresh ids (duplicate, paste, batch variants). */
export function cloneObject<T extends StudioObject>(obj: T, dx = 0, dy = 0): T {
  return { ...obj, id: newId(obj.id.split('_')[0] || 'o'), x: obj.x + dx, y: obj.y + dy };
}
