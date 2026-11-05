/**
 * Catalog manager form model: the editable draft (strings, as typed), zod validation, and the
 * conversion to the Product stored in Firestore. Pricing contract (api/_lib/pricing.ts): the unit
 * price of a size is `price + priceDelta` rupees excluding GST; finish ids must be server-known.
 */
import { z } from 'zod';
import {
  categories, mrpFor, unitPrice, type FinishId, type Product, type ProductCategory, type RoomId, type ThemeId,
} from '@/lib/catalog';

/** Finishes the catalog offers for new products (legacy `steel` / `corten` are still accepted on old documents). */
export const FINISH_IDS = [
  'black_patina', 'brass', 'antique_brass', 'gold', 'copper', 'corten_rust', 'stainless', 'brushed_hairline',
] as const satisfies readonly FinishId[];
const ACCEPTED_FINISH_IDS = [...FINISH_IDS, 'steel', 'corten'] as const;

const LEGACY_CATEGORY_IDS = ['wall-art', 'sculptures', 'showpieces', 'statement', 'frames', 'monograms', 'silhouettes', 'quotes'] as const;
export const CATEGORY_IDS: readonly ProductCategory[] = categories.map(c => c.id);
const ACCEPTED_CATEGORY_IDS: readonly string[] = [...CATEGORY_IDS, ...LEGACY_CATEGORY_IDS];

export const INDOOR_OUTDOOR = ['indoor', 'outdoor', 'both'] as const;

export interface SizeDraft { label: string; widthMm: string; heightMm: string; priceDelta: string }
export interface FaqDraft { q: string; a: string }

export interface ProductDraft {
  name: string; slug: string; tagline: string; description: string;
  category: ProductCategory; shapeId: string;
  price: string; mrp: string; hsnCode: string;
  finishes: FinishId[]; sizes: SizeDraft[];
  stock: string; trackInventory: boolean; leadTimeDays: string;
  featured: boolean; bestseller: boolean; isNew: boolean; customizable: boolean; isSample: boolean;
  imageUrl: string; lifestyleImage: string;
  alloySpec: string; material: string; thicknessMm: string; mounting: string; weightKg: string;
  indoorOutdoor: '' | (typeof INDOOR_OUTDOOR)[number];
  rooms: RoomId[]; themes: ThemeId[]; faqs: FaqDraft[];
}

/** New products start on a valid current category and finishes (the old defaults were retired ids). */
export function emptyDraft(): ProductDraft {
  return {
    name: '', slug: '', tagline: '', description: '', category: 'geometric', shapeId: 'circle',
    price: '', mrp: '', hsnCode: '',
    finishes: ['black_patina', 'brass', 'copper'],
    sizes: [{ label: '45 × 45 cm', widthMm: '450', heightMm: '450', priceDelta: '0' }],
    stock: '10', trackInventory: true, leadTimeDays: '',
    featured: false, bestseller: false, isNew: true, customizable: false, isSample: false,
    imageUrl: '', lifestyleImage: '',
    alloySpec: '', material: '', thicknessMm: '', mounting: '', weightKg: '', indoorOutdoor: '',
    rooms: [], themes: [], faqs: [],
  };
}

const str = (v: number | undefined) => (v === undefined ? '' : String(v));

export function draftFromProduct(p: Product): ProductDraft {
  return {
    name: p.name, slug: p.slug, tagline: p.tagline ?? '', description: p.description ?? '',
    category: p.category, shapeId: p.shapeId, price: str(p.price), mrp: str(p.mrp), hsnCode: p.hsnCode ?? '',
    finishes: [...p.finishes],
    sizes: p.sizes.map(s => ({ label: s.label, widthMm: str(s.widthMm), heightMm: str(s.heightMm), priceDelta: str(s.priceDelta) })),
    stock: str(p.stock), trackInventory: p.trackInventory ?? true, leadTimeDays: str(p.leadTimeDays),
    featured: Boolean(p.featured), bestseller: Boolean(p.bestseller), isNew: Boolean(p.isNew),
    customizable: Boolean(p.customizable), isSample: Boolean(p.isSample),
    imageUrl: p.imageUrl ?? '', lifestyleImage: p.lifestyleImage ?? '',
    alloySpec: p.alloySpec ?? '', material: p.material ?? '', thicknessMm: str(p.thicknessMm), mounting: p.mounting ?? '',
    weightKg: str(p.weightKg), indoorOutdoor: p.indoorOutdoor ?? '',
    rooms: [...(p.rooms ?? [])], themes: [...(p.themes ?? [])], faqs: (p.faqs ?? []).map(f => ({ ...f })),
  };
}

const optionalText = z.string().trim().transform(v => v || undefined);
const num = (label: string) => z.string().trim().transform(v => (v === '' ? NaN : Number(v)))
  .pipe(z.number({ invalid_type_error: `${label} must be a number` }).finite(`${label} must be a number`));
const optionalNum = (schema: z.ZodNumber) => z.string().trim().transform(v => (v === '' ? undefined : Number(v))).pipe(schema.optional());
const imageUrl = z.string().trim().refine(v => v === '' || v.startsWith('/') || /^https?:\/\/\S+$/.test(v), 'Use an https:// URL or a /path on this site')
  .transform(v => v || undefined);

