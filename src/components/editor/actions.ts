/**
 * Studio commands used by the UI (tool rail, inspector, shortcuts, fixes). They operate on
 * the editor store; geometry-heavy helpers are imported lazily so the initial studio
 * bundle stays small.
 */
import { applyTemplate, resizePlate, type StudioContext } from '@/lib/studio/api';
import { elementById, elementPathData } from '@/lib/studio/elements/motifs';
import { parametricShape, type ParametricKind, type ParametricParams } from '@/lib/studio/elements/parametric';
import { centrePathData } from '@/lib/studio/geometry/path';
import type { BooleanOp } from '@/lib/studio/operations';
import type { PatternResult } from '@/lib/studio/patterns/generate';
import type { RepeatResult } from '@/lib/studio/repeat';
import { cloneObject, createDocument, createHole, createPath, createShape, createText, defaultOpFor } from '@/lib/studio/document';
import type { FixId, DesignIssue } from '@/lib/studio/manufacturability';
import type { CutRules } from '@/lib/studio/materials';
import type { StudioDocument, StudioObject } from '@/lib/studio/schema';
import { selectedObjects, useStudio } from '@/lib/studio/store';
import { detectScript, fontById } from '@/lib/studio/text/fonts';
import { CUSTOM_PIECE_LIMITS } from '@/lib/pricing/customPiece';
import { toast } from 'sonner';
import { useStudioUi } from './uiStore';

const doc = () => useStudio.getState().doc;
const centre = () => ({ x: doc().plate.widthMm / 2, y: doc().plate.heightMm / 2 });

export function addTextObject(text = 'Your text') {
  const d = doc();
  const size = Math.max(12, Math.round(Math.min(d.plate.heightMm * 0.22, d.plate.widthMm * 0.12)));
  const font = fontById(detectScript(text) === 'devanagari' ? 'yatra-one' : 'poppins-semibold');
  useStudio.getState().addObjects([createText({ ...centre(), text, fontId: font.id, sizeMm: size, weld: font.weld }, defaultOpFor(d.plate.style))]);
}

export function addShapeObject(shapeId: string) {
  const d = doc();
  const s = Math.round(Math.min(d.plate.widthMm, d.plate.heightMm) * 0.3);
  useStudio.getState().addObjects([createShape({ ...centre(), shapeId, widthMm: s, heightMm: s }, defaultOpFor(d.plate.style))]);
}

/** Places a library motif sized and anchored as its definition says (border pieces against the plate edge). */
export function addElementObject(id: string) {
  const def = elementById(id);
  if (!def) return;
  const { plate } = doc();
  const c = centrePathData(elementPathData(id));
  const place = def.place ?? { span: 'min' as const, share: 0.4 };
  const scale = (place.share * (place.span === 'width' ? plate.widthMm : Math.min(plate.widthMm, plate.heightMm))) / Math.max(c.width, c.height, 1e-6);
  const w = c.width * scale, h = c.height * scale;
  const edge = Math.min(20, Math.min(plate.widthMm, plate.heightMm) * 0.08);
  const at = place.anchor === 'top-left' ? { x: edge + w / 2, y: edge + h / 2 }
    : place.anchor === 'top' ? { x: plate.widthMm / 2, y: edge + h / 2 }
      : centre();
  useStudio.getState().addObjects([createPath({ d: c.d, ...at, scaleX: scale, scaleY: scale, name: def.name }, defaultOpFor(plate.style))]);
}

/** Adds a polygon, star, ring or spiral (a spiral is an engraved line). */
export function addParametricShape(kind: ParametricKind, params: Partial<ParametricParams>) {
  const d = doc();
  const diameter = Math.round(Math.min(d.plate.widthMm, d.plate.heightMm) * 0.35);
  const made = parametricShape(kind, diameter, params);
  useStudio.getState().addObjects([createPath({ d: made.d, ...centre(), source: 'draw', name: kind, op: made.op === 'score' ? 'score' : undefined }, defaultOpFor(d.plate.style))]);
}

