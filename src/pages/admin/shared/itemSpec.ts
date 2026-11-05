import { hasCustomDesign } from '@/lib/orders/camDocument';
import type { OrderItem } from '@/types/store';

export const isCustomItem = (item: OrderItem): boolean => hasCustomDesign(item) || Boolean(item.userUploadedImage);

export function itemSizeText(item: OrderItem): string {
  const mm = item.widthMm && item.heightMm ? `${item.widthMm} × ${item.heightMm} mm` : '';
  return [item.sizeLabel, mm].filter(Boolean).join(' · ') || 'Size not recorded';
}
