import { describe, expect, it } from 'vitest';
import {
  MAX_QC_PHOTOS, NOTES_MARKER, allItemsPassedQc, appendNote, emptyChecks, freeText, parseNotes, qcPhotoPaths, recordPackage, recordQc, resetQc, serializeNotes, withFreeText,
  type QcChecks,
} from '../orderNotes';

const allChecks = (): QcChecks => ({ dimensions: true, finish: true, edges: true, hardware: true, photo: true });
const AT = Date.UTC(2026, 10, 5, 14, 2);
const PHOTO = 'qc/ord_1/mh3k2-a1b2c3.webp';

describe('order notes structured block', () => {
  it('treats legacy plain notes as free text with empty data', () => {
    const parsed = parseNotes('Check patina');
    expect(parsed.text).toBe('Check patina');
    expect(parsed.data.qc).toEqual({});
    expect(serializeNotes(parsed)).toBe('Check patina');
  });

  it('round-trips QC and package data after the free text', () => {
    let notes = appendNote('', 'Started cutting', 'a@vernox.in', AT);
    notes = recordQc(notes, { itemId: 'i1', checks: allChecks(), outcome: 'pass', by: 'q@vernox.in', at: AT, photos: [PHOTO] });
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
    const base = recordQc('first', { itemId: 'i1', checks: allChecks(), outcome: 'pass', by: 'q', at: AT, photos: [PHOTO] });
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
    const next = recordQc(broken, { itemId: 'i1', checks: allChecks(), outcome: 'pass', by: 'q', at: AT, photos: [PHOTO] });
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
    expect(() => recordQc('', { itemId: 'i1', checks: partial, outcome: 'pass', by: 'q', at: AT, photos: [PHOTO] })).toThrow(/every QC check/i);
    expect(() => recordQc('', { itemId: 'i1', checks: partial, outcome: 'fail', by: 'q', at: AT, reason: '  ' })).toThrow(/reason/i);
  });

  it('derives "Photo taken" from stored photos: a pass needs one, a tick alone is not enough', () => {
    expect(() => recordQc('', { itemId: 'i1', checks: allChecks(), outcome: 'pass', by: 'q', at: AT })).toThrow(/QC photo/i);
    const passed = parseNotes(recordQc('', { itemId: 'i1', checks: { ...allChecks(), photo: false }, outcome: 'pass', by: 'q', at: AT, photos: [PHOTO] }));
    expect(passed.data.qc.i1).toMatchObject({ outcome: 'pass', photos: [PHOTO] });
    expect(passed.data.qc.i1.checks.photo).toBe(true);
    const failed = parseNotes(recordQc('', { itemId: 'i1', checks: allChecks(), outcome: 'fail', by: 'q', at: AT, reason: 'Scratch' }));
    expect(failed.data.qc.i1.checks.photo).toBe(false);
    expect(passed.data.qcLog[0].photos).toBeUndefined();
  });

  it('keeps a failed attempt\'s photos in the log after the results reset', () => {
    const notes = resetQc(recordQc('', { itemId: 'i1', checks: emptyChecks(), outcome: 'fail', by: 'q', at: AT, reason: 'Scratch', photos: [PHOTO] }));
    expect(parseNotes(notes).data.qcLog[0]).toMatchObject({ outcome: 'fail', photos: [PHOTO] });
  });

  it('accepts only QC storage paths, at most MAX_QC_PHOTOS per item', () => {
    const base = { itemId: 'i1', checks: allChecks(), outcome: 'pass' as const, by: 'q', at: AT };
    for (const bad of ['returns/ord_1/x.webp', 'qc/ord_1/../x.webp', 'qc/ord_1/x.jpg', 'https://evil.example/x.webp']) {
      expect(() => recordQc('', { ...base, photos: [bad] })).toThrow(/at most/i);
    }
    const many = Array.from({ length: MAX_QC_PHOTOS + 1 }, (_, i) => `qc/ord_1/p${i}.webp`);
    expect(() => recordQc('', { ...base, photos: many })).toThrow(/at most/i);
    // A hand-edited block keeps only valid paths.
    const tampered = parseNotes(`${NOTES_MARKER}{"qc":{"i1":{"outcome":"pass","checks":{},"photos":["${PHOTO}","javascript:x",7]}},"qcLog":[]}`);
    expect(tampered.data.qc.i1.photos).toEqual([PHOTO]);
  });

  it('lists every QC photo on the order', () => {
    let notes = recordQc('', { itemId: 'i1', checks: allChecks(), outcome: 'pass', by: 'q', at: AT, photos: [PHOTO] });
    notes = recordQc(notes, { itemId: 'i2', checks: allChecks(), outcome: 'pass', by: 'q', at: AT, photos: ['qc/ord_1/p2.webp'] });
    expect(qcPhotoPaths(notes)).toEqual([PHOTO, 'qc/ord_1/p2.webp']);
    expect(qcPhotoPaths(undefined)).toEqual([]);
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
