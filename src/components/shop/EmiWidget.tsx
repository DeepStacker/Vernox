import { useEffect, useRef, useState } from 'react';
import { AFFORDABILITY_CONTAINER_ID, affordabilityAmountPaise, razorpayKeyId, renderAffordabilityWidget, whenPageIdle } from '@/lib/emi/affordability';

/**
 * "No-cost EMI / pay in instalments" message from Razorpay's Affordability Widget, for product and cart pages.
 * `amountRupees` is what the customer will pay including GST. Renders nothing (no element, no script) when the Razorpay
 * key is not configured or the amount is too small, and removes itself if the script fails; it never blocks first paint.
 * Only one widget can exist per page (fixed container id).
 */
export function EmiWidget({ amountRupees, className }: { amountRupees: number; className?: string }) {
  const keyId = razorpayKeyId();
  const amountPaise = affordabilityAmountPaise(amountRupees, keyId);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!keyId || amountPaise === null) return;
    return whenPageIdle(() => {
      if (!ref.current) return;
      void renderAffordabilityWidget(keyId, amountPaise, ref.current).then(ok => { if (!ok) setFailed(true); });
    });
  }, [keyId, amountPaise]);

  if (!keyId || amountPaise === null || failed) return null;
  return <div ref={ref} id={AFFORDABILITY_CONTAINER_ID} className={className} />;
}