/** A rounded rectangle: the rectangle shape with its corners rounded. */
export function addRoundedRectangle() {
  const d = doc();
  const w = Math.round(d.plate.widthMm * 0.35), h = Math.round(Math.min(d.plate.heightMm * 0.3, w));
  useStudio.getState().addObjects([createShape({ ...centre(), shapeId: 'rectangle', widthMm: w, heightMm: h, cornerRadiusMm: Math.round(Math.min(w, h) * 0.25) }, defaultOpFor(d.plate.style))]);
}

export function addHoleObject(diameterMm = 6) {
  useStudio.getState().addObjects([createHole({ ...centre(), diameterMm })]);
}

/** Places an outline (traced or imported, mm, centred) at the plate centre, fitted to 60 % of the plate. */
export function placePath(d: string, widthMm: number, heightMm: number, source: 'trace' | 'import', name?: string) {
  const docNow = doc();
  const fit = Math.min((docNow.plate.widthMm * 0.6) / Math.max(widthMm, 1e-6), (docNow.plate.heightMm * 0.6) / Math.max(heightMm, 1e-6));
  // Imports keep their true size when they fit; traces (pixel-derived) are always fitted.
  const scale = source === 'import' && fit >= 1 ? 1 : fit;
  useStudio.getState().addObjects([
    createPath({ ...centre(), d, source, scaleX: scale, scaleY: scale, name }, defaultOpFor(docNow.plate.style)),
  ]);
}

export function duplicateSelection() {
  const s = useStudio.getState();
  const copies = selectedObjects(s).map(o => cloneObject(o, 10, 10));
  if (copies.length) s.addObjects(copies);
}

export function deleteSelection() {
  const s = useStudio.getState();
  const ids = selectedObjects(s).filter(o => !o.locked).map(o => o.id);
  if (ids.length) s.removeObjects(ids);
}

/**
 * Adds a generated pattern as one path object (one undo step). `replaceId` is a selected cut-out
 * that the pattern fills in: it is replaced, since the holes are that cut-out with metal left in it.
 */
export function addPatternFill(result: Extract<PatternResult, { ok: true }>, mode: 'cut' | 'add', name: string, replaceId?: string) {
  const path = createPath({ d: result.d, x: result.centre.x, y: result.centre.y, op: mode, name });
  const s = useStudio.getState();
  if (replaceId) s.replaceObjects([replaceId], [path]);
  else s.addObjects([path]);
}

/** Applies a repeat or symmetry result as one undoable edit: the selection (grouped) plus its copies. */
export function applyRepeatResult(result: RepeatResult, originalIds: string[]) {
  if (result.copies.length === 0) return;
  useStudio.getState().replaceObjects(originalIds, [...result.originals, ...result.copies]);
}

async function geometry() {
  return import('@/lib/studio/operations');
}

export async function centreSelection(axis: 'both' | 'x' | 'y' = 'both') {
  const s = useStudio.getState();
  const objects = selectedObjects(s).filter(o => !o.locked);
  if (objects.length) s.updateObjects((await geometry()).centreOnPlate(objects, s.doc.plate, axis));
}

export async function flipSelection(axis: 'x' | 'y') {
  const s = useStudio.getState();
  const objects = selectedObjects(s).filter(o => !o.locked);
  if (objects.length) s.updateObjects((await geometry()).flipObjects(objects, axis));
}

/** Combine (union) or cut the upper shapes out of the lowest one (subtract) and replace the selection with the result. */
export async function combineSelection(op: BooleanOp) {
  const s = useStudio.getState();
  const objects = selectedObjects(s);
  if (objects.length < 2) return;
  const result = (await geometry()).booleanObjects(objects, op);
  if (result) s.replaceObjects(objects.map(o => o.id), [result]);
  else toast.error('Nothing is left after that.');
}

export function nudgeSelection(dx: number, dy: number) {
  const s = useStudio.getState();
  const patches: Record<string, Partial<StudioObject>> = {};
  for (const o of selectedObjects(s)) if (!o.locked) patches[o.id] = { x: o.x + dx, y: o.y + dy };
  s.updateObjects(patches);
}

