import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '@/types/store';
import { draftFromConfig, missingSellerFields, toStorePatch, validateBusiness } from '../settingsForm';

const config: StoreConfig = { storeName: 'Vernox', currency: '₹', gstRatePercent: 18, freeShippingThreshold: 5000, shippingFee: 150 };

describe('business settings form', () => {
  it('accepts a valid GSTIN whose state code matches and rejects a malformed one', () => {
    const d = draftFromConfig(config);
    d.seller.gstin = '29abcde1234f1z5';
    d.seller.stateCode = '29';
    expect(validateBusiness(d)).toEqual({});
    d.seller.gstin = '29ABCDE1234F1Z';
    expect(validateBusiness(d).gstin).toMatch(/valid 15-character GSTIN/);
  });

  it('requires the state code to be the GSTIN prefix', () => {
    const d = draftFromConfig(config);
    d.seller.gstin = '29ABCDE1234F1Z5';
    d.seller.stateCode = '27';
    expect(validateBusiness(d).stateCode).toMatch(/first two characters/);
  });

  it('validates contact fields and numeric limits', () => {
    const d = draftFromConfig(config);
    Object.assign(d, { whatsappNumber: '98', supportEmail: 'nope', codFee: '-1', returnWindowDays: '7.5', defaultLeadTimeDays: '400' });
    expect(Object.keys(validateBusiness(d)).sort()).toEqual(['codFee', 'defaultLeadTimeDays', 'returnWindowDays', 'supportEmail', 'whatsappNumber']);
  });

  it('builds a patch with an upper-cased GSTIN and omits empty numbers', () => {
    const d = draftFromConfig(config);
    d.seller.gstin = '29abcde1234f1z5';
    d.codEnabled = true;
    d.codFee = '49';
    const patch = toStorePatch(d);
    expect(patch.seller?.gstin).toBe('29ABCDE1234F1Z5');
    expect(patch).toMatchObject({ codEnabled: true, codFee: 49, supportEmail: '' });
    expect(patch).not.toHaveProperty('returnWindowDays');
  });

  it('lists the seller fields still missing for invoices', () => {
    expect(missingSellerFields(undefined)).toEqual(['legalName', 'gstin', 'address', 'state', 'stateCode', 'pincode']);
    expect(missingSellerFields({ legalName: 'A', gstin: 'G', address: 'x', state: 'KA', stateCode: '29', pincode: '560001' })).toEqual([]);
  });
});

describe('design consultation settings', () => {
  it('starts from the defaults (disabled, 999, credit on, 60 days, 3 days)', () => {
    expect(draftFromConfig(config).consultation).toEqual({ enabled: false, priceInr: '999', creditTowardsOrder: true, creditValidityDays: '60', turnaroundDays: '3', sacCode: '998391' });
  });

  it('validates the fee, the day counts and the SAC code', () => {
    const d = draftFromConfig(config);
    d.consultation = { ...d.consultation, priceInr: '0', turnaroundDays: '2.5', creditValidityDays: '400', sacCode: '99' };
    const errors = validateBusiness(d);
    expect(errors.consultationPrice).toBeDefined();
    expect(errors.turnaroundDays).toBeDefined();
    expect(errors.creditValidityDays).toBeDefined();
    expect(errors.sacCode).toBeDefined();
  });

  it('writes the consultation block with numbers into the patch', () => {
    const d = draftFromConfig(config);
    d.consultation = { ...d.consultation, enabled: true, priceInr: '1499' };
    expect(toStorePatch(d).consultation).toEqual({ enabled: true, priceInr: 1499, creditTowardsOrder: true, creditValidityDays: 60, turnaroundDays: 3, sacCode: '998391' });
  });
});
