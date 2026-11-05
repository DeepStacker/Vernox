/**
 * Manufacturability checks on a composed part. Each issue carries a rule id (strings live
 * in i18n.ts), a severity, where it is (plate mm) and, when one exists, a one-click fix.
 * Only `error` issues block add-to-cart.
 *
 * Thin features use a morphological opening (shrink by w/2, grow back): metal that does not
 * survive is narrower than the minimum web. Narrow slots use the dual closing.
 */
import { CUSTOM_PIECE_LIMITS, type CustomPieceLimits } from '@/lib/pricing/customPiece';
import { difference, offset, pieces, ringAreaAbs, type Piece } from './geometry/clipper';
import { ringLength, ringsBounds, type Bounds, type Rings } from './geometry/path';
import { composeDocument, objectRings, plateOutline, type Composition } from './compose';
import type { CutRules } from './materials';
import type { StudioDocument } from './schema';

export type IssueRule =
  | 'empty'
  | 'too-large'
  | 'too-small'
  | 'loose-pieces'
  | 'thin-feature'
  | 'narrow-slot'
  | 'small-hole'
  | 'small-text'
  | 'outside-plate'
  | 'mounting-no-room'
  | 'text-loading';

export type FixId = 'add-bridges' | 'grow-text' | 'fit-size' | 'grow-size' | 'mounting-off';

export interface DesignIssue {
  id: string;
  rule: IssueRule;
  severity: 'error' | 'warning';
  params?: Record<string, number | string>;
  at?: Bounds;
  objectId?: string;
  fix?: FixId;
}

export interface PartStats {
  widthMm: number;
  heightMm: number;
  areaMm2: number;
  cutLengthMm: number;
  pierces: number;
  cutTimeSec: number;
  weightKg: number;
  pieces: number;
}

export interface Analysis {
  issues: DesignIssue[];
  stats: PartStats;
  /** True when nothing blocks ordering. */
  orderable: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Smallest bounding rectangle the server will be asked to price (whole mm, rounded up). */
export function billableSize(c: Composition): { widthMm: number; heightMm: number } {
  if (!c.bounds) return { widthMm: 0, heightMm: 0 };
  return {
    widthMm: Math.ceil(c.bounds.maxX - c.bounds.minX - 1e-6),
    heightMm: Math.ceil(c.bounds.maxY - c.bounds.minY - 1e-6),
  };
}

function residuePieces(residue: Rings, minArea: number, minExtent: number): Bounds[] {
  return pieces(residue)
    .filter(p => p.area >= minArea)
    .map(p => ringsBounds([p.outer]) as Bounds)
    .filter(b => Math.max(b.maxX - b.minX, b.maxY - b.minY) >= minExtent);
}

function mergeBounds(list: Bounds[]): Bounds | undefined {
  if (list.length === 0) return undefined;
  return list.reduce((a, b) => ({ minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) }));
}

export function partStats(c: Composition, rules: CutRules): PartStats {
  const size = billableSize(c);
  let cutLength = 0;
  let pierces = 0;
  for (const p of c.pieces) {
    cutLength += ringLength(p.outer);
    pierces += 1;
    for (const h of p.holes) { cutLength += ringLength(h); pierces += 1; }
  }
  for (const s of c.score) { cutLength += ringLength(s, false); pierces += 1; }
  const areaMm2 = c.pieces.reduce((a, p) => a + p.area, 0);
  return {
    ...size,
    areaMm2,
    cutLengthMm: Math.round(cutLength),
    pierces,
    cutTimeSec: Math.round((cutLength / rules.feedMmPerMin) * 60 + pierces * rules.pierceSec),
    weightKg: Math.round(((areaMm2 * rules.thicknessMm) / 1000) * rules.densityGPerCm3) / 1000,
    pieces: c.pieces.length,
  };
}

