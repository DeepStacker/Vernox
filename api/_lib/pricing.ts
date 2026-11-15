/**
 * Server-authoritative pricing (pure functions, no I/O).
 *
 * Catalog prices come from Firestore `products/{id}` documents (rupees, as staff
 * edit them) converted to paise by productFromDoc(). Crafting Studio pieces
 * (productId CUSTOM_PRODUCT_ID) are priced from their dimensions, finish and the cutting
 * work the server measures from the design's frozen production contours, via
 * StoreConfig.customPieces (priceCustomLine). Any price the client sends is ignored — the request
 * schema does not even accept one.
 *
 * Prices are GST-inclusive (ROADMAP.md "Business and tax decisions"): every catalogue
 * price, size difference, custom-piece rate, shipping fee, COD fee, coupon amount
 * and the consultation fee is what the customer pays, tax included. The order total
 * is the sum of those inclusive amounts, to the paisa; GST is the part of it that
 * splitInclusiveTax() takes out, never an amount added on top.
 *
 * Rounding: every unit price is an integer number of paise; line totals are
 * unit × quantity. GST is back-calculated per invoice line and rounded per line,
 * so the order total and the GST invoice always agree to the paisa:
 *  - an order-level discount is allocated to lines pro rata to their value
 *    (largest-remainder, so the parts sum exactly to the discount) and taken off
 *    the inclusive line amount before the split;
 *  - each line is split at its product's GST rate (`gstRatePercent` on the product,
 *    else the store rate): tax = round(inclusive × r / (100 + r)), half up, and
 *    taxable = inclusive − tax, so taxable + tax is always the inclusive amount;
 *  - shipping and the COD fee are part of a composite supply of goods, so they are
 *    split at the rate of the principal supply — the highest line rate.
 *
 * Discounts (ROADMAP.md "Business and tax decisions", volume discounts): the order discount is either a coupon
 * or the volume (bulk) discount, whichever is larger — they do not stack, and on a tie the volume discount is used
 * so the coupon stays unspent. A consultation credit is money already paid, so it is added to the volume discount.
 * The volume tier is chosen by the pieces in the whole order (volumeDiscountFor) and its percent comes off the
 * GST-inclusive merchandise subtotal, rounded half up to the paisa, before the per-line GST split above.
 *
 * Orders created before 2026-11-15 were priced GST-exclusive (tax added on top);
 * their frozen `amounts` stay as they were and carry no `pricesIncludeTax` marker
 * (api/_lib/orders.ts).
 */
import { ApiError } from './errors';
import { isNonNegativeFinite, rupeesToPaise } from './money';
import type { DocData } from './store';
import type { StoreConfig } from './storeConfig';

import { CONSULTATION_SERVICE_ID } from '../../src/types/consultation';
import { CUSTOM_PRODUCT_ID } from '../../src/types/products';
import { normaliseFinishId, quoteCustomPiece, type CustomPieceBreakdown } from '../../src/lib/pricing/customPiece';
import { cutWorkFromDesignRef } from '../../src/lib/pricing/cutWork';
import { tierBps, volumeTierFor, type VolumeDiscountTier } from '../../src/lib/pricing/volumeDiscount';

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
  /** Custom pieces: how the unit price was made up (plate, cutting, engraving, holes). */
  customPricing?: CustomPieceBreakdown;
}

export interface LineTax {
  /** Share of the order discount allocated to this line. */
  discountPaise: number;
  /** Line value after discount, less the GST included in it (taxable + tax = line total − discount). */
  taxablePaise: number;
  gstRateBps: number;
  taxPaise: number;
}

export interface ChargeTax {
  kind: 'shipping' | 'cod_fee';
  /** Fee less the GST included in it (taxable + tax = the fee). Legacy exclusive orders: the fee itself. */
  taxablePaise: number;
  gstRateBps: number;
  taxPaise: number;
}

export interface TaxBreakdown {
  lines: LineTax[];
  charges: ChargeTax[];
}

/** The volume (bulk) discount an order received. */
export interface AppliedVolumeDiscount {
  minUnits: number;
  percent: number;
  /** Pieces in the order (goods lines; a service line does not count). */
  units: number;
  discountPaise: number;
}

/** What makes up OrderTotals.discountPaise. */
export interface DiscountParts {
  /** The coupon's share of the discount (0 unless `coupon` is 'applied'). */
  couponPaise: number;
  /** 'superseded': a coupon was entered but the volume discount was at least as large, so the coupon was not used. */
  coupon: 'none' | 'applied' | 'superseded';
  volume: AppliedVolumeDiscount | null;
}

