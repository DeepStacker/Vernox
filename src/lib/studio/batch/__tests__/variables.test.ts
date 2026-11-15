import { describe, expect, it } from 'vitest';
import { createDocument, createText } from '../../document';
import {
  activeBindings, applyVariantTexts, cellsByHeader, missingColumns, resolveBindings, resolveTexts, substitute, templateFields, variantKey, variantLabel,
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

describe('automatic column links for template-bound texts', () => {
  const bound = (id: string, t: string, binding: string) => ({ ...createText({ x: 0, y: 0, text: t, binding }, 'cut'), id });
  // The House name plate: texts bound to `name` (label "Family name") and `number` (label "House number").
  const doc = { objects: [bound('n', 'The Sharmas', 'name'), bound('h', 'B-42', 'number'), text('f', 'WELCOME')] };
  const labels = { name: 'Family name', number: 'House number' };
  const isQty = (h: string) => h.toLowerCase() === 'qty';

  it('links each bound text to the column with the same key, case and spaces ignored', () => {
    const r = resolveBindings({}, doc, ['Name ', 'NUMBER', 'qty'], labels, isQty);
    expect(r.bindings).toEqual({ n: '{Name}', h: '{NUMBER}' });
    expect(r.links.map(l => [l.objectId, l.source, l.columns])).toEqual([['n', 'auto', ['Name']], ['h', 'auto', ['NUMBER']], ['f', 'fixed', []]]);
    expect(r.unusedColumns).toEqual([]);
    const cells = cellsByHeader(['Name ', 'NUMBER', 'qty'], ['The Iyers', '7', '2']);
    expect(resolveTexts(r.bindings, cells)).toEqual({ n: 'The Iyers', h: '7' });
  });

  it('matches the field label too ("Family name", "House Number") and reports unlinked fields and unused columns', () => {
    const r = resolveBindings({}, doc, ['family_name', 'Flat', 'notes'], labels, isQty);
    expect(r.bindings).toEqual({ n: '{family_name}' });
    expect(r.links.find(l => l.objectId === 'h')).toMatchObject({ source: 'unlinked', label: 'House number', template: '' });
    expect(r.unusedColumns).toEqual(['Flat', 'notes']);
    expect(resolveBindings({}, doc, ['House Number'], labels).bindings).toEqual({ h: '{House Number}' });
  });

  it('keeps typed templates, including fixed text, over the automatic link', () => {
    const r = resolveBindings({ n: 'Flat {flat}', h: '' }, doc, ['name', 'number', 'flat'], labels, isQty);
    expect(r.bindings).toEqual({ n: 'Flat {flat}' });
    expect(r.links.map(l => l.source)).toEqual(['manual', 'manual', 'fixed']);
    expect(r.unusedColumns).toEqual(['name', 'number']);
  });

  it('does nothing without a sheet', () => {
    const r = resolveBindings({}, doc, [], labels);
    expect(r.bindings).toEqual({});
    expect(r.links.map(l => l.source)).toEqual(['unlinked', 'unlinked', 'fixed']);
  });
});
