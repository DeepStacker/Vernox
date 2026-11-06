/**
 * Geometry stage of a batch: for each distinct design variant, shape its text, check that
 * the text fits the plate, run the manufacturability checks (geometry worker) and price it
 * with the shared `quoteCustomPiece`. Variants are processed one at a time, yielding to the
 * browser between jobs, with the rows currently on screen first — a 500-row sheet never
 * blocks the UI.
 */
import { quoteCustomPiece } from '@/lib/pricing/customPiece';
import { issueMessage } from '../i18n';
import { rulesFor, shapeTextObject, type StudioContext } from '../api';
import { pathBounds, placementMatrix } from '../geometry/path';
import type { StudioDocument } from '../schema';
import { plateTextMargin } from '../text/fit';
import { GeometryRunner } from './geometryRunner';
import type { BatchProblem, Variant } from './plan';
import { applyVariantTexts } from './variables';
import type { CustomFinishRate } from '@/lib/pricing/customPiece';

export interface VariantEval {
  state: 'ok' | 'error';
  problems: BatchProblem[];
  unitPricePaise?: number;
  size?: { widthMm: number; heightMm: number };
  /** Metal region as an even-odd SVG path in mm, for the thumbnail. */
  previewD?: string;
  /** Bounds of the metal region: `minX minY width height`. */
  viewBox?: string;
}

export interface BatchContext extends StudioContext {
  rates: Readonly<Record<string, CustomFinishRate>>;
}

/** The document for one variant, with its bound text shaped. Throws when a font cannot load. */
export async function materialiseVariant(doc: StudioDocument, texts: Readonly<Record<string, string>>): Promise<StudioDocument> {
  const variant = applyVariantTexts(doc, texts);
  const objects = await Promise.all(
    variant.objects.map(o => (o.kind === 'text' && o.id in texts && o.text.trim() ? shapeTextObject(o) : o)),
  );
  return { ...variant, objects };
}

/** How far (mm) the bound text reaches beyond the plate's margin; 0 when it fits. */
export function textOverflowMm(doc: StudioDocument, boundIds: Iterable<string>): number {
  if (doc.plate.style === 'none') return 0; // no plate: the part simply grows
  const margin = plateTextMargin(doc.plate);
  let over = 0;
  for (const id of boundIds) {
    const o = doc.objects.find(x => x.id === id);
    if (o?.kind !== 'text' || !o.outline) continue;
    const b = pathBounds(o.outline, placementMatrix(o.x, o.y, o.rotation, o.scaleX, o.scaleY));
    if (!b) continue;
    over = Math.max(over, margin - b.minX, b.maxX - (doc.plate.widthMm - margin), margin - b.minY, b.maxY - (doc.plate.heightMm - margin));
  }
  return over > 0.5 ? Math.ceil(over) : 0;
}

export async function evaluateVariant(
  doc: StudioDocument,
  texts: Readonly<Record<string, string>>,
  ctx: BatchContext,
  runner: GeometryRunner,
): Promise<VariantEval> {
  let variantDoc: StudioDocument;
  try {
    variantDoc = await materialiseVariant(doc, texts);
  } catch {
    return { state: 'error', problems: [{ code: 'shape-failed' }] };
  }
  const geometry = await runner.run(variantDoc, rulesFor(variantDoc, ctx), ctx.limits);
  const previewD = geometry.materialD || undefined;
  const b = geometry.bounds;
  const viewBox = b ? `${b.minX} ${b.minY} ${b.maxX - b.minX} ${b.maxY - b.minY}` : undefined;
  const problems: BatchProblem[] = [];

  const overMm = textOverflowMm(variantDoc, Object.keys(texts));
  if (overMm > 0) problems.push({ code: 'too-long', overMm });
  for (const issue of geometry.analysis.issues) {
    if (issue.severity === 'error') problems.push({ code: 'not-orderable', message: issueMessage(issue) });
  }

  const quote = quoteCustomPiece({ ...geometry.size, finish: variantDoc.material.finish }, ctx.rates, ctx.limits);
  if ('problem' in quote) problems.push({ code: 'unpriced', reason: quote.problem });

  return {
    state: problems.length ? 'error' : 'ok',
    problems,
    size: geometry.size,
    previewD,
    viewBox,
    ...('problem' in quote ? {} : { unitPricePaise: quote.unitPricePaise }),
  };
}

const yieldToBrowser = () => new Promise<void>(resolve => setTimeout(resolve, 0));

export interface EvaluatorOptions {
  doc: StudioDocument;
  variants: readonly Variant[];
  ctx: BatchContext;
  onResult: (key: string, result: VariantEval) => void;
}

export class BatchEvaluator {
  private readonly runner = new GeometryRunner();
  private readonly todo: Variant[];
  private priority: ReadonlySet<string> = new Set();
  private disposed = false;

  constructor(private readonly opts: EvaluatorOptions) {
    this.todo = [...opts.variants];
  }

  /** Variants to evaluate before the rest (the rows currently visible). */
  setPriority(keys: Iterable<string>) {
    this.priority = new Set(keys);
  }

  private next(): Variant | undefined {
    const i = this.todo.findIndex(v => this.priority.has(v.key));
    return this.todo.splice(i >= 0 ? i : 0, 1)[0];
  }

  async run(): Promise<void> {
    for (let v = this.next(); v && !this.disposed; v = this.next()) {
      let result: VariantEval;
      try {
        result = await evaluateVariant(this.opts.doc, v.texts, this.opts.ctx, this.runner);
      } catch (err) {
        if (this.disposed) return;
        result = { state: 'error', problems: [{ code: 'not-orderable', message: err instanceof Error ? err.message : String(err) }] };
      }
      if (this.disposed) return;
      this.opts.onResult(v.key, result);
      await yieldToBrowser();
    }
  }

  dispose() {
    this.disposed = true;
    this.runner.dispose();
  }
}
