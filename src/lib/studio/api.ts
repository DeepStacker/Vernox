/**
 * Public, headless studio API. Everything the studio UI does to a design can be done
 * here without React or a canvas — for tests, admin tools, B2B batch jobs and future
 * integrations. Documents are immutable: every function returns a new document.
 *
 *   const doc = await applyTemplate('house-name', { name: 'The Iyers' }, { finish: 'brass' });
 *   const { analysis } = validate(doc);
 *   const quote = price(doc);
 *   const dxf = exportDXF(doc);
 *
 * Reference: docs/studio.md ("Developer API").
 */
import { CUSTOM_PIECE_LIMITS, DEFAULT_CUSTOM_FINISH_RATES, quoteCustomPiece, type CustomFinishRate, type CustomPieceLimits, type CustomPieceQuote } from '@/lib/pricing/customPiece';
import { ORDER_LIMITS } from '@/lib/pricing/orderLimits';
import { CUSTOM_PRODUCT_ID } from '@/types/products';
import { exportProductionDXF, exportProductionSVG, type CamExportOptions } from '@/lib/exportCAM';
import { composeDocument, plateOutline, type Composition } from './compose';
import { createDocument, createHole, createPath, createShape, createText, defaultOpFor, type CreateDocumentOptions } from './document';
import { ringsToPathData, transformPathData } from './geometry/path';
import { analyzeComposition, billableSize, type Analysis } from './manufacturability';
import { finishPreset, resolveCutRules, type CutRuleOverrides, type CutRules } from './materials';
import { buildProduction } from './production';
import { parseStudioDocument, type HoleObject, type ProductionGeometry, type PathObject, type ShapeObject, type StudioDocument, type StudioObject, type TextObject } from './schema';
import { applyTemplateFields, getTemplate, templateDefaults } from './templates/registry';
import './templates/definitions';
import { fontById } from './text/fonts';
import { shapeText } from './text/shaper';
import { autoFitBoundText } from './text/fit';
import { DEFAULT_TRACE_OPTIONS, type TraceOptions } from './trace/options';
import type { ImageDataLike } from 'imagetracerjs';

export { createDocument, parseStudioDocument };
export type { StudioDocument, StudioObject, Analysis, CutRules };

/** Pricing/rules context; defaults mirror the server's built-in configuration. */
export interface StudioContext {
  rates?: Readonly<Record<string, CustomFinishRate>>;
  limits?: CustomPieceLimits;
  cutRuleOverrides?: CutRuleOverrides;
}

export function rulesFor(doc: StudioDocument, ctx: StudioContext = {}): CutRules {
  return resolveCutRules(doc.material.finish, doc.material.thicknessMm, ctx.cutRuleOverrides);
}

const touch = (doc: StudioDocument, patch: Partial<StudioDocument>): StudioDocument => ({ ...doc, ...patch, updatedAt: Date.now(), production: undefined });

// ---------- building ----------

/** Shapes (or re-shapes) the outline of a text object. */
export async function shapeTextObject(obj: TextObject): Promise<TextObject> {
  const shaped = await shapeText(obj);
  return { ...obj, outline: shaped.d || undefined };
}

/** Fills every missing text outline (fonts load on demand); template-bound text is fitted to the plate. */
export async function ensureOutlines(doc: StudioDocument): Promise<StudioDocument> {
  if (!doc.objects.some(o => o.kind === 'text' && !o.outline)) return doc;
  const objects = await Promise.all(
    doc.objects.map(async o => (o.kind === 'text' && !o.outline ? autoFitBoundText(await shapeTextObject(o), doc.plate) : o)),
  );
  return { ...doc, objects };
}

export async function addText(doc: StudioDocument, opts: Parameters<typeof createText>[0] = {}): Promise<StudioDocument> {
  const font = fontById(opts.fontId ?? 'poppins-semibold');
  const text = await shapeTextObject(createText({ x: doc.plate.widthMm / 2, y: doc.plate.heightMm / 2, weld: font.weld, ...opts }, defaultOpFor(doc.plate.style)));
  return touch(doc, { objects: [...doc.objects, text] });
}

export function addShape(doc: StudioDocument, opts: Parameters<typeof createShape>[0] = {}): StudioDocument {
  const shape: ShapeObject = createShape({ x: doc.plate.widthMm / 2, y: doc.plate.heightMm / 2, ...opts }, defaultOpFor(doc.plate.style));
  return touch(doc, { objects: [...doc.objects, shape] });
}

export function addHole(doc: StudioDocument, opts: Parameters<typeof createHole>[0] = {}): StudioDocument {
  const hole: HoleObject = createHole({ x: doc.plate.widthMm / 2, y: doc.plate.heightMm / 2, ...opts });
  return touch(doc, { objects: [...doc.objects, hole] });
}

export function addPath(doc: StudioDocument, opts: Parameters<typeof createPath>[0]): StudioDocument {
  const path: PathObject = createPath(opts, defaultOpFor(doc.plate.style));
  return touch(doc, { objects: [...doc.objects, path] });
}