const sizeSchema = z.object({
  label: z.string().trim().min(1, 'Size label is required').max(60),
  widthMm: num('Width').pipe(z.number().int('Width must be whole millimetres').min(50, 'Width must be at least 50 mm').max(3000)),
  heightMm: num('Height').pipe(z.number().int('Height must be whole millimetres').min(50, 'Height must be at least 50 mm').max(3000)),
  priceDelta: num('Price difference').pipe(z.number().min(-100000).max(1000000)),
});

export const productFormSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug may use lower-case letters, numbers and single hyphens'),
  tagline: z.string().trim().max(160),
  description: z.string().trim().max(4000),
  category: z.string().refine(v => ACCEPTED_CATEGORY_IDS.includes(v), 'Pick a category').transform(v => v as ProductCategory),
  shapeId: z.string().trim().min(1, 'Pick a base shape'),
  price: num('Price').pipe(z.number().positive('Price must be greater than zero').max(1000000)),
  mrp: optionalNum(z.number().positive('MRP must be greater than zero').max(10000000)),
  hsnCode: z.string().trim().refine(v => v === '' || /^\d{4,8}$/.test(v), 'HSN code is 4 to 8 digits').transform(v => v || undefined),
  finishes: z.array(z.enum(ACCEPTED_FINISH_IDS)).min(1, 'Choose at least one finish'),
  sizes: z.array(sizeSchema).min(1, 'Add at least one size'),
  stock: num('Stock').pipe(z.number().int('Stock must be a whole number').min(0)),
  trackInventory: z.boolean(),
  leadTimeDays: optionalNum(z.number().int('Lead time must be whole days').min(1).max(120)),
  featured: z.boolean(), bestseller: z.boolean(), isNew: z.boolean(), customizable: z.boolean(), isSample: z.boolean(),
  imageUrl, lifestyleImage: imageUrl,
  alloySpec: optionalText, material: optionalText, mounting: optionalText,
  thicknessMm: optionalNum(z.number().positive().max(20)),
  weightKg: optionalNum(z.number().positive().max(500)),
  indoorOutdoor: z.enum(['', 'indoor', 'outdoor', 'both']).transform(v => v || undefined),
  rooms: z.array(z.string()), themes: z.array(z.string()),
  faqs: z.array(z.object({ q: z.string().trim(), a: z.string().trim() })).transform(list => list.filter(f => f.q && f.a)),
}).superRefine((v, ctx) => {
  if (v.mrp !== undefined && v.mrp <= v.price) ctx.addIssue({ code: 'custom', path: ['mrp'], message: 'MRP must be higher than the price to show a discount' });
  v.sizes.forEach((s, i) => {
    if (v.price + s.priceDelta <= 0) ctx.addIssue({ code: 'custom', path: ['sizes', i, 'priceDelta'], message: 'Price plus difference must stay above zero' });
  });
  const labels = v.sizes.map(s => s.label.toLowerCase());
  labels.forEach((l, i) => {
    if (labels.indexOf(l) !== i) ctx.addIssue({ code: 'custom', path: ['sizes', i, 'label'], message: 'Size labels must be unique' });
  });
});

export type ValidProduct = z.output<typeof productFormSchema>;

export type ParseResult = { ok: true; fields: ValidProduct } | { ok: false; errors: Record<string, string> };

/** Validates a draft; errors are keyed by dotted field path (e.g. `sizes.1.widthMm`), first message wins. */
export function parseDraft(draft: ProductDraft): ParseResult {
  const result = productFormSchema.safeParse(draft);
  if (result.success) return { ok: true, fields: result.data };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.');
    if (!(key in errors)) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

/** Merges validated fields onto the stored product (keeping fields the form does not own). */
export function buildProduct(fields: ValidProduct, base: Pick<Product, 'id'> & Partial<Product>, now: number): Product {
  const { sizes, rooms, themes, faqs, ...rest } = fields;
  const optional = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  return {
    ...base,
    // Optional fields cleared in the form must not linger from the stored document.
    mrp: undefined, leadTimeDays: undefined, hsnCode: undefined, material: undefined, thicknessMm: undefined, mounting: undefined,
    weightKg: undefined, indoorOutdoor: undefined, alloySpec: undefined, imageUrl: undefined, lifestyleImage: undefined,
    ...optional,
    sizes, rooms: rooms as RoomId[], themes: themes as ThemeId[], faqs,
    createdAt: base.createdAt ?? now,
  } as Product;
}

export interface SizePreview {
  label: string;
  /** Rupees excluding GST, or null when the row is incomplete. */
  price: number | null;
  mrp: number | null;
  discountPercent: number;
}

/** Live price preview per size from the draft (tolerates half-typed values). */
export function previewSizes(draft: Pick<ProductDraft, 'price' | 'mrp' | 'sizes'>): SizePreview[] {
  const price = Number(draft.price);
  const mrp = draft.mrp.trim() === '' ? undefined : Number(draft.mrp);
  return draft.sizes.map(s => {
    const delta = Number(s.priceDelta);
    if (!draft.price.trim() || !Number.isFinite(price) || price <= 0 || s.priceDelta.trim() === '' || !Number.isFinite(delta)) {
      return { label: s.label, price: null, mrp: null, discountPercent: 0 };
    }
    const unit = unitPrice({ price }, { priceDelta: delta });
    const list = mrpFor({ price, mrp }, { priceDelta: delta });
    return { label: s.label, price: unit, mrp: list, discountPercent: list ? Math.round((1 - unit / list) * 100) : 0 };
  });
}
