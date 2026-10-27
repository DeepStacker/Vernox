import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { z } from 'zod';
import { products as defaultProducts, categories as defaultCategories, Product, ProductCategory } from './catalog';
export type { Product, ProductCategory };

import { auth, db, googleProvider } from './firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import type { Coupon, CouponUsage } from '@/types/coupon';
import type { AdminUser, AdminRole, AuditLog, AuditTargetType } from '@/types/admin';
import { LAUNCH_COUPONS } from '@/types/coupon';

// Passphrase Salting & Hashing Helper
export function hashPassphrase(passphrase: string): string {
  let hash = 0x811c9dc5;
  const salt = "vernox-atelier-salt-2026";
  const salted = passphrase + salt;
  for (let i = 0; i < salted.length; i++) {
    hash ^= salted.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

export interface CustomerAccount {
  email: string;
  phone?: string;
  passwordHash?: string;
  name: string;
  address?: string;
  city?: string;
  zip?: string;
  country?: string;
  isGoogleUser?: boolean;
  role?: 'admin' | 'customer';
  isAdmin?: boolean;
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

import { defaultReviews } from './reviewsData';

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

export type OrderStatus = 'Pending' | 'Pending_Payment' | 'Paid' | 'Designing' | 'Cutting' | 'Finished' | 'Shipped' | 'Delivered' | 'Cancelled';

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
  customDesignThumb?: string;
  customDesignRef?: string;
  userUploadedImage?: string; // Client reference artwork uploaded in Crafting Studio
  uploadedArtworkName?: string;
}

export type PaymentStatus = 'Authorized' | 'Paid' | 'Pending' | 'Refunded';
export type FulfillmentStatus = 'Unfulfilled' | 'Partially Fulfilled' | 'Fulfilled';

export interface Order {
  id: string;
  total: number;
  placedAt: number;
  createdAt?: number | string;
  email: string;
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  fulfillmentStatus?: FulfillmentStatus;
  items: OrderItem[];
  shippingName?: string;
  shippingAddress?: string;
  shippingCity?: string;
  shippingZip?: string;
  shippingCountry?: string;
  trackingCarrier?: string;
  trackingNumber?: string;
  estimatedDelivery?: string;
  adminNotes?: string;
  trafficSource?: 'Direct' | 'Search' | 'Social' | 'Referrals' | 'Email';
  socialSource?: 'Facebook' | 'Instagram' | 'Twitter' | 'Pinterest' | 'Reddit';
  deviceType?: 'Desktop' | 'Mobile' | 'Tablet';
  couponCode?: string;
  discountTotal?: number;
  customerName?: string;
  phone?: string;
}

export interface StoreConfig {
  storeName: string;
  currency: string;
  taxRate: number;
  freeShippingThreshold: number;
  shippingFee: number;
  adminPassphraseHash?: string;
  adminEmail?: string;
}

interface CatalogCtx {
  products: Product[];
  categories: { id: ProductCategory; name: string; description: string }[];
  homepageSettings: HomepageSettings;
  orders: Order[];
  topics: Topic[];
  storeConfig: StoreConfig;
  reviews: Review[];
  wishlist: string[];
  isAdmin: boolean;
  loginAdmin: (email: string, pass: string) => Promise<boolean>;
  
  // Product Actions
  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  getProductBySlug: (slug: string) => Product | undefined;
  
  // Category Actions
  addCategory: (category: { id: ProductCategory; name: string; description: string }) => void;
  updateCategory: (id: string, updates: Partial<{ id: ProductCategory; name: string; description: string }>) => void;
  deleteCategory: (id: string) => void;
  
  // Homepage Actions
  updateHomepageSettings: (updates: Partial<HomepageSettings>) => void;
  
  // Order Actions
  addOrder: (order: Omit<Order, 'status'> & { status?: OrderStatus }) => void;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  updateOrder: (orderId: string, updates: Partial<Order>) => void;
  deleteOrder: (orderId: string) => void;
  
  // Topic Actions
  addTopic: (topic: Omit<Topic, 'id'>) => void;
  updateTopic: (id: string, updates: Partial<Topic>) => void;
  deleteTopic: (id: string) => void;

  // Configuration Actions
  updateStoreConfig: (updates: Partial<StoreConfig>) => void;
  verifyAdminPassphrase: (passphrase: string) => boolean;

  // Review Actions
  addReview: (review: Omit<Review, 'id'>) => Promise<void>;
  updateReview: (id: string, updates: Partial<Review>) => Promise<boolean>;
  deleteReview: (id: string) => Promise<void>;
  toggleReviewFeatured: (id: string) => Promise<boolean>;
  toggleReviewVerified: (id: string) => Promise<boolean>;
  replyToReview: (id: string, response: string) => Promise<boolean>;

  // Wishlist Actions
  toggleWishlist: (productId: string) => Promise<void>;
  isInWishlist: (productId: string) => boolean;

  // DB Import with Validation
  importDatabase: (jsonData: string) => { success: boolean; error?: string };
  
  // Customer Auth Actions
  currentCustomer: CustomerAccount | null;
  loginCustomer: (emailOrPhone: string, pass: string) => Promise<boolean>;
  loginWithGoogleMock: (name: string, email: string) => Promise<void>;
  registerCustomer: (account: Omit<CustomerAccount, 'passwordHash'> & { password?: string }) => Promise<boolean>;
  logoutCustomer: () => Promise<void>;
  updateCustomerProfile: (updates: Partial<CustomerAccount>) => Promise<void>;

  // Enterprise Coupon & Discount System
  coupons: Coupon[];
  couponUsages: CouponUsage[];
  createCoupon: (coupon: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'usedCount'>) => Promise<boolean>;
  updateCoupon: (id: string, updates: Partial<Coupon>) => Promise<boolean>;
  deleteCoupon: (id: string) => Promise<boolean>;
  toggleCouponStatus: (id: string, isActive: boolean) => Promise<boolean>;

  // Enterprise Admin RBAC & Audit
  adminUsers: AdminUser[];
  currentAdmin: AdminUser | null;
  adminRole: AdminRole;
  logoutAdmin: () => void;
  logAdminAudit: (action: string, targetType: AuditTargetType, targetId: string, details?: Record<string, any>) => Promise<void>;
  fetchAuditLogs: (targetType?: string) => Promise<AuditLog[]>;
  createAdminUser: (email: string, name: string, role: AdminRole) => Promise<boolean>;
  updateAdminRole: (adminId: string, role: AdminRole, status: 'active' | 'suspended') => Promise<boolean>;

  // Customers & Stock
  customers: CustomerAccount[];
  updateStock: (productId: string, newStock: number) => Promise<void>;

  // Reset
  resetAll: () => void;
}

const CatalogContext = createContext<CatalogCtx | null>(null);

// Validation Schemas
const ProductZSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  tagline: z.string(),
  description: z.string(),
  category: z.string(),
  price: z.number(),
  shapeId: z.string(),
  finishes: z.array(z.string()),
  sizes: z.array(z.object({
    label: z.string(),
    widthMm: z.number(),
    heightMm: z.number(),
    priceDelta: z.number()
  })),
  featured: z.boolean().optional(),
  bestseller: z.boolean().optional(),
  isNew: z.boolean().optional(),
  customizable: z.boolean().optional()
});

const CategoryZSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string()
});

const TopicZSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  content: z.string(),
  readTime: z.string(),
  date: z.string()
});

const OrderItemZSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  productSlug: z.string(),
  shapeId: z.string(),
  sizeLabel: z.string(),
  widthMm: z.number(),
  heightMm: z.number(),
  finish: z.string(),
  unitPrice: z.number(),
  quantity: z.number(),
  customDesignThumb: z.string().optional(),
  customDesignRef: z.string().optional(),
  userUploadedImage: z.string().optional(),
  uploadedArtworkName: z.string().optional()
});

const OrderZSchema = z.object({
  id: z.string(),
  total: z.number(),
  placedAt: z.number(),
  email: z.string().email(),
  status: z.enum(['Pending', 'Designing', 'Cutting', 'Finished', 'Shipped', 'Delivered']),
  items: z.array(OrderItemZSchema),
  shippingName: z.string().optional(),
  shippingAddress: z.string().optional(),
  shippingCity: z.string().optional(),
  shippingZip: z.string().optional(),
  shippingCountry: z.string().optional(),
  trackingCarrier: z.string().optional(),
  trackingNumber: z.string().optional(),
  estimatedDelivery: z.string().optional(),
  adminNotes: z.string().optional()
});

const HeroSlideZSchema = z.object({
  id: z.string(),
  image: z.string(),
  series: z.string(),
  location: z.string(),
  featuredArtwork: z.string(),
  artworkLink: z.string()
});

const HomepageSettingsZSchema = z.object({
  heroTitle: z.string(),
  heroSubtitle: z.string(),
  heroSubtitleItalic: z.string(),
  heroBadge: z.string(),
  featuredProductIds: z.array(z.string()),
  manifestoItems: z.array(z.object({
    icon: z.string(),
    title: z.string(),
    body: z.string()
  })),
  sectionsVisibility: z.record(z.boolean()),
  sectionsOrder: z.array(z.string()),
  heroShapeId: z.string().optional(),
  heroFinish: z.string().optional(),
  heroSlides: z.array(HeroSlideZSchema).optional()
});

const StoreConfigZSchema = z.object({
  storeName: z.string(),
  currency: z.string(),
  taxRate: z.number(),
  freeShippingThreshold: z.number(),
  shippingFee: z.number(),
  adminPassphraseHash: z.string().optional(),
  adminEmail: z.string().optional()
});

const DatabaseZSchema = z.object({
  products: z.array(ProductZSchema).optional(),
  categories: z.array(CategoryZSchema).optional(),
  homepageSettings: HomepageSettingsZSchema.optional(),
  orders: z.array(OrderZSchema).optional(),
  topics: z.array(TopicZSchema).optional(),
  storeConfig: StoreConfigZSchema.optional()
});

