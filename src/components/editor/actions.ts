/**
 * Studio commands used by the UI (tool rail, inspector, shortcuts, fixes). They operate on
 * the editor store; geometry-heavy helpers are imported lazily so the initial studio
 * bundle stays small.
 */
import { applyTemplate, resizePlate, type StudioContext } from '@/lib/studio/api';
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

/** Imports an SVG or DXF file as a path object. */
export async function importVectorFile(file: File) {
  try {
    const { importDxf, importSvg } = await import('@/lib/studio/import/importVector');
    const text = await file.text();
    const v = /\.dxf$/i.test(file.name) ? await importDxf(text) : importSvg(text);
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
