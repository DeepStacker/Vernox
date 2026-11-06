/**
 * Server-authoritative pricing (pure functions, no I/O).
 *
 * Catalog prices come from Firestore `products/{id}` documents (rupees, as staff
 * edit them) converted to paise by productFromDoc(). Crafting Studio pieces
 * (productId CUSTOM_PRODUCT_ID) are priced from their dimensions and finish via
 * StoreConfig.customPieces. Any price the client sends is ignored — the request
 * schema does not even accept one.
 *
 * Rounding: every unit price is an integer number of paise; line totals are
 * unit × quantity. GST (prices are GST-exclusive; tax is added on top) is
 * computed per invoice line and rounded per line, so the order total and the GST
 * invoice always agree to the paisa:
 *  - an order-level discount is allocated to lines pro rata to their value
 *    (largest-remainder, so the parts sum exactly to the discount);
 *  - each line is taxed at its product's GST rate (`gstRatePercent` on the product,
 *    else the store rate);
 *  - shipping and the COD fee are part of a composite supply of goods, so they are
 *    taxable at the rate of the principal supply — the highest line rate.
 */
import { ApiError } from './errors';
import { isNonNegativeFinite, rupeesToPaise } from './money';
import type { DocData } from './store';
import type { StoreConfig } from './storeConfig';

import { CONSULTATION_SERVICE_ID } from '../../src/types/consultation';
import { CUSTOM_PRODUCT_ID } from '../../src/types/products';
import { normaliseFinishId, quoteCustomPiece } from '../../src/lib/pricing/customPiece';

export { CUSTOM_PRODUCT_ID };

export interface CheckoutItemInput {
  productId: string;
  sizeLabel?: string;
  widthMm?: number;
  heightMm?: number;
  finish: string;
  quantity: number;
  customDesignRef?: string;
}

export interface ProductSize {
  label: string;
  widthMm: number;
  heightMm: number;
  priceDeltaPaise: number;
}

export interface ProductRecord {
  id: string;
  name: string;
  category: string | null;
  basePricePaise: number;
  sizes: ProductSize[];
  /** Normalised finish ids; empty = any finish accepted. */
  finishes: string[];
  trackInventory: boolean;
  stock: number;
  purchasable: boolean;
  /** HSN code from the product document; null = store default. */
  hsnCode: string | null;
  /** Product-specific GST rate; null = store rate. */
  gstRateBps: number | null;
  /** Production days before dispatch; null = store default. */
  leadTimeDays: number | null;
}

export interface PricedLine {
  productId: string;
  name: string;
  category: string | null;
  sizeLabel: string | null;
  widthMm: number | null;
  heightMm: number | null;
  finish: string;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
  isCustom: boolean;
  customDesignRef: string | null;
  /** HSN for goods; SAC for a service line. */
  hsnCode: string;
  gstRateBps: number;
  /** A service (design consultation): no stock, no shipping, never COD. */
  isService?: boolean;
}

export interface LineTax {
  /** Share of the order discount allocated to this line. */
  discountPaise: number;
  taxablePaise: number;
  gstRateBps: number;
  taxPaise: number;
}

export interface ChargeTax {
  kind: 'shipping' | 'cod_fee';
  taxablePaise: number;
  gstRateBps: number;
  taxPaise: number;
}

export interface TaxBreakdown {
  lines: LineTax[];
  charges: ChargeTax[];
}

export interface OrderTotals {
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  /** COD handling fee (0 for prepaid). */
  codFeePaise: number;
  taxPaise: number;
  totalPaise: number;
  /** Store GST rate at the time of the order (rate of shipping/fees when all lines share it). */
  gstRateBps: number;
  taxBreakdown: TaxBreakdown;
}

export const normaliseFinish = normaliseFinishId;
const normaliseLabel = (label: string) => label.trim().toLowerCase().replace(/\s+/g, ' ');

const invalidItem = (message: string) => new ApiError(400, 'INVALID_ITEM', message);

/**
 * Builds a ProductRecord from a Firestore product document. Returns null when the
 * document cannot be priced safely (missing/invalid price) — callers treat that as
 * INVALID_ITEM rather than guessing a price or a stock level.
 */
const optionalWholeNumber = (value: unknown, max: number): number | null =>
  isNonNegativeFinite(value) && Number.isInteger(value) && value <= max ? value : null;

