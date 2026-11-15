// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { applyTemplate, setTemplateField, validate } from '../api';
import { getTemplate, listTemplates, TEMPLATE_CATEGORIES, templateDefaults } from '../templates/registry';
import { fontById, fontsForText } from '../text/fonts';
import { useDiskFonts } from './testFonts';

// Real fonts, real HarfBuzz shaping, the same compose + manufacturability pipeline the studio
// runs. A template is a promise that a customer's first design is clean.
beforeAll(() => useDiskFonts());

const describeIssues = (doc: Awaited<ReturnType<typeof applyTemplate>>) =>
  validate(doc).analysis.issues.map(i => `${i.rule}(${JSON.stringify(i.params ?? {})} at ${JSON.stringify(i.at ?? null)})`);

describe('built-in templates', () => {
  it('has a category for every template and enough templates', () => {
    const categories = new Set(TEMPLATE_CATEGORIES.map(c => c.id));
    expect(listTemplates().length).toBeGreaterThanOrEqual(18);
    for (const t of listTemplates()) expect(categories.has(t.category), t.id).toBe(true);
  });

  it('only uses fonts that can render the field text', () => {
    for (const t of listTemplates()) {
      for (const o of t.build(templateDefaults(t)).objects ?? []) {
        if (o.kind === 'text') expect(fontsForText(o.text).map(f => f.id), `${t.id}: ${fontById(o.fontId).name} for "${o.text}"`).toContain(o.fontId);
      }
    }
  });

  for (const t of listTemplates()) {
    it(`${t.id}: default design has zero manufacturability issues`, async () => {
      const doc = await applyTemplate(t.id);
      expect(describeIssues(doc)).toEqual([]);
    });

    (t.samples ?? []).forEach((fields, i) => {
      it(`${t.id}: typical edit #${i + 1} (${Object.values(fields).join(' / ').replace(/\n/g, ' ')}) is clean`, async () => {
        const doc = await applyTemplate(t.id, fields);
        expect(describeIssues(doc)).toEqual([]);
      });
    });
  }

  it('editing a field in the studio keeps the design clean', async () => {
    const t = getTemplate('house-name')!;
    let doc = await applyTemplate(t.id);
    doc = await setTemplateField(doc, 'name', t.samples![0].name);
    expect(describeIssues(doc)).toEqual([]);
  });
});
