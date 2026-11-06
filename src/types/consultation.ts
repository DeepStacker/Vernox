/**
 * Stage 2 "My Space" and paid design consultation: document shapes shared by the browser and the
 * API (dependency-free). Firestore layout: DATABASE.md ("Spaces and consultations").
 *
 *   users/{uid}/spaces/{spaceId}            customer-owned, client-written (firestore.rules)
 *   consultations/{orderId}                 server-written; the id equals the paid order's id
 *   consultations/{orderId}/private/draft   staff-only proposal draft, server-written
 */

/** Service line sold through the prepaid checkout; there is no `products/` document for it. */
export const CONSULTATION_SERVICE_ID = 'design-consultation';

/** Prefix of the single-use credit coupons issued with a consultation (customer-visible code). */
export const CONSULTATION_CREDIT_PREFIX = 'DESIGN-';

/** SAC for "specialty design services including interior design". OWNER TO CONFIRM with the CA. */
export const DEFAULT_CONSULTATION_SAC = '998391';

export const MAX_WALLS_PER_SPACE = 8;
export const MAX_PROPOSAL_ITEMS = 12;
export const FREE_REVISIONS = 1;

export const BUDGET_BANDS = [
  { id: 'under_10k', label: 'Under ₹10,000' },
  { id: '10k_25k', label: '₹10,000 to ₹25,000' },
  { id: '25k_50k', label: '₹25,000 to ₹50,000' },
  { id: 'over_50k', label: 'Over ₹50,000' },
] as const;
export type BudgetBandId = (typeof BUDGET_BANDS)[number]['id'];

/** `settings/store.consultation` (rupees). Server parsing and defaults: api/_lib/storeConfig.ts. */
export interface ConsultationSettings {
  enabled: boolean;
  /** Fee before GST, like every catalogue price. Owner to confirm. */
  priceInr: number;
  /** Issue a single-use coupon for the fee, redeemable on the customer's next order. */
  creditTowardsOrder: boolean;
  creditValidityDays: number;
  /** Days from purchase to a proposal; the designer queue shows it as the SLA. */
  turnaroundDays: number;
  /** SAC printed on the service line: 998391, specialty (interior) design services. */
  sacCode: string;
  /** GST on the service, independent of the goods rate: 18% for SAC 998391 (unchanged by GST 2.0). */
  gstRatePercent: number;
}

export const DEFAULT_CONSULTATION_SETTINGS: ConsultationSettings = {
  enabled: false,
  priceInr: 999,
  creditTowardsOrder: true,
  creditValidityDays: 60,
  turnaroundDays: 3,
  sacCode: DEFAULT_CONSULTATION_SAC,
  gstRatePercent: 18,
};

/** One wall of a space. Photo at `spaces/{uid}/{spaceId}/{id}.jpg`; the scale is stored, not the marks. */
export interface SpaceWall {
  id: string;
  name: string;
  /** Wall width and height in cm: typed, or derived from the photo's scale. */
  widthCm: number;
  heightCm: number;
  /** Photo pixels per cm; null without a photo. */
  pxPerCm: number | null;
  photoPath: string | null;
  photoWidth: number | null;
  photoHeight: number | null;
  /** Furniture below, colours, anything the designer should know. */
  notes: string;
}

export interface SpaceDoc {
  id: string;
  name: string;
  roomType: string;
  budgetBand: BudgetBandId | null;
  notes: string;
  walls: SpaceWall[];
  createdAt: number;
  updatedAt: number;
}

export const CONSULTATION_STATUSES = ['new', 'in_progress', 'proposed', 'closed'] as const;
export type ConsultationStatus = (typeof CONSULTATION_STATUSES)[number];

/** Wall as snapshotted into a consultation; photos are copied to `consultations/{id}/walls/{wallId}.jpg`. */
export type ConsultationWall = SpaceWall;

export type ProposalItemKind = 'catalogue' | 'custom';

export interface ProposalItem {
  id: string;
  wallId: string;
  kind: ProposalItemKind;
  /** Catalogue product id (kind catalogue). */
  productId: string | null;
  productName: string;
  sizeLabel: string | null;
  widthMm: number;
  heightMm: number;
  finish: string;
  /** Studio document JSON (kind custom); becomes the cart line's customDesignRef. */
  designRef: string | null;
  /** Piece centre on the wall photo in wall cm, and its rotation. */
  pose: { cx: number; cy: number; rotationDeg: number };
  /** Composed preview image at `consultations/{id}/previews/{itemId}.png`. */
  previewPath: string | null;
  note: string;
}

export interface ProposalDraft {
  items: ProposalItem[];
  note: string;
  updatedAt: number;
  updatedBy: string;
}

export interface Proposal {
  version: number;
  items: ProposalItem[];
  note: string;
  sentAt: number;
  sentBy: string;
}

export interface ConsultationCredit {
  /** Customer-visible coupon code, bound to the customer's email. */
  code: string;
  /** Rupees (the consultation fee before GST). */
  amountInr: number;
  expiresAt: number;
}

export interface ConsultationDoc {
  id: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  customerName: string;
  status: ConsultationStatus;
  outcome: 'accepted' | 'declined' | null;
  spaceId: string;
  spaceName: string;
  roomType: string;
  budgetBand: BudgetBandId | null;
  notes: string;
  walls: ConsultationWall[];
  /** False until the wall photos have been copied from the customer's space. */
  photosReady: boolean;
  pricePaise: number;
  turnaroundDays: number;
  createdAt: number;
  dueAt: number;
  assignedUid: string | null;
  assignedName: string | null;
  proposal: Proposal | null;
  revisionsUsed: number;
  revisionNote: string | null;
  credit: ConsultationCredit | null;
  creditRedeemedAt: number | null;
  creditRedeemedOrderId: string | null;
  updatedAt: number;
}
