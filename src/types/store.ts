/**
 * Client-side domain types for the storefront and admin data layer.
 * Orders are created by the server only; the client reads them through `normalizeOrder`.
 */
import type { Product, ProductCategory } from '@/lib/catalog';
import type { OrderStatus } from '@/lib/orders/orderStateMachine';
import type { StaffRole } from '@/lib/auth/permissions';

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
}

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
