import { useEffect, useState } from 'react';
import { Truck, Banknote } from 'lucide-react';
import { useDeliveryEstimate } from '@/lib/shipping/useDeliveryEstimate';
import { formatDeliveryDate, rememberedPincode, rememberPincode } from '@/lib/shipping/deliveryEstimate';
import { CUSTOM_PRODUCT_ID } from '@/types/products';

interface DeliveryEstimateProps {
  /** Product whose production lead time is included; omit for a store-wide estimate. */
  productId?: string;
  className?: string;
}

/**
 * PIN-code delivery check for the product page: estimated delivery date and
 * cash-on-delivery availability. Remembers the last PIN code on this device.
 */
export function DeliveryEstimate({ productId, className = '' }: DeliveryEstimateProps) {
  const [pincode, setPincode] = useState(rememberedPincode);
  const { estimate, isLoading, error, isValidPincode } = useDeliveryEstimate(pincode, productId);
  const isCustom = productId === CUSTOM_PRODUCT_ID;

  useEffect(() => {
    if (estimate) rememberPincode(estimate.pincode);
  }, [estimate]);

  return (
    <div className={`border border-border/70 rounded p-3 space-y-2 text-xs ${className}`}>
      <label htmlFor="delivery-pincode" className="flex items-center gap-1.5 font-semibold text-dark-brown">
        <Truck className="w-3.5 h-3.5 text-burgundy" aria-hidden /> Check delivery
      </label>
      <input
        id="delivery-pincode"
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={6}
        placeholder="Enter 6-digit PIN code"
        value={pincode}
        onChange={e => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="w-full bg-background border border-border rounded px-3 py-2 text-sm outline-none focus:border-burgundy transition"
      />
      <div aria-live="polite" className="min-h-[1.25rem]">
        {!isValidPincode && pincode.length > 0 && <p className="text-muted-foreground">Enter all 6 digits.</p>}
        {isLoading && <p className="text-muted-foreground">Checking…</p>}
        {error && <p className="text-destructive">{error.message}</p>}
        {estimate && !isLoading && (
          estimate.serviceable ? (
            <div className="space-y-1">
              {estimate.estimatedDeliveryDate && (
                <p className="text-foreground">
                  Delivery by <span className="font-semibold">{formatDeliveryDate(estimate.estimatedDeliveryDate)}</span>
                  <span className="text-muted-foreground"> · made to order, dispatched in {estimate.estimatedDispatchDays} days</span>
                </p>
              )}
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Banknote className="w-3.5 h-3.5" aria-hidden />
                {estimate.codAvailable
                  ? 'Cash on delivery available'
                  : isCustom
                    ? 'Custom designs are prepaid only'
                    : 'Cash on delivery not available here; pay online'}
              </p>
            </div>
          ) : (
            <p className="text-destructive">We do not deliver to this PIN code yet.</p>
          )
        )}
      </div>
    </div>
  );
}

export default DeliveryEstimate;
