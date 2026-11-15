// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { saveSettings } from '../../api/_lib/catalogAdmin';
import { quoteCart } from '../../api/_lib/cartQuote';
import { quoteStaffOrder } from '../../api/_lib/staffOrders';
import { createCheckoutIntent, type PrepaidCheckoutResponse } from '../../api/_lib/checkout';
import { ApiError } from '../../api/_lib/errors';
import type { TaxDocument } from '../../api/_lib/gst/invoice';
import { orderPath } from '../../api/_lib/orders';
import { computeTotals, priceConsultationLine, volumeDiscountFor, type PricedLine } from '../../api/_lib/pricing';
import { createRefund } from '../../api/_lib/refunds';
import { createShipment } from '../../api/_lib/shipping/shipments';
import { ManualShippingProvider } from '../../api/_lib/shipping/manual';
import { defaultStoreConfig, mergeStoreConfig } from '../../api/_lib/storeConfig';
import {
  DEFAULT_VOLUME_DISCOUNTS,
  nextVolumeTier,
  parseVolumeDiscounts,
  resolveVolumeDiscounts,
  volumeDiscountLabel,
  volumeNudge,
  volumeTierFor,
} from '../lib/pricing/volumeDiscount';
import { checkoutRequest, deps, FakeRefundGateway, NOW, paidOrder, seededStore, SELLER_CONFIG, setStatus, STAFF_ACTOR } from './support/serverFixtures';

/** Store defaults: 5% GST, ₹1,499 free-shipping threshold, default tiers 10+/5%, 25+/10%, 50+/15%. */
const CONFIG = defaultStoreConfig({} as NodeJS.ProcessEnv);

const line = (unitPricePaise: number, quantity: number, extra: Partial<PricedLine> = {}): PricedLine => ({
  productId: 'p', name: 'Piece', category: 'decor', sizeLabel: null, widthMm: null, heightMm: null, finish: 'steel', quantity,
  unitPricePaise, lineTotalPaise: unitPricePaise * quantity, isCustom: false, customDesignRef: null, hsnCode: '830629', gstRateBps: 500, ...extra,
});

describe('volume discount tiers (shared definition)', () => {
  it('picks the tier at each boundary and tells how many pieces reach the next', () => {
    const tiers = DEFAULT_VOLUME_DISCOUNTS;
    expect(volumeTierFor(9, tiers)).toBeNull();
    expect(volumeTierFor(10, tiers)).toEqual({ minUnits: 10, percent: 5 });
    expect(volumeTierFor(24, tiers)?.percent).toBe(5);
    expect(volumeTierFor(25, tiers)?.percent).toBe(10);
    expect(volumeTierFor(49, tiers)?.percent).toBe(10);
    expect(volumeTierFor(50, tiers)?.percent).toBe(15);
    expect(nextVolumeTier(22, tiers)).toEqual({ tier: { minUnits: 25, percent: 10 }, unitsToGo: 3 });
    expect(nextVolumeTier(50, tiers)).toBeNull();
    expect(volumeNudge(nextVolumeTier(22, tiers)!)).toBe('Add 3 more pieces to save 10%');
    expect(volumeNudge(nextVolumeTier(9, tiers)!)).toBe('Add 1 more piece to save 5%');
    expect(volumeDiscountLabel({ minUnits: 25, percent: 10 })).toBe('Bulk discount 10% (25+ pieces)');
    expect(volumeDiscountLabel({ minUnits: 40, percent: 12.5 })).toBe('Bulk discount 12.5% (40+ pieces)');
  });

  it('validates settings: sorted, distinct, rising percent, sane bounds; [] is off; bad values keep the defaults', () => {
    expect(parseVolumeDiscounts([{ minUnits: 25, percent: 10 }, { minUnits: 10, percent: 5 }])).toEqual({
      ok: true, tiers: [{ minUnits: 10, percent: 5 }, { minUnits: 25, percent: 10 }],
    });
    expect(parseVolumeDiscounts([])).toEqual({ ok: true, tiers: [] });
    for (const bad of [
      [{ minUnits: 1, percent: 5 }],
      [{ minUnits: 10.5, percent: 5 }],
      [{ minUnits: 10, percent: 0 }],
      [{ minUnits: 10, percent: 60 }],
      [{ minUnits: 10, percent: 5.555 }],
      [{ minUnits: 10, percent: 5 }, { minUnits: 10, percent: 7 }],
      [{ minUnits: 10, percent: 10 }, { minUnits: 25, percent: 5 }],
      'yes',
    ]) {
      expect(parseVolumeDiscounts(bad).ok).toBe(false);
    }
    expect(resolveVolumeDiscounts(undefined)).toEqual(DEFAULT_VOLUME_DISCOUNTS);
    const warnings: string[] = [];
    expect(resolveVolumeDiscounts([{ minUnits: 0, percent: 5 }], e => warnings.push(e))).toEqual(DEFAULT_VOLUME_DISCOUNTS);
    expect(warnings).toHaveLength(1);
    expect(mergeStoreConfig(CONFIG, { volumeDiscounts: [] }).volumeDiscounts).toEqual([]);
    expect(CONFIG.volumeDiscounts).toEqual(DEFAULT_VOLUME_DISCOUNTS);
  });

  it('saveSettings refuses a bad tier list and stores a good one sorted', async () => {
    const store = seededStore();
    const err = await saveSettings(store, 'store', { volumeDiscounts: [{ minUnits: 10, percent: 10 }, { minUnits: 25, percent: 5 }] }, STAFF_ACTOR, NOW).catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toMatch(/larger discount/);
    await saveSettings(store, 'store', { volumeDiscounts: [{ minUnits: 20, percent: 8 }, { minUnits: 5, percent: 3 }] }, STAFF_ACTOR, NOW);
    expect(store.read('settings/store')!.volumeDiscounts).toEqual([{ minUnits: 5, percent: 3 }, { minUnits: 20, percent: 8 }]);
  });
});

