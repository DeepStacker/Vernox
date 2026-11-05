/**
 * Template registry. A template is data plus a pure `build(fields)` that returns the plate,
 * material and objects; text objects bound to a field (`binding`) update when the customer
 * edits that field, keeping their position. Register a new template
 * with `registerTemplate` (see definitions.ts) — no component changes needed.
 */
import type { CreateDocumentOptions } from '../document';
import type { StudioDocument, StudioObject } from '../schema';

export type TemplateCategory = 'name-plate' | 'spiritual' | 'office' | 'quote' | 'festive';

export interface TemplateField {
  key: string;
  label: string;
  default: string;
  multiline?: boolean;
}

export interface StudioTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  fields: TemplateField[];
  /** Finish used for the gallery thumbnail and as the starting finish. */
  finish: string;
  build: (fields: Record<string, string>) => CreateDocumentOptions;
}

const registry = new Map<string, StudioTemplate>();

export function registerTemplate(template: StudioTemplate) {
  registry.set(template.id, template);
}

export function listTemplates(): StudioTemplate[] {
  return [...registry.values()];
}

export function getTemplate(id: string): StudioTemplate | undefined {
  return registry.get(id);
}

export function templateDefaults(t: StudioTemplate): Record<string, string> {
  return Object.fromEntries(t.fields.map(f => [f.key, f.default]));
}

/**
 * Sets template field values: bound text gets the new text and returns to the template's
 * designed size (auto-fit shrinks it again when needed); its outline is cleared for re-shaping.
 */
export function applyTemplateFields(doc: StudioDocument, fields: Record<string, string>): StudioDocument {
  if (!doc.template) return doc;
  const values = { ...doc.template.fields, ...fields };
  const built = getTemplate(doc.template.id)?.build(values);
  // The plate may have been resized since the template was applied; scale designed sizes with it.
  const k = built?.plate?.widthMm && built.plate.heightMm
    ? Math.min(doc.plate.widthMm / built.plate.widthMm, doc.plate.heightMm / built.plate.heightMm)
    : 1;
  const objects = doc.objects.map((o): StudioObject => {
    if (o.kind !== 'text' || !o.binding || !(o.binding in fields)) return o;
    const designed = built?.objects?.find(b => b.kind === 'text' && b.binding === o.binding);
    return {
      ...o,
      text: fields[o.binding],
      ...(designed?.kind === 'text' ? { sizeMm: Math.round(designed.sizeMm * k * 10) / 10, letterSpacingMm: designed.letterSpacingMm * k } : {}),
      outline: undefined,
    };
  });
  return { ...doc, template: { ...doc.template, fields: values }, objects };
}
