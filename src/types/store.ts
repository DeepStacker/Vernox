/**
 * Client-side domain types for the storefront and admin data layer.
 * Orders are created by the server only; the client reads them through `normalizeOrder`.
 */
import type { Product, ProductCategory } from '@/lib/catalog';
import type { OrderStatus } from '@/lib/orders/orderStateMachine';
import type { StaffRole } from '@/lib/auth/permissions';
import type { OrderOps } from './orderOps';

export type { Product, ProductCategory, OrderStatus };

export interface CategoryDoc {
  id: ProductCategory;
  name: string;
  description: string;
}

export interface CustomerAccount {
  uid?: string;
  email: string;
  phone?: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  isGoogleUser?: boolean;
  createdAt?: number | string;
}

export interface Topic {
  id: string;
  title: string;
  category: string;
  content: string;
  readTime: string;
  date: string;
}

export interface Review {
  id: string;
  productId: string;
  customerName: string;
  customerRole?: string;
  location?: string;
  rating: number;
  comment: string;
  placedAt: number;
  verified?: boolean;
  featured?: boolean;
  helpfulCount?: number;
  status?: 'published' | 'pending' | 'archived';
  conciergeResponse?: string;
  conciergeRespondedAt?: number;
}

export interface HeroSlide {
  id: string;
  image: string;
  series: string;
  location: string;
  featuredArtwork: string;
  artworkLink: string;
}

export interface HomepageSettings {
  heroTitle: string;
  heroSubtitle: string;
  heroSubtitleItalic: string;
  heroBadge: string;
  featuredProductIds: string[];
  manifestoItems: Array<{ icon: string; title: string; body: string }>;
  sectionsVisibility: Record<string, boolean>;
  sectionsOrder: string[];
  heroShapeId?: string;
  heroFinish?: string;
  heroSlides?: HeroSlide[];
}

/** Public store settings (`settings/store`). Display only: the server owns real pricing. */
export interface StoreConfig {
  storeName: string;
  currency: string;
  gstRatePercent: number;
  freeShippingThreshold: number;
  shippingFee: number;
  adminEmail?: string;
  /** Cash on delivery (display; the server enforces eligibility). */
  codEnabled?: boolean;
  codFee?: number;
  codMaxOrderValue?: number;
  returnWindowDays?: number;
  defaultLeadTimeDays?: number;
  customLeadTimeDays?: number;
  /** Supplier block printed on GST invoices (public business details only). */
  seller?: Partial<SellerSettings>;
  /** Storefront contact details. */
  whatsappNumber?: string;
  supportPhone?: string;
  supportEmail?: string;
  supportHours?: string;
  workshopAddress?: string;
}

import type { SellerSettings } from './settings';
export type { SellerSettings, StoreSettingsDoc } from './settings';

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  shapeId: string;
  sizeLabel: string;
  widthMm: number;
  heightMm: number;
  finish: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  customDesignThumb?: string;
  /** Full design JSON written by the Crafting Studio (see editor/TopBar). */
  customDesignRef?: string;
  userUploadedImage?: string;
  uploadedArtworkName?: string;
}

export type PaymentStatus = 'Authorized' | 'Paid' | 'Pending' | 'Refunded';

export interface StatusHistoryEntry {
  status: OrderStatus;
  at: number;
  by: string;
}

export interface OrderTracking {
  carrier?: string;
  trackingNumber?: string;
  url?: string;
  estimatedDelivery?: string;
}

export interface Order {
  id: string;
  orderNumber?: string;
  userId?: string;
  email: string;
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  placedAt: number;
  updatedAt?: number;
  items: OrderItem[];
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  total: number;
  couponCode?: string;
  customerName?: string;
  phone?: string;
  shippingAddress?: string;
  shippingCity?: string;
  shippingState?: string;
  shippingPincode?: string;
  shippingCountry?: string;
  tracking?: OrderTracking;
  assignedTo?: string;
  adminNotes?: string;
  statusHistory: StatusHistoryEntry[];
  /** Staff-only money, payment and shipment fields; present when the document carries them (orderOps.ts). */
  ops?: OrderOps;
}

/** Server response for GET /api/order-status (public, no PII beyond the caller's own email). */
export interface PublicOrderSummary {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  placedAt?: number;
  total?: number;
  currency?: string;
  items?: Array<{ productId?: string; name: string; quantity: number; lineTotal?: number }>;
  tracking?: OrderTracking;
  statusHistory?: Array<{ status: OrderStatus; at: number }>;
  shippingCity?: string;
  shippingState?: string;
  /** Phase 2 fields of the API response (see API.md, GET /api/order-status). */
  paymentMethod?: 'prepaid' | 'cod' | 'replacement';
  /** Set once the order is dispatched; download via GET /api/invoice. */
  invoiceNumber?: string | null;
  /** True while the customer may still cancel online (POST /api/order-cancel). */
  canCancel?: boolean;
  /** Epoch ms until which POST /api/return-request is accepted, or null. */
  returnEligibleUntil?: number | null;
  /** COD fee in rupees (0 for prepaid). */
  codFee?: number;
}

export interface StaffMember {
  uid: string;
  email: string;
  name?: string;
  role: StaffRole;
  disabled?: boolean;
}

export interface AuditEntry {
  id: string;
  timestamp: number;
  adminEmail: string;
  adminName?: string;
  adminRole?: string;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
  ip?: string;
}
