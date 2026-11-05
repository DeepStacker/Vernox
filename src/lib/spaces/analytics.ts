import { trackStoreEvent } from '@/lib/storeAnalytics';

/**
 * Stage 2 events (ROADMAP.md, "Decision: room scanning and interior planning"), recorded through the
 * storefront tracker like the wall-preview events. Ids, counts and amounts only: never photos, names or notes.
 * `consultation_purchased` is also countable from the server (`consultations/` documents), which is the
 * authoritative count; the browser events show the funnel around it.
 */
export type SpaceEvent =
  | 'space_created'
  | 'wall_added'
  | 'consultation_purchased'
  | 'proposal_viewed'
  | 'proposal_item_added_to_cart'
  | 'consultation_credit_redeemed';

export type SpaceEventData = Record<string, string | number | boolean>;

export function trackSpaceEvent(event: SpaceEvent, data: SpaceEventData = {}): void {
  trackStoreEvent('view', { event, eventData: data });
}