export const DEFAULT_HERO_SLIDES: HeroSlide[] = [
  {
    id: 'slide-01',
    image: '/images/hero-nocturne-living.jpg',
    series: 'THE NOCTURNE SERIES · 2026',
    location: 'Antwerp Penthouse Residence',
    featuredArtwork: 'Abstract Horizon Impasto',
    artworkLink: '/product/abstract-horizon',
  },
  {
    id: 'slide-02',
    image: '/images/hero-art-lounge.jpg',
    series: 'THE HORIZON SALON · 2026',
    location: 'Milanese Gallery Lounge',
    featuredArtwork: 'Golden Silence & Sculptural Form',
    artworkLink: '/product/golden-silence',
  },
  {
    id: 'slide-03',
    image: '/images/hero-penthouse-brass.jpg',
    series: 'BRUTALIST RELIEF · 2026',
    location: 'Zurich Lakefront Atelier',
    featuredArtwork: 'Textured Canvas & Solid Plate',
    artworkLink: '/product/textured-canvas',
  },
  {
    id: 'slide-04',
    image: '/images/statement-piece.jpg',
    series: 'ARCHITECTURAL MONOLITH · 2026',
    location: 'Geneva Executive Residence',
    featuredArtwork: 'Contemporary Bloom & Bronze Figure',
    artworkLink: '/product/contemporary-bloom',
  },
];

const DEFAULT_HOMEPAGE_SETTINGS: HomepageSettings = {
  heroTitle: "Metal, quietly held on the wall.",
  heroSubtitle: "Wall pieces cut from Belgian steel, finished by hand in oxblood-patinated brass and warm copper. Ready-made, or shape one that is entirely yours.",
  heroSubtitleItalic: "quietly",
  heroBadge: "Antwerp Atelier · Est. 2019",
  featuredProductIds: ['p-01', 'p-06', 'p-08'],
  manifestoItems: [
    { icon: 'Hammer', title: 'Cut in Antwerp', body: 'Every piece leaves one workshop, signed on the reverse.' },
    { icon: 'Compass', title: 'Yours, precisely', body: 'Change a millimetre, a metal, a monogram — live, in-browser.' },
    { icon: 'Flame', title: 'Ten-day lead', body: 'From raw sheet to your wall in under a fortnight.' },
  ],
  sectionsVisibility: {
    hero: true,
    manifesto: true,
    collections: true,
    featured: true,
    installations: true,
    story: true,
    'b2b-trade': true,
    authenticity: true,
    metallurgy: true,
    bestsellers: true,
    topics: true,
    'studio-cta': true
  },
  sectionsOrder: ['hero', 'manifesto', 'collections', 'featured', 'installations', 'story', 'b2b-trade', 'authenticity', 'metallurgy', 'bestsellers', 'topics', 'studio-cta'],
  heroShapeId: 'starburst',
  heroFinish: 'brass',
  heroSlides: DEFAULT_HERO_SLIDES
};

const DEFAULT_TOPICS: Topic[] = [
  {
    id: 't-1',
    title: 'Selecting the Perfect Metal Finish',
    category: 'Design Guide',
    content: 'Choosing the right finish for your metal art is key. Blackened steel offers a heavy, industrial, raw appearance with deep shading. Antique brass and warm gold bring a warm, light-catching glow to elegant monograms and geometric displays. Corten steel slowly patinates over months, creating a beautiful weathered copper-rust texture perfect for nature silhouettes outdoors.',
    readTime: '4 min read',
    date: 'July 10, 2026'
  },
  {
    id: 't-2',
    title: 'The Art of Fibre Laser Cutting',
    category: 'Workshop Notes',
    content: 'At the heart of the Antwerp atelier is our high-capacity fibre laser cutter. Operating at a micron level of accuracy, it slices 3mm high-grade Belgian sheet steel in seconds. Because of the precision beam, the cuts are extremely clean, requiring only minor manual brushing, ensuring every curve remains smooth and laser-sharp without distortion.',
    readTime: '6 min read',
    date: 'June 15, 2026'
  }
];

