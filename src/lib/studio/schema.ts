/**
 * Studio design document — schema version 4 (the authoritative, versioned format).
 *
 * Units are millimetres everywhere. The plate occupies (0,0)–(widthMm,heightMm); y grows
 * downwards (SVG convention). Each object's geometry is defined in *local* coordinates
 * centred on (0,0) and placed by translate(x,y) · rotate(rotation°) · scale(scaleX,scaleY).
 *
 * What gets cut is derived, never stored as the source of truth: see compose.ts
 * (plate ∪ "add" objects − "cut" objects − mounting holes, plus automatic bridges).
 * `production` is a frozen snapshot of that result, attached when the design is added to
 * the cart, so production files never depend on fonts or code that may change later.
 *
 * Reference: docs/studio.md ("Design document schema"). Older formats are migrated in
 * src/lib/orders/camDocument.ts (legacy VDM 3.0.0 order designs) and
 * src/lib/projectStorage.ts (legacy saved projects).
 */
import { z } from 'zod';

export const STUDIO_SCHEMA_VERSION = 4 as const;

const finite = z.number().finite();
const positive = finite.positive();

/** How an object contributes to the part: removed from material, added to it, or engraved (score line). */
export const objectOpSchema = z.enum(['cut', 'add', 'score']);
export type ObjectOp = z.infer<typeof objectOpSchema>;

const baseObjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(120).optional(),
  x: finite,
  y: finite,
  rotation: finite.default(0),
  scaleX: finite.default(1),
  scaleY: finite.default(1),
  op: objectOpSchema,
  locked: z.boolean().optional(),
  hidden: z.boolean().optional(),
  groupId: z.string().optional(),
});

export const textObjectSchema = baseObjectSchema.extend({
  kind: z.literal('text'),
  text: z.string().max(500),
  fontId: z.string().min(1),
  /** Letter (cap) height in mm — what a customer means by "10 cm letters". */
  sizeMm: positive,
  letterSpacingMm: finite.default(0),
  lineHeight: positive.default(1.25),
  align: z.enum(['left', 'center', 'right']).default('center'),
  /** Fuse nearly-touching letters (script fonts) into one connected piece. */
  weld: z.boolean().default(false),
  /** Template field this text is bound to (parametric templates). */
  binding: z.string().optional(),
  /** Cached outline in local mm (derived from text+font+size; re-derivable). */
  outline: z.string().optional(),
});

export const shapeObjectSchema = baseObjectSchema.extend({
  kind: z.literal('shape'),
  /** Id from the shape library (src/lib/shapes.ts) or a studio generator (studio/shapes.ts). */
  shapeId: z.string().min(1),
  widthMm: positive,
  heightMm: positive,
  cornerRadiusMm: finite.min(0).default(0),
});

export const pathObjectSchema = baseObjectSchema.extend({
  kind: z.literal('path'),
  /** SVG path data in local mm, centred on (0,0). Closed sub-paths for cut/add; any for score. */
  d: z.string().min(1).max(400_000),
  source: z.enum(['trace', 'import', 'boolean', 'offset', 'draw']).optional(),
});

export const holeObjectSchema = baseObjectSchema.extend({
  kind: z.literal('hole'),
  diameterMm: positive,
});

export const studioObjectSchema = z.discriminatedUnion('kind', [
  textObjectSchema,
  shapeObjectSchema,
  pathObjectSchema,
  holeObjectSchema,
]);

export type TextObject = z.infer<typeof textObjectSchema>;
export type ShapeObject = z.infer<typeof shapeObjectSchema>;
export type PathObject = z.infer<typeof pathObjectSchema>;
export type HoleObject = z.infer<typeof holeObjectSchema>;
export type StudioObject = z.infer<typeof studioObjectSchema>;
export type StudioObjectKind = StudioObject['kind'];

/**
 * - solid: a full plate; objects default to being cut out of it (name plates, stencils).
 * - frame: only a border ring of the plate shape; objects are added and welded to it.
 * - none:  no plate; the part is the union of the "add" objects (free-standing letters, logos).
 */
export const plateStyleSchema = z.enum(['solid', 'frame', 'none']);
export type PlateStyle = z.infer<typeof plateStyleSchema>;

export const plateSchema = z.object({
  style: plateStyleSchema,
  shapeId: z.string().min(1),
  widthMm: positive,
  heightMm: positive,
  cornerRadiusMm: finite.min(0).default(0),
  /** Border width for the "frame" style. */
  borderMm: finite.min(0).default(15),
});
export type Plate = z.infer<typeof plateSchema>;

export const materialSchema = z.object({
  /** Server-known finish id (DEFAULT_CUSTOM_FINISH_RATES keys). */
  finish: z.string().min(1),
  thicknessMm: positive,
});
export type MaterialChoice = z.infer<typeof materialSchema>;

export const mountingSchema = z.object({
  preset: z.enum(['none', 'top-2', 'corners-4', 'center-1']),
  diameterMm: positive.default(5),
  /** Distance from the plate edge to the hole centre. */
  insetMm: positive.default(15),
});
export type Mounting = z.infer<typeof mountingSchema>;

export const manufacturingSchema = z.object({
  /** Automatically connect loose pieces (letter counters, floating parts) with bridges. */
  autoBridges: z.boolean().default(false),
  /** Bridge width override; default comes from the material rules. */
  bridgeWidthMm: positive.optional(),
});

const productionContourSchema = z.object({
  role: z.enum(['inner', 'outer', 'score']),
  /** Polyline in plate mm ("M x y L x y … Z"); closed unless role is score. */
  d: z.string().min(1),
});

/** Frozen cut geometry (nominal, before kerf) used by production exports. */
export const productionSchema = z.object({
  generatedAt: finite,
  widthMm: positive,
  heightMm: positive,
  /** Contours in cut order: inner (holes, deepest first), then score, then outer. */
  contours: z.array(productionContourSchema),
  kerfMm: finite.min(0),
  substrate: z.string(),
  thicknessMm: positive,
  finish: z.string(),
});
export type ProductionGeometry = z.infer<typeof productionSchema>;
export type ProductionContour = z.infer<typeof productionContourSchema>;

export const studioDocumentSchema = z.object({
  schemaVersion: z.literal(STUDIO_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().max(120).default(''),
  createdAt: finite,
  updatedAt: finite,
  plate: plateSchema,
  material: materialSchema,
  mounting: mountingSchema,
  manufacturing: manufacturingSchema,
  objects: z.array(studioObjectSchema).max(2000),
  template: z.object({ id: z.string(), fields: z.record(z.string()) }).optional(),
  production: productionSchema.optional(),
});
export type StudioDocument = z.infer<typeof studioDocumentSchema>;

/** Parses untrusted JSON-like input into a document, filling defaults. Throws ZodError on invalid input. */
export function parseStudioDocument(value: unknown): StudioDocument {
  return studioDocumentSchema.parse(value);
}

export function isStudioDocument(value: unknown): boolean {
  return studioDocumentSchema.safeParse(value).success;
}
