/**
 * Public store content: store settings (`settings/store`), homepage layout (`settings/homepage`)
 * and journal topics. Defaults below are in-memory display fallbacks only and are never written back.
 */
import { useQuery } from '@tanstack/react-query';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firestoreDb';
import type { HomepageSettings, StoreConfig, Topic } from '@/types/store';
import { DEFAULT_HOMEPAGE_SETTINGS, DEFAULT_STORE_CONFIG, toHomepageSettings, toStoreConfig, toTopic } from './catalogMappers';
import { logAudit } from './adminApi';
import { stripUndefined, useOptimisticMutation } from './optimistic';

export { DEFAULT_HERO_SLIDES, DEFAULT_HOMEPAGE_SETTINGS, DEFAULT_STORE_CONFIG } from './catalogMappers';

export const STORE_CONFIG_KEY = ['settings', 'store'] as const;
export const HOMEPAGE_KEY = ['settings', 'homepage'] as const;
export const TOPICS_KEY = ['topics'] as const;

export async function fetchStoreConfig(): Promise<StoreConfig> {
  const snap = await getDoc(doc(db, 'settings', 'store'));
  return toStoreConfig(snap.exists() ? snap.data() : null);
}

export async function fetchHomepageSettings(): Promise<HomepageSettings> {
  const snap = await getDoc(doc(db, 'settings', 'homepage'));
  return toHomepageSettings(snap.exists() ? snap.data() : null);
}

export async function fetchTopics(): Promise<Topic[]> {
  const snap = await getDocs(collection(db, 'topics'));
  return snap.docs.map(d => toTopic(d.id, d.data()));
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
