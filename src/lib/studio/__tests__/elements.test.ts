// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validate } from '../api';
import { createDocument, createPath } from '../document';
import { ELEMENTS, elementPathData } from '../elements/motifs';
import { centrePathData } from '../geometry/path';
import { pieces } from '../geometry/clipper';
import { elementRings } from '../elements/motifs';
import type { StudioDocument } from '../schema';

const TARGET_MM = 150;

/** A motif scaled so its longer side is TARGET_MM, centred on a plate or standing alone. */
function withElement(id: string, mode: 'cut-out' | 'solid'): StudioDocument {
  const c = centrePathData(elementPathData(id));
  const scale = TARGET_MM / Math.max(c.width, c.height);
  const plate = mode === 'cut-out'
    ? { style: 'solid' as const, widthMm: 260, heightMm: 260, cornerRadiusMm: 6 }
    : { style: 'none' as const, widthMm: 260, heightMm: 260 };
  const doc = createDocument({ plate, mounting: { preset: 'none' }, material: { finish: 'black_patina', thicknessMm: 2 } });
  // No auto-bridges: a motif must not rely on them (that would hide loose pieces).
  doc.manufacturing.autoBridges = false;
  return { ...doc, objects: [createPath({ d: c.d, x: 130, y: 130, scaleX: scale, scaleY: scale, op: mode === 'cut-out' ? 'cut' : 'add' })] };
}

// A part under 100 mm in one direction is a size rule for the whole piece, not a motif defect.
const describeIssues = (doc: StudioDocument) => validate(doc).analysis.issues.filter(i => i.rule !== 'too-small').map(i => `${i.rule}(${JSON.stringify(i.params ?? {})} at ${JSON.stringify(i.at ?? null)})`);

describe('elements library', () => {
  it('has the requested motifs, unique ids and a name each', () => {
    expect(ELEMENTS.length).toBeGreaterThanOrEqual(19);
    expect(new Set(ELEMENTS.map(e => e.id)).size).toBe(ELEMENTS.length);
    for (const id of ['lotus', 'peacock', 'tree-of-life', 'branch', 'sun', 'moon', 'star', 'bird', 'elephant', 'diya', 'kalash', 'paisley', 'rosette', 'floral-corner', 'border-straight', 'border-corner', 'arrow', 'heart']) {
      expect(ELEMENTS.map(e => e.id), id).toContain(id);
    }
  });

  for (const e of ELEMENTS) {
    it(`${e.id}: one connected silhouette without islands`, () => {
      const ps = pieces(elementRings(e.id));
      expect(ps).toHaveLength(1);
      expect(ps[0].holes).toHaveLength(0);
    });

    it(`${e.id}: cut out of a plate at ${TARGET_MM} mm has zero issues`, () => {
      expect(describeIssues(withElement(e.id, 'cut-out'))).toEqual([]);
    });

    it(`${e.id}: as a solid free-standing piece at ${TARGET_MM} mm has zero issues`, () => {
      expect(describeIssues(withElement(e.id, 'solid'))).toEqual([]);
    });
  }
});
