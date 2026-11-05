/**
 * Structured data stored inside the order `notes` string.
 *
 * Staff may write only status, statusHistory, assignedTo, tracking, notes and updatedAt on an
 * order (firestore.rules), so QC results and package details ride along in `notes`:
 *
 *   <free-text internal notes, one "[date by] text" line per note>
 *   #vernox:v1 {"qc":{...},"qcLog":[...],"package":{...}}
 *
 * The block is the LAST line, introduced by NOTES_MARKER, and holds compact JSON. Free text and
 * block are edited independently so neither can clobber the other. A block that fails to parse is
 * kept as plain text (never silently dropped) and a fresh block is appended after it.
 * Documented in DATABASE.md ("orders.notes").
 */

export const NOTES_MARKER = '#vernox:v1 ';

export const QC_CHECKS = [
  { id: 'dimensions', label: 'Dimensions within tolerance' },
  { id: 'finish', label: 'Finish uniform' },
  { id: 'edges', label: 'Edges deburred' },
  { id: 'hardware', label: 'Mounting hardware included' },
  { id: 'photo', label: 'Photo taken' },
] as const;

export type QcCheckId = (typeof QC_CHECKS)[number]['id'];
export type QcChecks = Record<QcCheckId, boolean>;

export interface QcItemResult {
  outcome: 'pass' | 'fail';
  checks: QcChecks;
  at: number;
  by: string;
  reason?: string;
}

export interface QcLogEntry {
  itemId: string;
  outcome: 'pass' | 'fail';
  at: number;
  by: string;
  reason?: string;
}

export interface PackageInfo {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  at: number;
  by: string;
}

export interface StructuredNotes {
  /** Latest QC result per order item id. */
  qc: Record<string, QcItemResult>;
  /** Append-only history of QC attempts (kept so a failed-then-passed item keeps its reason). */
  qcLog: QcLogEntry[];
  package?: PackageInfo;
}

export interface ParsedNotes {
  text: string;
  data: StructuredNotes;
}

const MAX_QC_LOG = 50;

export const emptyChecks = (): QcChecks => ({ dimensions: false, finish: false, edges: false, hardware: false, photo: false });

