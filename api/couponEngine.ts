/**
 * Server-Authoritative Coupon Validation & Discount Calculation Engine
 * Enforces business logic, usage limits, expiration, and category restrictions.
 */

import { db } from '../src/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import type { Coupon, CouponValidationRequest, CouponValidationResult } from '../src/types/coupon';
import { LAUNCH_COUPONS } from '../src/types/coupon';

export { LAUNCH_COUPONS };

export async function validateAndCalculateCoupon(
  params: CouponValidationRequest
): Promise<CouponValidationResult> {
  const rawCode = params.code?.trim().toUpperCase();
  if (!rawCode) {
    return {
      isValid: false,
      discountAmount: 0,
      errorCode: 'INVALID_CODE',
      error: 'Please provide a valid coupon code.',
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

  // 1. Fetch Coupon from Cloud Firestore
  let coupon: Coupon | null = null;
  try {
    const q = query(collection(db, 'coupons'), where('code', '==', rawCode));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docData = snap.docs[0].data();
      coupon = {
        id: snap.docs[0].id,
        ...docData
      } as Coupon;
    }
  } catch (err) {
    console.warn('Firestore coupon query notice:', err);
  }

  // Fallback to clientCoupons (e.g. newly created admin coupons in browser storage)
  if (!coupon && Array.isArray(params.clientCoupons)) {
    const matched = params.clientCoupons.find(c => c.code?.trim().toUpperCase() === rawCode);
    if (matched) {
      coupon = matched;
    }
  }

  // Fallback to launch static coupons if not found in Firestore
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

  // 2. Active Status Check
  if (coupon.isActive === false) {
    return {
      isValid: false,
      discountAmount: 0,
      errorCode: 'COUPON_INACTIVE',
      error: 'This promotion is currently disabled.',
    };
  }

  // 3. Date Validity Checks
  const now = new Date();
  if (coupon.startDate) {
    const start = new Date(coupon.startDate);
    if (now < start) {
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
    // End of expiry day (23:59:59)
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

  // 4. Global Usage Limit Check
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

  // 5. Minimum Order Subtotal Check
  if (typeof coupon.minOrderValue === 'number' && coupon.minOrderValue > 0) {
    if (cartSubtotal < coupon.minOrderValue) {
      return {
        isValid: false,
        discountAmount: 0,
        errorCode: 'MIN_ORDER_NOT_MET',
        error: `Minimum order value of ${params.currency || '₹'}${coupon.minOrderValue} required for this coupon.`,
      };
    }
  }

  // 6. Per-Customer Usage Limit Check
  if (params.customerEmail && typeof coupon.maxUsagePerCustomer === 'number' && coupon.maxUsagePerCustomer > 0) {
    try {
      const cleanEmail = params.customerEmail.trim().toLowerCase();
      const usagesQ = query(
        collection(db, 'coupon_usages'),
        where('couponCode', '==', coupon.code),
        where('customerEmail', '==', cleanEmail)
      );
      const usageSnap = await getDocs(usagesQ);
      if (usageSnap.size >= coupon.maxUsagePerCustomer) {
        return {
          isValid: false,
          discountAmount: 0,
          errorCode: 'CUSTOMER_LIMIT_EXCEEDED',
          error: `You have already redeemed this coupon the maximum allowed times (${coupon.maxUsagePerCustomer}).`,
        };
      }
    } catch (usageErr) {
      console.warn('Customer usage query notice (proceeding):', usageErr);
    }
  }

  // 7. Calculate Eligible Subtotal (if restricted by categories/products)
  let eligibleSubtotal = cartSubtotal;
  if (
    (coupon.applicableCategories && coupon.applicableCategories.length > 0) ||
    (coupon.applicableProductIds && coupon.applicableProductIds.length > 0)
  ) {
    if (params.cartItems && params.cartItems.length > 0) {
      const eligibleItems = params.cartItems.filter(item => {
        const matchesCategory = !coupon!.applicableCategories?.length || 
          (item.category && coupon!.applicableCategories.includes(item.category));
        const matchesProduct = !coupon!.applicableProductIds?.length || 
          (item.productId && coupon!.applicableProductIds.includes(item.productId));
        return matchesCategory && matchesProduct;
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

  // Round to 2 decimal places
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
