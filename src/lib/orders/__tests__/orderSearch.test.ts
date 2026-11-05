import { describe, expect, it } from 'vitest';
import type { Order } from '@/types/store';
import { matchesOrder, messageSnippets, normaliseIndianPhone, summariseCustomer, whatsappLink } from '../orderSearch';

const base: Order = {
  id: 'abc123def456', orderNumber: 'VX-20261105-ABC123', email: 'Priya@Example.com', customerName: 'Priya Nair', phone: '+91 98765 43210',
  shippingPincode: '560001', status: 'Cutting', placedAt: 1, items: [], subtotal: 0, discountTotal: 0, shippingTotal: 0, taxTotal: 0, total: 1000, statusHistory: [],
};

describe('order search', () => {
  it('matches order number, email, phone, pincode and name', () => {
    expect(matchesOrder(base, 'vx-20261105')).toBe(true);
    expect(matchesOrder(base, 'priya@example')).toBe(true);
    expect(matchesOrder(base, '98765 43210')).toBe(true);
    expect(matchesOrder(base, '5600')).toBe(true);
    expect(matchesOrder(base, 'nair')).toBe(true);
    expect(matchesOrder(base, '110001')).toBe(false);
    expect(matchesOrder(base, 'zzz')).toBe(false);
    expect(matchesOrder(base, '  ')).toBe(true);
  });

  it('does not match short digit fragments against phone numbers', () => {
    expect(matchesOrder(base, '98')).toBe(false);
  });
});

describe('phone and WhatsApp', () => {
  it('normalises Indian numbers', () => {
    expect(normaliseIndianPhone('98765 43210')).toBe('919876543210');
    expect(normaliseIndianPhone('+91-98765-43210')).toBe('919876543210');
    expect(normaliseIndianPhone('098765 43210')).toBe('919876543210');
    expect(normaliseIndianPhone('12345')).toBeNull();
    expect(normaliseIndianPhone(undefined)).toBeNull();
  });

  it('builds an encoded wa.me link or null', () => {
    expect(whatsappLink('9876543210', 'Hi & bye\nok')).toBe('https://wa.me/919876543210?text=Hi%20%26%20bye%0Aok');
    expect(whatsappLink('abc', 'x')).toBeNull();
  });
});

describe('customer summary and snippets', () => {
  it('aggregates by email, case-insensitively, counting revenue orders for lifetime value', () => {
    const orders = [base, { ...base, id: 'b', placedAt: 5, total: 500, status: 'Cancelled' as const }, { ...base, id: 'c', email: 'other@x.in' }];
    const s = summariseCustomer('priya@example.com', orders, o => o.status !== 'Cancelled');
    expect(s).toMatchObject({ orderCount: 2, lifetimeValue: 1000, lastOrderAt: 5, name: 'Priya Nair' });
  });

  it('offers a tracking snippet only when tracking exists', () => {
    expect(messageSnippets(base, 'Vernox').map(s => s.id)).toEqual(['status', 'delay']);
    const shipped = { ...base, tracking: { carrier: 'Delhivery', trackingNumber: 'DL123' } };
    const tracking = messageSnippets(shipped, 'Vernox').find(s => s.id === 'tracking');
    expect(tracking?.text).toContain('DL123');
    expect(tracking?.text).toContain('Hi Priya');
  });
});
