/**
 * Wishlist. Guests keep a local list; signed-in customers use `wishlists/{uid}`.
 * The query cache is the single shared store so every component sees the same list.
 */
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth/AuthProvider';
import { safeLocal } from '@/lib/safeStorage';
import { useOptimisticMutation } from './optimistic';

const GUEST_KEY = 'vernox-wishlist';

const wishlistKey = (uid: string | undefined) => ['wishlist', uid ?? 'guest'] as const;

async function fetchWishlist(uid: string | undefined): Promise<string[]> {
  const guest = safeLocal.getJson<string[]>(GUEST_KEY, []);
  if (!uid) return guest;
  const snap = await getDoc(doc(db, 'wishlists', uid));
  const saved: string[] = snap.exists() ? (snap.data().productIds ?? []) : [];
  if (guest.length === 0) return saved;
  const merged = Array.from(new Set([...saved, ...guest]));
  try {
    await setDoc(doc(db, 'wishlists', uid), { productIds: merged });
    safeLocal.remove(GUEST_KEY);
  } catch (err) {
    console.warn('[wishlist] could not merge guest wishlist into account:', err);
  }
  return merged;
}

export function useWishlist() {
  const { user } = useAuth();
  const uid = user?.uid;
  const key = wishlistKey(uid);
  const { data: wishlist = [] } = useQuery({ queryKey: key, queryFn: () => fetchWishlist(uid), staleTime: Infinity });

  const toggle = useOptimisticMutation<string[], string>({
    queryKey: key,
    mutationFn: async productId => {
      const current = wishlist;
      const next = current.includes(productId) ? current.filter(id => id !== productId) : [...current, productId];
      if (uid) await setDoc(doc(db, 'wishlists', uid), { productIds: next });
      else safeLocal.setJson(GUEST_KEY, next);
    },
    apply: (cur = [], productId) => (cur.includes(productId) ? cur.filter(id => id !== productId) : [...cur, productId]),
    failureMessage: 'Could not update wishlist',
  });

  return {
    wishlist,
    isInWishlist: (productId: string) => wishlist.includes(productId),
    toggleWishlist: (productId: string) => toggle.run(productId),
  };
}
