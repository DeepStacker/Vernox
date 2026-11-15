/**
 * Cutting work of a custom piece, measured from its frozen production contours
 * (`StudioDocument.production.contours`, src/lib/studio/schema.ts) — the exact geometry the
 * workshop cuts. Shared by the server (api/_lib/pricing.ts reads the snapshot inside the
 * cart line's customDesignRef) and the studio (which measures the production it is about to
 * freeze), so identical geometry always gives identical numbers and identical prices.
 *
 * Pure and dependency-free (relative imports only), like customPiece.ts, so both the Vite
 * build and the Node API typecheck can import it.
 *
 * What is measured:
 *  - through-cut length: the perimeter of every closed contour (role inner or outer), mm;
 *  - pierces: one per closed contour (the beam pierces the sheet once to start each one);
 *  - engraving (score) length: the open length of every score line, mm (no pierce: the
 *    beam marks the surface, it does not go through).
 *
 * Contours are polylines in the form buildProduction() writes ("M x yLx y…Z", absolute
 * coordinates). Anything else is rejected as malformed rather than guessed at. Work is
 * linear in the input and bounded by CUT_WORK_LIMITS (the checkout already caps one line's
 * design JSON at 200 000 characters).
 */
import { ORDER_LIMITS } from './orderLimits';

export interface CutWork {
  /** Through-cut length of all closed contours, mm. */
  cutLengthMm: number;
  /** Closed contours, i.e. pierces. */
  pierces: number;
  /** Engraving (score line) length, mm. */
  scoreLengthMm: number;
  /** Extent of all contours (the part's bounding box), mm. */
  widthMm: number;
  heightMm: number;
  /** Sheet thickness recorded in the snapshot, mm; null when the snapshot has none. */
  thicknessMm: number | null;
}

export interface CutContourInput {
  role: string;
  d: string;
}

export const CUT_WORK_LIMITS = {
  /** Contours in one design. */
  maxContours: 20_000,
  /** Characters of contour path data in one design. */
  maxPathChars: ORDER_LIMITS.maxDesignRefChars,
} as const;

export type CutWorkProblem = 'malformed' | 'too-complex';

export type CutWorkResult = { ok: true; work: CutWork } | { ok: false; problem: CutWorkProblem };

const TOKEN = /([MLZmlz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)|([\s,]+)|(.)/g;

interface Polyline { points: number[]; closed: boolean }

/** Parses "M x y L x y … Z" (absolute) into polylines; null when anything else appears. */
function parsePolylines(d: string): Polyline[] | null {
  const out: Polyline[] = [];
  let current: Polyline | null = null;
  let command: 'M' | 'L' | null = null;
  let pending: number | null = null;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(d); m; m = TOKEN.exec(d)) {
    if (m[3]) continue;
    if (m[4]) return null;
    if (m[1]) {
      if (pending !== null) return null;
      const c = m[1];
      if (c === 'Z') {
        if (!current) return null;
        current.closed = true;
        current = null;
        command = null;
      } else if (c === 'M' || c === 'L') {
        if (c === 'L' && !current) return null;
        command = c;
      } else {
        return null; // relative commands are never written by buildProduction
      }
      continue;
    }
    const n = Number(m[2]);
    if (!Number.isFinite(n) || command === null) return null;
    if (pending === null) { pending = n; continue; }
    if (command === 'M') {
      current = { points: [pending, n], closed: false };
      out.push(current);
      command = 'L'; // implicit lineto after the first pair, as in SVG
    } else {
      (current as Polyline).points.push(pending, n);
    }
    pending = null;
  }
  return pending === null ? out : null;
}

function polylineLength(p: Polyline, close: boolean): number {
  const pts = p.points;
  let len = 0;
  for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  if (close && pts.length >= 4) len += Math.hypot(pts[0] - pts[pts.length - 2], pts[1] - pts[pts.length - 1]);
  return len;
}

