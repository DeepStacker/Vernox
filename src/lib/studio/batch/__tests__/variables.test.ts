import { describe, expect, it } from 'vitest';
import { createDocument, createText } from '../../document';
import {
  activeBindings, applyVariantTexts, cellsByHeader, missingColumns, resolveTexts, substitute, templateFields, variantKey, variantLabel,
} from '../variables';

const text = (id: string, t: string, outline?: string) => ({ ...createText({ x: 0, y: 0, text: t }, 'cut'), id, outline });

describe('variable substitution', () => {
  it('lists fields and substitutes case-insensitively', () => {
    expect(templateFields('Flat {Block}-{ number } {block}')).toEqual(['Block', 'number']);
    const cells = cellsByHeader([' Block', 'Number '], ['A', ' 12 ']);
    expect(substitute('Flat {block}-{NUMBER}', cells)).toBe('Flat A-12');
  });

  it('turns unknown fields into empty text and leaves other braces alone', () => {
    expect(substitute('{missing}!', {})).toBe('!');
    expect(substitute('{}', {})).toBe('{}');
  });

  it('keeps the first column when a header repeats', () => {
    expect(cellsByHeader(['a', 'A'], ['1', '2'])).toEqual({ a: '1' });
  });

  it('reports missing columns once each', () => {
    expect(missingColumns({ x: '{a} {b}', y: '{B}' }, ['a'])).toEqual(['b']);
  });

  it('dedupes variants by resolved text, independent of key order', () => {
    expect(variantKey({ a: '1', b: '2' })).toBe(variantKey({ b: '2', a: '1' }));
    expect(variantKey({ a: '1' })).not.toBe(variantKey({ a: '2' }));
    expect(resolveTexts({ t1: '{n}' }, { n: 'X' })).toEqual({ t1: 'X' });
  });

  it('labels a variant briefly', () => {
    expect(variantLabel({ a: 'Room  12', b: '' })).toBe('Room 12');
    expect(variantLabel({ a: 'x'.repeat(200) }).length).toBeLessThanOrEqual(60);
  });

  it('applies texts to a document without mutating it and clears outlines', () => {
    const t1 = text('t1', 'old', 'M0 0');
    const t2 = text('t2', 'keep', 'M1 1');
    const doc = { ...createDocument({}), name: 'Door', objects: [t1, t2] };
    const next = applyVariantTexts(doc, { t1: 'Room 5' });
    const [a, b] = next.objects;
    expect(a.kind === 'text' && a.text).toBe('Room 5');
    expect(a.kind === 'text' && a.outline).toBeUndefined();
    expect(b).toBe(t2);
    expect(next.name).toBe('Door – Room 5');
    expect(doc.objects[0]).toBe(t1);
  });

  it('ignores bindings for deleted objects and fixed text', () => {
    const doc = { objects: [text('t1', 'a')] };
    expect(activeBindings({ t1: '{n}', gone: '{n}' }, doc)).toEqual({ t1: '{n}' });
    expect(activeBindings({ t1: 'fixed' }, doc)).toEqual({});
  });
});