export function emptyStructuredNotes(): StructuredNotes {
  return { qc: {}, qcLog: [] };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function sanitise(value: unknown): StructuredNotes | null {
  if (!isRecord(value)) return null;
  const data = emptyStructuredNotes();
  if (isRecord(value.qc)) {
    for (const [itemId, r] of Object.entries(value.qc)) {
      if (!isRecord(r) || (r.outcome !== 'pass' && r.outcome !== 'fail') || !isRecord(r.checks)) continue;
      const checks = emptyChecks();
      for (const { id } of QC_CHECKS) checks[id] = r.checks[id] === true;
      data.qc[itemId] = {
        outcome: r.outcome, checks, at: Number(r.at) || 0, by: String(r.by ?? ''),
        ...(typeof r.reason === 'string' && r.reason ? { reason: r.reason } : {}),
      };
    }
  }
  if (Array.isArray(value.qcLog)) {
    data.qcLog = value.qcLog.filter(isRecord)
      .filter(e => e.outcome === 'pass' || e.outcome === 'fail')
      .map(e => ({
        itemId: String(e.itemId ?? ''), outcome: e.outcome as 'pass' | 'fail', at: Number(e.at) || 0, by: String(e.by ?? ''),
        ...(typeof e.reason === 'string' && e.reason ? { reason: e.reason } : {}),
      }));
  }
  const pkg = value.package;
  if (isRecord(pkg)) {
    data.package = {
      lengthCm: Number(pkg.lengthCm) || 0, widthCm: Number(pkg.widthCm) || 0, heightCm: Number(pkg.heightCm) || 0,
      weightKg: Number(pkg.weightKg) || 0, at: Number(pkg.at) || 0, by: String(pkg.by ?? ''),
    };
  }
  return data;
}

export function parseNotes(raw: string | undefined | null): ParsedNotes {
  const source = typeof raw === 'string' ? raw : '';
  const atStart = source.startsWith(NOTES_MARKER);
  const idx = atStart ? 0 : source.lastIndexOf(`\n${NOTES_MARKER}`) + 1;
  if (!atStart && idx === 0) return { text: source, data: emptyStructuredNotes() };
  try {
    const data = sanitise(JSON.parse(source.slice(idx + NOTES_MARKER.length)));
    if (data) return { text: source.slice(0, idx).trimEnd(), data };
  } catch {
    // Malformed block: fall through and keep everything as text so nothing is lost.
  }
  return { text: source, data: emptyStructuredNotes() };
}

const isEmptyData = (d: StructuredNotes) => Object.keys(d.qc).length === 0 && d.qcLog.length === 0 && !d.package;

export function serializeNotes({ text, data }: ParsedNotes): string {
  const body = text.trimEnd();
  if (isEmptyData(data)) return body;
  const block = `${NOTES_MARKER}${JSON.stringify(data)}`;
  return body ? `${body}\n${block}` : block;
}

const stamp = (at: number) => new Date(at).toISOString().slice(0, 16).replace('T', ' ');

/** Appends an attributed free-text note, keeping any structured block intact. */
export function appendNote(raw: string | undefined, note: string, by: string, at: number): string {
  const parsed = parseNotes(raw);
  const line = `[${stamp(at)} UTC ${by}] ${note.trim().replace(/\s*\n\s*/g, ' ')}`;
  return serializeNotes({ ...parsed, text: parsed.text ? `${parsed.text}\n${line}` : line });
}

/** Replaces the free text (editor save) without touching the structured block. */
export function withFreeText(raw: string | undefined, text: string): string {
  return serializeNotes({ ...parseNotes(raw), text });
}

export function freeText(raw: string | undefined): string {
  return parseNotes(raw).text;
}

export const isQcComplete = (checks: QcChecks): boolean => QC_CHECKS.every(({ id }) => checks[id]);

export interface QcRecordInput {
  itemId: string;
  checks: QcChecks;
  outcome: 'pass' | 'fail';
  by: string;
  at: number;
  reason?: string;
}

/** Records a QC attempt. A pass requires every check; a fail requires a reason. Throws otherwise. */
export function recordQc(raw: string | undefined, input: QcRecordInput): string {
  const reason = input.reason?.trim();
  if (input.outcome === 'pass' && !isQcComplete(input.checks)) throw new Error('Every QC check must be ticked to pass an item.');
  if (input.outcome === 'fail' && !reason) throw new Error('Enter a reason when failing an item.');
  const parsed = parseNotes(raw);
  const result: QcItemResult = {
    outcome: input.outcome, checks: input.checks, at: input.at, by: input.by, ...(reason ? { reason } : {}),
  };
  const entry: QcLogEntry = { itemId: input.itemId, outcome: input.outcome, at: input.at, by: input.by, ...(reason ? { reason } : {}) };
  return serializeNotes({
    text: parsed.text,
    data: { ...parsed.data, qc: { ...parsed.data.qc, [input.itemId]: result }, qcLog: [...parsed.data.qcLog, entry].slice(-MAX_QC_LOG) },
  });
}

/** Clears per-item results so a reworked order is inspected again from scratch (log is kept). */
export function resetQc(raw: string | undefined): string {
  const parsed = parseNotes(raw);
  return serializeNotes({ text: parsed.text, data: { ...parsed.data, qc: {} } });
}

export function allItemsPassedQc(itemIds: readonly string[], data: StructuredNotes): boolean {
  return itemIds.length > 0 && itemIds.every(id => data.qc[id]?.outcome === 'pass' && isQcComplete(data.qc[id].checks));
}

export function isValidPackage(p: Pick<PackageInfo, 'lengthCm' | 'widthCm' | 'heightCm' | 'weightKg'>): boolean {
  return [p.lengthCm, p.widthCm, p.heightCm, p.weightKg].every(n => Number.isFinite(n) && n > 0);
}

export function recordPackage(raw: string | undefined, pkg: Omit<PackageInfo, 'at' | 'by'>, by: string, at: number): string {
  if (!isValidPackage(pkg)) throw new Error('Package length, width, height and weight must all be greater than zero.');
  const parsed = parseNotes(raw);
  return serializeNotes({ text: parsed.text, data: { ...parsed.data, package: { ...pkg, by, at } } });
}