export function buildDefaultAtelierOrders(): Order[] {
  const now = Date.now();
  const hour = 3600 * 1000;
  const day = 24 * hour;

  return [
    // Today / Last 24 Hours
    {
      id: 'VX-89241',
      total: 485.0,
      placedAt: now - Math.round(2.5 * hour),
      createdAt: new Date(now - Math.round(2.5 * hour)).toISOString(),
      email: 'elena.rostova@atelier-v.com',
      status: 'Designing',
      paymentStatus: 'Paid',
      fulfillmentStatus: 'Partially Fulfilled',
      shippingName: 'Elena Rostova',
      shippingAddress: '42 Avenue Louise, Penthouse 8B',
      shippingCity: 'Brussels',
      shippingZip: '1050',
      shippingCountry: 'Belgium',
      trackingCarrier: 'Antwerp White-Glove Courier',
      trafficSource: 'Direct',
      deviceType: 'Desktop',
      adminNotes: 'Client uploaded custom heraldic crest artwork in Crafting Studio. Requires 3.0mm Brushed Antique Brass plate with flush countersunk standoffs.',
      items: [
        {
          id: 'item-custom-01',
          productId: 'custom-bespoke',
          productName: 'Bespoke Crest (Rostova Monogram Heraldry)',
          productSlug: 'custom-bespoke',
          shapeId: 'arch_monolith',
          sizeLabel: '300mm × 450mm',
          widthMm: 300,
          heightMm: 450,
          finish: 'antique_brass',
          unitPrice: 485.0,
          quantity: 1,
          userUploadedImage: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="%231b1412" rx="12"/><path d="M 150 40 L 220 80 L 220 180 Q 150 260 150 260 Q 80 180 80 180 L 80 80 Z" fill="none" stroke="%23d4af37" stroke-width="4"/><path d="M 150 70 L 195 100 L 195 170 Q 150 230 150 230 Q 105 170 105 170 L 105 100 Z" fill="%23d4af37" fill-opacity="0.15" stroke="%23d4af37" stroke-width="2"/><text x="150" y="170" font-family="serif" font-size="70" font-weight="bold" fill="%23d4af37" text-anchor="middle">R</text><path d="M 130 90 L 170 90 M 150 75 L 150 105" stroke="%23d4af37" stroke-width="3"/></svg>',
          uploadedArtworkName: 'Rostova_Family_Heraldic_Crest_Original.svg',
          customDesignThumb: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><path d="M 0 50 Q 150 0 300 50 L 300 450 L 0 450 Z" fill="none" stroke="%23ef4444" stroke-width="2"/><circle cx="20" cy="65" r="4" fill="none" stroke="%23ef4444" stroke-width="1.5"/><circle cx="280" cy="65" r="4" fill="none" stroke="%23ef4444" stroke-width="1.5"/><circle cx="20" cy="430" r="4" fill="none" stroke="%23ef4444" stroke-width="1.5"/><circle cx="280" cy="430" r="4" fill="none" stroke="%23ef4444" stroke-width="1.5"/><path d="M 150 140 L 210 175 L 210 260 Q 150 330 150 330 Q 90 260 90 260 L 90 175 Z" fill="none" stroke="%23ef4444" stroke-width="2"/></svg>',
          customDesignRef: '{"version":"3.0.0","documentId":"vdm-rostova-001","boundary":{"widthMm":300,"heightMm":450,"shapeTemplateId":"arch_monolith","pathData":"M 0 50 Q 150 0 300 50 L 300 450 L 0 450 Z"},"material":{"substrate":"brass_cz108","thicknessMm":3.0,"finish":"antique_brass"}}',
        }
      ]
    },
    {
      id: 'VX-89240',
      total: 620.0,
      placedAt: now - Math.round(6.5 * hour),
      createdAt: new Date(now - Math.round(6.5 * hour)).toISOString(),
      email: 'julian.sterling@manhattan-penthouse.com',
      status: 'Cutting',
      paymentStatus: 'Paid',
      fulfillmentStatus: 'Partially Fulfilled',
      shippingName: 'Julian Alexander Sterling',
      shippingAddress: '740 Park Avenue, Floor 18',
      shippingCity: 'New York',
      shippingZip: '10021',
      shippingCountry: 'United States',
      trackingCarrier: 'Antwerp White-Glove Courier',
      trafficSource: 'Social',
      socialSource: 'Instagram',
      deviceType: 'Desktop',
      adminNotes: 'Architectural wall installation in blackened steel. 3.0mm Belgian steel with chamfered perimeter bevel.',
      items: [
        {
          id: 'item-89240-01',
          productId: 'p-08',
          productName: 'Metropolitan Horizon Silhouette',
          productSlug: 'metropolitan-horizon',
          shapeId: 'rectangle',
          sizeLabel: '1200mm × 500mm',
          widthMm: 1200,
          heightMm: 500,
          finish: 'blackened_steel',
          unitPrice: 620.0,
          quantity: 1,
        }
      ]
    },
    {
      id: 'VX-89239',
      total: 390.0,
      placedAt: now - Math.round(10.5 * hour),
      createdAt: new Date(now - Math.round(10.5 * hour)).toISOString(),
      email: 'clara.vonberg@zurich-art.ch',
      status: 'Paid',
      paymentStatus: 'Paid',
      fulfillmentStatus: 'Unfulfilled',
      shippingName: 'Clara von Berg',
      shippingAddress: 'Bahnhofstrasse 45',
      shippingCity: 'Zurich',
      shippingZip: '8001',
      shippingCountry: 'Switzerland',
      trafficSource: 'Search',
      deviceType: 'Mobile',
      adminNotes: 'Zurich residence salon project. Polished copper arch monolith with brushed brass finish highlights.',
      items: [
        {
          id: 'item-89239-01',
          productId: 'p-03',
          productName: 'Geometric Arch Monolith',
          productSlug: 'geometric-arch',
          shapeId: 'arch_monolith',
          sizeLabel: '450mm × 750mm',
          widthMm: 450,
          heightMm: 750,
          finish: 'polished_copper',
          unitPrice: 390.0,
          quantity: 1,
        }
      ]
    },

    // Yesterday (24h - 48h ago)
    {
      id: 'VX-89218',
      total: 320.0,
      placedAt: now - Math.round(26 * hour),
      createdAt: new Date(now - Math.round(26 * hour)).toISOString(),
      email: 'marcus.vanderbilt@lumina-arch.com',
      status: 'Pending',
      paymentStatus: 'Authorized',
      fulfillmentStatus: 'Unfulfilled',
      shippingName: 'Marcus Vanderbilt',
      shippingAddress: 'Studio Pickup - Antwerp Metalworks Dock 4',
      shippingCity: 'Antwerp',
      shippingZip: '2000',
      shippingCountry: 'Belgium',
      trafficSource: 'Search',
      deviceType: 'Desktop',
      adminNotes: 'Bespoke Lumina Starburst logo uploaded via Studio Lasso crop tool. Corten weathering finish.',
      items: [
        {
          id: 'item-custom-02',
          productId: 'custom-bespoke',
          productName: 'Bespoke Starburst Architectural Sign',
          productSlug: 'custom-bespoke',
          shapeId: 'circle',
          sizeLabel: '400mm × 400mm',
          widthMm: 400,
          heightMm: 400,
          finish: 'corten_rust',
          unitPrice: 320.0,
          quantity: 1,
          userUploadedImage: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="%23261a15" rx="12"/><polygon points="150,30 180,110 260,110 195,160 220,240 150,190 80,240 105,160 40,110 120,110" fill="%23c27ba0" stroke="%23e8c2ca" stroke-width="3"/><circle cx="150" cy="150" r="30" fill="%23261a15" stroke="%23e8c2ca" stroke-width="2"/></svg>',
          uploadedArtworkName: 'Lumina_Studio_Starburst_Cropped.png',
          customDesignThumb: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><circle cx="150" cy="150" r="140" fill="none" stroke="%23ef4444" stroke-width="2"/><polygon points="150,50 175,115 245,115 185,160 210,230 150,185 90,230 115,160 55,115 125,115" fill="none" stroke="%23ef4444" stroke-width="2"/></svg>',
          customDesignRef: '{"version":"3.0.0","documentId":"vdm-starburst-002","boundary":{"widthMm":400,"heightMm":400,"shapeTemplateId":"circle","pathData":"M 150 10 A 140 140 0 1 1 149.9 10 Z"},"material":{"substrate":"corten_weathering","thicknessMm":3.0,"finish":"corten_rust"}}',
        }
      ]
    },
    {
      id: 'VX-89215',
      total: 840.0,
      placedAt: now - Math.round(35 * hour),
      createdAt: new Date(now - Math.round(35 * hour)).toISOString(),
      email: 'henri.montmirail@paris-art.fr',
      status: 'Cutting',
      paymentStatus: 'Paid',
      fulfillmentStatus: 'Partially Fulfilled',
      shippingName: 'Henri de Montmirail',
      shippingAddress: '28 Boulevard Saint-Germain',
      shippingCity: 'Paris',
      shippingZip: '75005',
      shippingCountry: 'France',
      trafficSource: 'Referrals',
      deviceType: 'Desktop',
      adminNotes: 'Architectural twin panel installation. Requires antique brass patination with hand-burnished edge bevels.',
      items: [
        {
          id: 'item-89215-01',
          productId: 'p-01',
          productName: 'Aura of Dawn Brass Wallpiece',
          productSlug: 'aura-of-dawn',
          shapeId: 'circle',
          sizeLabel: '600mm × 600mm',
          widthMm: 600,
          heightMm: 600,
          finish: 'antique_brass',
          unitPrice: 515.0,
          quantity: 1,
        },
        {
          id: 'item-89215-02',
          productId: 'p-04',
          productName: 'Abstract Starburst Emblem',
          productSlug: 'abstract-starburst',
          shapeId: 'starburst',
          sizeLabel: '300mm × 300mm',
          widthMm: 300,
          heightMm: 300,
          finish: 'antique_brass',
          unitPrice: 325.0,
          quantity: 1,
        }
      ]
    },

    // Last 7 Days (2 - 7 days ago)
    {
      id: '#195867',
      total: 515.0,
      placedAt: now - Math.round(2.6 * day),
      createdAt: new Date(now - Math.round(2.6 * day)).toISOString(),
      email: 'theodore.henry@montreal-luxe.ca',
      status: 'Shipped',
      paymentStatus: 'Paid',
      fulfillmentStatus: 'Fulfilled',
      shippingName: 'Theodore William Henry',
      shippingAddress: '1420 Rue Sherbrooke Ouest, Suite 902',
      shippingCity: 'Montreal',
      shippingZip: 'H3G 1K4',
      shippingCountry: 'Canada',
      trackingCarrier: 'FedEx Luxury International',
      trackingNumber: 'FDX-882190102CA',
      trafficSource: 'Direct',
      deviceType: 'Desktop',
      adminNotes: 'Large bespoke architectural statement piece. Authorized via credit payment gateway.',
      items: [
        {
          id: 'item-195867-01',
          productId: 'p-01',
          productName: 'Aura of Dawn Brass Wallpiece',
          productSlug: 'aura-of-dawn',
          shapeId: 'circle',
          sizeLabel: '600mm × 600mm',
          widthMm: 600,
          heightMm: 600,
          finish: 'antique_brass',
          unitPrice: 515.0,
          quantity: 1,
        }
      ]
    },
    {
      id: '#195866',
      total: 354.06,
      placedAt: now - Math.round(4.3 * day),
      createdAt: new Date(now - Math.round(4.3 * day)).toISOString(),
      email: 'persephone.jane@manhattanloft.com',
      status: 'Shipped',
      paymentStatus: 'Paid',
      fulfillmentStatus: 'Fulfilled',
      shippingName: 'Persephone Alexandra Jane',
      shippingAddress: '432 Park Avenue, Apt 54A',
      shippingCity: 'New York',
      shippingZip: '10022',
      shippingCountry: 'United States',
      trackingCarrier: 'DHL Express Luxury',
      trackingNumber: 'DHL-992102910US',
      trafficSource: 'Social',
      socialSource: 'Instagram',
      deviceType: 'Mobile',
      adminNotes: 'Precision fiber laser cutting completed at Antwerp facility. Shipped with velvet packaging.',
      items: [
        {
          id: 'item-195866-01',
          productId: 'p-06',
          productName: 'Contemporary Bloom & Bronze Figure',
          productSlug: 'contemporary-bloom',
          shapeId: 'arch_monolith',
          sizeLabel: '400mm × 650mm',
          widthMm: 400,
          heightMm: 650,
          finish: 'oxblood_brass',
          unitPrice: 354.06,
          quantity: 1,
        }
      ]
    },
    {
      id: '#195865',
      total: 721.0,
      placedAt: now - Math.round(6.1 * day),
      createdAt: new Date(now - Math.round(6.1 * day)).toISOString(),
      email: 'lysander.james@vancouverdesign.ca',
      status: 'Delivered',
      paymentStatus: 'Paid',
      fulfillmentStatus: 'Fulfilled',
      shippingName: 'Lysander Oliver James',
      shippingAddress: '1077 West Cordova St, Penthouse 3',
      shippingCity: 'Vancouver',
      shippingZip: 'V6C 2C6',
      shippingCountry: 'Canada',
      trafficSource: 'Search',
      deviceType: 'Desktop',
      trackingCarrier: 'FedEx International Luxury Care',
      trackingNumber: 'FDX-7749204192',
      estimatedDelivery: 'Yesterday',
      adminNotes: 'Signed proof of delivery collected. Standoff mounting hardware included.',
      items: [
        {
          id: 'item-195865-01',
          productId: 'p-08',
          productName: 'Metropolitan Horizon Silhouette',
          productSlug: 'metropolitan-horizon',
          shapeId: 'rectangle',
          sizeLabel: '1200mm × 500mm',
          widthMm: 1200,
          heightMm: 500,
          finish: 'blackened_steel',
          unitPrice: 721.0,
          quantity: 1,
        }
      ]
    },

    // Last 30 Days (7 - 30 days ago)
    {
      id: '#195864',
      total: 185.0,
      placedAt: now - Math.round(11.5 * day),
      createdAt: new Date(now - Math.round(11.5 * day)).toISOString(),
      email: 'percival.thomas@kensington-residence.co.uk',
      status: 'Delivered',
      paymentStatus: 'Paid',
      fulfillmentStatus: 'Fulfilled',
      shippingName: 'Percival Benedict Thomas',
      shippingAddress: '18 Kensington Palace Gardens',
      shippingCity: 'London',
      shippingZip: 'W8 4PX',
      shippingCountry: 'United Kingdom',
      trafficSource: 'Direct',
      deviceType: 'Desktop',
      trackingCarrier: 'Royal Mail Special Delivery',
      trackingNumber: 'RM-449102830GB',
      items: [
        {
          id: 'item-195864-01',
          productId: 'p-02',
          productName: 'Celestial Orb Mirror Frame',
          productSlug: 'celestial-orb',
          shapeId: 'circle',
          sizeLabel: '350mm × 350mm',
          widthMm: 350,
          heightMm: 350,
          finish: 'polished_copper',
          unitPrice: 185.0,
          quantity: 1,
        }
      ]
    },
    {
      id: '#195863',
      total: 474.0,
      placedAt: now - Math.round(18.2 * day),
      createdAt: new Date(now - Math.round(18.2 * day)).toISOString(),
      email: 'leopold.edward@berlin-galerie.de',
      status: 'Delivered',
      paymentStatus: 'Paid',
      fulfillmentStatus: 'Fulfilled',
      shippingName: 'Leopold Percival Edward',
      shippingAddress: 'Kurfürstendamm 194',
      shippingCity: 'Berlin',
      shippingZip: '10707',
      shippingCountry: 'Germany',
      trafficSource: 'Social',
      socialSource: 'Facebook',
      deviceType: 'Desktop',
      adminNotes: 'SEPA Direct Debit verified. Handcrafted and installed in gallery foyer.',
      items: [
        {
          id: 'item-195863-01',
          productId: 'p-03',
          productName: 'Geometric Arch Monolith',
          productSlug: 'geometric-arch',
          shapeId: 'arch_monolith',
          sizeLabel: '450mm × 750mm',
          widthMm: 450,
          heightMm: 750,
          finish: 'corten_rust',
          unitPrice: 474.0,
          quantity: 1,
        }
      ]
    },
    {
      id: '#195862',
      total: 136.0,
      placedAt: now - Math.round(26.5 * day),
      createdAt: new Date(now - Math.round(26.5 * day)).toISOString(),
      email: 'rosalind.maeve@torontodesign.ca',
      status: 'Delivered',
      paymentStatus: 'Paid',
      fulfillmentStatus: 'Fulfilled',
      shippingName: 'Rosalind Clementine Maeve',
      shippingAddress: '88 Bloor St East, Suite 2104',
      shippingCity: 'Toronto',
      shippingZip: 'M4W 3G9',
      shippingCountry: 'Canada',
      trafficSource: 'Referrals',
      deviceType: 'Mobile',
      items: [
        {
          id: 'item-195862-01',
          productId: 'p-04',
          productName: 'Abstract Starburst Emblem',
          productSlug: 'abstract-starburst',
          shapeId: 'starburst',
          sizeLabel: '300mm × 300mm',
          widthMm: 300,
          heightMm: 300,
          finish: 'antique_brass',
          unitPrice: 136.0,
          quantity: 1,
        }
      ]
    },

    // Last 90 Days (30 - 90 days ago)
    {
      id: '#195859',
      total: 580.0,
      placedAt: now - Math.round(41.5 * day),
      createdAt: new Date(now - Math.round(41.5 * day)).toISOString(),
      email: 'genevieve.laurent@monaco-residence.mc',
      status: 'Delivered',
      paymentStatus: 'Paid',
      fulfillmentStatus: 'Fulfilled',
      shippingName: 'Geneviève Laurent',
      shippingAddress: '15 Boulevard de Suisse',
      shippingCity: 'Monaco',
      shippingZip: '98000',
      shippingCountry: 'Monaco',
      trafficSource: 'Direct',
      deviceType: 'Desktop',
      items: [
        {
          id: 'item-195859-01',
          productId: 'p-01',
          productName: 'Aura of Dawn Brass Wallpiece',
          productSlug: 'aura-of-dawn',
          shapeId: 'circle',
          sizeLabel: '600mm × 600mm',
          widthMm: 600,
          heightMm: 600,
          finish: 'antique_brass',
          unitPrice: 580.0,
          quantity: 1,
        }
      ]
    },
    {
      id: '#195855',
      total: 920.0,
      placedAt: now - Math.round(56.0 * day),
      createdAt: new Date(now - Math.round(56.0 * day)).toISOString(),
      email: 'kenzo.takahashi@ginza-arch.jp',
      status: 'Delivered',
      paymentStatus: 'Paid',
      fulfillmentStatus: 'Fulfilled',
      shippingName: 'Kenzo Takahashi',
      shippingAddress: 'Ginza 6-Chome, Chuo-ku',
      shippingCity: 'Tokyo',
      shippingZip: '104-0061',
      shippingCountry: 'Japan',
      trafficSource: 'Search',
      deviceType: 'Desktop',
      items: [
        {
          id: 'item-195855-01',
          productId: 'p-08',
          productName: 'Metropolitan Horizon Silhouette',
          productSlug: 'metropolitan-horizon',
          shapeId: 'rectangle',
          sizeLabel: '1200mm × 500mm',
          widthMm: 1200,
          heightMm: 500,
          finish: 'blackened_steel',
          unitPrice: 920.0,
          quantity: 1,
        }
      ]
    },
    {
      id: '#195851',
      total: 410.0,
      placedAt: now - Math.round(72.5 * day),
      createdAt: new Date(now - Math.round(72.5 * day)).toISOString(),
      email: 'astrid.lindholm@stockholm-design.se',
      status: 'Delivered',
      paymentStatus: 'Paid',
      fulfillmentStatus: 'Fulfilled',
      shippingName: 'Astrid Lindholm',
      shippingAddress: 'Strandvägen 17',
      shippingCity: 'Stockholm',
      shippingZip: '114 56',
      shippingCountry: 'Sweden',
      trafficSource: 'Social',
      socialSource: 'Pinterest',
      deviceType: 'Mobile',
      items: [
        {
          id: 'item-195851-01',
          productId: 'p-06',
          productName: 'Contemporary Bloom & Bronze Figure',
          productSlug: 'contemporary-bloom',
          shapeId: 'arch_monolith',
          sizeLabel: '400mm × 650mm',
          widthMm: 400,
          heightMm: 650,
          finish: 'oxblood_brass',
          unitPrice: 410.0,
          quantity: 1,
        }
      ]
    },
    {
      id: '#195846',
      total: 675.0,
      placedAt: now - Math.round(84.0 * day),
      createdAt: new Date(now - Math.round(84.0 * day)).toISOString(),
      email: 'matteo.rossi@milan-design.it',
      status: 'Delivered',
      paymentStatus: 'Paid',
      fulfillmentStatus: 'Fulfilled',
      shippingName: 'Matteo Rossi',
      shippingAddress: 'Via Montenapoleone 8',
      shippingCity: 'Milan',
      shippingZip: '20121',
      shippingCountry: 'Italy',
      trafficSource: 'Direct',
      deviceType: 'Desktop',
      items: [
        {
          id: 'item-195846-01',
          productId: 'p-03',
          productName: 'Geometric Arch Monolith',
          productSlug: 'geometric-arch',
          shapeId: 'arch_monolith',
          sizeLabel: '450mm × 750mm',
          widthMm: 450,
          heightMm: 750,
          finish: 'corten_rust',
          unitPrice: 675.0,
          quantity: 1,
        }
      ]
    }
  ];
}