/**
 * Traces an image in this thread (the UI uses the trace worker instead; the tracer is loaded on demand)
 * and places it scaled to `widthMm`, centred on the plate unless x/y are given.
 */
export async function addImage(
  doc: StudioDocument,
  image: ImageDataLike,
  opts: { widthMm?: number; x?: number; y?: number; trace?: Partial<TraceOptions> } = {},
): Promise<StudioDocument> {
  const { traceImage } = await import('./trace/traceCore');
  const traced = traceImage(image, { ...DEFAULT_TRACE_OPTIONS, ...opts.trace });
  if (!traced.bounds || !traced.d) throw new Error('Nothing to trace in this image.');
  const { minX, minY, maxX, maxY } = traced.bounds;
  const widthMm = opts.widthMm ?? doc.plate.widthMm * 0.6;
  const s = widthMm / Math.max(1, maxX - minX);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  // Bake the pixel → mm scale and centring into the path so the object's own scale stays 1.
  const d = transformPathData(traced.d, [s, 0, 0, s, -cx * s, -cy * s]);
  return addPath(doc, { d, source: 'trace', x: opts.x ?? doc.plate.widthMm / 2, y: opts.y ?? doc.plate.heightMm / 2 });
}

export interface TemplateOverrides {
  finish?: string;
  widthMm?: number;
  heightMm?: number;
}

/** Builds a document from a registered template, with outlines shaped. */
export async function applyTemplate(id: string, fields: Record<string, string> = {}, overrides: TemplateOverrides = {}): Promise<StudioDocument> {
  const template = getTemplate(id);
  if (!template) throw new Error(`Unknown template "${id}".`);
  const values = { ...templateDefaults(template), ...fields };
  const built: CreateDocumentOptions = template.build(values);
  let doc = createDocument({ ...built, material: { ...built.material, ...(overrides.finish ? { finish: overrides.finish } : {}) } });
  doc = { ...doc, name: template.name, template: { id, fields: values } };
  if (overrides.widthMm || overrides.heightMm) doc = resizePlate(doc, overrides.widthMm ?? doc.plate.widthMm, overrides.heightMm ?? doc.plate.heightMm);
  return ensureOutlines(doc);
}

/**
 * Variable data: one template, one document per row of field values (e.g. a CSV of employee
 * name plates). Each result is validated and priced independently by the caller.
 */
export async function applyTemplateBatch(id: string, rows: Record<string, string>[], overrides: TemplateOverrides = {}): Promise<StudioDocument[]> {
  return Promise.all(rows.map(fields => applyTemplate(id, fields, overrides)));
}

/** Sets a template field and updates every text bound to it (outlines re-shaped and fitted). */
export async function setTemplateField(doc: StudioDocument, key: string, value: string): Promise<StudioDocument> {
  return ensureOutlines(touch(applyTemplateFields(doc, { [key]: value }), {}));
}

/** Resizes the plate and scales object positions and sizes with it (proportional layout). */
export function resizePlate(doc: StudioDocument, widthMm: number, heightMm: number): StudioDocument {
  const sx = widthMm / doc.plate.widthMm;
  const sy = heightMm / doc.plate.heightMm;
  const s = Math.min(sx, sy);
  const objects = doc.objects.map((o): StudioObject => {
    const moved = { ...o, x: o.x * sx, y: o.y * sy };
    switch (o.kind) {
      case 'text': return { ...moved, kind: 'text', sizeMm: Math.round(o.sizeMm * s * 10) / 10, letterSpacingMm: o.letterSpacingMm * s, outline: undefined } as TextObject;
      case 'shape': return { ...moved, widthMm: o.widthMm * s, heightMm: o.heightMm * s } as ShapeObject;
      case 'path': return { ...moved, scaleX: o.scaleX * s, scaleY: o.scaleY * s } as PathObject;
      default: return moved as StudioObject;
    }
  });
  return touch(doc, { plate: { ...doc.plate, widthMm, heightMm }, objects });
}

// ---------- checking, pricing, output ----------

export function compose(doc: StudioDocument, ctx: StudioContext = {}): Composition {
  return composeDocument(doc, rulesFor(doc, ctx));
}

export function validate(doc: StudioDocument, ctx: StudioContext = {}): { composition: Composition; analysis: Analysis } {
  const composition = compose(doc, ctx);
  return { composition, analysis: analyzeComposition(doc, composition, rulesFor(doc, ctx), ctx.limits ?? CUSTOM_PIECE_LIMITS) };
}

export interface PriceResult {
  widthMm: number;
  heightMm: number;
  quote: CustomPieceQuote;
}

/** The same price the server will charge (shared function), for the part's bounding box. */
export function price(doc: StudioDocument, ctx: StudioContext = {}, composition = compose(doc, ctx)): PriceResult {
  const size = billableSize(composition);
  return { ...size, quote: quoteCustomPiece({ ...size, finish: doc.material.finish }, ctx.rates ?? DEFAULT_CUSTOM_FINISH_RATES, ctx.limits ?? CUSTOM_PIECE_LIMITS) };
}

