// @vitest-environment node
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
    expect(invoice).toMatchObject({ type: 'invoice', supplyType: 'intra_state', taxInclusive: false, placeOfSupply: { stateCode: '29' } });
    expect(invoice.totals).toEqual({ taxablePaise: 53_800, cgstPaise: 4_842, sgstPaise: 4_842, igstPaise: 0, taxPaise: 9_684, totalPaise: order.amounts.totalPaise });
    expect(invoice.lines[0]).toMatchObject({ hsnCode: '8306', quantity: 2, gstRateBps: 1_800 });
    expect(order.invoiceNumber).toBe(invoice.number);
    expect(order.status).toBe('Shipped');
  });

  it('charges IGST for an inter-state supply', async () => {
    const store = seededStore();
    const { invoice } = await invoicedOrder(store, {
      customer: { email: 'ravi@example.com', name: 'Ravi K', phone: '9876500000', address: '1 Linking Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400050', country: 'India' },
    });
    expect(invoice.supplyType).toBe('inter_state');
    expect(invoice.totals).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: 9_684 });
  });

  it('taxes shipping as its own line at the goods rate', async () => {
    const store = seededStore();
    // One ₹89 piece: below the ₹150 free-shipping threshold → ₹40 shipping
    const { invoice } = await invoicedOrder(store, { items: [{ productId: 'p-11', finish: 'steel', quantity: 1 }] });
    const goods = invoice.lines[0];
    expect(goods.taxablePaise).toBe(8_900);
    expect([goods.cgstPaise, goods.sgstPaise]).toEqual([801, 801]);
    const shipping = invoice.lines.find(l => l.description.startsWith('Shipping'))!;
    expect(shipping).toMatchObject({ taxablePaise: 4_000, cgstPaise: 360, sgstPaise: 360 });
    expect(invoice.totals.totalPaise).toBe(8_900 + 4_000 + 1_602 + 720);
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
    expect((err as ApiError).code).toBe('CONFIG_ERROR');
    expect(store.read(`invoices/${res.orderId}`)).toBeUndefined();
    expect(store.read(orderPath(res.orderId))!.status).toBe('Packed');
  });

  it('builds credit notes that mirror the invoice (full) or keep its tax proportion (partial)', async () => {
    const store = seededStore();
    const { invoice } = await invoicedOrder(store);
    const reservation = { series: 'credit_note' as const, fy: '2026-27', sequence: 1, number: 'CN/26-27/000001', counterPath: 'x' };
    const full = buildCreditNote({ invoice, refundId: 'r1', amountPaise: invoice.totals.totalPaise, reason: 'cancelled', reservation, now: NOW });
    expect(full.totals).toEqual(invoice.totals);
    expect(full.againstInvoice).toEqual({ id: invoice.id, number: invoice.number });
    const partial = buildCreditNote({ invoice, refundId: 'r2', amountPaise: 11_800, reason: 'goodwill', reservation, now: NOW });
    expect(partial.totals).toMatchObject({ taxablePaise: 10_000, taxPaise: 1_800, totalPaise: 11_800, cgstPaise: 900, sgstPaise: 900 });
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
    setStatus(store, res.orderId, 'Packed', { items: legacyItems, amounts: { ...order.amounts, taxBreakdown: undefined } });
    await createShipment(store, manual, SELLER_CONFIG, { orderId: res.orderId, manual: { courier: 'DTDC', awb: 'D7654321' }, actor: STAFF_ACTOR });
    const invoice = store.read(`invoices/${res.orderId}`) as unknown as TaxDocument;
    expect(invoice.totals.totalPaise).toBe(order.amounts.totalPaise);
  });
});
