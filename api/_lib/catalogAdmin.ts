/**
 * Catalogue and settings writes (admin actions SAVE_PRODUCT, DELETE_PRODUCT, SAVE_CATEGORY, DELETE_CATEGORY,
 * SAVE_TOPIC, DELETE_TOPIC, SAVE_STORE_SETTINGS, SAVE_HOMEPAGE). The browser used to write these documents
 * directly; now the API validates what checkout, pricing and GST invoices depend on, keeps `stock` out of
 * product saves (reservations move it; staff use ADJUST_STOCK), and audits every change server-side.
 *
 * Descriptive fields (copy, images, SEO, homepage layout) pass through, bounded in size: the storefront renders
 * them as text and the API never prices from them.
 */
import { z } from 'zod';
import { auditInTransaction, buildAuditEntry } from './audit';
import { ApiError, badRequest } from './errors';
import { productFromDoc } from './pricing';
import { GSTIN_PATTERN, defaultStoreConfig, mergeStoreConfig } from './storeConfig';
import type { DocData, DocStore } from './store';

type Actor = Parameters<typeof buildAuditEntry>[0]['actor'];

const MAX_DOC_BYTES = 200_000;
const docId = z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/);
const rupees = (max: number) =>
  z.number().finite().min(0).max(max).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'use at most 2 decimals');

function bounded<T extends Record<string, unknown>>(doc: T, what: string): T {
  // JSON round-trip drops undefined and anything that is not plain data; size keeps one document from bloating reads.
  const json = JSON.stringify(doc);
  if (json.length > MAX_DOC_BYTES) throw badRequest(`The ${what} is too large to save (${Math.round(json.length / 1000)} kB).`);
  return JSON.parse(json) as T;
}

// ---------------------------------------------------------------- products

export const productSchema = z
  .object({
    id: docId,
    name: z.string().trim().min(1).max(200),
    slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use lower-case letters, digits and hyphens').max(120),
    price: rupees(1_000_000).refine(v => v > 0, 'must be above zero'),
    mrp: rupees(10_000_000).optional(),
    category: z.string().trim().min(1).max(64),
    finishes: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    sizes: z
      .array(z.object({
        label: z.string().trim().min(1).max(120),
        widthMm: z.number().int().min(0).max(10_000).optional(),
        heightMm: z.number().int().min(0).max(10_000).optional(),
        priceDelta: z.number().finite().min(-1_000_000).max(1_000_000).default(0),
      }).passthrough())
      .max(30)
      .default([]),
    hsnCode: z.string().trim().regex(/^[0-9]{4,8}$/, 'HSN codes are 4 to 8 digits').optional().or(z.literal('').transform(() => undefined)),
    gstRatePercent: z.number().finite().min(0).max(28).optional(),
    leadTimeDays: z.number().int().min(0).max(90).optional(),
    trackInventory: z.boolean().optional(),
    stock: z.number().int().min(0).max(1_000_000).optional(),
    imageUrl: z.string().trim().max(1000).optional(),
    lifestyleImage: z.string().trim().max(1000).optional(),
  })
  .passthrough()
  .superRefine((p, ctx) => {
    for (const [i, s] of p.sizes.entries()) {
      if (p.price + (s.priceDelta ?? 0) <= 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sizes', i, 'priceDelta'], message: 'makes this size free or negative' });
    }
    for (const key of ['imageUrl', 'lifestyleImage'] as const) {
      const url = p[key];
      // Rendered as <img src>: only web addresses and storage paths, never a script or inline data URL.
      if (url && /^\s*(javascript|data|vbscript):/i.test(url)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'is not an image address' });
    }
  });
export type ProductInput = z.infer<typeof productSchema>;

/** Creates with the given stock, or replaces an existing product keeping its live stock. */
export async function saveProduct(store: DocStore, input: ProductInput, actor: Actor, now = Date.now()) {
  const product = bounded(input as Record<string, unknown>, 'product');
  return store.runTransaction(async tx => {
    const existing = await tx.get(`products/${input.id}`);
    const doc: DocData = existing
      ? { ...product, stock: existing.stock ?? 0, createdAt: existing.createdAt ?? now, updatedAt: now }
      : { ...product, stock: input.stock ?? 0, createdAt: now, updatedAt: now };
    // The same parser checkout prices from: a product it cannot price must not be saved as buyable.
    if (!productFromDoc(input.id, doc)) throw badRequest('This product cannot be priced: check the price.');
    tx.set(`products/${input.id}`, doc);
    auditInTransaction(store, tx, buildAuditEntry({
      actor, action: 'PRODUCT_SAVED', targetType: 'product', targetId: input.id, details: { name: input.name, created: !existing }, now,
    }));
    return { id: input.id, created: !existing };
  });
}