export function toProduction(doc: StudioDocument, ctx: StudioContext = {}) {
  const rules = rulesFor(doc, ctx);
  return buildProduction(composeDocument(doc, rules), rules, doc.material.finish);
}

export function exportSVG(doc: StudioDocument, opts: CamExportOptions & StudioContext = {}): string {
  return exportProductionSVG(doc.production ?? toProduction(doc, opts), opts);
}

export function exportDXF(doc: StudioDocument, opts: CamExportOptions & StudioContext = {}): string {
  return exportProductionDXF(doc.production ?? toProduction(doc, opts), opts);
}

/** Mount point for the wall preview: outer + inner contours as one even-odd SVG path in mm. */
export function getDesignOutlineForPreview(doc: StudioDocument, ctx: StudioContext = {}): { svgPath: string; widthMm: number; heightMm: number } {
  const prod = doc.production ?? toProduction(doc, ctx);
  return {
    svgPath: prod.contours.filter(c => c.role !== 'score').map(c => c.d).join(''),
    widthMm: prod.widthMm,
    heightMm: prod.heightMm,
  };
}

/** Plate outline as path data (for thumbnails of documents with no geometry yet). */
export function plateOutlinePath(doc: StudioDocument): string {
  return ringsToPathData(plateOutline(doc.plate));
}

// ---------- ordering ----------

/** Server limit for one line's design JSON (api/_lib/checkout.ts MAX_DESIGN_REF_CHARS). */
export const MAX_DESIGN_REF_CHARS = ORDER_LIMITS.maxDesignRefChars;

/**
 * Freezes production geometry into the document and serialises it for the order. Cached
 * text outlines are dropped first if needed (they are re-derivable from text + font).
 */
export function serializeForOrder(doc: StudioDocument, ctx: StudioContext = {}, production: ProductionGeometry = toProduction(doc, ctx)): string {
  const frozen: StudioDocument = { ...doc, production };
  let json = JSON.stringify(frozen);
  if (json.length > MAX_DESIGN_REF_CHARS) {
    json = JSON.stringify({ ...frozen, objects: frozen.objects.map(o => (o.kind === 'text' ? { ...o, outline: undefined } : o)) });
  }
  if (json.length > MAX_DESIGN_REF_CHARS) throw new Error('DESIGN_TOO_DETAILED');
  return json;
}

export interface CartLine {
  productId: typeof CUSTOM_PRODUCT_ID;
  productName: string;
  productSlug: string;
  shapeId: string;
  sizeLabel: string;
  widthMm: number;
  heightMm: number;
  finish: string;
  unitPrice: number;
  quantity: number;
  customDesignRef: string;
  customDesignThumb?: string;
}

/**
 * Cart line for a design (composed once). `unitPrice` (rupees) is display-only — the
 * server re-prices from width, height and finish. Throws when the design has blocking
 * issues, cannot be priced, or is too detailed to store with the order.
 */
export function toCartLine(doc: StudioDocument, quantity = 1, ctx: StudioContext = {}): CartLine {
  const rules = rulesFor(doc, ctx);
  const composition = composeDocument(doc, rules);
  const analysis = analyzeComposition(doc, composition, rules, ctx.limits ?? CUSTOM_PIECE_LIMITS);
  if (!analysis.orderable) throw new Error('DESIGN_NOT_ORDERABLE');
  const p = price(doc, ctx, composition);
  if ('problem' in p.quote) throw new Error(`PRICE_${p.quote.problem.toUpperCase()}`);
  const production = buildProduction(composition, rules, doc.material.finish);
  const thumb = thumbnailDataUri(production, doc.material.finish);
  return {
    productId: CUSTOM_PRODUCT_ID,
    productName: doc.name ? `Custom: ${doc.name}` : 'Custom metal design',
    productSlug: CUSTOM_PRODUCT_ID,
    shapeId: doc.plate.shapeId,
    sizeLabel: `${p.widthMm}mm × ${p.heightMm}mm`,
    widthMm: p.widthMm,
    heightMm: p.heightMm,
    finish: p.quote.finish,
    unitPrice: p.quote.unitPricePaise / 100,
    quantity,
    customDesignRef: serializeForOrder(doc, ctx, production),
    ...(thumb ? { customDesignThumb: thumb } : {}),
  };
}

/** Small SVG data URI of the part in its finish (the cart drops thumbnails over 15 KB). */
export function thumbnailDataUri(prod: ProductionGeometry, finish: string, maxChars = 14_000): string | undefined {
  const stops = finishPreset(finish).swatch.map((c, i, all) => `<stop offset="${i / Math.max(1, all.length - 1)}" stop-color="${c}"/>`).join('');
  for (const precision of [1, 0]) {
    const d = prod.contours.filter(c => c.role !== 'score').map(c => c.d.replace(/-?\d+\.\d+/g, n => Number(n).toFixed(precision))).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(prod.widthMm)} ${Math.ceil(prod.heightMm)}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs><path fill="url(#g)" fill-rule="evenodd" d="${d}"/></svg>`;
    const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    if (uri.length <= maxChars) return uri;
  }
  return undefined;
}
