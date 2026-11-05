import { describe, expect, it } from 'vitest';
import type { OrderOps } from '@/types/orderOps';
import type { Order } from '@/types/store';
import type { OrderStatus } from '../orderStateMachine';
import {
  buildCodCsv, buildOrdersCsv, buildRefundsCsv, collectedPaise, csvCell, gstSplit, istRange, parseRupeesToPaise, paymentTotals, reconcile,
  refundAmountError, refundCeilingPaise,
} from '../finance';

const baseOps: OrderOps = {
  paymentMethod: 'prepaid', razorpayPaymentId: 'pay_1', paidAt: 1, subtotalPaise: 0, discountPaise: 0, shippingPaise: 0, codFeePaise: 0,
  taxPaise: 1800, totalPaise: 11800, refundedPaise: 0, refundPendingPaise: 0, refunds: [], codCollectedPaise: 0, codCollectedAt: null,
  deliveredAt: null, invoiceNumber: null, flags: [], shipment: null, parentOrderId: null,
};

const order = (id: string, status: OrderStatus, ops: Partial<OrderOps> = {}, extra: Partial<Order> = {}): Order => ({
  id, orderNumber: `VX-${id}`, email: 'a@b.in', status, placedAt: Date.UTC(2026, 10, 5, 20), items: [], subtotal: 100, discountTotal: 0, shippingTotal: 0,
  taxTotal: 18, total: 118, statusHistory: [], shippingState: 'Karnataka', ops: { ...baseOps, ...ops }, ...extra,
});

describe('collected money and the refund ceiling', () => {
  it('counts a captured online payment in full and nothing without a payment id', () => {
    expect(collectedPaise(order('a', 'Paid'))).toBe(11800);
    expect(collectedPaise(order('b', 'Paid', { razorpayPaymentId: null }))).toBe(0);
  });

  it('counts COD only once cash is recorded as collected', () => {
    expect(collectedPaise(order('c', 'Delivered', { paymentMethod: 'cod', razorpayPaymentId: null }))).toBe(0);
    expect(collectedPaise(order('c', 'Delivered', { paymentMethod: 'cod', razorpayPaymentId: null, codCollectedPaise: 11800 }))).toBe(11800);
  });

  it('subtracts refunded and in-flight refunds, never below zero', () => {
    expect(refundCeilingPaise(order('d', 'Paid', { refundedPaise: 3000, refundPendingPaise: 2000 }))).toBe(6800);
    expect(refundCeilingPaise(order('e', 'Paid', { refundedPaise: 11800, refundPendingPaise: 500 }))).toBe(0);
  });
});

describe('refund amount entry', () => {
  it('parses rupee text into paise and rejects bad input', () => {
    expect(parseRupeesToPaise('1,250.5')).toBe(125050);
    expect(parseRupeesToPaise('₹ 99')).toBe(9900);
    expect(parseRupeesToPaise('0')).toBeNull();
    expect(parseRupeesToPaise('12.345')).toBeNull();
    expect(parseRupeesToPaise('-5')).toBeNull();
    expect(parseRupeesToPaise('')).toBeNull();
  });

  it('reports the ceiling when the amount is too high and accepts the exact ceiling', () => {
    expect(refundAmountError('118.01', 11800)).toBe('The most you can refund now is ₹118.00.');
    expect(refundAmountError('118', 11800)).toBeNull();
    expect(refundAmountError('1', 0)).toBe('Nothing is left to refund on this order.');
    expect(refundAmountError('abc', 11800)).toMatch(/Enter an amount/);
  });
});

