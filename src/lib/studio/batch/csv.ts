/**
 * Small, dependency-free CSV parser for batch orders (RFC 4180 plus the quirks of
 * spreadsheet exports): UTF-8 BOM, CRLF/LF/CR line ends, quoted fields with embedded
 * commas, newlines and doubled quotes, and comma / semicolon / tab delimiters (a range
 * pasted from Excel or Sheets is tab-separated). The first record is the header row.
 */

export const MAX_BATCH_ROWS = 500;
/** Input guard: a 500-row sheet is a few tens of KB; this only stops accidental huge pastes. */
export const MAX_CSV_CHARS = 2_000_000;

export interface ParsedCsv {
  headers: string[];
  /** Data records, each exactly `headers.length` cells (padded or trimmed), capped at MAX_BATCH_ROWS. */
  rows: string[][];
  /** Data records found in the input, before the cap. */
  totalRows: number;
  truncated: boolean;
  delimiter: string;
  /** Set when a quoted field never closed; the rows before it are still returned. */
  unterminatedQuote: boolean;
  /** Input exceeded MAX_CSV_CHARS and was cut. */
  inputTruncated: boolean;
}

const DELIMITERS = [',', ';', '\t'] as const;

/** Picks the delimiter that occurs most in the header line, ignoring quoted text. */
export function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    else if (!quoted) {
      if (c === '\n' || c === '\r') break;
      if (c in counts) counts[c]++;
    }
  }
  return DELIMITERS.reduce((best, d) => (counts[d] > counts[best] ? d : best), ',');
}

/** Splits text into records of cells. Blank lines become a record with one empty cell. */
function splitRecords(text: string, delimiter: string): { records: string[][]; unterminatedQuote: boolean } {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  let cellStarted = false;
  const endCell = () => { record.push(cell); cell = ''; cellStarted = false; };
  const endRecord = () => { endCell(); records.push(record); record = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"' && !cellStarted) {
      quoted = true;
      cellStarted = true;
    } else if (c === delimiter) {
      endCell();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRecord();
    } else {
      cell += c;
      cellStarted = true;
    }
  }
  const unterminatedQuote = quoted;
  if (cell !== '' || cellStarted || record.length > 0) endRecord();
  return { records, unterminatedQuote };
}

export function parseCsv(input: string): ParsedCsv {
  const inputTruncated = input.length > MAX_CSV_CHARS;
  const text = (inputTruncated ? input.slice(0, MAX_CSV_CHARS) : input).replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(text);
  const { records, unterminatedQuote } = splitRecords(text, delimiter);

  // Leading blank lines are not a header; trailing blank lines are not rows.
  const isBlank = (r: string[]) => r.every(c => c.trim() === '');
  while (records.length && isBlank(records[0])) records.shift();
  while (records.length && isBlank(records[records.length - 1])) records.pop();

  const headerRecord = records.shift();
  if (!headerRecord) {
    return { headers: [], rows: [], totalRows: 0, truncated: false, delimiter, unterminatedQuote, inputTruncated };
  }
  const headers = headerRecord.map(h => h.trim());
  const width = headers.length;
  const normalised = records.map(r => {
    if (r.length === width) return r;
    return r.length > width ? r.slice(0, width) : [...r, ...Array<string>(width - r.length).fill('')];
  });
  return {
    headers,
    rows: normalised.slice(0, MAX_BATCH_ROWS),
    totalRows: normalised.length,
    truncated: normalised.length > MAX_BATCH_ROWS,
    delimiter,
    unterminatedQuote,
    inputTruncated,
  };
}
