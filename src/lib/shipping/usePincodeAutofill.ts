import { useEffect, useRef } from 'react';
import { isCompletePincode, placePatch, stateFromPincode, type AddressPlace, type PlacePatch } from '@/lib/pincode';
import { useDeliveryEstimate } from './useDeliveryEstimate';

/**
 * Fills city and state from the PIN code as soon as it is 6 digits, without overwriting what the person typed.
 * State appears at once from the local table (src/lib/pincode.ts); the courier's serviceability answer then adds the
 * city and, being authoritative, may correct a table-filled state. Cached per PIN by useDeliveryEstimate, so the
 * checkout's own delivery check shares the request (pass the same `productId`). Fails silently: the fields simply stay editable and empty.
 */
export function usePincodeAutofill(pincode: string, place: AddressPlace, apply: (patch: PlacePatch) => void, productId?: string): void {
  const { estimate } = useDeliveryEstimate(pincode, productId);
  const placeRef = useRef(place);
  placeRef.current = place;
  const lastFilled = useRef<PlacePatch>({});
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const pin = pincode.trim();
  const courierPin = estimate?.pincode === pin ? estimate : null;
  const courierCity = courierPin?.city ?? null;
  const courierState = courierPin?.state ?? null;

  useEffect(() => {
    if (!isCompletePincode(pin)) return;
    const patch = placePatch(placeRef.current, lastFilled.current, {
      state: courierState ?? stateFromPincode(pin),
      city: courierCity,
    });
    if (patch.city === undefined && patch.state === undefined) return;
    lastFilled.current = { ...lastFilled.current, ...patch };
    applyRef.current(patch);
  }, [pin, courierCity, courierState]);
}
