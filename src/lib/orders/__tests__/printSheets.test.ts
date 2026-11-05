import { describe, expect, it } from 'vitest';
import type { Order } from '@/types/store';
import { code39Svg } from '../code39';
import { buildJobSheetsHtml, buildPackingSlipHtml, escapeHtml } from '../printSheets';

const order: Order = {
  id: 'o1', orderNumber: 'VX-20261105-ABC123', email: 'a@b.in', customerName: '<script>alert(1)</script>', status: 'Cutting', placedAt: 0,
  items: [{ id: 'i1', productId: 'p1', productName: 'Om "Mandala"', productSlug: '', shapeId: '', sizeLabel: '60 × 60 cm', widthMm: 600, heightMm: 600, finish: 'brass', unitPrice: 1, quantity: 2, lineTotal: 2 }],
  subtotal: 0, discountTotal: 0, shippingTotal: 0, taxTotal: 0, total: 0, statusHistory: [], shippingAddress: '1 MG Road', shippingPincode: '560001',
};
const ctx = { products: [], storeName: 'Vernox' };

describe('print sheets', () => {
  it('escapes HTML', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('renders one page per order with number, dimensions and checklist', () => {
    const html = buildJobSheetsHtml([order, { ...order, id: 'o2', orderNumber: 'VX-2' }], ctx);
    expect(html.match(/class="sheet"/g)).toHaveLength(2);
    expect(html).toContain('VX-20261105-ABC123');
    expect(html).toContain('600 × 600 mm');
    expect(html).toContain('Edges deburred');
    expect(html).toContain('<svg');
  });

  it('never injects customer-supplied markup into the packing slip', () => {
    const html = buildPackingSlipHtml(order, ctx);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('HANDLE WITH CARE');
    expect(html).toContain('560001');
  });

  it('draws a Code 39 barcode and drops unsupported characters', () => {
    expect(code39Svg('VX-1')).toContain('<rect');
    expect(code39Svg('a$b')).toBe(code39Svg('AB'));
  });
});
