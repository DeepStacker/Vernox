/**
 * Studio strings. English is complete; other locales (Hindi first) add a partial dictionary
 * with the same keys and fall back to English for anything missing. Keep strings short —
 * the studio deliberately uses very little text.
 */
import type { DesignIssue } from './manufacturability';

const en = {
  'step.start': 'Start',
  'step.design': 'Design',
  'step.review': 'Review',
  'start.title': 'What would you like to make?',
  'start.templates': 'Start from a template',
  'start.blank': 'Blank plate',
  'start.upload': 'Upload a logo or drawing',
  'start.resume': 'Continue your last design',
  'start.saved': 'Your saved designs',
  'step.batch': 'Batch',
  'batch.variables': 'Variables',
  'batch.variablesHint': 'Type {column} in a text to fill it from the sheet.',
  'batch.noText': 'Add a text item to the design first.',
  'batch.fixed': 'Fixed',
  'batch.data': 'Sheet',
  'batch.paste': 'Paste CSV here (first row = column names)',
  'batch.upload': 'Upload CSV',
  'batch.clear': 'Clear',
  'batch.rows': '{count} rows',
  'batch.flagged': '{count} flagged',
  'batch.variants': '{count} designs',
  'batch.units': '{count} pieces',
  'batch.pricing': 'Pricing {done}/{total}…',
  'batch.total': 'Total',
  'batch.add': 'Add {count} to cart',
  'batch.added': 'In cart',
  'batch.limits': 'An order takes up to {lines} lines, {qty} pieces per line.',
  'batch.truncated': 'Only the first {max} of {total} rows are used.',
  'batch.inputTruncated': 'The file is too large; the rest was ignored.',
  'batch.unterminated': 'A quote is never closed; later rows may be missing.',
  'batch.partial': 'Added {added}. {left} do not fit this order: check out, then add the rest.',
  'batch.addedAll': 'Added {count} to cart',
  'batch.nothingFits': 'The cart has no room for these designs.',
  'batch.missingColumn': 'No column "{field}" in the sheet.',
  'batch.col.qty': 'Qty',
  'batch.col.price': 'Price',
  'batch.err.empty-row': 'Empty row',
  'batch.err.empty-value': '"{field}" is empty',
  'batch.err.bad-qty': 'Quantity "{value}" is not a whole number',
  'batch.err.qty-too-high': 'At most {max} per row',
  'batch.err.too-long': 'Text is {over} mm too long for the plate',
  'batch.err.shape-failed': 'Could not prepare the letters',
  'batch.err.unpriced': 'Cannot be priced ({reason})',
  'tool.select': 'Select (V)',
  'tool.text': 'Add text (T)',
  'tool.shape': 'Add shape (S)',
  'tool.upload': 'Upload & trace (U)',
  'tool.hole': 'Mounting holes',
  'tool.templates': 'Templates',
  'tool.plate': 'Plate & material',
  'tool.layers': 'Layers (L)',
  'tool.import': 'Import SVG / DXF',
  'tool.shortcuts': 'Shortcuts (?)',
  'tool.undo': 'Undo (Ctrl+Z)',
  'tool.redo': 'Redo (Ctrl+Shift+Z)',
  'mode.simple': 'Simple',
  'mode.pro': 'Pro',
  'bar.next': 'Review',
  'bar.addToCart': 'Add to cart',
  'bar.added': 'Added to cart',
  'bar.leadTime': 'Ships in {days} days',
  'bar.fixFirst': 'Fix the red issues first',
  'issues.none': 'Ready to cut',
  'issues.title': 'Checks',
  'fix.add-bridges': 'Add bridges',
  'fix.grow-text': 'Make bigger',
  'fix.fit-size': 'Fit to limit',
  'fix.grow-size': 'Enlarge',
  'fix.mounting-off': 'Remove holes',
  'issue.empty': 'Nothing to cut yet.',
  'issue.text-loading': 'Preparing letters…',
  'issue.too-large': 'Larger than {w} × {h} mm.',
  'issue.too-small': 'Smaller than {min} mm.',
  'issue.loose-pieces': '{count} piece(s) would fall out.',
  'issue.thin-feature': 'Metal thinner than {mm} mm in {count} place(s).',
  'issue.narrow-slot': 'Gaps narrower than {mm} mm in {count} place(s).',
  'issue.small-hole': '{count} hole(s) smaller than {mm} mm.',
  'issue.small-text': 'Letters under {mm} mm may not cut cleanly.',
  'issue.outside-plate': 'Part of this item is outside the plate.',
  'issue.mounting-no-room': 'No room for {count} mounting hole(s).',
  'review.finish': 'Finish',
  'review.thickness': 'Thickness',
  'review.quantity': 'Quantity',
  'review.download': 'Download',
  'review.standoff': 'Wall shadow',
  'trace.title': 'Trace image',
  'trace.threshold': 'Threshold',
  'trace.smooth': 'Smoothness',
  'trace.despeckle': 'Remove specks',
  'trace.invert': 'Invert',
  'trace.place': 'Place on plate',
  'trace.working': 'Tracing…',
  'trace.failed': 'Could not trace this image.',
  'plate.title': 'Plate',
  'plate.style.solid': 'Solid plate',
  'plate.style.frame': 'Frame',
  'plate.style.none': 'No plate',
  'obj.op.cut': 'Cut out',
  'obj.op.add': 'Solid',
  'obj.op.score': 'Engrave',
  'shortcuts.title': 'Keyboard shortcuts',
  'error.storage': 'Could not save: browser storage is full or blocked.',
  'error.tooDetailed': 'This design is too detailed to order online. Simplify it or contact us.',
} as const;

export type MessageKey = keyof typeof en;
type Dictionary = Partial<Record<MessageKey, string>>;

/** Hindi: add translations here; anything missing falls back to English. */
const hi: Dictionary = {};

const dictionaries: Record<string, Dictionary> = { en, hi };
let locale = 'en';

export function setStudioLocale(next: string) {
  locale = next in dictionaries ? next : 'en';
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = dictionaries[locale]?.[key] ?? en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}

export function issueMessage(issue: Pick<DesignIssue, 'rule' | 'params'>): string {
  return t(`issue.${issue.rule}` as MessageKey, issue.params);
}
