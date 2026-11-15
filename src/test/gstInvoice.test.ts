// @vitest-environment node
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/_lib/errors';
import { applyInvoice, buildCreditNote, planInvoice, type TaxDocument } from '../../api/_lib/gst/invoice';
import { renderTaxDocumentPdf } from '../../api/_lib/gst/invoicePdf';
import { financialYear, formatDocumentNumber, reserveNumber } from '../../api/_lib/gst/numbering';
import { gstStateCode } from '../../api/_lib/gst/stateCodes';
import { asOrder, orderPath, type OrderDoc } from '../../api/_lib/orders';
import { createShipment } from '../../api/_lib/shipping/shipments';
import { ManualShippingProvider } from '../../api/_lib/shipping/manual';
import { NOW, paidOrder, seededStore, SELLER_CONFIG, setStatus, STAFF_ACTOR, TEST_CONFIG } from './support/serverFixtures';
import type { MemoryStore } from './support/memoryStore';
import { defaultSettingsDoc, mergeStoreConfig } from '../../api/_lib/storeConfig';
import { isPlaceholderSeller, isPlaceholderValue, PLACEHOLDER_CONTACT, PLACEHOLDER_GSTIN, PLACEHOLDER_SELLER } from '../types/settings';

const IST = (iso: string) => Date.parse(`${iso}+05:30`);
const manual = new ManualShippingProvider({ transitDays: 5, codEnabled: true });

async function invoicedOrder(store: MemoryStore, overrides: Record<string, unknown> = {}, now = NOW) {
  const res = await paidOrder(store, overrides);
  setStatus(store, res.orderId, 'Packed');
  await createShipment(store, manual, SELLER_CONFIG, { orderId: res.orderId, manual: { courier: 'Delhivery', awb: `AWB${res.orderId.slice(0, 8)}` }, actor: STAFF_ACTOR, now });
  return { res, invoice: store.read(`invoices/${res.orderId}`) as unknown as TaxDocument };
}

describe('financial year numbering', () => {
  it('rolls over at midnight IST on 1 April', () => {
    expect(financialYear(IST('2027-03-31T23:59:59'))).toBe('2026-27');
    expect(financialYear(IST('2027-04-01T00:00:00'))).toBe('2027-28');
    expect(financialYear(IST('2026-11-05T10:00:00'))).toBe('2026-27');
    expect(financialYear(IST('2027-01-15T10:00:00'))).toBe('2026-27');
  });

  it('formats numbers within the 16-character GST limit', () => {
    const n = formatDocumentNumber('invoice', '2026-27', 123);
    expect(n).toBe('VX/26-27/000123');
    expect(n.length).toBeLessThanOrEqual(16);
    expect(formatDocumentNumber('credit_note', '2099-00', 999_999).length).toBeLessThanOrEqual(16);
  });

  it('restarts the sequence in a new financial year', async () => {
    const store = seededStore();
    const march = await invoicedOrder(store, { idempotencyKey: 'idem-fy-0001' }, IST('2027-03-31T23:00:00'));
    const april = await invoicedOrder(store, { idempotencyKey: 'idem-fy-0002' }, IST('2027-04-01T09:00:00'));
    const april2 = await invoicedOrder(store, { idempotencyKey: 'idem-fy-0003' }, IST('2027-04-01T10:00:00'));
    expect(march.invoice.number).toBe('VX/26-27/000001');
    expect(april.invoice.number).toBe('VX/27-28/000001');
    expect(april2.invoice.number).toBe('VX/27-28/000002');
    expect(store.read('counters/invoice_2027-28')!.last).toBe(2);
  });

  it('hands out gap-free unique numbers under concurrency', async () => {
    const store = seededStore();
    store.seed('products/p-01', { ...store.read('products/p-01')!, stock: 100 });
    const orders: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const res = await paidOrder(store, { idempotencyKey: `idem-conc-${i}000` });
      setStatus(store, res.orderId, 'Packed');
      orders.push(res.orderId);
    }
    await Promise.all(
      orders.map(orderId => createShipment(store, manual, SELLER_CONFIG, { orderId, manual: { courier: 'DTDC', awb: `D${orderId.slice(0, 10)}` }, actor: STAFF_ACTOR })),
    );
    const numbers = orders.map(id => (store.read(`invoices/${id}`) as unknown as TaxDocument).number).sort();
    expect(numbers).toEqual(Array.from({ length: 8 }, (_, i) => `VX/26-27/00000${i + 1}`));
  });

  it('reads the counter inside the transaction', async () => {
    const store = seededStore();
    store.seed('counters/invoice_2026-27', { last: 41 });
    const r = await store.runTransaction(tx => reserveNumber(tx, 'invoice', NOW));
    expect(r.number).toBe('VX/26-27/000042');
  });
});