describe('computeTotals with a volume discount', () => {
  it('counts pieces over the whole order and rounds the discount half up to the paisa', () => {
    // 6 + 4 pieces: neither line reaches 10 alone, the order does (per-order units).
    const totals = computeTotals([line(162_775, 6), line(162_775, 4, { productId: 'q' })], null, CONFIG);
    // 10 × ₹1,627.75 = ₹16,277.50; 5% = ₹813.875 → ₹813.88.
    expect(totals.discountParts).toEqual({ couponPaise: 0, coupon: 'none', volume: { minUnits: 10, percent: 5, units: 10, discountPaise: 81_388 } });
    expect(totals.discountPaise).toBe(81_388);
    expect(totals.taxBreakdown.lines.map(l => l.discountPaise)).toEqual([48_833, 32_555]);
    expect(totals.totalPaise).toBe(1_627_750 - 81_388);
    for (const [i, l] of totals.taxBreakdown.lines.entries()) {
      const inclusive = [976_650, 651_100][i] - l.discountPaise;
      expect(l.taxablePaise + l.taxPaise).toBe(inclusive);
    }
  });

  it('gives nothing below the first tier and never counts a service line', () => {
    expect(computeTotals([line(100_000, 9)], null, CONFIG).discountParts?.volume).toBeNull();
    expect(volumeDiscountFor([priceConsultationLine(CONFIG)], CONFIG.volumeDiscounts)).toBeNull();
    expect(computeTotals([line(100_000, 50)], null, { ...CONFIG, volumeDiscounts: [] }).discountPaise).toBe(0);
  });

  it('worked example: 30 pieces at ₹1,000 incl. 5% GST with a 10% coupon — no stacking, the volume discount wins the tie', () => {
    const lines = [line(100_000, 30)];
    const coupon = { discountPaise: 300_000, isCredit: false }; // 10% of ₹30,000
    const totals = computeTotals(lines, coupon, CONFIG);
    expect(totals).toMatchObject({
      subtotalPaise: 3_000_000,
      discountPaise: 300_000,
      discountParts: { couponPaise: 0, coupon: 'superseded', volume: { minUnits: 25, percent: 10, units: 30, discountPaise: 300_000 } },
      shippingPaise: 0,
      taxPaise: 128_571, // ₹27,000 × 5/105, rounded half up
      totalPaise: 2_700_000,
    });
    expect(totals.taxBreakdown.lines[0]).toEqual({ discountPaise: 300_000, taxablePaise: 2_571_429, gstRateBps: 500, taxPaise: 128_571 });

    // A 15% coupon beats the 10% tier: the coupon alone applies.
    const bigger = computeTotals(lines, { discountPaise: 450_000, isCredit: false }, CONFIG);
    expect(bigger.discountParts).toEqual({ couponPaise: 450_000, coupon: 'applied', volume: null });
    expect(bigger.totalPaise).toBe(2_550_000);
  });

  it('adds a consultation credit to the volume discount (already-paid money, not a promotion)', () => {
    const totals = computeTotals([line(100_000, 30)], { discountPaise: 99_900, isCredit: true }, CONFIG);
    expect(totals.discountParts).toMatchObject({ couponPaise: 99_900, coupon: 'applied', volume: { discountPaise: 300_000 } });
    expect(totals.discountPaise).toBe(399_900);
    expect(totals.totalPaise).toBe(3_000_000 - 399_900);
  });
});

