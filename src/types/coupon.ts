/**
 * Vernox Enterprise Coupon & Promotion Types
 */

export type DiscountType = 'percentage' | 'fixed';

export interface Coupon {
  id: string;
  code: string; // Trimmed uppercase e.g. "VERNOX20"
  description: string;
  discountType: DiscountType;
  discountValue: number; // e.g. 20 for 20%, or 50 for $50/₹50
  maxDiscountLimit?: number; // Capped max discount for percentage coupons (e.g. max $100 off)
  minOrderValue?: number; // Minimum cart subtotal required to apply
  maxUsageCount?: number; // Maximum total redemptions across all customers (null/undefined = unlimited)
  usedCount: number; // Current redemption count
  maxUsagePerCustomer?: number; // Maximum times a single customer email can use this (default: 1)
  startDate?: string; // ISO date string or YYYY-MM-DD
  expiryDate?: string; // ISO date string or YYYY-MM-DD
  isActive: boolean; // Enable/disable toggle
  applicableCategories?: string[]; // Empty or undefined = all categories
  applicableProductIds?: string[]; // Empty or undefined = all products
  createdAt: number;
  updatedAt: number;
}

export interface CouponUsage {
  id: string;
  couponId: string;
  couponCode: string;
  orderId: string;
  customerEmail: string;
  discountAmount: number;
  orderTotal: number;
  usedAt: number;
}

/**
 * Input of the client-side display estimate (src/lib/couponValidator.ts). The server
 * never accepts this shape: /api/validate-coupon takes cart items and prices them itself.
 */
export interface CouponValidationRequest {
  code: string;
  cartSubtotal: number;
  cartItems?: Array<{
    productId?: string;
    productSlug?: string;
    unitPrice: number;
    quantity: number;
    category?: string;
  }>;
  customerEmail?: string;
  currency?: string;
}

export interface CouponValidationResult {
  isValid: boolean;
  couponId?: string;
  couponCode?: string;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount: number;
  description?: string;
  error?: string;
  errorCode?: 
    | 'COUPON_NOT_FOUND' 
    | 'COUPON_INACTIVE' 
    | 'COUPON_EXPIRED' 
    | 'COUPON_NOT_STARTED' 
    | 'USAGE_LIMIT_EXCEEDED' 
    | 'CUSTOMER_LIMIT_EXCEEDED' 
    | 'MIN_ORDER_NOT_MET' 
    | 'NO_APPLICABLE_ITEMS' 
    | 'INVALID_CODE'
    | 'RATE_LIMITED'
    | 'SERVER_ERROR';
}

/**
 * Launch coupon definitions. SEED DATA ONLY: scripts/seed-firestore.ts writes them to
 * the `coupons` collection. The server evaluates coupons exclusively from Firestore,
 * so these are never honoured unless seeded (and then usage is tracked there).
 */
export const LAUNCH_COUPONS: Record<string, Omit<Coupon, 'id' | 'createdAt' | 'updatedAt'>> = {
  'WELCOME10': {
    code: 'WELCOME10',
    description: '10% Welcome Discount for Vernox Atelier patrons',
    discountType: 'percentage',
    discountValue: 10,
    maxDiscountLimit: 1500,
    minOrderValue: 100,
    maxUsageCount: 1000,
    usedCount: 0,
    maxUsagePerCustomer: 1,
    isActive: true,
  },
  'ATELIER50': {
    code: 'ATELIER50',
    description: 'Flat ₹50 atelier discount on orders over ₹200',
    discountType: 'fixed',
    discountValue: 50,
    minOrderValue: 200,
    maxUsageCount: 500,
    usedCount: 0,
    maxUsagePerCustomer: 2,
    isActive: true,
  },
  'VERNOXVIP': {
    code: 'VERNOXVIP',
    description: '15% Exclusive Collector Privilege',
    discountType: 'percentage',
    discountValue: 15,
    maxDiscountLimit: 3000,
    minOrderValue: 350,
    maxUsageCount: 200,
    usedCount: 0,
    maxUsagePerCustomer: 1,
    isActive: true,
  },
  'ATELIER10': {
    code: 'ATELIER10',
    description: '10% Atelier Architectural Privilege',
    discountType: 'percentage',
    discountValue: 10,
    maxDiscountLimit: 1500,
    minOrderValue: 100,
    maxUsageCount: 1000,
    usedCount: 0,
    maxUsagePerCustomer: 1,
    isActive: true,
  },
  'ARCHITECT15': {
    code: 'ARCHITECT15',
    description: '15% Architectural Studio Trade Discount',
    discountType: 'percentage',
    discountValue: 15,
    maxDiscountLimit: 3000,
    minOrderValue: 200,
    maxUsageCount: 500,
    usedCount: 0,
    maxUsagePerCustomer: 2,
    isActive: true,
  },
  'TRADE15': {
    code: 'TRADE15',
    description: '15% Trade Partner Discount',
    discountType: 'percentage',
    discountValue: 15,
    maxDiscountLimit: 3000,
    minOrderValue: 200,
    maxUsageCount: 500,
    usedCount: 0,
    maxUsagePerCustomer: 2,
    isActive: true,
  },
  'VERNOX20': {
    code: 'VERNOX20',
    description: '20% Master Collector Commission Privilege',
    discountType: 'percentage',
    discountValue: 20,
    maxDiscountLimit: 5000,
    minOrderValue: 300,
    maxUsageCount: 200,
    usedCount: 0,
    maxUsagePerCustomer: 1,
    isActive: true,
  }
};
