/**
 * Shipping provider selection and the delivery-estimate service.
 *
 * Shiprocket is used when SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD and
 * SHIPROCKET_PICKUP_LOCATION are all set; otherwise ManualShippingProvider.
 * Serviceability answers are cached per PIN in `serviceability_cache/{pincode}`
 * for 12 hours (server-only) to keep checkout and product pages off the courier API.
 */
import type { DocStore } from '../store';
import type { StoreConfig } from '../storeConfig';
import { ManualShippingProvider, INDIAN_PINCODE } from './manual';
import { ShiprocketProvider } from './shiprocket';
import type { ServiceabilityResult, ShippingProvider } from './types';

const CACHE_TTL_MS = 12 * 3600_000;
const IST_OFFSET_MS = 5.5 * 3600_000;

export function createShippingProvider(store: DocStore, config: StoreConfig, env: NodeJS.ProcessEnv = process.env): ShippingProvider {
  const email = env.SHIPROCKET_EMAIL?.trim();
  const password = env.SHIPROCKET_PASSWORD?.trim();
  const pickupLocation = env.SHIPROCKET_PICKUP_LOCATION?.trim();
  const pickupPincode = env.SHIPROCKET_PICKUP_PINCODE?.trim() || config.seller.pincode;
  if (email && password && pickupLocation && INDIAN_PINCODE.test(pickupPincode)) {
    return new ShiprocketProvider({ email, password, pickupLocation, pickupPincode }, store);
  }
  return new ManualShippingProvider({ transitDays: config.fulfilment.manualTransitDays, codEnabled: config.cod.enabled });
}

/** Serviceability with a per-PIN cache; provider failures are not cached. */
export async function serviceabilityFor(
  store: DocStore,
  provider: ShippingProvider,
  pincode: string,
  now = Date.now(),
): Promise<ServiceabilityResult> {
  if (!INDIAN_PINCODE.test(pincode)) return { serviceable: false, codAvailable: false, transitDays: null, courierName: null };
  const path = `serviceability_cache/${provider.name}_${pincode}`;
  const cached = await store.get(path);
  if (cached && typeof cached.cachedAt === 'number' && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.result as ServiceabilityResult;
  }
  const result = await provider.checkServiceability({ deliveryPincode: pincode });
  try {
    await store.set(path, { result, cachedAt: now, expiresAt: new Date(now + CACHE_TTL_MS) });
  } catch (err) {
    console.error(`[shipping] could not cache serviceability for ${pincode}`, err);
  }
  return result;
}

/** Production days for one item: custom pieces use the custom lead time; catalogue items their own or the default. */
export function itemLeadTimeDays(isCustom: boolean, productLeadTimeDays: number | null, config: StoreConfig): number {
  if (isCustom) return config.fulfilment.customLeadTimeDays;
  return productLeadTimeDays ?? config.fulfilment.defaultLeadTimeDays;
}

/** IST calendar date `days` after `now`, as YYYY-MM-DD. */
export function istDatePlusDays(now: number, days: number): string {
  return new Date(now + IST_OFFSET_MS + days * 24 * 3600_000).toISOString().slice(0, 10);
}

export interface DeliveryEstimate {
  serviceable: boolean;
  codAvailable: boolean;
  estimatedDispatchDays: number;
  estimatedDeliveryDate: string | null;
  courierName: string | null;
  /** Delivery city/state when the courier names them; the storefront uses them to prefill addresses. */
  city: string | null;
  state: string | null;
}

/**
 * Dispatch = production lead time (product `leadTimeDays`, store default, or the
 * custom-piece lead time); delivery = dispatch + courier transit (manual transit
 * days when the courier gives no estimate). Calendar days; the workshop calendar
 * (holidays, Sundays) is not modelled yet.
 */
export function buildDeliveryEstimate(params: {
  serviceability: ServiceabilityResult;
  leadTimeDays: number;
  codAllowedForItem: boolean;
  config: StoreConfig;
  now: number;
}): DeliveryEstimate {
  const { serviceability: s, leadTimeDays, config, now } = params;
  const transit = s.transitDays ?? config.fulfilment.manualTransitDays;
  return {
    serviceable: s.serviceable,
    codAvailable: s.serviceable && s.codAvailable && config.cod.enabled && params.codAllowedForItem,
    estimatedDispatchDays: leadTimeDays,
    estimatedDeliveryDate: s.serviceable ? istDatePlusDays(now, leadTimeDays + transit) : null,
    courierName: s.courierName,
    city: s.city ?? null,
    state: s.state ?? null,
  };
}