describe('GST invoice', () => {
  it('splits CGST and SGST for an intra-state supply and matches the order total', async () => {
    const store = seededStore();
    const { res, invoice } = await invoicedOrder(store);
    const order = asOrder(store.read(orderPath(res.orderId))!)!;
    // 2 × ₹269 including 18% GST: ₹538 holds 538 × 18/118 = ₹82.07, so the taxable value is ₹455.93.
    expect(invoice).toMatchObject({ type: 'invoice', supplyType: 'intra_state', taxInclusive: true, placeOfSupply: { stateCode: '29' } });
    expect(invoice.totals).toEqual({ taxablePaise: 45_593, cgstPaise: 4_103, sgstPaise: 4_104, igstPaise: 0, taxPaise: 8_207, totalPaise: 53_800 });
    expect(order.amounts.totalPaise).toBe(53_800);
    expect(invoice.lines[0]).toMatchObject({ hsnCode: '830629', quantity: 2, gstRateBps: 1_800, unitPricePaise: 26_900, grossPaise: 53_800, totalPaise: 53_800 });
    expect(order.invoiceNumber).toBe(invoice.number);
    expect(order.status).toBe('Shipped');
  });

  it('charges IGST for an inter-state supply', async () => {
    const store = seededStore();
    const { invoice } = await invoicedOrder(store, {
      customer: { email: 'ravi@example.com', name: 'Ravi K', phone: '9876500000', address: '1 Linking Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400050', country: 'India' },
    });
    expect(invoice.supplyType).toBe('inter_state');
    expect(invoice.totals).toMatchObject({ taxablePaise: 45_593, cgstPaise: 0, sgstPaise: 0, igstPaise: 8_207, totalPaise: 53_800 });
  });

  it('worked example: one ₹2,499 piece at 5%, intra-state', async () => {
    const store = seededStore();
    store.seed('products/p-2499', { id: 'p-2499', name: 'Mandala', category: 'spiritual', price: 2_499, gstRatePercent: 5, finishes: ['brass'], sizes: [], stock: 5, trackInventory: true });
    const { res, invoice } = await invoicedOrder(store, { items: [{ productId: 'p-2499', finish: 'brass', quantity: 1 }] });
    // 2,499 × 5/105 = ₹119.00 GST inside the price: taxable ₹2,380.00, CGST ₹59.50 + SGST ₹59.50, total ₹2,499.00.
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.lines[0]).toMatchObject({ unitPricePaise: 249_900, taxablePaise: 238_000, gstRateBps: 500, cgstPaise: 5_950, sgstPaise: 5_950, totalPaise: 249_900 });
    expect(invoice.totals).toEqual({ taxablePaise: 238_000, cgstPaise: 5_950, sgstPaise: 5_950, igstPaise: 0, taxPaise: 11_900, totalPaise: 249_900 });
    expect(asOrder(store.read(orderPath(res.orderId))!)!.amounts.totalPaise).toBe(249_900);
  });

  it('splits shipping as its own line at the goods rate, with GST included in the fee', async () => {
    const store = seededStore();
    // One ₹89 piece: below the ₹150 free-shipping threshold → ₹40 shipping
    const { invoice } = await invoicedOrder(store, { items: [{ productId: 'p-11', finish: 'steel', quantity: 1 }] });
    const goods = invoice.lines[0];
    expect(goods).toMatchObject({ grossPaise: 8_900, taxablePaise: 7_542, cgstPaise: 679, sgstPaise: 679, totalPaise: 8_900 });
    const shipping = invoice.lines.find(l => l.description.startsWith('Shipping'))!;
    expect(shipping).toMatchObject({ unitPricePaise: 4_000, grossPaise: 4_000, taxablePaise: 3_390, cgstPaise: 305, sgstPaise: 305, totalPaise: 4_000 });
    expect(invoice.totals.totalPaise).toBe(8_900 + 4_000);
    for (const l of invoice.lines) expect(l.taxablePaise + l.cgstPaise + l.sgstPaise + l.igstPaise).toBe(l.totalPaise);
  });

  it('is idempotent: shipping retries reuse the invoice and number', async () => {
    const store = seededStore();
    const { res, invoice } = await invoicedOrder(store);
    const order = asOrder(store.read(orderPath(res.orderId))!)!;
    const again = await store.runTransaction(async tx => {
      const plan = await planInvoice(tx, order, SELLER_CONFIG.seller, NOW);
      return applyInvoice(tx, plan, order, SELLER_CONFIG.seller, NOW);
    });
    expect(again).toEqual({ invoiceId: res.orderId, invoiceNumber: invoice.number });
    expect(store.read('counters/invoice_2026-27')!.last).toBe(1);
  });

  it('refuses to issue without seller GSTIN details', async () => {
    const store = seededStore();
    const res = await paidOrder(store);
    setStatus(store, res.orderId, 'Packed');
    const err = await createShipment(store, manual, TEST_CONFIG, { orderId: res.orderId, manual: { courier: 'DTDC', awb: 'D123456' }, actor: STAFF_ACTOR }).catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('SELLER_DETAILS_MISSING');
    expect(store.read(`invoices/${res.orderId}`)).toBeUndefined();
    expect(store.read(orderPath(res.orderId))!.status).toBe('Packed');
  });

  it('builds credit notes that mirror the invoice (full) or split the credited amount at the line rate (partial)', async () => {
    const store = seededStore();
    const { invoice } = await invoicedOrder(store);
    const reservation = { series: 'credit_note' as const, fy: '2026-27', sequence: 1, number: 'CN/26-27/000001', counterPath: 'x' };
    const full = buildCreditNote({ invoice, refundId: 'r1', amountPaise: invoice.totals.totalPaise, reason: 'cancelled', reservation, now: NOW });
    expect(full.totals).toEqual(invoice.totals);
    expect(full.againstInvoice).toEqual({ id: invoice.id, number: invoice.number });
    const partial = buildCreditNote({ invoice, refundId: 'r2', amountPaise: 11_800, reason: 'goodwill', reservation, now: NOW });
    expect(partial.totals).toMatchObject({ taxablePaise: 10_000, taxPaise: 1_800, totalPaise: 11_800, cgstPaise: 900, sgstPaise: 900 });
    expect(partial.lines[0]).toMatchObject({ quantity: 1, unitPricePaise: 11_800, grossPaise: 11_800, taxablePaise: 10_000 });
    expect(partial.taxInclusive).toBe(true);
    expect(() => buildCreditNote({ invoice, refundId: 'r3', amountPaise: invoice.totals.totalPaise + 1, reason: 'x', reservation, now: NOW })).toThrow();
  });

  it('renders a PDF', async () => {
    const store = seededStore();
    const { invoice } = await invoicedOrder(store);
    const pdf = await renderTaxDocumentPdf({ ...invoice, buyer: { ...invoice.buyer, name: 'आशा राव ₹' } });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
  });

  it('knows GST state codes for every checkout state', () => {
    expect(gstStateCode('Karnataka')).toBe('29');
    expect(gstStateCode('dadra and nagar haveli and daman and diu')).toBe('26');
    expect(gstStateCode('Ladakh')).toBe('38');
    expect(gstStateCode('Atlantis')).toBeNull();
  });
});

