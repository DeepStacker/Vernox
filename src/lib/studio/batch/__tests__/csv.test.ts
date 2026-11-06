import { describe, expect, it } from 'vitest';
import { MAX_BATCH_ROWS, parseCsv } from '../csv';

describe('parseCsv', () => {
  it('parses headers and rows, strips a BOM and handles CRLF', () => {
    const r = parseCsv('\uFEFFname,flat\r\nAsha,101\r\nRavi,102\r\n');
    expect(r.headers).toEqual(['name', 'flat']);
    expect(r.rows).toEqual([['Asha', '101'], ['Ravi', '102']]);
    expect(r.totalRows).toBe(2);
  });

  it('handles quoted commas, doubled quotes and embedded newlines', () => {
    const r = parseCsv('name,note\n"Iyer, S.","say ""hi"""\n"Two\nlines",x');
    expect(r.rows).toEqual([['Iyer, S.', 'say "hi"'], ['Two\nlines', 'x']]);
    expect(r.unterminatedQuote).toBe(false);
  });

  it('detects tab (spreadsheet paste) and semicolon delimiters', () => {
    expect(parseCsv('a\tb\n1\t2').rows).toEqual([['1', '2']]);
    expect(parseCsv('a;b\n1;2').delimiter).toBe(';');
    // A comma inside a quoted header does not decide the delimiter.
    expect(parseCsv('"a,b";c\n1;2').headers).toEqual(['a,b', 'c']);
  });

  it('pads short rows, trims long ones and keeps blank lines as empty rows', () => {
    const r = parseCsv('a,b\n1\n\n1,2,3\n');
    expect(r.rows).toEqual([['1', ''], ['', ''], ['1', '2']]);
  });

  it('drops leading and trailing blank lines', () => {
    expect(parseCsv('\n\na\nx\n\n\n').rows).toEqual([['x']]);
  });

  it('caps rows and reports the real count', () => {
    const body = Array.from({ length: MAX_BATCH_ROWS + 25 }, (_, i) => `n${i}`).join('\n');
    const r = parseCsv(`name\n${body}`);
    expect(r.rows).toHaveLength(MAX_BATCH_ROWS);
    expect(r.totalRows).toBe(MAX_BATCH_ROWS + 25);
    expect(r.truncated).toBe(true);
  });

  it('flags an unterminated quote and returns the rows before it', () => {
    const r = parseCsv('a\nok\n"broken\nrow');
    expect(r.unterminatedQuote).toBe(true);
    expect(r.rows[0]).toEqual(['ok']);
  });

  it('returns nothing for empty input', () => {
    expect(parseCsv('')).toMatchObject({ headers: [], rows: [], totalRows: 0 });
    expect(parseCsv('   \n ').rows).toEqual([]);
  });
});
