import { describe, expect, it } from 'vitest';
import { buildReceipt, formatReceiptDate, maskPhone } from '@/lib/orders/receipt';
import type { OrderOps } from '@/types/orderOps';
import type { Order } from '@/types/store';

const ops: OrderOps = {
  paymentMethod: 'prepaid', razorpayPaymentId: null, paidAt: null, subtotalPaise: 100000, discountPaise: 10000, shippingPaise: 0, codFeePaise: 0,
  taxPaise: 16200, totalPaise: 106200, refundedPaise: 0, refundPendingPaise: 0, refunds: [], codCollectedPaise: 0, codCollectedAt: null,
  deliveredAt: null, invoiceNumber: null, flags: [], shipment: null, parentOrderId: null,
};
const config = {
  storeName: 'Vernox',
  seller: { tradeName: 'Vernox Metal Art', gstin: '29ABCDE1234F1Z5', address: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', phone: '+91 98450 00000' },
  returnWindowDays: 7,
};
const order = (extra: Partial<Order> = {}, opsExtra: Partial<OrderOps> = {}): Order => ({
  id: 'o1', orderNumber: 'VX-20261114-ABC123', email: 'a@b.in', status: 'Delivered', placedAt: Date.UTC(2026, 10, 14, 9, 35), customerName: 'Asha Rao', phone: '+91 98450 12345',
  shippingState: 'Karnataka', items: [{ id: 'i1', productId: 'p', productName: 'Peacock Wall Art', productSlug: 'p', shapeId: '', sizeLabel: 'Medium · 50cm', widthMm: 0, heightMm: 0, finish: 'brass', unitPrice: 500, quantity: 2, lineTotal: 1000 }],
  subtotal: 1000, discountTotal: 100, shippingTotal: 0, taxTotal: 162, total: 1062, statusHistory: [], ops: { ...ops, ...opsExtra }, ...extra,
});

describe('receipt helpers', () => {
  it('masks a phone except its last four digits', () => {
    expect(maskPhone('+91 98450 12345')).toBe('XXXXXXXX2345');
    expect(maskPhone('1234')).toBe('1234');
    expect(maskPhone(undefined)).toBe('');
  });

  it('prints the date in IST whatever the device time zone', () => {
    expect(formatReceiptDate(Date.UTC(2026, 10, 14, 9, 35))).toMatch(/14 Nov 2026,? 3:05 pm/i);
  });
});

describe('buildReceipt', () => {
  it('titles an order without an invoice "Order receipt" and one with an invoice "Tax invoice"', () => {
    expect(buildReceipt({ order: order(), config }).title).toBe('Order receipt');
    const r = buildReceipt({ order: order({}, { invoiceNumber: 'VX/26-27/0007' }), config });
    expect(r.title).toBe('Tax invoice');
    expect(r.invoiceNumber).toBe('VX/26-27/0007');
  });

  it('shows seller details, the masked customer phone and the lines', () => {
    const r = buildReceipt({ order: order(), config });
    expect(r.seller).toEqual({ name: 'Vernox Metal Art', addressLines: ['12 MG Road', 'Bengaluru, Karnataka, 560001'], gstin: '29ABCDE1234F1Z5', phone: '+91 98450 00000' });
    expect(r.customer).toEqual({ name: 'Asha Rao', phone: 'XXXXXXXX2345' });
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ name: 'Peacock Wall Art', quantity: 2, amount: '₹1,000.00' });
    expect(r.lines[0].detail).toContain('Medium · 50cm');
  });

  it('splits GST into CGST and SGST within the seller state and IGST outside it', () => {
    expect(buildReceipt({ order: order(), config }).totals.map(t => t.label)).toEqual(['Subtotal', 'Discount', 'CGST', 'SGST', 'TOTAL']);
    const inter = buildReceipt({ order: order({ shippingState: 'Kerala' }), config });
    expect(inter.totals.map(t => t.label)).toEqual(['Subtotal', 'Discount', 'IGST', 'TOTAL']);
    expect(inter.totals.at(-1)?.value).toBe('₹1,062.00');
  });

  it('takes the tax split from the invoice when there is one', () => {
    const invoice = { id: 'i', number: 'VX/1', issuedAt: 1, supplyType: 'inter_state' as const, totals: { igstPaise: 16201 } };
    const r = buildReceipt({ order: order(), config, invoice });
    expect(r.totals.find(t => t.label === 'IGST')?.value).toBe('₹162.01');
    expect(r.invoiceNumber).toBe('VX/1');
  });

  it('omits zero discount and shipping, and lists shipping and the COD fee when charged', () => {
    const plain = buildReceipt({ order: order({ discountTotal: 0 }, { discountPaise: 0 }), config }).totals.map(t => t.label);
    expect(plain).not.toContain('Discount');
    expect(plain).not.toContain('Shipping');
    const charged = buildReceipt({ order: order({}, { shippingPaise: 8000, codFeePaise: 5000 }), config }).totals.map(t => t.label);
    expect(charged).toContain('Shipping');
    expect(charged).toContain('COD fee');
  });

  it('records a counter payment in full with its reference and no balance', () => {
    const r = buildReceipt({ order: order({ offlinePayment: { mode: 'upi', reference: 'UTR123' } }), config });
    expect(r.payment).toEqual([{ label: 'Paid by', value: 'UPI' }, { label: 'Ref', value: 'UTR123' }, { label: 'Amount paid', value: '₹1,062.00' }]);
  });

  it('shows cash on delivery with the balance due until the cash is collected', () => {
    const due = buildReceipt({ order: order({}, { paymentMethod: 'cod' }), config }).payment;
    expect(due).toEqual([{ label: 'Payment', value: 'Cash on delivery' }, { label: 'Amount paid', value: '₹0.00' }, { label: 'Balance due', value: '₹1,062.00', strong: true }]);
    const paid = buildReceipt({ order: order({}, { paymentMethod: 'cod', codCollectedPaise: 106200 }), config }).payment;
    expect(paid.some(r => r.label === 'Balance due')).toBe(false);
  });

  it('shows the online payment id, and no balance on a cancelled order', () => {
    const online = buildReceipt({ order: order({}, { razorpayPaymentId: 'pay_9' }), config }).payment;
    expect(online.some(r => r.value === 'pay_9')).toBe(true);
    const cancelled = buildReceipt({ order: order({ status: 'Cancelled' }), config }).payment;
    expect(cancelled.some(r => r.label === 'Balance due')).toBe(false);
  });

  it('lists advance payments and the balance still owed on a part-paid order', () => {
    const r = buildReceipt({
      order: order({ balanceDuePaise: 56200, payments: [{ id: 'a', kind: 'advance', amountPaise: 50000, mode: 'cash', reference: '', at: 1 }] }),
      config,
    });
    expect(r.payment).toEqual([
      { label: 'Advance Cash', value: '₹500.00' },
      { label: 'Amount paid', value: '₹500.00' },
      { label: 'Balance due', value: '₹562.00', strong: true },
    ]);
    const settled = buildReceipt({ order: order({ balanceDuePaise: 0, offlinePayment: { mode: 'cash', reference: '' } }), config });
    expect(settled.payment.some(x => x.label === 'Balance due')).toBe(false);
    expect(settled.payment.find(x => x.label === 'Amount paid')?.value).toBe('₹1,062.00');
  });

  it('adds the returns line only when the settings have a return window', () => {
    expect(buildReceipt({ order: order(), config }).footer).toEqual(['Thank you for shopping with us.', 'Returns accepted within 7 days of delivery.']);
    expect(buildReceipt({ order: order(), config: { ...config, returnWindowDays: undefined } }).footer).toEqual(['Thank you for shopping with us.']);
  });

  it('falls back to the store name when seller details are not loaded', () => {
    expect(buildReceipt({ order: order(), config: undefined }).seller).toEqual({ name: 'Vernox', addressLines: [], gstin: null, phone: null });
  });
});