export const DEFAULT_ATELIER_ORDERS: Order[] = buildDefaultAtelierOrders();

const DEFAULT_STORE_CONFIG: StoreConfig = {
  storeName: "Vernox Atelier",
  currency: "₹",
  taxRate: 18,
  freeShippingThreshold: 150,
  shippingFee: 40,
  adminEmail: "concierge@vernoxatelier.com"
};

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('vernox-products');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Identify any default products missing from saved cache
          const existingIds = new Set(parsed.map((p: Product) => p.id));
          const missingDefaults = defaultProducts.filter(d => !existingIds.has(d.id));

          const updatedParsed = parsed.map((p: Product) => {
            const def = defaultProducts.find(d => d.id === p.id);
            return def ? { ...def, ...p, imageUrl: p.imageUrl || def.imageUrl, lifestyleImage: p.lifestyleImage || def.lifestyleImage, alloySpec: p.alloySpec || def.alloySpec } : p;
          });

          // Combined with defaultProducts order prioritized so prod-01 .. prod-08 stay at the top
          const combined = [...missingDefaults, ...updatedParsed];
          const defaultOrderMap = new Map(defaultProducts.map((p, idx) => [p.id, idx]));
          combined.sort((a, b) => {
            const orderA = defaultOrderMap.has(a.id) ? defaultOrderMap.get(a.id)! : 999;
            const orderB = defaultOrderMap.has(b.id) ? defaultOrderMap.get(b.id)! : 999;
            return orderA - orderB;
          });
          return combined;
        }
      }
      return defaultProducts;
    } catch {
      return defaultProducts;
    }
  });

  const [categories, setCategories] = useState<{ id: ProductCategory; name: string; description: string }[]>(() => {
    try {
      const saved = localStorage.getItem('vernox-categories');
      return saved ? JSON.parse(saved) : defaultCategories;
    } catch {
      return defaultCategories;
    }
  });

  const [homepageSettings, setHomepageSettings] = useState<HomepageSettings>(() => {
    try {
      const saved = localStorage.getItem('vernox-homepage');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Ensure new sections are incorporated if not already in saved order
        const baseOrder = DEFAULT_HOMEPAGE_SETTINGS.sectionsOrder;
        const savedOrder: string[] = parsed.sectionsOrder || [];
        const mergedOrder = [...savedOrder];
        for (const sec of baseOrder) {
          if (!mergedOrder.includes(sec)) {
            // Insert before bestsellers or push
            const bsIndex = mergedOrder.indexOf('bestsellers');
            if (bsIndex !== -1) {
              mergedOrder.splice(bsIndex, 0, sec);
            } else {
              mergedOrder.push(sec);
            }
          }
        }

        return {
          ...DEFAULT_HOMEPAGE_SETTINGS,
          ...parsed,
          sectionsVisibility: { ...DEFAULT_HOMEPAGE_SETTINGS.sectionsVisibility, ...(parsed.sectionsVisibility || {}) },
          sectionsOrder: mergedOrder,
          heroSlides: (Array.isArray(parsed.heroSlides) && parsed.heroSlides.length > 0) ? parsed.heroSlides : DEFAULT_HERO_SLIDES
        };
      }
      return DEFAULT_HOMEPAGE_SETTINGS;
    } catch {
      return DEFAULT_HOMEPAGE_SETTINGS;
    }
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem('vernox-orders');
      if (saved) {
        const rawOrders = JSON.parse(saved);
        if (Array.isArray(rawOrders) && rawOrders.length > 0) {
          const now = Date.now();
          // Check if cached orders contain recent orders (within 48 hours)
          const hasRecent = rawOrders.some((o: any) => {
            const t = o.placedAt || new Date(o.createdAt || 0).getTime();
            return (now - t) < 48 * 3600 * 1000;
          });

          if (hasRecent) {
            const existingIds = new Set(rawOrders.map((o: any) => o.id));
            const missingDefaults = DEFAULT_ATELIER_ORDERS.filter(d => !existingIds.has(d.id));
            const combined = [...rawOrders, ...missingDefaults];
            return combined.map((o: any) => ({
              ...o,
              status: o.status || 'Pending',
              paymentStatus: o.paymentStatus || (['Paid', 'Designing', 'Cutting', 'Finished', 'Shipped', 'Delivered'].includes(o.status) ? 'Paid' : o.status === 'Cancelled' ? 'Refunded' : 'Authorized'),
              fulfillmentStatus: o.fulfillmentStatus || (['Shipped', 'Delivered'].includes(o.status) ? 'Fulfilled' : ['Designing', 'Cutting', 'Finished'].includes(o.status) ? 'Partially Fulfilled' : 'Unfulfilled')
            }));
          }
        }
      }
      return DEFAULT_ATELIER_ORDERS;
    } catch {
      return DEFAULT_ATELIER_ORDERS;
    }
  });

  const [topics, setTopics] = useState<Topic[]>(() => {
    try {
      const saved = localStorage.getItem('vernox-topics');
      return saved ? JSON.parse(saved) : DEFAULT_TOPICS;
    } catch {
      return DEFAULT_TOPICS;
    }
  });

  const [storeConfig, setStoreConfig] = useState<StoreConfig>(() => {
    try {
      const saved = localStorage.getItem('vernox-store-config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.taxRate === 8) parsed.taxRate = 18;
        if (parsed.shippingFee === 15) parsed.shippingFee = 40;
        if (!parsed.currency || parsed.currency === '$') {
          parsed.currency = '₹';
          localStorage.setItem('vernox-store-config', JSON.stringify({ ...DEFAULT_STORE_CONFIG, ...parsed }));
        }
        return { ...DEFAULT_STORE_CONFIG, ...parsed };
      }
      return DEFAULT_STORE_CONFIG;
    } catch {
      return DEFAULT_STORE_CONFIG;
    }
  });

  const [currentCustomer, setCurrentCustomer] = useState<CustomerAccount | null>(null);

  // Enterprise Coupons State
  const [coupons, setCoupons] = useState<Coupon[]>(() => {
    try {
      const saved = localStorage.getItem('vernox-coupons');
      if (saved) return JSON.parse(saved);
    } catch {}
    return Object.values(LAUNCH_COUPONS).map(c => ({
      id: `launch-${c.code.toLowerCase()}`,
      ...c,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
  });

  const [couponUsages, setCouponUsages] = useState<CouponUsage[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(() => {
    try {
      const saved = sessionStorage.getItem('vernox-admin-user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [adminToken, setAdminToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('vernox-admin-token');
    } catch {
      return null;
    }
  });

  const [customers, setCustomers] = useState<CustomerAccount[]>(() => {
    try {
      const saved = localStorage.getItem('vernox-customers');
      const list: CustomerAccount[] = saved ? JSON.parse(saved) : [];
      const emailMap = new Map<string, CustomerAccount>();
      list.forEach(c => {
        if (c.email) emailMap.set(c.email.toLowerCase(), c);
      });

      // Populate from bespoke commission orders
      DEFAULT_ATELIER_ORDERS.forEach(o => {
        if (o.email && !emailMap.has(o.email.toLowerCase())) {
          emailMap.set(o.email.toLowerCase(), {
            email: o.email,
            name: o.shippingName || o.customerName || 'Atelier Patron',
            phone: o.phone || '+1 555-0192',
            address: typeof o.shippingAddress === 'string' ? o.shippingAddress : 'Private Atelier Residence',
            city: o.shippingCity || 'Mayfair',
            country: o.shippingCountry || 'United Kingdom',
            role: 'customer',
            createdAt: o.placedAt || Date.now(),
          });
        }
      });

      const result = Array.from(emailMap.values());
      try { localStorage.setItem('vernox-customers', JSON.stringify(result)); } catch {}
      return result;
    } catch {
      return [];
    }
  });
  const [reviews, setReviews] = useState<Review[]>(() => {
    try {
      const saved = localStorage.getItem('vernox-reviews');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const existingIds = new Set(parsed.map((r: Review) => r.id));
          const missingDefaults = defaultReviews.filter(d => !existingIds.has(d.id));
          return [...parsed, ...missingDefaults];
        }
      }
      return defaultReviews;
    } catch {
      return defaultReviews;
    }
  });

  // Persist reviews locally
  useEffect(() => {
    try {
      localStorage.setItem('vernox-reviews', JSON.stringify(reviews));
    } catch {}
  }, [reviews]);

  const [wishlist, setWishlist] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vernox-wishlist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Sync active customer changes into customer email for compatibility
  useEffect(() => {
    if (currentCustomer) {
      localStorage.setItem('vernox-customer-email', currentCustomer.email);
    } else {
      localStorage.removeItem('vernox-customer-email');
    }
  }, [currentCustomer]);

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const docRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data() as CustomerAccount;
            const email = (user.email || data.email || '').toLowerCase();
            const VERIFIED_ADMINS = [
              'admin@vernox.com',
              'concierge@vernoxatelier.com',
              (storeConfig?.adminEmail || '').toLowerCase()
            ].filter(Boolean);

            const isAdminUser = VERIFIED_ADMINS.includes(email) ||
                                Boolean(data.role === 'admin') ||
                                Boolean(data.isAdmin);

            setCurrentCustomer({
              ...data,
              email: user.email || data.email || '',
              phone: user.phoneNumber || data.phone || '',
              name: data.name || user.displayName || 'Atelier Customer',
              role: isAdminUser ? 'admin' : (data.role || 'customer'),
              isAdmin: isAdminUser
            });
          } else {
            const email = (user.email || '').toLowerCase();
            const VERIFIED_ADMINS = [
              'admin@vernox.com',
              'concierge@vernoxatelier.com',
              (storeConfig?.adminEmail || '').toLowerCase()
            ].filter(Boolean);
            const isAdminUser = VERIFIED_ADMINS.includes(email);

            // Write fallback document
            const fallbackProfile: CustomerAccount = {
              email: user.email || '',
              phone: user.phoneNumber || '',
              name: user.displayName || 'Atelier Customer',
              isGoogleUser: !!user.providerData.find(p => p.providerId === 'google.com'),
              role: isAdminUser ? 'admin' : 'customer',
              isAdmin: isAdminUser
            };
            try {
              await setDoc(docRef, fallbackProfile);
            } catch (writeErr) {
              console.warn("Notice: Firestore profile write deferred:", (writeErr as any)?.message || writeErr);
            }
            setCurrentCustomer(fallbackProfile);
          }
        } catch (e: any) {
          // Gracefully fallback to local profile when Firestore rules or network are offline
          console.debug("Using local customer profile fallback (Firestore offline or restricted):", e?.message || e);
          const email = (user.email || '').toLowerCase();
          const isAdminUser = email === 'admin@vernox.com' || email === 'concierge@vernoxatelier.com';
          const fallbackProfile: CustomerAccount = {
            email: user.email || '',
            phone: user.phoneNumber || '',
            name: user.displayName || 'Atelier Customer',
            isGoogleUser: !!user.providerData.find(p => p.providerId === 'google.com'),
            role: isAdminUser ? 'admin' : 'customer',
            isAdmin: isAdminUser
          };
          setCurrentCustomer(fallbackProfile);
        }
      } else {
        setCurrentCustomer(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Load and seed Firestore database collections in parallel
  useEffect(() => {
    let isCancelled = false;
    const syncFirestore = async () => {
      try {
        const [productsRes, categoriesRes, homepageRes, topicsRes, configRes, reviewsRes] = await Promise.allSettled([
          getDocs(collection(db, 'products')),
          getDocs(collection(db, 'categories')),
          getDoc(doc(db, 'settings', 'homepage')),
          getDocs(collection(db, 'topics')),
          getDoc(doc(db, 'config', 'store')),
          getDocs(collection(db, 'reviews'))
        ]);

        if (isCancelled) return;

        // 1. Products
        if (productsRes.status === 'fulfilled') {
          const productsSnap = productsRes.value;
          if (productsSnap.empty) {
            defaultProducts.forEach(p => { setDoc(doc(db, 'products', p.id), p).catch(() => {}); });
            setProducts(defaultProducts);
          } else {
            const firestoreProducts = productsSnap.docs.map(d => d.data() as Product);
            const existingIds = new Set(firestoreProducts.map(p => p.id));
            const missingDefaults = defaultProducts.filter(d => !existingIds.has(d.id));
            // Backfill Firestore with any missing default products (e.g. prod-01 .. prod-08)
            missingDefaults.forEach(p => { setDoc(doc(db, 'products', p.id), p).catch(() => {}); });

            const updatedFirestore = firestoreProducts.map((p: Product) => {
              const def = defaultProducts.find(d => d.id === p.id);
              return def ? { ...def, ...p, imageUrl: p.imageUrl || def.imageUrl, lifestyleImage: p.lifestyleImage || def.lifestyleImage, alloySpec: p.alloySpec || def.alloySpec } : p;
            });

            // Prioritize defaultProducts order so homepage creations appear first in collections
            const combined = [...missingDefaults, ...updatedFirestore];
            const defaultOrderMap = new Map(defaultProducts.map((p, idx) => [p.id, idx]));
            combined.sort((a, b) => {
              const orderA = defaultOrderMap.has(a.id) ? defaultOrderMap.get(a.id)! : 999;
              const orderB = defaultOrderMap.has(b.id) ? defaultOrderMap.get(b.id)! : 999;
              return orderA - orderB;
            });
            setProducts(combined);
          }
        }

        // 2. Categories
        if (categoriesRes.status === 'fulfilled') {
          const categoriesSnap = categoriesRes.value;
          if (categoriesSnap.empty) {
            defaultCategories.forEach(c => { setDoc(doc(db, 'categories', c.id), c).catch(() => {}); });
            setCategories(defaultCategories);
          } else {
            setCategories(categoriesSnap.docs.map(d => d.data() as any));
          }
        }

        // 3. Homepage Settings
        if (homepageRes.status === 'fulfilled') {
          const homepageDoc = homepageRes.value;
          if (!homepageDoc.exists()) {
            setDoc(doc(db, 'settings', 'homepage'), DEFAULT_HOMEPAGE_SETTINGS).catch(() => {});
            setHomepageSettings(DEFAULT_HOMEPAGE_SETTINGS);
          } else {
            const data = homepageDoc.data() as HomepageSettings;
            if (!data.heroSlides || !Array.isArray(data.heroSlides) || data.heroSlides.length === 0) {
              data.heroSlides = DEFAULT_HERO_SLIDES;
            }
            setHomepageSettings(data);
          }
        }

        // 4. Topics
        if (topicsRes.status === 'fulfilled') {
          const topicsSnap = topicsRes.value;
          if (topicsSnap.empty) {
            DEFAULT_TOPICS.forEach(t => { setDoc(doc(db, 'topics', t.id), t).catch(() => {}); });
            setTopics(DEFAULT_TOPICS);
          } else {
            setTopics(topicsSnap.docs.map(d => d.data() as Topic));
          }
        }

        // 5. Store Config
        if (configRes.status === 'fulfilled') {
          const configDoc = configRes.value;
          if (!configDoc.exists()) {
            setDoc(doc(db, 'config', 'store'), DEFAULT_STORE_CONFIG).catch(() => {});
            setStoreConfig(prev => ({
              ...DEFAULT_STORE_CONFIG,
              ...prev,
              currency: (prev.currency && prev.currency !== '$') ? prev.currency : '₹'
            }));
          } else {
            const loaded = configDoc.data() as StoreConfig;
            if (loaded.taxRate === 8) loaded.taxRate = 18;
            if (loaded.shippingFee === 15) loaded.shippingFee = 40;
            if (!loaded.currency || loaded.currency === '$') {
              loaded.currency = '₹';
              setDoc(doc(db, 'config', 'store'), { currency: '₹' }, { merge: true }).catch(() => {});
            }
            setStoreConfig(prev => {
              const finalCurrency = (prev.currency && prev.currency !== '$')
                ? prev.currency
                : (loaded.currency && loaded.currency !== '$')
                  ? loaded.currency
                  : '₹';
              const merged = { ...DEFAULT_STORE_CONFIG, ...loaded, ...prev, currency: finalCurrency };
              try { localStorage.setItem('vernox-store-config', JSON.stringify(merged)); } catch {}
              return merged;
            });
          }
        }

        // 6. Reviews
        if (reviewsRes.status === 'fulfilled') {
          const snap = reviewsRes.value;
          setReviews(snap.docs.map(d => d.data() as Review));
        }
      } catch (e: any) {
        if (e?.code !== 'permission-denied' && !String(e?.message).includes('insufficient permissions')) {
          console.warn("Firestore sync:", e?.message || e);
        }
      }
    };
    syncFirestore();
    return () => { isCancelled = true; };
  }, []);

  // Load wishlist from Firestore for logged-in user or sync from guest localStorage
  useEffect(() => {
    const loadWishlist = async () => {
      if (currentCustomer && auth.currentUser) {
        try {
          const docRef = doc(db, 'wishlists', auth.currentUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setWishlist(data.productIds || []);
          } else {
            await setDoc(docRef, { productIds: wishlist });
          }
        } catch (e: any) {
          if (e?.code !== 'permission-denied' && !String(e?.message).includes('insufficient permissions')) {
            console.warn("Firestore wishlist sync:", e?.message || e);
          }
        }
      } else {
        try {
          const saved = localStorage.getItem('vernox-wishlist');
          setWishlist(saved ? JSON.parse(saved) : []);
        } catch {
          setWishlist([]);
        }
      }
    };
    loadWishlist();
  }, [currentCustomer]);

  // Sync guest wishlist to localStorage
  useEffect(() => {
    if (!currentCustomer) {
      localStorage.setItem('vernox-wishlist', JSON.stringify(wishlist));
    }
  }, [wishlist, currentCustomer]);

  // Load all orders from Cloud Firestore for cross-device & admin sync
  useEffect(() => {
    const loadAllOrders = async () => {
      try {
        const snap = await getDocs(collection(db, 'orders'));
        const list = snap.docs.map(d => d.data() as Order);
        if (list.length > 0) {
          setOrders(list);
        }
      } catch (e: any) {
        if (e?.code !== 'permission-denied' && !String(e?.message).includes('insufficient permissions')) {
          console.warn("Firestore orders sync:", e?.message || e);
        }
      }
    };
    loadAllOrders();
  }, []);

  // Sync Coupons, Usages & Admin Users from Cloud Firestore
  useEffect(() => {
    const syncEnterpriseCollections = async () => {
      try {
        // Coupons
        const cSnap = await getDocs(collection(db, 'coupons')).catch(() => null);
        if (cSnap && !cSnap.empty) {
          setCoupons(cSnap.docs.map(d => ({ id: d.id, ...d.data() } as Coupon)));
        }

        // Coupon Usages
        const uSnap = await getDocs(collection(db, 'coupon_usages')).catch(() => null);
        if (uSnap && !uSnap.empty) {
          setCouponUsages(uSnap.docs.map(d => ({ id: d.id, ...d.data() } as CouponUsage)));
        }

        // Admin Users
        const aSnap = await getDocs(collection(db, 'admin_users')).catch(() => null);
        if (aSnap && !aSnap.empty) {
          setAdminUsers(aSnap.docs.map(d => ({ id: d.id, ...d.data() } as AdminUser)));
        }
      } catch (err) {
        console.warn('Enterprise collections sync notice:', err);
      }
    };
    syncEnterpriseCollections();
  }, []);

  // Sync Customers from Registered Users and Orders
  useEffect(() => {
    const deriveCustomers = async () => {
      const customerMap = new Map<string, CustomerAccount>();
      // 1. From placed orders
      orders.forEach(o => {
        if (o.email) {
          const em = o.email.trim().toLowerCase();
          if (!customerMap.has(em)) {
            customerMap.set(em, {
              email: em,
              name: o.shippingName || em.split('@')[0],
              address: o.shippingAddress,
              city: o.shippingCity,
              zip: o.shippingZip,
              country: o.shippingCountry,
              role: 'customer',
            });
          }
        }
      });

      // 2. From Firestore registered accounts
      try {
        const uSnap = await getDocs(collection(db, 'users'));
        uSnap.docs.forEach(d => {
          const u = d.data() as CustomerAccount;
          if (u.email) {
            const em = u.email.trim().toLowerCase();
            customerMap.set(em, { ...customerMap.get(em), ...u });
          }
        });
      } catch {}

      setCustomers(Array.from(customerMap.values()));
    };

    deriveCustomers();
  }, [orders]);

  // Backup sync to localStorage for rapid access fallback
  useEffect(() => {
    localStorage.setItem('vernox-products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('vernox-categories', JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem('vernox-homepage', JSON.stringify(homepageSettings));
  }, [homepageSettings]);

  useEffect(() => {
    localStorage.setItem('vernox-orders', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('vernox-topics', JSON.stringify(topics));
  }, [topics]);

  useEffect(() => {
    localStorage.setItem('vernox-store-config', JSON.stringify(storeConfig));
  }, [storeConfig]);

  // Product Actions
  const addProduct = async (p: Omit<Product, 'id'>) => {
    const newId = `p-${Date.now()}`;
    const newProduct = { ...p, id: newId };
    setProducts(prev => [...prev, newProduct]);
    try {
      await setDoc(doc(db, 'products', newId), newProduct);
    } catch (e) {
      console.error("Firestore add product error:", e);
    }
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    try {
      await updateDoc(doc(db, 'products', id), updates);
    } catch (e) {
      console.error("Firestore update product error:", e);
    }
  };

  const deleteProduct = async (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    try {
      await deleteDoc(doc(db, 'products', id));
    } catch (e) {
      console.error("Firestore delete product error:", e);
    }
  };

  const getProductBySlug = (slug: string) => {
    return products.find(p => p.slug === slug);
  };

  // Category Actions
  const addCategory = async (c: { id: ProductCategory; name: string; description: string }) => {
    setCategories(prev => [...prev, c]);
    try {
      await setDoc(doc(db, 'categories', c.id), c);
    } catch (e) {
      console.error("Firestore add category error:", e);
    }
  };

  const updateCategory = async (id: string, updates: Partial<{ id: ProductCategory; name: string; description: string }>) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    try {
      await updateDoc(doc(db, 'categories', id), updates);
    } catch (e) {
      console.error("Firestore update category error:", e);
    }
  };

  const deleteCategory = async (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id));
    try {
      await deleteDoc(doc(db, 'categories', id));
    } catch (e) {
      console.error("Firestore delete category error:", e);
    }
  };

  // Homepage Actions
  const updateHomepageSettings = async (updates: Partial<HomepageSettings>) => {
    const nextSettings = { ...homepageSettings, ...updates };
    setHomepageSettings(nextSettings);
    try {
      localStorage.setItem('vernox-homepage', JSON.stringify(nextSettings));
    } catch {}
    try {
      await setDoc(doc(db, 'settings', 'homepage'), nextSettings);
    } catch (e) {
      console.error("Firestore update homepage error:", e);
    }
  };

  // Order Actions
  const addOrder = async (order: Omit<Order, 'status'> & { status?: OrderStatus }) => {
    const status = order.status || 'Pending';
    const completeOrder: Order = {
      ...order,
      status,
      paymentStatus: order.paymentStatus || (['Paid', 'Designing', 'Cutting', 'Finished', 'Shipped', 'Delivered'].includes(status) ? 'Paid' : 'Authorized'),
      fulfillmentStatus: order.fulfillmentStatus || (['Shipped', 'Delivered'].includes(status) ? 'Fulfilled' : ['Designing', 'Cutting', 'Finished'].includes(status) ? 'Partially Fulfilled' : 'Unfulfilled'),
      placedAt: order.placedAt || Date.now(),
      createdAt: order.createdAt || new Date().toISOString()
    };
    setOrders(prev => {
      const next = [completeOrder, ...prev];
      try { localStorage.setItem('vernox-orders', JSON.stringify(next)); } catch {}
      return next;
    });

    if (completeOrder.email) {
      setCustomers(prev => {
        const em = completeOrder.email.toLowerCase().trim();
        const exists = prev.some(c => (c.email || '').toLowerCase().trim() === em);
        if (exists) return prev;
        const newCustomer: CustomerAccount = {
          email: completeOrder.email,
          name: completeOrder.shippingName || completeOrder.customerName || 'Atelier Patron',
          phone: completeOrder.phone || '',
          address: typeof completeOrder.shippingAddress === 'string' ? completeOrder.shippingAddress : '',
          city: completeOrder.shippingCity || '',
          country: completeOrder.shippingCountry || '',
          role: 'customer',
          createdAt: completeOrder.placedAt || Date.now(),
        };
        const nextCustomers = [newCustomer, ...prev];
        try { localStorage.setItem('vernox-customers', JSON.stringify(nextCustomers)); } catch {}
        return nextCustomers;
      });
    }

    try {
      await setDoc(doc(db, 'orders', completeOrder.id), completeOrder);
    } catch (e) {
      console.error("Firestore order save error:", e);
    }
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    setOrders(prev => {
      const next = prev.map(o => {
        if (o.id !== orderId) return o;
        const autoPayment: PaymentStatus = ['Paid', 'Designing', 'Cutting', 'Finished', 'Shipped', 'Delivered'].includes(status) 
          ? 'Paid' 
          : status === 'Cancelled' ? 'Refunded' : (o.paymentStatus || 'Authorized');
        const autoFulfillment: FulfillmentStatus = ['Shipped', 'Delivered'].includes(status) 
          ? 'Fulfilled' 
          : ['Designing', 'Cutting', 'Finished'].includes(status) 
            ? 'Partially Fulfilled' 
            : (o.fulfillmentStatus || 'Unfulfilled');
        return { ...o, status, paymentStatus: autoPayment, fulfillmentStatus: autoFulfillment };
      });
      try { localStorage.setItem('vernox-orders', JSON.stringify(next)); } catch {}
      return next;
    });
    try {
      await updateDoc(doc(db, 'orders', orderId), { status });
    } catch (e) {
      console.error("Firestore order status update error:", e);
    }
  };

  const updateOrder = async (orderId: string, updates: Partial<Order>) => {
    setOrders(prev => {
      const next = prev.map(o => o.id === orderId ? { ...o, ...updates } : o);
      try { localStorage.setItem('vernox-orders', JSON.stringify(next)); } catch {}
      return next;
    });
    try {
      await updateDoc(doc(db, 'orders', orderId), updates);
    } catch (e) {
      console.error("Firestore order update error:", e);
    }
  };

  const deleteOrder = async (orderId: string) => {
    setOrders(prev => prev.filter(o => o.id !== orderId));
    try {
      await deleteDoc(doc(db, 'orders', orderId));
    } catch (e) {
      console.error("Firestore order deletion error:", e);
    }
  };

  // Topic Actions
  const addTopic = async (t: Omit<Topic, 'id'>) => {
    const newId = `t-${Date.now()}`;
    const newTopic = { ...t, id: newId };
    setTopics(prev => [...prev, newTopic]);
    try {
      await setDoc(doc(db, 'topics', newId), newTopic);
    } catch (e) {
      console.error("Firestore add topic error:", e);
    }
  };

  const updateTopic = async (id: string, updates: Partial<Topic>) => {
    setTopics(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    try {
      await updateDoc(doc(db, 'topics', id), updates);
    } catch (e) {
      console.error("Firestore update topic error:", e);
    }
  };

  const deleteTopic = async (id: string) => {
    setTopics(prev => prev.filter(t => t.id !== id));
    try {
      await deleteDoc(doc(db, 'topics', id));
    } catch (e) {
      console.error("Firestore delete topic error:", e);
    }
  };

  // Store Configuration Actions
  const updateStoreConfig = async (updates: Partial<StoreConfig>) => {
    const nextConfig = { ...storeConfig, ...updates };
    if (!nextConfig.currency || nextConfig.currency === '$') {
      nextConfig.currency = '₹';
    }
    setStoreConfig(nextConfig);
    try {
      localStorage.setItem('vernox-store-config', JSON.stringify(nextConfig));
    } catch {}
    try {
      await setDoc(doc(db, 'config', 'store'), nextConfig, { merge: true });
    } catch (e) {
      console.warn("Firestore store config update notice (local state persisted):", e);
    }
  };

  const isAdmin = Boolean(
    currentAdmin !== null || (
      currentCustomer && (
        currentCustomer.role === 'admin' ||
        currentCustomer.isAdmin === true ||
        currentCustomer.email.toLowerCase() === (storeConfig.adminEmail || 'admin@vernox.com').toLowerCase() ||
        currentCustomer.email.toLowerCase() === 'concierge@vernoxatelier.com'
      )
    )
  );

  const adminRole: AdminRole = currentAdmin?.role || (isAdmin ? 'super_admin' : 'support');

  const logoutAdmin = () => {
    sessionStorage.removeItem('vernox-admin-token');
    sessionStorage.removeItem('vernox-admin-user');
    setCurrentAdmin(null);
    setAdminToken(null);
    signOut(auth).catch(() => {});
  };

  const loginAdmin = async (email: string, pass: string): Promise<boolean> => {
    const cleanEmail = email.trim().toLowerCase();
    
    // 1. Authoritative login via /api/admin
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'LOGIN',
          email: cleanEmail,
          password: pass
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.token && data.user) {
          sessionStorage.setItem('vernox-admin-token', data.token);
          sessionStorage.setItem('vernox-admin-user', JSON.stringify(data.user));
          setCurrentAdmin(data.user);
          setAdminToken(data.token);

          const adminProfile: CustomerAccount = {
            email: data.user.email,
            name: data.user.name,
            role: 'admin',
            isAdmin: true,
          };
          setCurrentCustomer(adminProfile);

          // Attempt parallel Firebase Auth sync
          signInWithEmailAndPassword(auth, cleanEmail, pass).catch(() => {});
          return true;
        }
      }
    } catch (apiErr) {
      console.warn('Notice: /api/admin login call failed, trying direct Firebase Auth:', apiErr);
    }

    // 2. Firebase Auth sign-in fallback
    try {
      const userCred = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      if (userCred.user) {
        const adminProfile: CustomerAccount = {
          email: cleanEmail,
          name: userCred.user.displayName || 'Atelier Administrator',
          role: 'admin',
          isAdmin: true,
        };
        setCurrentCustomer(adminProfile);
        const resolvedRole: AdminRole = cleanEmail === 'admin@vernox.com' ? 'super_admin' : 'admin';
        const userObj: AdminUser = {
          id: userCred.user.uid,
          email: cleanEmail,
          name: userCred.user.displayName || 'Atelier Administrator',
          role: resolvedRole,
          status: 'active',
          createdAt: Date.now()
        };
        setCurrentAdmin(userObj);
        sessionStorage.setItem('vernox-admin-user', JSON.stringify(userObj));
        return true;
      }
    } catch (authErr: any) {
      console.warn("Direct Firebase Auth sign-in notice:", authErr?.message);
    }

    return false;
  };

  const verifyAdminPassphrase = (_passphrase: string) => {
    return isAdmin;
  };

  // Enterprise Coupon Actions
  const createCoupon = async (couponData: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'usedCount'>) => {
    const code = couponData.code.trim().toUpperCase();
    const newId = `c-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newCoupon: Coupon = {
      ...couponData,
      id: newId,
      code,
      usedCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    setCoupons(prev => {
      const next = [newCoupon, ...prev.filter(c => c.id !== newId && c.code !== code)];
      try {
        localStorage.setItem('vernox-coupons', JSON.stringify(next));
      } catch {}
      return next;
    });

    const token = sessionStorage.getItem('vernox-admin-token');
    if (token) {
      try {
        await fetch('/api/admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'SAVE_COUPON',
            coupon: newCoupon
          })
        });
      } catch (err) {
        console.warn("Notice: /api/admin coupon sync skipped:", err);
      }
    } else {
      try {
        await setDoc(doc(db, 'coupons', newId), newCoupon).catch(err => {
          console.warn("Firestore coupon write notice (saved in local store):", err?.message || err);
        });
        await logAdminAudit('COUPON_CREATED', 'coupon', newId, { code, discountValue: newCoupon.discountValue }).catch(() => {});
      } catch (err) {
        console.warn("Coupon audit/sync notice:", err);
      }
    }
    return true;
  };

  const updateCoupon = async (id: string, updates: Partial<Coupon>) => {
    const cleanUpdates = { ...updates, updatedAt: Date.now() };
    if (cleanUpdates.code) cleanUpdates.code = cleanUpdates.code.trim().toUpperCase();
    
    let targetCoupon: Coupon | undefined;
    setCoupons(prev => {
      const next = prev.map(c => {
        if (c.id === id) {
          targetCoupon = { ...c, ...cleanUpdates };
          return targetCoupon;
        }
        return c;
      });
      try {
        localStorage.setItem('vernox-coupons', JSON.stringify(next));
      } catch {}
      return next;
    });

    const token = sessionStorage.getItem('vernox-admin-token');
    if (token && targetCoupon) {
      try {
        await fetch('/api/admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'SAVE_COUPON',
            coupon: targetCoupon
          })
        });
      } catch (err) {
        console.warn("Notice: /api/admin coupon update skipped:", err);
      }
    } else {
      try {
        await updateDoc(doc(db, 'coupons', id), cleanUpdates).catch(err => {
          console.warn("Firestore coupon update notice (saved in local store):", err?.message || err);
        });
        await logAdminAudit('COUPON_UPDATED', 'coupon', id, cleanUpdates).catch(() => {});
      } catch (err) {
        console.warn("Coupon audit/sync notice:", err);
      }
    }
    return true;
  };

  const deleteCoupon = async (id: string) => {
    const target = coupons.find(c => c.id === id);
    setCoupons(prev => {
      const next = prev.filter(c => c.id !== id);
      try {
        localStorage.setItem('vernox-coupons', JSON.stringify(next));
      } catch {}
      return next;
    });

    const token = sessionStorage.getItem('vernox-admin-token');
    if (token) {
      try {
        await fetch('/api/admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'DELETE_COUPON',
            couponId: id
          })
        });
      } catch (err) {
        console.warn("Notice: /api/admin coupon delete skipped:", err);
      }
    } else {
      try {
        await deleteDoc(doc(db, 'coupons', id)).catch(err => {
          console.warn("Firestore coupon delete notice (removed from local store):", err?.message || err);
        });
        await logAdminAudit('COUPON_DELETED', 'coupon', id, { code: target?.code }).catch(() => {});
      } catch (err) {
        console.warn("Coupon audit/sync notice:", err);
      }
    }
    return true;
  };

  const toggleCouponStatus = async (id: string, isActive: boolean) => {
    return updateCoupon(id, { isActive });
  };

  // Enterprise Stock Adjustment
  const updateStock = async (productId: string, newStock: number) => {
    const validStock = Math.max(0, Math.floor(newStock));
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, stock: validStock } : p));
    try {
      await updateDoc(doc(db, 'products', productId), { stock: validStock, updatedAt: Date.now() });
      await logAdminAudit('STOCK_ADJUSTED', 'inventory', productId, { newStock: validStock });
    } catch (err) {
      console.error("Update stock error:", err);
    }
  };

  // Enterprise Audit Logging & RBAC API helpers
  const logAdminAudit = async (action: string, targetType: AuditTargetType, targetId: string, details?: Record<string, any>) => {
    try {
      const token = sessionStorage.getItem('vernox-admin-token');
      await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'LOG_AUDIT',
          eventAction: action,
          targetType,
          targetId,
          details
        })
      });
    } catch (err) {
      console.warn("Audit log call deferred:", err);
    }
  };

  const fetchAuditLogs = async (targetType?: string): Promise<AuditLog[]> => {
    try {
      const token = sessionStorage.getItem('vernox-admin-token');
      const url = targetType ? `/api/admin?action=GET_AUDIT_LOGS&targetType=${encodeURIComponent(targetType)}` : '/api/admin?action=GET_AUDIT_LOGS';
      const res = await fetch(url, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      if (res.ok) {
        const data = await res.json();
        return data.logs || [];
      }
      return [];
    } catch {
      return [];
    }
  };

  const createAdminUser = async (email: string, name: string, role: AdminRole): Promise<boolean> => {
    try {
      const token = sessionStorage.getItem('vernox-admin-token');
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'CREATE_ADMIN',
          email,
          name,
          role
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.admin) {
          setAdminUsers(prev => [data.admin, ...prev]);
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  };

  const updateAdminRole = async (adminId: string, role: AdminRole, status: 'active' | 'suspended'): Promise<boolean> => {
    try {
      const token = sessionStorage.getItem('vernox-admin-token');
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'UPDATE_ADMIN_ROLE',
          adminId,
          role,
          status
        })
      });
      if (res.ok) {
        setAdminUsers(prev => prev.map(a => a.id === adminId ? { ...a, role, status } : a));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // Review Actions
  const addReview = async (r: Omit<Review, 'id'>) => {
    const newId = `r-${Date.now()}`;
    const newReview: Review = {
      ...r,
      id: newId,
      status: r.status || 'published',
      placedAt: r.placedAt || Date.now(),
    };
    setReviews(prev => [newReview, ...prev]);

    const token = sessionStorage.getItem('vernox-admin-token');
    if (token) {
      try {
        await fetch('/api/admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'SAVE_REVIEW',
            review: newReview
          })
        });
      } catch (err) {
        console.warn("Notice: /api/admin review sync skipped:", err);
      }
    } else {
      try {
        await setDoc(doc(db, 'reviews', newId), newReview).catch(err => {
          console.warn("Firestore review write notice (saved in local store):", err?.message || err);
        });
      } catch (e) {
        console.warn("Review sync notice:", e);
      }
    }
  };

  const updateReview = async (id: string, updates: Partial<Review>): Promise<boolean> => {
    let targetReview: Review | undefined;
    setReviews(prev => prev.map(r => {
      if (r.id === id) {
        targetReview = { ...r, ...updates };
        return targetReview;
      }
      return r;
    }));

    const token = sessionStorage.getItem('vernox-admin-token');
    if (token && targetReview) {
      try {
        await fetch('/api/admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'SAVE_REVIEW',
            review: targetReview
          })
        });
      } catch (err) {
        console.warn("Notice: /api/admin review update skipped:", err);
      }
    } else if (targetReview) {
      try {
        await updateDoc(doc(db, 'reviews', id), updates).catch(err => {
          console.warn("Firestore review update notice (saved in local store):", err?.message || err);
        });
      } catch (e) {
        console.warn("Review update notice:", e);
      }
    }
    return true;
  };

  const deleteReview = async (id: string) => {
    setReviews(prev => prev.filter(r => r.id !== id));
    const token = sessionStorage.getItem('vernox-admin-token');
    if (token) {
      try {
        await fetch('/api/admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'DELETE_REVIEW',
            reviewId: id
          })
        });
      } catch (err) {
        console.warn("Notice: /api/admin review delete skipped:", err);
      }
    } else {
      try {
        await deleteDoc(doc(db, 'reviews', id)).catch(err => {
          console.warn("Firestore review delete notice (removed from local store):", err?.message || err);
        });
      } catch (e) {
        console.warn("Review delete notice:", e);
      }
    }
  };

  const toggleReviewFeatured = async (id: string): Promise<boolean> => {
    const target = reviews.find(r => r.id === id);
    if (!target) return false;
    return updateReview(id, { featured: !target.featured });
  };

  const toggleReviewVerified = async (id: string): Promise<boolean> => {
    const target = reviews.find(r => r.id === id);
    if (!target) return false;
    return updateReview(id, { verified: !target.verified });
  };

  const replyToReview = async (id: string, response: string): Promise<boolean> => {
    return updateReview(id, {
      conciergeResponse: response.trim(),
      conciergeRespondedAt: Date.now()
    });
  };

  // Wishlist Actions
  const toggleWishlist = async (productId: string) => {
    let newWishlist: string[];
    if (wishlist.includes(productId)) {
      newWishlist = wishlist.filter(id => id !== productId);
    } else {
      newWishlist = [...wishlist, productId];
    }
    setWishlist(newWishlist);

    if (currentCustomer && auth.currentUser) {
      try {
        await setDoc(doc(db, 'wishlists', auth.currentUser.uid), { productIds: newWishlist });
      } catch (e) {
        console.error("Error updating wishlist in Firestore:", e);
      }
    }
  };

  const isInWishlist = (productId: string) => wishlist.includes(productId);

  // Database JSON Import with Zod validation
  const importDatabase = (jsonData: string): { success: boolean; error?: string } => {
    try {
      const data = JSON.parse(jsonData);
      const parsed = DatabaseZSchema.safeParse(data);
      if (!parsed.success) {
        const errorMsg = parsed.error.errors.map(err => {
          const path = err.path.join('.');
          return `${path ? `Field [${path}]` : 'Data'}: ${err.message}`;
        }).join('\n');
        return { success: false, error: errorMsg };
      }
      
      const valid = parsed.data;
      if (valid.products) setProducts(valid.products as Product[]);
      if (valid.categories) setCategories(valid.categories as any);
      if (valid.homepageSettings) setHomepageSettings(valid.homepageSettings as HomepageSettings);
      if (valid.orders) setOrders(valid.orders as Order[]);
      if (valid.topics) setTopics(valid.topics as Topic[]);
      if (valid.storeConfig) {
        const importedConfig = {
          ...(valid.storeConfig as StoreConfig),
          currency: (valid.storeConfig.currency && valid.storeConfig.currency !== '$') ? valid.storeConfig.currency : '₹'
        };
        setStoreConfig(importedConfig);
      }
      
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Malformed JSON syntax' };
    }
  };

  // Customer Auth Implementation
  const loginCustomer = async (emailOrPhone: string, pass: string): Promise<boolean> => {
    try {
      if (emailOrPhone.includes('@')) {
        await signInWithEmailAndPassword(auth, emailOrPhone.trim().toLowerCase(), pass);
        return true;
      }
      const q = query(collection(db, 'users'), where('phone', '==', emailOrPhone.trim()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const userData = snap.docs[0].data();
        await signInWithEmailAndPassword(auth, userData.email, pass);
        return true;
      }
      return false;
    } catch (e) {
      console.error("Firebase Login Error:", e);
      return false;
    }
  };

  const loginWithGoogleMock = async (name: string, email: string) => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error("Google OAuth Error:", e);
      throw e;
    }
  };

  const registerCustomer = async (account: Omit<CustomerAccount, 'passwordHash'> & { password?: string }): Promise<boolean> => {
    try {
      if (!account.password) return false;
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        account.email.trim().toLowerCase(), 
        account.password
      );
      const user = userCredential.user;
      const docRef = doc(db, 'users', user.uid);
      const profile: CustomerAccount = {
        email: account.email.trim().toLowerCase(),
        phone: account.phone || '',
        name: account.name,
        address: account.address || '',
        city: account.city || '',
        zip: account.zip || '',
        country: account.country || 'United States',
        isGoogleUser: false
      };
      try {
        await setDoc(docRef, profile);
      } catch (e) {
        console.error("Firestore user profile save failed, using local mode:", e);
      }
      setCurrentCustomer(profile);
      return true;
    } catch (e) {
      console.error("Firebase Registration Error:", e);
      return false;
    }
  };

  const logoutCustomer = async () => {
    try {
      await signOut(auth);
      setCurrentCustomer(null);
    } catch (e) {
      console.error("Firebase Signout Error:", e);
    }
  };

  const updateCustomerProfile = async (updates: Partial<CustomerAccount>) => {
    if (!auth.currentUser) return;
    const { passwordHash, ...profileUpdates } = updates;
    setCurrentCustomer(prev => prev ? { ...prev, ...profileUpdates } : null);
    try {
      const docRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(docRef, profileUpdates);
    } catch (e) {
      console.error("Firebase Profile Update Error (offline mode):", e);
    }
  };

  // Reset
  const resetAll = () => {
    setProducts(defaultProducts);
    setCategories(defaultCategories);
    setHomepageSettings(DEFAULT_HOMEPAGE_SETTINGS);
    setOrders([]);
    setTopics(DEFAULT_TOPICS);
    setStoreConfig(DEFAULT_STORE_CONFIG);
    setCurrentCustomer(null);
    setReviews(defaultReviews);
    localStorage.removeItem('vernox-products');
    localStorage.removeItem('vernox-categories');
    localStorage.removeItem('vernox-homepage');
    localStorage.removeItem('vernox-orders');
    localStorage.removeItem('vernox-topics');
    localStorage.removeItem('vernox-store-config');
    localStorage.removeItem('vernox-customer-email');
    localStorage.removeItem('vernox-reviews');
  };

  return (
    <CatalogContext.Provider value={{
      products,
      categories,
      homepageSettings,
      orders,
      topics,
      storeConfig: {
        ...storeConfig,
        currency: (storeConfig.currency && storeConfig.currency !== '$') ? storeConfig.currency : '₹'
      },
      reviews,
      wishlist,
      addProduct,
      updateProduct,
      deleteProduct,
      getProductBySlug,
      addCategory,
      updateCategory,
      deleteCategory,
      updateHomepageSettings,
      addOrder,
      updateOrderStatus,
      updateOrder,
      deleteOrder,
      addTopic,
      updateTopic,
      deleteTopic,
      updateStoreConfig,
      verifyAdminPassphrase,
      importDatabase,
      isAdmin,
      loginAdmin,
      logoutAdmin,
      currentCustomer,
      loginCustomer,
      loginWithGoogleMock,
      registerCustomer,
      logoutCustomer,
      updateCustomerProfile,
      addReview,
      updateReview,
      deleteReview,
      toggleReviewFeatured,
      toggleReviewVerified,
      replyToReview,
      toggleWishlist,
      isInWishlist,
      resetAll,
      // Enterprise extensions
      coupons,
      couponUsages,
      createCoupon,
      updateCoupon,
      deleteCoupon,
      toggleCouponStatus,
      adminUsers,
      currentAdmin,
      adminRole,
      logAdminAudit,
      fetchAuditLogs,
      createAdminUser,
      updateAdminRole,
      customers,
      updateStock
    }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  const c = useContext(CatalogContext);
  if (!c) throw new Error('useCatalog must be used within CatalogProvider');
  return c;
}
