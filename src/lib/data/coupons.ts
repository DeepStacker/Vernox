/** Coupons (admin only). Reads are staff-gated by rules; writes go through the audited admin API. */
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Coupon, CouponUsage } from '@/types/coupon';
import { adminAction } from './adminApi';
import { stripUndefined, useOptimisticMutation } from './optimistic';

export const COUPONS_KEY = ['admin', 'coupons'] as const;
export const COUPON_USAGES_KEY = ['admin', 'coupon-usages'] as const;

export async function fetchCoupons(): Promise<Coupon[]> {
  const snap = await getDocs(query(collection(db, 'coupons'), limit(500)));
  return snap.docs
    .map(d => ({ ...(d.data() as Coupon), id: d.id }))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export async function fetchCouponUsages(): Promise<CouponUsage[]> {
  const snap = await getDocs(query(collection(db, 'coupon_usages'), orderBy('usedAt', 'desc'), limit(500)));
  return snap.docs.map(d => ({ ...(d.data() as CouponUsage), id: d.id }));
}

export function useCoupons(enabled: boolean) {
  return useQuery({ queryKey: COUPONS_KEY, queryFn: fetchCoupons, enabled, staleTime: 30_000 });
}

export function useCouponUsages(enabled: boolean) {
  return useQuery({ queryKey: COUPON_USAGES_KEY, queryFn: fetchCouponUsages, enabled, staleTime: 30_000 });
}

export type NewCoupon = Omit<Coupon, 'id' | 'createdAt' | 'updatedAt' | 'usedCount'>;

export function useCouponMutations() {
  const save = useOptimisticMutation<Coupon[], Coupon>({
    queryKey: COUPONS_KEY,
    mutationFn: coupon => adminAction('SAVE_COUPON', { coupon: stripUndefined(coupon) }),
    apply: (cur = [], coupon) =>
      cur.some(c => c.id === coupon.id) ? cur.map(c => (c.id === coupon.id ? coupon : c)) : [coupon, ...cur],
    failureMessage: 'Could not save coupon',
  });

  const remove = useOptimisticMutation<Coupon[], string>({
    queryKey: COUPONS_KEY,
    mutationFn: couponId => adminAction('DELETE_COUPON', { couponId }),
    apply: (cur = [], id) => cur.filter(c => c.id !== id),
    failureMessage: 'Could not delete coupon',
  });

  return {
    createCoupon: (data: NewCoupon): Promise<boolean> => {
      const now = Date.now();
      const id = `c-${now}-${Math.random().toString(36).slice(2, 6)}`;
      return save.run({ ...data, code: data.code.trim().toUpperCase(), id, usedCount: 0, createdAt: now, updatedAt: now });
    },
    saveCoupon: (coupon: Coupon): Promise<boolean> => save.run({ ...coupon, updatedAt: Date.now() }),
    deleteCoupon: remove.run,
  };
}