describe('volume discount through checkout, payment, invoice and refunds', () => {
  const manual = new ManualShippingProvider({ transitDays: 5, codEnabled: true });
  const TEN = { items: [{ productId: 'p-01', sizeLabel: 'Medium · 50cm', finish: 'brass', quantity: 10 }] };
  // 10 × ₹269 = ₹2,690; 5% tier = ₹134.50; total ₹2,555.50 incl. 18% GST.
  const TOTAL = 255_550;

  it('charges the discounted total, drops a smaller coupon and leaves it unredeemed', async () => {
    const store = seededStore();
    store.seed('coupons/c1', { code: 'SMALL2', discountType: 'percentage', discountValue: 2, isActive: true, usedCount: 0 });
    const d = deps(store);
    const res = (await createCheckoutIntent(d, checkoutRequest({ ...TEN, couponCode: 'small2' }), null)) as PrepaidCheckoutResponse;
    expect(d.gateway.calls[0].amountPaise).toBe(TOTAL);
    expect(res.pricing).toMatchObject({
      subtotal: 2690, discount: 134.5, couponDiscount: 0, total: 2555.5,
      volumeDiscount: { percent: 5, minUnits: 10, units: 10, amount: 134.5 },
    });
    const order = store.read(orderPath(res.orderId))!;
    expect(order).toMatchObject({ coupon: null, couponCode: null, amounts: { discountPaise: 13_450, totalPaise: TOTAL, discountParts: { coupon: 'superseded' } } });
  });

  it('lets a larger coupon win and records only the coupon', async () => {
    const store = seededStore();
    store.seed('coupons/c2', { code: 'BIG20', discountType: 'percentage', discountValue: 20, isActive: true, usedCount: 0 });
    const res = (await createCheckoutIntent(deps(store), checkoutRequest({ ...TEN, couponCode: 'BIG20' }), null)) as PrepaidCheckoutResponse;
    expect(res.pricing).toMatchObject({ discount: 538, couponDiscount: 538, volumeDiscount: null, total: 2152 });
    expect(store.read(orderPath(res.orderId))!.coupon).toEqual({ id: 'c2', code: 'BIG20', discountPaise: 53_800 });
  });

  it('shows the discount on every invoice line, notes the tier, and caps refunds at the discounted total', async () => {
    const store = seededStore();
    const res = await paidOrder(store, TEN);
    setStatus(store, res.orderId, 'Packed');
    await createShipment(store, manual, SELLER_CONFIG, { orderId: res.orderId, manual: { courier: 'DTDC', awb: 'AWB0000001' }, actor: STAFF_ACTOR, now: NOW });
    const invoice = store.read(`invoices/${res.orderId}`) as unknown as TaxDocument;
    expect(invoice.lines[0]).toMatchObject({ quantity: 10, grossPaise: 269_000, discountPaise: 13_450, totalPaise: TOTAL });
    expect(invoice.lines[0].taxablePaise + invoice.lines[0].cgstPaise + invoice.lines[0].sgstPaise).toBe(TOTAL);
    expect(invoice.totals.totalPaise).toBe(TOTAL);
    expect(invoice.discountNote).toBe('Discount: Bulk discount 5% (10+ pieces) on 10 pieces. Each line shows its share, which reduces its taxable value.');

    const gateway = new FakeRefundGateway();
    const over = await createRefund(store, gateway, {
      orderId: res.orderId, amountPaise: TOTAL + 1, reason: 'test', method: 'razorpay', requestedBy: STAFF_ACTOR.uid, source: 'staff', actor: STAFF_ACTOR, now: NOW,
    }).catch(e => e);
    expect(over).toBeInstanceOf(ApiError);
    const full = await createRefund(store, gateway, {
      orderId: res.orderId, amountPaise: TOTAL, reason: 'test', method: 'razorpay', requestedBy: STAFF_ACTOR.uid, source: 'staff', actor: STAFF_ACTOR, now: NOW,
    });
    expect(gateway.calls[0].amountPaise).toBe(TOTAL);
    expect(full.status).toBe('pending');
  });
});

describe('cart quote', () => {
  it('answers in paise with the tier, the next tier and the coupon outcome', async () => {
    const store = seededStore();
    store.seed('coupons/c1', { code: 'SMALL2', discountType: 'percentage', discountValue: 2, isActive: true, usedCount: 0 });
    const items = [{ productId: 'p-01', sizeLabel: 'Medium · 50cm', finish: 'brass', quantity: 10 }];
    const q = await quoteCart(store, SELLER_CONFIG, { items, couponCode: 'SMALL2' }, NOW);
    expect(q).toMatchObject({
      subtotalPaise: 269_000, discountPaise: 13_450, couponDiscountPaise: 0, coupon: 'superseded', couponMessage: null,
      volumeDiscount: { minUnits: 10, percent: 5, units: 10, discountPaise: 13_450 },
      nextVolumeTier: { minUnits: 25, percent: 10, unitsToGo: 15 },
      totalPaise: 255_550,
      lines: [{ unitPricePaise: 26_900, lineTotalPaise: 269_000, quantity: 10 }],
    });
    const staff = await quoteStaffOrder(store, SELLER_CONFIG, { items, couponCode: 'SMALL2', cod: false, handover: false });
    expect(staff).toMatchObject({
      coupon: { ok: true, discountPaise: 5_380, superseded: true },
      volumeDiscount: { percent: 5, discountPaise: 13_450 },
      totals: { discountPaise: 13_450, couponDiscountPaise: 0, totalPaise: 255_550 },
    });
    const invalid = await quoteCart(store, SELLER_CONFIG, { items: [{ ...items[0], quantity: 1 }], couponCode: 'NOPE' }, NOW);
    expect(invalid).toMatchObject({ coupon: 'invalid', couponMessage: 'This coupon code is not recognised.', volumeDiscount: null, nextVolumeTier: { unitsToGo: 9 } });
  });
});