describe('legacy (Phase 1) orders', () => {
  it('reconstructs per-line tax and keeps the charged total', async () => {
    const store = seededStore();
    const res = await paidOrder(store);
    const order = asOrder(store.read(orderPath(res.orderId))!)! as OrderDoc;
    const legacyItems = order.items.map(i => {
      const { hsnCode: _h, gstRateBps: _g, discountPaise: _d, taxablePaise: _t, taxPaise: _x, ...rest } = i;
      return rest;
    });
    // Phase 1 was GST-exclusive: ₹538 + 18% GST (₹96.84, rounded once on the order) = ₹634.84, no marker.
    const amounts = { ...order.amounts, taxPaise: 9_684, totalPaise: 63_484, taxBreakdown: undefined };
    setStatus(store, res.orderId, 'Packed', { items: legacyItems, amounts, pricesIncludeTax: undefined });
    await createShipment(store, manual, SELLER_CONFIG, { orderId: res.orderId, manual: { courier: 'DTDC', awb: 'D7654321' }, actor: STAFF_ACTOR });
    const invoice = store.read(`invoices/${res.orderId}`) as unknown as TaxDocument;
    expect(invoice.taxInclusive).toBe(false);
    expect(invoice.totals).toMatchObject({ taxablePaise: 53_800, taxPaise: 9_684, totalPaise: 63_484 });
  });
});

