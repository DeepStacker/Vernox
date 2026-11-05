import { useQuery } from '@tanstack/react-query';
import { fetchDeliveryEstimate, isValidPincode, type DeliveryEstimate } from './deliveryEstimate';

/**
 * Delivery estimate for a PIN code (and optionally a product, whose production
 * lead time it includes). Queries only for a complete 6-digit PIN; results are
 * cached for 10 minutes per PIN + product.
 */
export function useDeliveryEstimate(pincode: string, productId?: string) {
  const pin = pincode.trim();
  const enabled = isValidPincode(pin);
  const query = useQuery<DeliveryEstimate, Error>({
    queryKey: ['delivery-estimate', pin, productId ?? null],
    queryFn: ({ signal }) => fetchDeliveryEstimate(pin, productId, signal),
    enabled,
    staleTime: 10 * 60_000,
    retry: 1,
  });
  return {
    estimate: enabled ? query.data ?? null : null,
    isLoading: enabled && query.isFetching,
    error: enabled ? query.error ?? null : null,
    isValidPincode: enabled,
  };
}
