/**
 * Pure mapping from stored documents to the client types, plus the display defaults. Shared by the live
 * Firestore reads (products.ts, reviews.ts, settings.ts; admin screens) and the CDN-cached public
 * catalogue (publicCatalog.ts; storefront), so a product looks the same whichever way it arrived.
 * Deliberately free of Firebase imports: the storefront must not pull the Firestore SDK to use these.
 */
import type { CategoryDoc, HeroSlide, HomepageSettings, Product, Review, StoreConfig, Topic } from '@/types/store';

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

export const DEFAULT_HOMEPAGE_SETTINGS: HomepageSettings = {
  heroTitle: 'Metal, quietly held on the wall.',
  heroSubtitle:
    'Wall pieces cut from sheet metal and finished by hand in oxblood-patinated brass and warm copper. Ready-made, or shape one that is entirely yours.',
  heroSubtitleItalic: 'quietly',
  heroBadge: 'Laser-cut metal wall art',
  featuredProductIds: [],
  manifestoItems: [
    { icon: 'Hammer', title: 'Cut to order', body: 'Every piece is laser-cut and finished in one workshop.' },
    { icon: 'Compass', title: 'Yours, precisely', body: 'Change a millimetre, a metal, a monogram, live in the browser.' },
    { icon: 'Flame', title: 'Made in days', body: 'From raw sheet to your wall in under a fortnight.' },
  ],
  sectionsVisibility: {
    hero: true, manifesto: true, collections: true, featured: true, installations: true, story: true,
    'b2b-trade': true, authenticity: true, metallurgy: true, bestsellers: true, topics: true, 'studio-cta': true,
  },
  sectionsOrder: [
    'hero', 'manifesto', 'collections', 'featured', 'installations', 'story', 'b2b-trade',
    'authenticity', 'metallurgy', 'bestsellers', 'topics', 'studio-cta',
  ],
  heroShapeId: 'starburst',
  heroFinish: 'brass',
  heroSlides: DEFAULT_HERO_SLIDES,
};

export const DEFAULT_STORE_CONFIG: StoreConfig = {
  storeName: 'Vernox',
  currency: '₹',
  gstRatePercent: 5,
  freeShippingThreshold: 1499,
  shippingFee: 150,
};

export function toProduct(id: string, raw: Record<string, unknown>): Product {
  const p = raw as Partial<Product>;
  return {
    ...(p as Product),
    id,
    finishes: Array.isArray(p.finishes) ? p.finishes : [],
    sizes: Array.isArray(p.sizes) ? p.sizes : [],
    stock: typeof p.stock === 'number' ? p.stock : 0,
  };
}

export function toCategory(id: string, raw: Record<string, unknown>): CategoryDoc {
  return { ...(raw as unknown as CategoryDoc), id: id as CategoryDoc['id'] };
}

export function toReview(id: string, raw: Record<string, unknown>): Review {
  const r = raw as Partial<Review>;
  return {
    productId: '',
    customerName: 'Anonymous',
    rating: 0,
    comment: '',
    placedAt: 0,
    ...r,
    id,
  };
}

export function toTopic(id: string, raw: Record<string, unknown>): Topic {
  return { ...(raw as unknown as Topic), id };
}

export function toStoreConfig(raw: Record<string, unknown> | null | undefined): StoreConfig {
  return { ...DEFAULT_STORE_CONFIG, ...((raw ?? {}) as Partial<StoreConfig>) };
}

export function toHomepageSettings(raw: Record<string, unknown> | null | undefined): HomepageSettings {
  return { ...DEFAULT_HOMEPAGE_SETTINGS, ...((raw ?? {}) as Partial<HomepageSettings>) };
}
