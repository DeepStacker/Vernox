import type { Coupon, CouponValidationRequest, CouponValidationResult } from '@/types/coupon';
import { LAUNCH_COUPONS } from '@/types/coupon';

/**
 * Universal Coupon Validation & Discount Engine
 * Evaluates active status, expiry, minimum subtotal, product/category rules, and discount calculation.
 * Usable both client-side and server-side.
 */
export function calculateCouponDiscount(
  params: CouponValidationRequest,
  couponsPool: Coupon[] = []
): CouponValidationResult {
  const rawCode = params.code?.trim().toUpperCase();
  if (!rawCode) {
    return {
      isValid: false,
      discountAmount: 0,
      errorCode: 'INVALID_CODE',
      error: 'Please enter a coupon code.',
    };
  }

  const cartSubtotal = Number(params.cartSubtotal) || 0;
  if (cartSubtotal <= 0) {
    return {
      isValid: false,
      discountAmount: 0,
      errorCode: 'MIN_ORDER_NOT_MET',
      error: 'Cart subtotal must be greater than zero.',
    };
  }

  const currencySymbol = params.currency || '₹';

  // 1. Locate coupon in provided pool (which contains Admin Panel coupons)
  let coupon = couponsPool.find(c => c.code?.trim().toUpperCase() === rawCode);

  // 2. Fallback to launch static coupons if not in dynamic pool
  if (!coupon && LAUNCH_COUPONS[rawCode]) {
    const launchDef = LAUNCH_COUPONS[rawCode];
    coupon = {
      id: `launch-${rawCode.toLowerCase()}`,
      ...launchDef,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  if (!coupon) {
    return {
      isValid: false,
      discountAmount: 0,
      errorCode: 'COUPON_NOT_FOUND',
      error: `Coupon code "${rawCode}" is not recognized.`,
    };
  }

  // 3. Active status check
  if (coupon.isActive === false) {
    return {
      isValid: false,
      discountAmount: 0,
      errorCode: 'COUPON_INACTIVE',
      error: 'This promotion is currently disabled.',
    };
  }

  // 4. Date validity checks
  const now = new Date();
  if (coupon.startDate) {
    const start = new Date(coupon.startDate);
    if (!isNaN(start.getTime()) && now < start) {
      return {
        isValid: false,
        discountAmount: 0,
        errorCode: 'COUPON_NOT_STARTED',
        error: `This promotion begins on ${start.toLocaleDateString()}.`,
      };
    }
  }

  if (coupon.expiryDate) {
    const expiry = new Date(coupon.expiryDate);
    if (!isNaN(expiry.getTime())) {
      expiry.setHours(23, 59, 59, 999);
      if (now > expiry) {
        return {
          isValid: false,
          discountAmount: 0,
          errorCode: 'COUPON_EXPIRED',
          error: 'This coupon code has expired.',
        };
      }
    }
  }

  // 5. Global usage limit check
  if (typeof coupon.maxUsageCount === 'number' && coupon.maxUsageCount > 0) {
    if ((coupon.usedCount || 0) >= coupon.maxUsageCount) {
      return {
        isValid: false,
        discountAmount: 0,
        errorCode: 'USAGE_LIMIT_EXCEEDED',
        error: 'This coupon has reached its maximum redemption limit.',
      };
    }
  }

  // 6. Minimum Order Value Check
  if (typeof coupon.minOrderValue === 'number' && coupon.minOrderValue > 0) {
    if (cartSubtotal < coupon.minOrderValue) {
      return {
        isValid: false,
        discountAmount: 0,
        errorCode: 'MIN_ORDER_NOT_MET',
        error: `Minimum order value of ${currencySymbol}${coupon.minOrderValue.toLocaleString()} required for ${coupon.code}.`,
      };
    }
  }

  // 7. Calculate Eligible Subtotal based on Category / Product restrictions
  let eligibleSubtotal = cartSubtotal;
  const hasCategoryRestriction = Array.isArray(coupon.applicableCategories) && coupon.applicableCategories.length > 0;
  const hasProductRestriction = Array.isArray(coupon.applicableProductIds) && coupon.applicableProductIds.length > 0;

  if (hasCategoryRestriction || hasProductRestriction) {
    if (params.cartItems && params.cartItems.length > 0) {
      const eligibleItems = params.cartItems.filter(item => {
        const matchesCat = !hasCategoryRestriction || 
          (item.category && coupon!.applicableCategories!.includes(item.category));
        const matchesProd = !hasProductRestriction || 
          (item.productId && coupon!.applicableProductIds!.includes(item.productId)) ||
          (item.productSlug && coupon!.applicableProductIds!.includes(item.productSlug));
        return matchesCat && matchesProd;
      });

      eligibleSubtotal = eligibleItems.reduce((acc, itm) => acc + (itm.unitPrice * (itm.quantity || 1)), 0);

      if (eligibleSubtotal <= 0) {
        return {
          isValid: false,
          discountAmount: 0,
          errorCode: 'NO_APPLICABLE_ITEMS',
          error: 'This coupon is not valid for any items currently in your cart.',
        };
      }
    }
  }

  // 8. Calculate Discount Amount
  let discountAmount = 0;
  if (coupon.discountType === 'percentage') {
    discountAmount = (eligibleSubtotal * coupon.discountValue) / 100;
    if (typeof coupon.maxDiscountLimit === 'number' && coupon.maxDiscountLimit > 0) {
      discountAmount = Math.min(discountAmount, coupon.maxDiscountLimit);
    }
  } else {
    // Fixed amount discount
    discountAmount = Math.min(coupon.discountValue, eligibleSubtotal);
  }

  discountAmount = Math.round(discountAmount * 100) / 100;

  return {
    isValid: true,
    couponId: coupon.id,
    couponCode: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountAmount,
    description: coupon.description,
  };
}
