import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useCart } from '@/lib/cartContext';
import { previewCoupon } from '@/lib/data/couponPreview';
import { creditState } from './consultationModel';
import { useMyConsultations } from './consultations';

/**
 * Applies the customer's unused consultation credit to a cart that has no coupon, once per cart content.
 * The code is validated by the server (it is bound to the account's email); an invalid or used credit is
 * simply not applied, and checkout re-evaluates the coupon again anyway.
 */
export function useAutoApplyConsultationCredit(): void {
  const { user } = useAuth();
  const { items, appliedCoupon, applyCoupon } = useCart();
  const { data } = useMyConsultations(user?.uid);
  const credit = data?.find(c => creditState(c, Date.now()) === 'available')?.credit;
  const attempted = useRef('');

  useEffect(() => {
    if (!credit || !user?.email || items.length === 0 || appliedCoupon) return;
    const signature = `${credit.code}|${items.map(i => i.id).join(',')}`;
    if (attempted.current === signature) return;
    attempted.current = signature;
    previewCoupon({ code: credit.code, items, email: user.email })
      .then(result => {
        if (!result.isValid) return;
        applyCoupon({
          code: result.couponCode ?? credit.code,
          discountAmount: result.discountAmount,
          discountType: result.discountType,
          discountValue: result.discountValue,
          description: result.description,
        });
      })
      .catch(() => undefined); // advisory: the customer can still enter the code by hand
  }, [credit, user?.email, items, appliedCoupon, applyCoupon]);
}