describe('payment totals and reconciliation', () => {
  const orders = [
    order('a', 'Paid'),
    order('b', 'Delivered', { paymentMethod: 'cod', razorpayPaymentId: null, codCollectedPaise: 11800 }),
    order('c', 'Packed', { paymentMethod: 'cod', razorpayPaymentId: null }),
    order('d', 'Delivered', { paymentMethod: 'cod', razorpayPaymentId: null }),
    order('e', 'Cancelled', { paymentMethod: 'cod', razorpayPaymentId: null }),
    order('f', 'Shipped', { razorpayPaymentId: null }),
    order('g', 'Payment_Discrepancy', { razorpayPaymentId: null }),
    order('h', 'Partially_Refunded', { refundedPaise: 1000, refundPendingPaise: 2000, flags: ['REFUND_NOT_STARTED'] }),
    order('i', 'Paid', { paymentMethod: 'replacement', razorpayPaymentId: null }),
  ];

  it('totals prepaid captured, COD collected and pending COD (cancelled orders excluded)', () => {
    expect(paymentTotals(orders)).toEqual({ prepaidCapturedPaise: 23600, codCollectedPaise: 11800, codPendingPaise: 23600, refundedPaise: 1000 });
  });

  it('lists paid prepaid orders with no payment id, ignoring COD and replacements', () => {
    expect(reconcile(orders).paidWithoutPaymentId.map(o => o.id)).toEqual(['f']);
  });

  it('flags discrepancies by status or by payment/refund flags', () => {
    expect(reconcile(orders).flagged.map(o => o.id)).toEqual(['g', 'h']);
  });

  it('lists refunds waiting for the webhook and delivered COD with no cash recorded', () => {
    const r = reconcile(orders);
    expect(r.refundsPending.map(o => o.id)).toEqual(['h']);
    expect(r.codNotCollected.map(o => o.id)).toEqual(['d']);
  });
});

describe('GST split', () => {
  it('splits intra-state tax into CGST and SGST that add back to the tax', () => {
    expect(gstSplit(order('a', 'Paid', { taxPaise: 1801, totalPaise: 11801 }), 'karnataka')).toEqual({
      supply: 'intra_state', taxablePaise: 10000, cgstPaise: 901, sgstPaise: 900, igstPaise: 0, taxPaise: 1801,
    });
  });

  it('charges IGST for another state and leaves the split empty when the seller state is unknown', () => {
    expect(gstSplit(order('a', 'Paid', {}, { shippingState: 'Maharashtra' }), 'Karnataka')).toMatchObject({ supply: 'inter_state', igstPaise: 1800, cgstPaise: 0 });
    expect(gstSplit(order('a', 'Paid'), undefined)).toMatchObject({ supply: 'unknown', cgstPaise: 0, sgstPaise: 0, igstPaise: 0, taxPaise: 1800 });
  });
});

describe('CSV export', () => {
  it('writes orders with the GST split and no customer identity', () => {
    const csv = buildOrdersCsv([order('a', 'Paid', { invoiceNumber: 'VX/26-27/000001' }, { customerName: 'Asha Rao', phone: '9876543210' })], { sellerState: 'Karnataka' });
    const [header, row] = csv.trim().split('\r\n');
    expect(header).toContain('cgst,sgst,igst,total_tax');
    expect(row).toBe('VX-a,2026-11-06,Paid,prepaid,Karnataka,intra_state,100.00,9.00,9.00,0.00,18.00,0.00,0.00,0.00,118.00,118.00,0.00,VX/26-27/000001');
    expect(csv).not.toMatch(/Asha|9876543210|a@b\.in/);
  });

  it('writes one row per refund and COD rows with the outstanding amount', () => {
    const refunded = order('a', 'Partially_Refunded', { refunds: [{ refundId: 'rf_1', amountPaise: 5000, at: Date.UTC(2026, 10, 7) }], refundedPaise: 5000 });
    expect(buildRefundsCsv([refunded]).trim().split('\r\n')[1]).toBe('VX-a,rf_1,2026-11-07,50.00,');
    const cod = order('d', 'Delivered', { paymentMethod: 'cod', razorpayPaymentId: null });
    expect(buildCodCsv([order('a', 'Paid'), cod]).trim().split('\r\n')[1]).toBe('VX-d,Delivered,,118.00,0.00,,118.00');
  });

  it('neutralises spreadsheet formulas and quotes separators', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell(-5)).toBe('-5');
  });

  it('turns an inclusive IST date range into epoch bounds', () => {
    const r = istRange('2026-11-05', '2026-11-05');
    expect(r && new Date(r.from).toISOString()).toBe('2026-11-04T18:30:00.000Z');
    expect(r && new Date(r.to).toISOString()).toBe('2026-11-05T18:29:59.999Z');
    expect(istRange('2026-11-06', '2026-11-05')).toBeNull();
    expect(istRange('x', '2026-11-05')).toBeNull();
  });
});