/** Measures production contours. Role `score` is engraving; every other role is a closed through-cut. */
export function measureCutWork(contours: readonly CutContourInput[], thicknessMm: number | null = null): CutWorkResult {
  if (contours.length > CUT_WORK_LIMITS.maxContours) return { ok: false, problem: 'too-complex' };
  let chars = 0;
  for (const c of contours) chars += c.d.length;
  if (chars > CUT_WORK_LIMITS.maxPathChars) return { ok: false, problem: 'too-complex' };

  let cutLengthMm = 0;
  let pierces = 0;
  let scoreLengthMm = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of contours) {
    const lines = parsePolylines(c.d);
    if (!lines) return { ok: false, problem: 'malformed' };
    const score = c.role === 'score';
    for (const line of lines) {
      if (line.points.length < 4) continue; // a lone point cuts nothing
      for (let i = 0; i < line.points.length; i += 2) {
        const x = line.points[i], y = line.points[i + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (score) {
        scoreLengthMm += polylineLength(line, false);
      } else {
        cutLengthMm += polylineLength(line, true);
        pierces += 1;
      }
    }
  }
  const hasExtent = maxX >= minX;
  return {
    ok: true,
    work: {
      cutLengthMm,
      pierces,
      scoreLengthMm,
      widthMm: hasExtent ? maxX - minX : 0,
      heightMm: hasExtent ? maxY - minY : 0,
      thicknessMm: thicknessMm !== null && Number.isFinite(thicknessMm) && thicknessMm > 0 ? thicknessMm : null,
    },
  };
}

export type DesignCutWork =
  | { kind: 'none' }
  | { kind: 'measured'; work: CutWork }
  | { kind: 'invalid'; problem: CutWorkProblem };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The cutting work recorded in a cart line's design reference (the serialised Studio
 * document with its frozen `production` snapshot). Returns `none` when there is nothing to
 * measure — no reference, a plain-text staff reference, or a design saved without a
 * snapshot (legacy) — and the caller prices by area only. A snapshot that is present but
 * damaged is `invalid`: the line cannot be priced from geometry the workshop could not cut.
 *
 * Only `production.contours` and `production.thicknessMm` are read; everything else in the
 * document is ignored here.
 */
export function cutWorkFromDesignRef(ref: string | null | undefined): DesignCutWork {
  const text = ref?.trim() ?? '';
  if (!text.startsWith('{')) return { kind: 'none' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: 'invalid', problem: 'malformed' };
  }
  if (!isRecord(parsed)) return { kind: 'none' };
  if (parsed.production === undefined) {
    // Every studio cart line freezes its contours (studio/api.ts toCartLine). A full studio document without them
    // would be priced by area only and then cut in full: treat it as damaged rather than as a size-only piece.
    return typeof parsed.schemaVersion === 'number' && Array.isArray(parsed.objects) ? { kind: 'invalid', problem: 'malformed' } : { kind: 'none' };
  }
  const production = parsed.production;
  if (!isRecord(production) || !Array.isArray(production.contours)) return { kind: 'invalid', problem: 'malformed' };
  const contours: CutContourInput[] = [];
  for (const c of production.contours) {
    if (!isRecord(c) || typeof c.role !== 'string' || typeof c.d !== 'string') return { kind: 'invalid', problem: 'malformed' };
    if (c.role !== 'inner' && c.role !== 'outer' && c.role !== 'score') return { kind: 'invalid', problem: 'malformed' };
    contours.push({ role: c.role, d: c.d });
  }
  const thickness = typeof production.thicknessMm === 'number' ? production.thicknessMm : null;
  const result = measureCutWork(contours, thickness);
  return 'problem' in result ? { kind: 'invalid', problem: result.problem } : { kind: 'measured', work: result.work };
}

/**
 * The smallest design reference that prices like the full one: only the production snapshot's
 * contours and thickness, which is all cutWorkFromDesignRef reads. The cart quote and the batch
 * quote send this instead of the whole document to keep requests small.
 */
export function pricingDesignRef(production: { contours: readonly CutContourInput[]; thicknessMm?: number }): string {
  return JSON.stringify({ production: { contours: production.contours.map(c => ({ role: c.role, d: c.d })), thicknessMm: production.thicknessMm } });
}

/**
 * pricingDesignRef for a full design reference. Undefined when there is nothing to measure (priced by size, as at
 * checkout); a reference that is not a well-formed snapshot is passed through whole, so the quote fails exactly
 * as checkout would.
 */
export function pricingDesignRefFrom(ref: string | null | undefined): string | undefined {
  const text = ref?.trim() ?? '';
  if (!text.startsWith('{')) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  if (!isRecord(parsed) || parsed.production === undefined) return undefined;
  const p = parsed.production;
  if (!isRecord(p) || !Array.isArray(p.contours)) return text;
  const contours = p.contours.filter((c): c is CutContourInput => isRecord(c) && typeof c.role === 'string' && typeof c.d === 'string');
  if (contours.length !== p.contours.length) return text;
  return pricingDesignRef({ contours, thicknessMm: typeof p.thicknessMm === 'number' ? p.thicknessMm : undefined });
}