// ---------------------------------------------------------------- categories, topics

export const categorySchema = z.object({
  id: docId,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(''),
}).passthrough();

export const topicSchema = z.object({
  id: docId,
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().max(80).default(''),
  content: z.string().max(100_000),
  readTime: z.string().trim().max(40).default(''),
  date: z.string().trim().max(40).default(''),
}).passthrough();

type Collection = 'products' | 'categories' | 'topics';
const AUDIT: Record<Collection, { target: 'product' | 'category' | 'settings'; saved: string; deleted: string }> = {
  products: { target: 'product', saved: 'PRODUCT_SAVED', deleted: 'PRODUCT_DELETED' },
  categories: { target: 'category', saved: 'CATEGORY_SAVED', deleted: 'CATEGORY_DELETED' },
  topics: { target: 'settings', saved: 'TOPIC_SAVED', deleted: 'TOPIC_DELETED' },
};

export async function saveSimpleDoc(store: DocStore, collection: 'categories' | 'topics', input: { id: string }, actor: Actor, now = Date.now()) {
  const doc = bounded(input as Record<string, unknown>, collection === 'topics' ? 'topic' : 'category');
  await store.runTransaction(async tx => {
    tx.set(`${collection}/${input.id}`, { ...doc, updatedAt: now });
    auditInTransaction(store, tx, buildAuditEntry({ actor, action: AUDIT[collection].saved, targetType: AUDIT[collection].target, targetId: input.id, now }));
  });
  return { id: input.id };
}

export async function deleteCatalogDoc(store: DocStore, collection: Collection, id: string, actor: Actor, now = Date.now()) {
  await store.runTransaction(async tx => {
    if (!(await tx.get(`${collection}/${id}`))) throw new ApiError(404, 'NOT_FOUND', 'It was already deleted.');
    tx.delete(`${collection}/${id}`);
    auditInTransaction(store, tx, buildAuditEntry({ actor, action: AUDIT[collection].deleted, targetType: AUDIT[collection].target, targetId: id, now }));
  });
  return { id };
}

// ---------------------------------------------------------------- settings

/** Seller details on settings/store feed every GST invoice: check them where they are saved, not at dispatch. */
function assertSellerShape(seller: unknown) {
  if (!seller || typeof seller !== 'object') return;
  const s = seller as Record<string, unknown>;
  const gstin = typeof s.gstin === 'string' ? s.gstin.trim().toUpperCase() : '';
  if (gstin && !GSTIN_PATTERN.test(gstin)) throw badRequest('The GSTIN is not valid: it has 15 characters, e.g. 29ABCDE1234F1Z5.');
  if (gstin && typeof s.stateCode === 'string' && s.stateCode && s.stateCode !== gstin.slice(0, 2)) {
    throw badRequest('The GST state code must match the first two digits of the GSTIN.');
  }
  if (typeof s.pincode === 'string' && s.pincode && !/^[1-9][0-9]{5}$/.test(s.pincode)) throw badRequest('The seller PIN code must be 6 digits.');
}

/** No setting is a negative amount, rate or count; a typo there would reach prices or limits at checkout. */
function assertNoNegativeNumbers(value: unknown, path: string) {
  if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) throw badRequest(`${path} must be zero or more.`);
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) assertNoNegativeNumbers(v, path ? `${path}.${k}` : k);
  }
}

export const settingsPatchSchema = z.record(z.unknown()).refine(v => Object.keys(v).length > 0, 'nothing to save');

/** Top-level merge, as the settings screens apply it, validated as a whole before it is stored. */
export async function saveSettings(store: DocStore, kind: 'store' | 'homepage', patch: Record<string, unknown>, actor: Actor, now = Date.now()) {
  const updates = bounded(patch, 'settings');
  await store.runTransaction(async tx => {
    const current = (await tx.get(`settings/${kind}`)) ?? {};
    const next: DocData = { ...current, ...updates, updatedAt: now };
    if (kind === 'store') {
      assertSellerShape(next.seller);
      assertNoNegativeNumbers({ ...next, updatedAt: 0 }, '');
      mergeStoreConfig(defaultStoreConfig(), next); // throws on shapes the API cannot read
    }
    if (JSON.stringify(next).length > MAX_DOC_BYTES) throw badRequest('These settings are too large to save.');
    tx.set(`settings/${kind}`, next);
    auditInTransaction(store, tx, buildAuditEntry({
      actor, action: kind === 'store' ? 'STORE_CONFIG_UPDATED' : 'HOMEPAGE_UPDATED', targetType: 'settings', targetId: kind,
      details: { fields: Object.keys(updates) }, now,
    }));
  });
  return { saved: Object.keys(updates) };
}