export function groupSelection(group: boolean) {
  const s = useStudio.getState();
  const sel = selectedObjects(s);
  if (sel.length < (group ? 2 : 1)) return;
  const groupId = group ? `g_${Date.now().toString(36)}` : undefined;
  s.updateObjects(Object.fromEntries(sel.map(o => [o.id, { groupId }])));
}

export function selectAll() {
  const s = useStudio.getState();
  s.select(s.doc.objects.filter(o => !o.locked && !o.hidden).map(o => o.id));
}

/** Expands a selection to whole groups. */
export function withGroups(ids: string[], objects: StudioObject[]): string[] {
  const groups = new Set(objects.filter(o => ids.includes(o.id) && o.groupId).map(o => o.groupId));
  if (groups.size === 0) return ids;
  return [...new Set([...ids, ...objects.filter(o => o.groupId && groups.has(o.groupId)).map(o => o.id)])];
}

export async function startFromTemplate(id: string, fields: Record<string, string> = {}, overrides: { finish?: string; widthMm?: number; heightMm?: number } = {}) {
  const built = await applyTemplate(id, fields, overrides);
  useStudio.getState().loadDocument(built);
  useStudioUi.getState().setStep('design');
  useStudioUi.getState().requestFit();
}

export function startBlank(overrides: Partial<StudioDocument['plate']> = {}, finish?: string) {
  useStudio.getState().loadDocument(createDocument({ plate: overrides, material: finish ? { finish } : undefined }));
  useStudioUi.getState().setStep('design');
  useStudioUi.getState().requestFit();
}

/** Vector file types the studio imports (SVG, DXF, PDF and PDF-compatible Illustrator); EPS gets an explanation. */
export const VECTOR_IMPORT_PATTERN = /\.(svg|dxf|pdf|ai|eps)$/i;

/** Imports an SVG, DXF, PDF or Illustrator (.ai) file as a path object. */
export async function importVectorFile(file: File) {
  try {
    if (/\.eps$/i.test(file.name)) throw new Error('EPS files are not supported. Export the artwork as SVG or PDF and import that.');
    let v;
    if (/\.(pdf|ai)$/i.test(file.name)) {
      // pdf.js is heavy: loaded only now, and only inside the studio chunk graph.
      const { importPdf } = await import('@/lib/studio/import/importPdf');
      v = await importPdf(await file.arrayBuffer());
    } else {
      const { importDxf, importSvg } = await import('@/lib/studio/import/importVector');
      const text = await file.text();
      v = /\.dxf$/i.test(file.name) ? await importDxf(text) : importSvg(text);
    }
    placePath(v.d, v.widthMm, v.heightMm, 'import', file.name);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not import this file.');
  }
}

/** Applies a one-click fix for an analysis issue. */
export function applyFix(fix: FixId, issue: DesignIssue, rules: CutRules, ctx: StudioContext = {}) {
  const s = useStudio.getState();
  const limits = ctx.limits ?? CUSTOM_PIECE_LIMITS;
  switch (fix) {
    case 'add-bridges':
      s.setAutoBridges(true);
      break;
    case 'grow-text': {
      const o = s.doc.objects.find(x => x.id === issue.objectId);
      if (o?.kind === 'text') s.updateObjects({ [o.id]: { sizeMm: Math.ceil(rules.minTextMm / Math.min(Math.abs(o.scaleX), Math.abs(o.scaleY))) } });
      break;
    }
    case 'fit-size': {
      const { widthMm: w, heightMm: h } = s.doc.plate;
      const k = Math.min(limits.maxWidthMm / w, limits.maxHeightMm / h, 1) * 0.98;
      s.loadDocumentTracked(resizePlate(s.doc, Math.floor(w * k), Math.floor(h * k)));
      break;
    }
    case 'grow-size': {
      const { widthMm: w, heightMm: h } = s.doc.plate;
      const k = Math.max(limits.minDimensionMm / w, limits.minDimensionMm / h, 1);
      s.loadDocumentTracked(resizePlate(s.doc, Math.ceil(w * k), Math.ceil(h * k)));
      break;
    }
    case 'mounting-off':
      s.updateMounting({ preset: 'none' });
      break;
  }
}

export function zoomFit() {
  useStudioUi.getState().requestFit();
}