describe('GST-exclusive orders placed before 2026-11-15', () => {
  /** Rewrites a fresh order into what the server stored before GST-inclusive pricing: ₹89 + ₹40 shipping, 18% added on top. */
  async function exclusiveOrder(store: MemoryStore) {
    const res = await paidOrder(store, { items: [{ productId: 'p-11', finish: 'steel', quantity: 1 }] });
    const order = asOrder(store.read(orderPath(res.orderId))!)! as OrderDoc;
    setStatus(store, res.orderId, 'Packed', {
      pricesIncludeTax: undefined,
      items: [{ ...order.items[0], discountPaise: 0, taxablePaise: 8_900, taxPaise: 1_602 }],
      amounts: {
        ...order.amounts,
        taxPaise: 2_322,
        totalPaise: 15_222,
        taxBreakdown: {
          lines: [{ discountPaise: 0, taxablePaise: 8_900, gstRateBps: 1_800, taxPaise: 1_602 }],
          charges: [{ kind: 'shipping', taxablePaise: 4_000, gstRateBps: 1_800, taxPaise: 720 }],
        },
      },
    });
    return res;
  }

  it('still invoices exactly as before: GST added on top, same per-line values and total', async () => {
    const store = seededStore();
    const res = await exclusiveOrder(store);
    await createShipment(store, manual, SELLER_CONFIG, { orderId: res.orderId, manual: { courier: 'DTDC', awb: 'D5554321' }, actor: STAFF_ACTOR });
    const invoice = store.read(`invoices/${res.orderId}`) as unknown as TaxDocument;
    expect(invoice.taxInclusive).toBe(false);
    expect(invoice.lines[0]).toMatchObject({ unitPricePaise: 8_900, grossPaise: 8_900, taxablePaise: 8_900, cgstPaise: 801, sgstPaise: 801, totalPaise: 10_502 });
    const shipping = invoice.lines.find(l => l.description.startsWith('Shipping'))!;
    expect(shipping).toMatchObject({ unitPricePaise: 4_000, grossPaise: 4_000, taxablePaise: 4_000, cgstPaise: 360, sgstPaise: 360, totalPaise: 4_720 });
    expect(invoice.totals.totalPaise).toBe(15_222);

    // A partial credit note keeps the original line's taxable/GST proportion, as before.
    const reservation = { series: 'credit_note' as const, fy: '2026-27', sequence: 1, number: 'CN/26-27/000001', counterPath: 'x' };
    const partial = buildCreditNote({ invoice, refundId: 'r-old', amountPaise: 10_502, reason: 'goodwill', reservation, now: NOW });
    expect(partial.taxInclusive).toBe(false);
    expect(partial.totals.totalPaise).toBe(10_502);
    expect(partial.totals.taxablePaise + partial.totals.taxPaise).toBe(10_502);
    const pdf = await renderTaxDocumentPdf(invoice);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
  });
});

describe('placeholder seller details (UAT before the real GSTIN is entered)', () => {
  const placeholderConfig = mergeStoreConfig(TEST_CONFIG, { seller: PLACEHOLDER_SELLER });

  it('issues SPECIMEN invoices in their own series and leaves the real series untouched', async () => {
    const store = seededStore();
    const res = await paidOrder(store);
    setStatus(store, res.orderId, 'Packed');
    await createShipment(store, manual, placeholderConfig, { orderId: res.orderId, manual: { courier: 'Delhivery', awb: 'AWBSPEC0001' }, actor: STAFF_ACTOR });
    const invoice = store.read(`invoices/${res.orderId}`) as unknown as TaxDocument;
    expect(invoice.number).toMatch(/^SP\/\d{2}-\d{2}\/000001$/);
    expect(invoice.number.length).toBeLessThanOrEqual(16);
    expect(invoice.specimen).toBe(true);
    expect(store.read(`counters/invoice_${financialYear(NOW)}`) ?? null).toBeNull();

    const note = buildCreditNote({ invoice, refundId: 'r-spec', amountPaise: 1000, reason: 'test', reservation: await store.runTransaction(tx => reserveNumber(tx, 'specimen_credit_note', NOW)), now: NOW });
    expect(note.specimen).toBe(true);
    const pdf = await PDFDocument.load(await renderTaxDocumentPdf(invoice));
    expect(pdf.getTitle()).toMatch(/^Specimen Tax Invoice SP\//);
  });

  it('switches to the real series once a real GSTIN is saved', async () => {
    const { invoice } = await invoicedOrder(seededStore());
    expect(invoice.number).toMatch(/^VX\//);
    expect(invoice.specimen).toBeUndefined();
  });

  it('recognises placeholders so the storefront can hide them', () => {
    expect(isPlaceholderSeller(PLACEHOLDER_SELLER)).toBe(true);
    expect(isPlaceholderSeller(SELLER_CONFIG.seller)).toBe(false);
    expect(isPlaceholderValue(PLACEHOLDER_CONTACT.supportEmail)).toBe(true);
    expect(isPlaceholderValue('hello@vernox.in')).toBe(false);
    expect(defaultSettingsDoc().seller.gstin).toBe(PLACEHOLDER_GSTIN);
  });
});

describe('GST state names from codes', () => {
  it('maps a GSTIN prefix back to the checkout state name', async () => {
    const { stateForGstCode } = await import('../../api/_lib/gst/stateCodes');
    expect(stateForGstCode('29')).toBe('Karnataka');
    expect(stateForGstCode('07')).toBe('Delhi');
    expect(stateForGstCode('26')).toBe('Dadra and Nagar Haveli and Daman and Diu');
    expect(stateForGstCode('99')).toBeNull();
    expect(gstStateCode(stateForGstCode('33'))).toBe('33');
  });
});