export function productFromDoc(id: string, data: DocData | null): ProductRecord | null {
  if (!data || !isNonNegativeFinite(data.price)) return null;
  const sizes: ProductSize[] = [];
  if (Array.isArray(data.sizes)) {
    for (const s of data.sizes as Array<Record<string, unknown>>) {
      if (typeof s?.label !== 'string' || !isNonNegativeFinite(s.priceDelta ?? 0)) return null;
      sizes.push({
        label: s.label,
        widthMm: Number(s.widthMm) || 0,
        heightMm: Number(s.heightMm) || 0,
        priceDeltaPaise: rupeesToPaise(Number(s.priceDelta ?? 0)),
      });
    }
  }
  const trackInventory = data.trackInventory !== false;
  const stock = typeof data.stock === 'number' && Number.isFinite(data.stock) ? Math.floor(data.stock) : 0;
  return {
    id,
    name: typeof data.name === 'string' && data.name.trim() ? data.name : id,
    category: typeof data.category === 'string' ? data.category : null,
    basePricePaise: rupeesToPaise(data.price),
    sizes,
    finishes: Array.isArray(data.finishes) ? (data.finishes as unknown[]).filter((f): f is string => typeof f === 'string').map(normaliseFinish) : [],
    trackInventory,
    stock,
    purchasable: data.status !== 'archived' && data.status !== 'draft' && data.isActive !== false,
    hsnCode: typeof data.hsnCode === 'string' && /^[0-9]{4,8}$/.test(data.hsnCode.trim()) ? data.hsnCode.trim() : null,
    gstRateBps: isNonNegativeFinite(data.gstRatePercent) && data.gstRatePercent <= 100 ? Math.round(data.gstRatePercent * 100) : null,
    leadTimeDays: optionalWholeNumber(data.leadTimeDays, 90),
  };
}

function resolveSize(item: CheckoutItemInput, product: ProductRecord): ProductSize | null {
  if (product.sizes.length === 0) return null;
  if (item.sizeLabel) {
    const wanted = normaliseLabel(item.sizeLabel);
    const byLabel = product.sizes.find(s => normaliseLabel(s.label) === wanted);
    if (byLabel) return byLabel;
  }
  if (item.widthMm && item.heightMm) {
    const byDims = product.sizes.find(s => s.widthMm === item.widthMm && s.heightMm === item.heightMm);
    if (byDims) return byDims;
  }
  throw invalidItem(`Size "${item.sizeLabel ?? `${item.widthMm}×${item.heightMm}mm`}" is not offered for ${product.name}.`);
}

export function priceCatalogLine(
  item: CheckoutItemInput,
  product: ProductRecord | null,
  tax: Pick<StoreConfig, 'gstRateBps' | 'defaultHsnCode'>,
): PricedLine {
  if (!product) throw invalidItem(`Product ${item.productId} is not available.`);
  if (!product.purchasable) throw invalidItem(`${product.name} is no longer available.`);
  const finish = normaliseFinish(item.finish);
  if (product.finishes.length > 0 && !product.finishes.includes(finish)) {
    throw invalidItem(`Finish "${item.finish}" is not offered for ${product.name}.`);
  }
  const size = resolveSize(item, product);
  const unitPricePaise = product.basePricePaise + (size?.priceDeltaPaise ?? 0);
  return {
    productId: product.id,
    name: product.name,
    category: product.category,
    sizeLabel: size?.label ?? null,
    widthMm: size?.widthMm ?? null,
    heightMm: size?.heightMm ?? null,
    finish,
    quantity: item.quantity,
    unitPricePaise,
    lineTotalPaise: unitPricePaise * item.quantity,
    isCustom: false,
    customDesignRef: item.customDesignRef ?? null,
    hsnCode: product.hsnCode ?? tax.defaultHsnCode,
    gstRateBps: product.gstRateBps ?? tax.gstRateBps,
  };
}

/** Custom piece: max(minimum, setupFee + width_cm × height_cm × rate), via the shared quoteCustomPiece(). */
export function priceCustomLine(item: CheckoutItemInput, config: StoreConfig): PricedLine {
  const { minDimensionMm, maxWidthMm, maxHeightMm, finishes } = config.customPieces;
  const quote = quoteCustomPiece(item, finishes, config.customPieces);
  if ('problem' in quote) {
    if (quote.problem === 'missing-dimensions') throw invalidItem('Custom pieces require widthMm and heightMm.');
    if (quote.problem === 'out-of-range') {
      throw invalidItem(`Custom pieces must be between ${minDimensionMm}mm and ${maxWidthMm}×${maxHeightMm}mm.`);
    }
    throw invalidItem(`Finish "${item.finish}" is not available for custom pieces.`);
  }
  const { unitPricePaise, rate, finish } = quote;
  const widthMm = item.widthMm as number;
  const heightMm = item.heightMm as number;
  return {
    productId: CUSTOM_PRODUCT_ID,
    name: `Bespoke ${rate.label} piece (${widthMm} × ${heightMm} mm)`,
    category: 'custom',
    sizeLabel: `${widthMm}mm × ${heightMm}mm`,
    widthMm,
    heightMm,
    finish,
    quantity: item.quantity,
    unitPricePaise,
    lineTotalPaise: unitPricePaise * item.quantity,
    isCustom: true,
    customDesignRef: item.customDesignRef ?? null,
    hsnCode: config.defaultHsnCode,
    gstRateBps: config.gstRateBps,
  };
}

