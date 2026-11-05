import { trackStoreEvent } from '@/lib/storeAnalytics';

export type WallPreviewEvent =
  | 'wall_preview_opened'
  | 'room_scene_changed'
  | 'own_photo_used'
  | 'size_changed_in_preview'
  | 'ar_launched'
  | 'ar_unsupported'
  | 'preview_saved'
  | 'preview_shared'
  | 'fit_recommendation_used';

export type EventData = Record<string, string | number | boolean>;

/**
 * Records a wall-preview interaction through the storefront tracker. Callers pass ids, sizes and finishes only:
 * no personal data, and never the customer's photo or its contents.
 */
export function trackWallPreview(event: WallPreviewEvent, data: EventData = {}): void {
  trackStoreEvent('view', { event, eventData: data });
}