/** A coupon evaluated by coupons.evaluateCoupon, as computeTotals weighs it against the volume discount. */
export interface CouponDiscountInput {
  discountPaise: number;
  /** A consultation credit (coupon with consultationId): already paid for, so it adds to the volume discount. */
  isCredit: boolean;
}

export interface OrderTotals {
  subtotalPaise: number;
  /** All discounts together (coupon and/or volume); see discountParts. */
  discountPaise: number;
  /** Absent on orders placed before volume discounts, where the whole discount was the coupon's. */
  discountParts?: DiscountParts;
  shippingPaise: number;
  /** COD handling fee (0 for prepaid). */
  codFeePaise: number;
  /** GST included in the total (legacy exclusive orders: GST added to it; see OrderDoc.pricesIncludeTax). */
  taxPaise: number;
  /** subtotal − discount + shipping + COD fee: what the customer pays. */
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
      // Staff may enter a negative difference (a smaller, cheaper size). A size that is malformed or
      // would not price above zero is dropped on its own so it cannot make the whole product unbuyable.
      const delta = s?.priceDelta ?? 0;
      if (typeof s?.label !== 'string' || typeof delta !== 'number' || !Number.isFinite(delta)) continue;
      const priceDeltaPaise = rupeesToPaise(delta);
      if (rupeesToPaise(data.price) + priceDeltaPaise <= 0) continue;
      sizes.push({
        label: s.label,
        widthMm: Number(s.widthMm) || 0,
        heightMm: Number(s.heightMm) || 0,
        priceDeltaPaise,
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

/** How far (mm) the measured design may exceed the line's stated size: contours are stored to 0.01 mm. */
const DESIGN_SIZE_TOLERANCE_MM = 1;

/**
 * Custom piece, via the shared quoteCustomPiece() (src/lib/pricing/customPiece.ts): plate (setup + area) plus cutting,
 * engraving and pierces beyond the included allowance. The cutting work is measured here from the frozen production
 * contours inside `customDesignRef` (cutWorkFromDesignRef) — the geometry the workshop cuts — never from numbers the
 * client sends. A line without a snapshot (a staff custom piece with a plain-text reference, or a legacy design) is
 * priced by size and finish only. A snapshot that is damaged, too complex, or larger than the stated size is refused.
 */
export function priceCustomLine(item: CheckoutItemInput, config: StoreConfig): PricedLine {
  const { minDimensionMm, maxWidthMm, maxHeightMm, finishes } = config.customPieces;
  const design = cutWorkFromDesignRef(item.customDesignRef);
  if (design.kind === 'invalid') {
    throw invalidItem(design.problem === 'too-complex'
      ? 'This custom design is too detailed to cut. Please simplify it in the studio.'
      : 'The custom design data is damaged. Please add the design to the cart again from the studio.');
  }
  const work = design.kind === 'measured' ? design.work : null;
  const quote = quoteCustomPiece({ ...item, work }, finishes, config.customPieces);
  if ('problem' in quote) {
    if (quote.problem === 'missing-dimensions') throw invalidItem('Custom pieces require widthMm and heightMm.');
    if (quote.problem === 'out-of-range') {
      throw invalidItem(`Custom pieces must be between ${minDimensionMm}mm and ${maxWidthMm}×${maxHeightMm}mm.`);
    }
    throw invalidItem(`Finish "${item.finish}" is not available for custom pieces.`);
  }
  const { unitPricePaise, rate, finish, breakdown } = quote;
  const widthMm = item.widthMm as number;
  const heightMm = item.heightMm as number;
  // The plate is billed by the stated size, so the geometry that will be cut must fit inside it.
  if (work && (work.widthMm > widthMm + DESIGN_SIZE_TOLERANCE_MM || work.heightMm > heightMm + DESIGN_SIZE_TOLERANCE_MM)) {
    throw invalidItem('The custom design is larger than its stated size. Please add the design to the cart again from the studio.');
  }
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
    customPricing: breakdown,
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

/**
 * The one place GST is taken out of a GST-inclusive amount (pricing and credit notes both use it; the browser only
 * shows what the server returns). Integer arithmetic, rounded half up, so the result never depends on floating
 * point: tax = round(inclusive × r / (10 000 + r)) with r in basis points, taxable = inclusive − tax.
 */
export function splitInclusiveTax(inclusivePaise: number, rateBps: number): { taxablePaise: number; taxPaise: number } {
  if (!Number.isInteger(inclusivePaise) || !Number.isInteger(rateBps) || rateBps < 0) {
    throw new Error(`splitInclusiveTax needs integer paise and a non-negative integer rate (got ${inclusivePaise}, ${rateBps})`);
  }
  const sign = inclusivePaise < 0 ? -1 : 1;
  const magnitude = Math.abs(inclusivePaise);
  const divisor = 10_000 + rateBps;
  const taxPaise = sign * Math.floor((2 * magnitude * rateBps + divisor) / (2 * divisor));
  return { taxablePaise: inclusivePaise - taxPaise, taxPaise };
}

/**
 * The volume discount `lines` earn under `tiers`: the tier is picked by the pieces in the whole order (per order, not
 * per line, the usual B2B expectation), the percent applies to the GST-inclusive value of the goods lines and is
 * rounded half up to the paisa in integer arithmetic. Service lines neither count nor are discounted.
 */
export function volumeDiscountFor(lines: PricedLine[], tiers: readonly VolumeDiscountTier[]): AppliedVolumeDiscount | null {
  const goods = lines.filter(l => !l.isService);
  const units = goods.reduce((sum, l) => sum + l.quantity, 0);
  const tier = volumeTierFor(units, tiers);
  if (!tier) return null;
  const basePaise = goods.reduce((sum, l) => sum + l.lineTotalPaise, 0);
  const discountPaise = Math.floor((2 * basePaise * tierBps(tier) + 10_000) / 20_000);
  return discountPaise > 0 ? { minUnits: tier.minUnits, percent: tier.percent, units, discountPaise } : null;
}

/** Coupon versus volume discount (file comment, "Discounts"). */
export function resolveDiscounts(lines: PricedLine[], coupon: CouponDiscountInput | null, tiers: readonly VolumeDiscountTier[]): DiscountParts {
  const volume = volumeDiscountFor(lines, tiers);
  if (!coupon) return { couponPaise: 0, coupon: 'none', volume };
  const couponPaise = Math.max(0, Math.round(coupon.discountPaise));
  if (coupon.isCredit) return { couponPaise, coupon: 'applied', volume };
  if (volume && volume.discountPaise >= couponPaise) return { couponPaise: 0, coupon: 'superseded', volume };
  return { couponPaise, coupon: 'applied', volume: null };
}

export function computeTotals(
  lines: PricedLine[],
  /** The evaluated coupon (a bare number is a promotional coupon's discount; 0 or null = no coupon). */
  coupon: CouponDiscountInput | number | null,
  config: StoreConfig,
  /** `collected`: handed over at the counter (api/_lib/staffOrders.ts), so nothing ships and no shipping is charged. */
  options: { cod?: boolean; collected?: boolean } = {},
): OrderTotals {
  const subtotalPaise = lines.reduce((sum, l) => sum + l.lineTotalPaise, 0);
  const couponInput = typeof coupon === 'number' ? (coupon > 0 ? { discountPaise: coupon, isCredit: false } : null) : coupon;
  const discountParts = resolveDiscounts(lines, couponInput, config.volumeDiscounts);
  const discount = Math.min(subtotalPaise, discountParts.couponPaise + (discountParts.volume?.discountPaise ?? 0));
  // Free shipping is judged on the merchandise subtotal before discount, inclusive (>=).
  const shippable = !options.collected && lines.some(l => !l.isService);
  const shippingPaise = !shippable || subtotalPaise >= config.freeShippingThresholdPaise ? 0 : config.shippingFeePaise;
  const codFeePaise = options.cod ? config.cod.feePaise : 0;

  const discounts = allocateProRata(discount, lines.map(l => l.lineTotalPaise));
  const lineTaxes: LineTax[] = lines.map((l, idx) => ({
    discountPaise: discounts[idx],
    gstRateBps: l.gstRateBps,
    ...splitInclusiveTax(l.lineTotalPaise - discounts[idx], l.gstRateBps),
  }));
  const chargeRateBps = lines.length > 0 ? Math.max(...lines.map(l => l.gstRateBps)) : config.gstRateBps;
  const charges: ChargeTax[] = [];
  if (shippingPaise > 0) charges.push({ kind: 'shipping', gstRateBps: chargeRateBps, ...splitInclusiveTax(shippingPaise, chargeRateBps) });
  if (codFeePaise > 0) charges.push({ kind: 'cod_fee', gstRateBps: chargeRateBps, ...splitInclusiveTax(codFeePaise, chargeRateBps) });
  const taxPaise = [...lineTaxes, ...charges].reduce((sum, t) => sum + t.taxPaise, 0);
  return {
    subtotalPaise,
    discountPaise: discount,
    discountParts,
    shippingPaise,
    codFeePaise,
    // Included in the amounts above, not added to them.
    taxPaise,
    totalPaise: subtotalPaise - discount + shippingPaise + codFeePaise,
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
