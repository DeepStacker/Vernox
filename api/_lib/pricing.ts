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
 * unit × quantity; GST is rounded once on the discounted merchandise subtotal.
 */
import { ApiError } from './errors';
import { isNonNegativeFinite, rupeesToPaise } from './money';
import type { DocData } from './store';
import type { StoreConfig } from './storeConfig';

export const CUSTOM_PRODUCT_ID = 'custom-bespoke';

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
}

export interface OrderTotals {
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  taxPaise: number;
  totalPaise: number;
  gstRateBps: number;
}

export const normaliseFinish = (finish: string) => finish.trim().toLowerCase().replace(/[\s-]+/g, '_');
const normaliseLabel = (label: string) => label.trim().toLowerCase().replace(/\s+/g, ' ');

const invalidItem = (message: string) => new ApiError(400, 'INVALID_ITEM', message);

/**
 * Builds a ProductRecord from a Firestore product document. Returns null when the
 * document cannot be priced safely (missing/invalid price) — callers treat that as
 * INVALID_ITEM rather than guessing a price or a stock level.
 */
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

export function priceCatalogLine(item: CheckoutItemInput, product: ProductRecord | null): PricedLine {
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
  };
}

/** Custom piece: max(minimum, setupFee + width_cm × height_cm × rate), rounded to whole paise. */
export function priceCustomLine(item: CheckoutItemInput, config: StoreConfig): PricedLine {
  const { minDimensionMm, maxWidthMm, maxHeightMm, finishes } = config.customPieces;
  const { widthMm, heightMm } = item;
  if (!widthMm || !heightMm) throw invalidItem('Custom pieces require widthMm and heightMm.');
  if (widthMm < minDimensionMm || heightMm < minDimensionMm || widthMm > maxWidthMm || heightMm > maxHeightMm) {
    throw invalidItem(
      `Custom pieces must be between ${minDimensionMm}mm and ${maxWidthMm}×${maxHeightMm}mm.`,
    );
  }
  const finish = normaliseFinish(item.finish);
  const rate = finishes[finish];
  if (!rate) throw invalidItem(`Finish "${item.finish}" is not available for custom pieces.`);

  const areaCm2 = (widthMm / 10) * (heightMm / 10);
  const unitPricePaise = Math.max(rate.minimumPaise, Math.round(rate.setupFeePaise + areaCm2 * rate.ratePaisePerCm2));
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
      : priceCatalogLine(item, products.get(item.productId) ?? null),
  );
}

export function computeTotals(lines: PricedLine[], discountPaise: number, config: StoreConfig): OrderTotals {
  const subtotalPaise = lines.reduce((sum, l) => sum + l.lineTotalPaise, 0);
  const discount = Math.min(subtotalPaise, Math.max(0, Math.round(discountPaise)));
  const discounted = subtotalPaise - discount;
  // Free shipping is judged on the merchandise subtotal before discount, inclusive (>=).
  const shippingPaise = subtotalPaise >= config.freeShippingThresholdPaise ? 0 : config.shippingFeePaise;
  const taxPaise = Math.round((discounted * config.gstRateBps) / 10_000);
  return {
    subtotalPaise,
    discountPaise: discount,
    shippingPaise,
    taxPaise,
    totalPaise: discounted + shippingPaise + taxPaise,
    gstRateBps: config.gstRateBps,
  };
}

/** Quantity of each stock-tracked catalog product the order needs. */
export function stockRequirements(lines: PricedLine[]): Map<string, number> {
  const required = new Map<string, number>();
  for (const line of lines) {
    if (line.isCustom) continue;
    required.set(line.productId, (required.get(line.productId) ?? 0) + line.quantity);
  }
  return required;
}
