import { describe, expect, it } from 'vitest';
import {
  NOTES_MARKER, allItemsPassedQc, appendNote, emptyChecks, freeText, parseNotes, recordPackage, recordQc, resetQc, serializeNotes, withFreeText,
  type QcChecks,
} from '../orderNotes';

const allChecks = (): QcChecks => ({ dimensions: true, finish: true, edges: true, hardware: true, photo: true });
const AT = Date.UTC(2026, 10, 5, 14, 2);

describe('order notes structured block', () => {
  it('treats legacy plain notes as free text with empty data', () => {
    const parsed = parseNotes('Check patina');
    expect(parsed.text).toBe('Check patina');
    expect(parsed.data.qc).toEqual({});
    expect(serializeNotes(parsed)).toBe('Check patina');
  });

  it('round-trips QC and package data after the free text', () => {
    let notes = appendNote('', 'Started cutting', 'a@vernox.in', AT);
    notes = recordQc(notes, { itemId: 'i1', checks: allChecks(), outcome: 'pass', by: 'q@vernox.in', at: AT });
    notes = recordPackage(notes, { lengthCm: 60, widthCm: 40, heightCm: 8, weightKg: 3.2 }, 'q@vernox.in', AT);
    expect(notes.split('\n').pop()?.startsWith(NOTES_MARKER)).toBe(true);
    const parsed = parseNotes(notes);
    expect(parsed.text).toBe('[2026-11-05 14:02 UTC a@vernox.in] Started cutting');
    expect(parsed.data.qc.i1.outcome).toBe('pass');
    expect(parsed.data.package).toMatchObject({ lengthCm: 60, weightKg: 3.2 });
    expect(allItemsPassedQc(['i1'], parsed.data)).toBe(true);
    expect(allItemsPassedQc(['i1', 'i2'], parsed.data)).toBe(false);
  });

  it('keeps the block intact when free text is edited or a note is appended', () => {
    const base = recordQc('first', { itemId: 'i1', checks: allChecks(), outcome: 'pass', by: 'q', at: AT });
    expect(parseNotes(withFreeText(base, 'edited')).data.qc.i1).toBeDefined();
    expect(freeText(withFreeText(base, 'edited'))).toBe('edited');
    expect(parseNotes(appendNote(base, 'more', 'x', AT)).data.qc.i1).toBeDefined();
  });

  it('supports a block with no free text', () => {
    const notes = recordPackage(undefined, { lengthCm: 1, widthCm: 1, heightCm: 1, weightKg: 1 }, 'q', AT);
    expect(notes.startsWith(NOTES_MARKER)).toBe(true);
    expect(parseNotes(notes).data.package?.heightCm).toBe(1);
  });

  it('never drops a malformed block: it stays as text', () => {
    const broken = `note\n${NOTES_MARKER}{not json`;
    const parsed = parseNotes(broken);
    expect(parsed.text).toBe(broken);
    expect(parsed.data.qcLog).toEqual([]);
    const next = recordQc(broken, { itemId: 'i1', checks: allChecks(), outcome: 'pass', by: 'q', at: AT });
    expect(parseNotes(next).data.qc.i1.outcome).toBe('pass');
    expect(next).toContain('{not json');
  });

  it('ignores hostile or unexpected JSON shapes', () => {
    const parsed = parseNotes(`${NOTES_MARKER}{"qc":{"i1":{"outcome":"maybe"},"i2":"x"},"qcLog":[1,{"outcome":"pass"}],"package":"big"}`);
    expect(parsed.data.qc).toEqual({});
    expect(parsed.data.qcLog).toHaveLength(1);
    expect(parsed.data.package).toBeUndefined();
  });

  it('refuses to pass with unticked checks and to fail without a reason', () => {
    const partial = { ...allChecks(), edges: false };
    expect(() => recordQc('', { itemId: 'i1', checks: partial, outcome: 'pass', by: 'q', at: AT })).toThrow(/every QC check/i);
    expect(() => recordQc('', { itemId: 'i1', checks: partial, outcome: 'fail', by: 'q', at: AT, reason: '  ' })).toThrow(/reason/i);
  });

  it('resets per-item results after a fail but keeps the reason in the log', () => {
    const failed = recordQc('', { itemId: 'i1', checks: emptyChecks(), outcome: 'fail', by: 'q', at: AT, reason: 'Burrs on edge' });
    const after = parseNotes(resetQc(failed));
    expect(after.data.qc).toEqual({});
    expect(after.data.qcLog[0]).toMatchObject({ itemId: 'i1', outcome: 'fail', reason: 'Burrs on edge' });
  });

  it('validates package dimensions', () => {
    expect(() => recordPackage('', { lengthCm: 0, widthCm: 1, heightCm: 1, weightKg: 1 }, 'q', AT)).toThrow();
    expect(() => recordPackage('', { lengthCm: NaN, widthCm: 1, heightCm: 1, weightKg: 1 }, 'q', AT)).toThrow();
  });
});