export function analyzeComposition(
  doc: StudioDocument,
  c: Composition,
  rules: CutRules,
  limits: CustomPieceLimits = CUSTOM_PIECE_LIMITS,
): Analysis {
  const issues: DesignIssue[] = [];
  const stats = partStats(c, rules);

  if (c.pendingText.length > 0) {
    issues.push({ id: 'text-loading', rule: 'text-loading', severity: 'error' });
  }
  if (c.pieces.length === 0) {
    issues.push({ id: 'empty', rule: 'empty', severity: 'error' });
    return { issues, stats, orderable: false };
  }

  if (stats.widthMm > limits.maxWidthMm || stats.heightMm > limits.maxHeightMm) {
    issues.push({ id: 'too-large', rule: 'too-large', severity: 'error', params: { w: limits.maxWidthMm, h: limits.maxHeightMm }, fix: 'fit-size' });
  }
  if (stats.widthMm < limits.minDimensionMm || stats.heightMm < limits.minDimensionMm) {
    issues.push({ id: 'too-small', rule: 'too-small', severity: 'error', params: { min: limits.minDimensionMm }, fix: 'grow-size' });
  }

  // Loose pieces: everything but the biggest piece would drop out (or ship as a separate part).
  if (c.pieces.length > 1) {
    const main = c.pieces.reduce((a, b) => (b.area > a.area ? b : a));
    const loose = c.pieces.filter((p: Piece) => p !== main);
    issues.push({
      id: 'loose-pieces',
      rule: 'loose-pieces',
      severity: 'error',
      params: { count: loose.length },
      at: mergeBounds(loose.map(p => ringsBounds([p.outer]) as Bounds)),
      fix: 'add-bridges',
    });
  }

  // Thin metal (opening residue). Corner rounding leaves tiny slivers; ignore those.
  const r = rules.minFeatureMm / 2;
  const opened = offset(offset(c.material, -r, 'miter'), r, 'miter');
  const thin = residuePieces(difference(c.material, opened), r * r * 1.5, rules.minFeatureMm * 1.5);
  if (thin.length > 0) {
    issues.push({ id: 'thin-feature', rule: 'thin-feature', severity: 'warning', params: { mm: rules.minFeatureMm, count: thin.length }, at: mergeBounds(thin) });
  }

  // Narrow slots between cuts (closing residue).
  const s = rules.minHoleMm / 2;
  const closed = offset(offset(c.material, s, 'miter'), -s, 'miter');
  const slots = residuePieces(difference(closed, c.material), s * s * 1.5, rules.minHoleMm * 1.5);
  if (slots.length > 0) {
    issues.push({ id: 'narrow-slot', rule: 'narrow-slot', severity: 'warning', params: { mm: rules.minHoleMm, count: slots.length }, at: mergeBounds(slots) });
  }

  const minHoleArea = Math.PI * (rules.minHoleMm / 2) ** 2;
  const small = c.pieces.flatMap(p => p.holes).filter(h => ringAreaAbs(h) < minHoleArea);
  if (small.length > 0) {
    issues.push({ id: 'small-hole', rule: 'small-hole', severity: 'warning', params: { mm: rules.minHoleMm, count: small.length }, at: mergeBounds(small.map(h => ringsBounds([h]) as Bounds)) });
  }

  if (c.mountingDropped > 0) {
    issues.push({ id: 'mounting-no-room', rule: 'mounting-no-room', severity: 'warning', params: { count: c.mountingDropped }, fix: 'mounting-off' });
  }

  const plateB = doc.plate.style === 'none' ? null : ringsBounds(plateOutline(doc.plate));
  for (const obj of doc.objects) {
    if (obj.hidden) continue;
    if (obj.kind === 'text' && obj.text.trim() && obj.sizeMm * Math.min(Math.abs(obj.scaleX), Math.abs(obj.scaleY)) < rules.minTextMm) {
      issues.push({ id: `small-text:${obj.id}`, rule: 'small-text', severity: 'warning', objectId: obj.id, params: { mm: rules.minTextMm }, fix: 'grow-text' });
    }
    if (plateB && obj.op === 'cut') {
      const b = ringsBounds(objectRings(obj, 0.2));
      if (b && (b.minX < plateB.minX - 0.01 || b.minY < plateB.minY - 0.01 || b.maxX > plateB.maxX + 0.01 || b.maxY > plateB.maxY + 0.01)) {
        issues.push({ id: `outside:${obj.id}`, rule: 'outside-plate', severity: 'warning', objectId: obj.id, at: b });
      }
    }
  }

  return { issues, stats: { ...stats, areaMm2: round1(stats.areaMm2) }, orderable: !issues.some(i => i.severity === 'error') };
}

/** Compose + analyse in one call (worker and headless API entry point). */
export function analyzeDocument(doc: StudioDocument, rules: CutRules, limits?: CustomPieceLimits): { composition: Composition; analysis: Analysis } {
  const composition = composeDocument(doc, rules);
  return { composition, analysis: analyzeComposition(doc, composition, rules, limits) };
}
