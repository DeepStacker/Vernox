/**
 * Coupon form validation, mirroring couponSchema in api/admin.ts so staff see the problem
 * before a round trip. Blank optional fields become null, which the server stores as
 * "no limit" (a cleared expiry or cap really clears; absent would leave the old value).
 */
import type { DiscountType } from '@/types/coupon';

export interface CouponDraft {
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: string;
  maxDiscountLimit: string;
  minOrderValue: string;
  maxUsageCount: string;
  maxUsagePerCustomer: string;
  startDate: string;
  expiryDate: string;
  isActive: boolean;
}

export interface CouponPayload {
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountLimit: number | null;
  minOrderValue: number | null;
  maxUsageCount: number | null;
  maxUsagePerCustomer: number | null;
  startDate: string | null;
  expiryDate: string | null;
  isActive: boolean;
}

export type CouponFormResult = { ok: true; payload: CouponPayload } | { ok: false; error: string };

const DECIMAL = /^\d+(\.\d+)?$/;
const WHOLE = /^\d+$/;

const fail = (error: string): CouponFormResult => ({ ok: false, error });

type Parsed = { value: number | null } | { error: string };

function optionalNumber(raw: string, label: string, whole: boolean, min: number): Parsed {
  const text = raw.trim();
  if (!text) return { value: null };
  if (!(whole ? WHOLE : DECIMAL).test(text)) return { error: `${label} must be ${whole ? 'a whole number' : 'a number'}.` };
  const n = Number(text);
  if (n < min) return { error: `${label} must be ${min === 0 ? 'zero or more' : 'at least 1'}.` };
  return { value: n };
}

export function validateCouponDraft(draft: CouponDraft): CouponFormResult {
  const code = draft.code.trim().toUpperCase();
  if (code.length < 3 || code.length > 40) return fail('Coupon code must be 3 to 40 characters.');
  if (!/^[A-Z0-9_-]+$/.test(code)) return fail('Coupon code can only use letters, numbers, hyphens and underscores.');

  const value = draft.discountValue.trim();
  if (!DECIMAL.test(value)) return fail('Discount value must be a number.');
  const discountValue = Number(value);
  if (discountValue <= 0) return fail('Discount value must be more than 0.');
  if (draft.discountType === 'percentage' && discountValue > 100) return fail('A percentage discount cannot exceed 100.');

  const maxDiscountLimit = optionalNumber(draft.maxDiscountLimit, 'Max discount cap', false, 0);
  const minOrderValue = optionalNumber(draft.minOrderValue, 'Min order spend', false, 0);
  const maxUsageCount = optionalNumber(draft.maxUsageCount, 'Max total uses', true, 1);
  const maxUsagePerCustomer = optionalNumber(draft.maxUsagePerCustomer, 'Limit per customer', true, 1);
  if ('error' in maxDiscountLimit) return fail(maxDiscountLimit.error);
  if ('error' in minOrderValue) return fail(minOrderValue.error);
  if ('error' in maxUsageCount) return fail(maxUsageCount.error);
  if ('error' in maxUsagePerCustomer) return fail(maxUsagePerCustomer.error);

  return {
    ok: true,
    payload: {
      code,
      description: draft.description.trim(),
      discountType: draft.discountType,
      discountValue,
      maxDiscountLimit: maxDiscountLimit.value,
      minOrderValue: minOrderValue.value,
      maxUsageCount: maxUsageCount.value,
      maxUsagePerCustomer: maxUsagePerCustomer.value,
      startDate: draft.startDate || null,
      expiryDate: draft.expiryDate || null,
      isActive: draft.isActive,
    },
  };
}