/**
 * The design consultation: a server-defined service line. The fee, SAC and GST come from
 * StoreConfig only; it is only ever priced by the consultation purchase (api/_lib/consultations.ts),
 * never from a client-supplied item, so no `products/` document can impersonate it.
 */
export function priceConsultationLine(config: StoreConfig): PricedLine {
  const { pricePaise, sacCode, gstRateBps } = config.consultation;
  return {
    productId: CONSULTATION_SERVICE_ID,
    name: 'Design consultation',
    category: 'service',
    sizeLabel: null,
    widthMm: null,
    heightMm: null,
    finish: 'service',
    quantity: 1,
    unitPricePaise: pricePaise,
    lineTotalPaise: pricePaise,
    isCustom: false,
    customDesignRef: null,
    hsnCode: sacCode,
    gstRateBps,
    isService: true,
  };
}

/** Prices every line; `products` holds the Firestore record for each catalog productId (or null). */
export function priceLines(
  items: CheckoutItemInput[],
  products: ReadonlyMap<string, ProductRecord | null>,
  config: StoreConfig,
): PricedLine[] {
  if (items.length === 0) throw invalidItem('Order must contain at least one item.');
  return items.map(item =>
    item.productId === CUSTOM_PRODUCT_ID
      ? priceCustomLine(item, config)
      : priceCatalogLine(item, products.get(item.productId) ?? null, config),
  );
}

/** Splits `total` across `weights` proportionally; parts are integers summing exactly to `total`. */
export function allocateProRata(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, w) => a + w, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const exact = weights.map(w => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let remainder = total - parts.reduce((a, p) => a + p, 0);
  const order = exact.map((e, idx) => ({ idx, frac: e - Math.floor(e) })).sort((a, b) => b.frac - a.frac || a.idx - b.idx);
  for (const { idx } of order) {
    if (remainder <= 0) break;
    parts[idx] += 1;
    remainder -= 1;
  }
  return parts;
}

const taxOn = (taxablePaise: number, rateBps: number) => Math.round((taxablePaise * rateBps) / 10_000);

export function computeTotals(
  lines: PricedLine[],
  discountPaise: number,
  config: StoreConfig,
  options: { cod?: boolean } = {},
): OrderTotals {
  const subtotalPaise = lines.reduce((sum, l) => sum + l.lineTotalPaise, 0);
  const discount = Math.min(subtotalPaise, Math.max(0, Math.round(discountPaise)));
  // Free shipping is judged on the merchandise subtotal before discount, inclusive (>=).
  const shippable = lines.some(l => !l.isService);
  const shippingPaise = !shippable || subtotalPaise >= config.freeShippingThresholdPaise ? 0 : config.shippingFeePaise;
  const codFeePaise = options.cod ? config.cod.feePaise : 0;

  const discounts = allocateProRata(discount, lines.map(l => l.lineTotalPaise));
  const lineTaxes: LineTax[] = lines.map((l, idx) => {
    const taxablePaise = l.lineTotalPaise - discounts[idx];
    return { discountPaise: discounts[idx], taxablePaise, gstRateBps: l.gstRateBps, taxPaise: taxOn(taxablePaise, l.gstRateBps) };
  });
  const chargeRateBps = lines.length > 0 ? Math.max(...lines.map(l => l.gstRateBps)) : config.gstRateBps;
  const charges: ChargeTax[] = [];
  if (shippingPaise > 0) {
    charges.push({ kind: 'shipping', taxablePaise: shippingPaise, gstRateBps: chargeRateBps, taxPaise: taxOn(shippingPaise, chargeRateBps) });
  }
  if (codFeePaise > 0) {
    charges.push({ kind: 'cod_fee', taxablePaise: codFeePaise, gstRateBps: chargeRateBps, taxPaise: taxOn(codFeePaise, chargeRateBps) });
  }
  const taxPaise = [...lineTaxes, ...charges].reduce((sum, t) => sum + t.taxPaise, 0);
  return {
    subtotalPaise,
    discountPaise: discount,
    shippingPaise,
    codFeePaise,
    taxPaise,
    totalPaise: subtotalPaise - discount + shippingPaise + codFeePaise + taxPaise,
    // Headline rate for legacy readers; per-line rates in taxBreakdown are authoritative.
    gstRateBps: chargeRateBps,
    taxBreakdown: { lines: lineTaxes, charges },
  };
}

/** Quantity of each stock-tracked catalog product the order needs. */
export function stockRequirements(lines: PricedLine[]): Map<string, number> {
  const required = new Map<string, number>();
  for (const line of lines) {
    if (line.isCustom || line.isService) continue;
    required.set(line.productId, (required.get(line.productId) ?? 0) + line.quantity);
  }
  return required;
}
