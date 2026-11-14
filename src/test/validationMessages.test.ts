// @vitest-environment node
import type { VercelRequest } from '@vercel/node';
import { describe, expect, it } from 'vitest';
import { checkoutRequestSchema } from '../../api/_lib/checkout';
import { parseBody } from '../../api/_lib/http';
import { formatRupees } from '../../api/_lib/money';
import { isValidEmail, validateAddress, type AddressForm } from '../lib/checkout/validation';

const customer = { email: 'a@b.in', name: 'Asha', phone: '9876543210', address: '12 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001', country: 'India' };
const item = { productId: 'p-01', quantity: 1, finish: 'gold' };
const messageFor = (body: unknown) => {
  try {
    parseBody({ body } as VercelRequest, checkoutRequestSchema);
  } catch (err) {
    return `${(err as Error & { code: string }).code}: ${(err as Error).message}`;
  }
  return 'ok';
};

describe('friendly validation messages', () => {
  it('names fields instead of zod paths', () => {
    expect(messageFor({ idempotencyKey: 'abcdefgh12', items: [item], customer: { ...customer, name: 'x'.repeat(121) } })).toBe('VALIDATION_ERROR: Name must be at most 120 characters.');
    expect(messageFor({ idempotencyKey: 'abcdefgh12', items: [item], customer: { ...customer, email: 'a@@b.in' } })).toBe('VALIDATION_ERROR: Email must be a valid email address.');
    expect(messageFor({ idempotencyKey: 'abcdefgh12', items: [item], customer: { ...customer, pincode: '12' } })).toMatch(/^VALIDATION_ERROR: PIN code /);
    expect(messageFor({ idempotencyKey: 'abcdefgh12', items: [item], customer: { ...customer, address: '' } })).toBe('VALIDATION_ERROR: Address is required.');
    expect(messageFor({ idempotencyKey: 'abcdefgh12', items: [{ ...item, customDesignRef: '' }], customer })).toMatch(/^VALIDATION_ERROR: Design reference \(item 1\) /);
  });
});

describe('money formatting', () => {
  it('formats paise with Indian grouping and two decimals', () => {
    expect(formatRupees(123_456)).toBe('₹1,234.56');
    expect(formatRupees(10_000_000)).toBe('₹1,00,000.00');
    expect(formatRupees(50)).toBe('₹0.50');
  });
});

describe('checkout form limits', () => {
  const form: AddressForm = { ...customer };
  it('rejects over-long fields and malformed emails like the server does', () => {
    const errors = validateAddress({ ...form, name: 'n'.repeat(121), address: 'a'.repeat(501), city: 'c'.repeat(101) });
    expect(Object.keys(errors).sort()).toEqual(['address', 'city', 'name']);
    for (const bad of ['a@@b.in', 'a@b', 'a b@c.in', '.a@b.in', 'a@b..in', 'a@']) expect(isValidEmail(bad)).toBe(false);
    expect(isValidEmail('first.last+tag@sub.example.co.in')).toBe(true);
  });
});
