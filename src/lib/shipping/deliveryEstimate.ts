/**
 * Client for GET /api/serviceability (PIN-code serviceability, COD availability
 * and delivery estimate) and the remembered delivery PIN code.
 */
import { safeLocal } from '@/lib/safeStorage';

export interface DeliveryEstimate {
  pincode: string;
  serviceable: boolean;
  codAvailable: boolean;
  /** Production days before dispatch. */
  estimatedDispatchDays: number;
  /** YYYY-MM-DD (IST), or null when not serviceable. */
  estimatedDeliveryDate: string | null;
  courierName: string | null;
}

export class DeliveryEstimateError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'DeliveryEstimateError';
  }
}

const PINCODE_KEY = 'vernox.deliveryPincode';

export function isValidPincode(pincode: string): boolean {
  return /^[1-9][0-9]{5}$/.test(pincode.trim());
}

export function rememberedPincode(): string {
  const value = safeLocal.get(PINCODE_KEY) ?? '';
  return isValidPincode(value) ? value : '';
}

export function rememberPincode(pincode: string): void {
  if (isValidPincode(pincode)) safeLocal.set(PINCODE_KEY, pincode.trim());
}

export async function fetchDeliveryEstimate(pincode: string, productId?: string, signal?: AbortSignal): Promise<DeliveryEstimate> {
  const params = new URLSearchParams({ pincode: pincode.trim() });
  if (productId) params.set('productId', productId);
  let res: Response;
  try {
    res = await fetch(`/api/serviceability?${params.toString()}`, { signal });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new DeliveryEstimateError('Could not check delivery right now. Please try again.', 'NETWORK_ERROR');
  }
  const body = (await res.json().catch(() => null)) as (Partial<DeliveryEstimate> & { success?: boolean; message?: string; code?: string }) | null;
  if (!res.ok || !body || body.success === false) {
    throw new DeliveryEstimateError(body?.message || 'Could not check delivery for this PIN code.', body?.code ?? 'UNKNOWN');
  }
  return {
    pincode: String(body.pincode ?? pincode),
    serviceable: body.serviceable === true,
    codAvailable: body.codAvailable === true,
    estimatedDispatchDays: Number(body.estimatedDispatchDays ?? 0),
    estimatedDeliveryDate: typeof body.estimatedDeliveryDate === 'string' ? body.estimatedDeliveryDate : null,
    courierName: typeof body.courierName === 'string' ? body.courierName : null,
  };
}

/** "Tue, 12 Nov" for a YYYY-MM-DD date. */
export function formatDeliveryDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
