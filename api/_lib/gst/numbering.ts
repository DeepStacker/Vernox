/**
 * Sequential GST document numbers per financial year (1 April – 31 March, IST).
 *
 * Rule 46(b) of the CGST Rules: a consecutive serial number, unique for the
 * financial year, of at most 16 characters. Format `PREFIX/YY-YY/NNNNNN`, e.g.
 * `VX/26-27/000123` (15 characters) for invoices and `CN/26-27/000004` for credit
 * notes. Each series has its own counter document `counters/{series}_{YYYY-YY}`,
 * read and incremented inside the transaction that issues the document, so
 * concurrent issues serialise and numbers are gap-free.
 */
import type { StoreTransaction } from '../store';

/** `specimen_*` series are used while the seller is on placeholder details, so real numbering starts at 000001. */
export type DocumentSeries = 'invoice' | 'credit_note' | 'specimen_invoice' | 'specimen_credit_note';

const PREFIX: Record<DocumentSeries, string> = { invoice: 'VX', credit_note: 'CN', specimen_invoice: 'SP', specimen_credit_note: 'SC' };
const IST_OFFSET_MS = 5.5 * 3600_000;

/** Financial year containing the instant, as `2026-27`. */
export function financialYear(ms: number): string {
  const ist = new Date(ms + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? year : year - 1; // April = month 3
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function formatDocumentNumber(series: DocumentSeries, fy: string, sequence: number): string {
  const short = `${fy.slice(2, 4)}-${fy.slice(5, 7)}`;
  return `${PREFIX[series]}/${short}/${String(sequence).padStart(6, '0')}`;
}

export const counterPath = (series: DocumentSeries, fy: string) => `counters/${series}_${fy}`;

export interface NumberReservation {
  series: DocumentSeries;
  fy: string;
  sequence: number;
  number: string;
  counterPath: string;
}

/** Read phase: the next number in the series for the instant's financial year. */
export async function reserveNumber(tx: StoreTransaction, series: DocumentSeries, now: number): Promise<NumberReservation> {
  const fy = financialYear(now);
  const path = counterPath(series, fy);
  const counter = await tx.get(path);
  const last = typeof counter?.last === 'number' ? counter.last : 0;
  const sequence = last + 1;
  return { series, fy, sequence, number: formatDocumentNumber(series, fy, sequence), counterPath: path };
}

/** Write phase: commits the reservation (only after the document using it is written in the same transaction). */
export function commitNumber(tx: StoreTransaction, reservation: NumberReservation, now: number) {
  tx.set(reservation.counterPath, { series: reservation.series, financialYear: reservation.fy, last: reservation.sequence, updatedAt: now });
}
