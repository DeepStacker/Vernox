/**
 * Public store content: store settings (`settings/store`), homepage layout (`settings/homepage`)
 * and journal topics. Defaults below are in-memory display fallbacks only and are never written back.
 */
import { useQuery } from '@tanstack/react-query';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { HeroSlide, HomepageSettings, StoreConfig, Topic } from '@/types/store';
import { logAudit } from './adminApi';
import { stripUndefined, useOptimisticMutation } from './optimistic';

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
  gstRatePercent: 18,
  freeShippingThreshold: 5000,
  shippingFee: 150,
};

export const STORE_CONFIG_KEY = ['settings', 'store'] as const;
export const HOMEPAGE_KEY = ['settings', 'homepage'] as const;
export const TOPICS_KEY = ['topics'] as const;

export async function fetchStoreConfig(): Promise<StoreConfig> {
  const snap = await getDoc(doc(db, 'settings', 'store'));
  return { ...DEFAULT_STORE_CONFIG, ...(snap.exists() ? (snap.data() as Partial<StoreConfig>) : {}) };
}

export async function fetchHomepageSettings(): Promise<HomepageSettings> {
  const snap = await getDoc(doc(db, 'settings', 'homepage'));
  return { ...DEFAULT_HOMEPAGE_SETTINGS, ...(snap.exists() ? (snap.data() as Partial<HomepageSettings>) : {}) };
}

export async function fetchTopics(): Promise<Topic[]> {
  const snap = await getDocs(collection(db, 'topics'));
  return snap.docs.map(d => ({ ...(d.data() as Topic), id: d.id }));
}

export function useStoreConfig() {
  return useQuery({ queryKey: STORE_CONFIG_KEY, queryFn: fetchStoreConfig, staleTime: 5 * 60_000 });
}

export function useHomepageSettings() {
  return useQuery({ queryKey: HOMEPAGE_KEY, queryFn: fetchHomepageSettings, staleTime: 5 * 60_000 });
}

export function useTopics() {
  return useQuery({ queryKey: TOPICS_KEY, queryFn: fetchTopics, staleTime: 5 * 60_000 });
}

export function useSettingsMutations() {
  const storeConfig = useOptimisticMutation<StoreConfig, Partial<StoreConfig>>({
    queryKey: STORE_CONFIG_KEY,
    mutationFn: async updates => {
      await setDoc(doc(db, 'settings', 'store'), stripUndefined(updates), { merge: true });
      logAudit('STORE_CONFIG_UPDATED', 'settings', 'store', updates as Record<string, unknown>);
    },
    apply: (cur, updates) => ({ ...(cur ?? DEFAULT_STORE_CONFIG), ...updates }),
    failureMessage: 'Could not save store settings',
  });

  const homepage = useOptimisticMutation<HomepageSettings, Partial<HomepageSettings>>({
    queryKey: HOMEPAGE_KEY,
    mutationFn: async updates => {
      await setDoc(doc(db, 'settings', 'homepage'), stripUndefined(updates), { merge: true });
      logAudit('HOMEPAGE_UPDATED', 'settings', 'homepage');
    },
    apply: (cur, updates) => ({ ...(cur ?? DEFAULT_HOMEPAGE_SETTINGS), ...updates }),
    failureMessage: 'Could not save homepage settings',
  });

  const saveTopic = useOptimisticMutation<Topic[], Topic>({
    queryKey: TOPICS_KEY,
    mutationFn: async topic => {
      await setDoc(doc(db, 'topics', topic.id), stripUndefined(topic));
    },
    apply: (cur = [], topic) =>
      cur.some(t => t.id === topic.id) ? cur.map(t => (t.id === topic.id ? topic : t)) : [topic, ...cur],
    failureMessage: 'Could not save topic',
  });

  const removeTopic = useOptimisticMutation<Topic[], string>({
    queryKey: TOPICS_KEY,
    mutationFn: async id => {
      await deleteDoc(doc(db, 'topics', id));
    },
    apply: (cur = [], id) => cur.filter(t => t.id !== id),
    failureMessage: 'Could not delete topic',
  });

  return {
    updateStoreConfig: storeConfig.run,
    updateHomepageSettings: homepage.run,
    saveTopic: saveTopic.run,
    deleteTopic: removeTopic.run,
  };
}
