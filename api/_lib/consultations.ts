/**
 * Paid design consultation, purchase side.
 *
 * The consultation is sold through the ordinary prepaid checkout (checkout.ts) as a server-defined
 * service line (pricing.priceConsultationLine): same Razorpay order, signature check, webhook and
 * idempotent confirmation as a product order, so there is one payment path to trust.
 *
 *  1. /api/consultation PURCHASE reads the customer's own space, snapshots it into
 *     `order.consultation` (ConsultationPurchase) and creates a Pending_Payment order of kind
 *     `service`. The client never sends the price; settings and the space are read here.
 *  2. confirmPayment (payments.ts) calls planConsultationOnPayment() inside the transaction that
 *     marks the order Paid: it creates `consultations/{orderId}` and, when the store credits the
 *     fee towards the next order, a single-use coupon bound to the customer's email.
 *  3. After that transaction commits, copyConsultationPhotos() copies the wall photos from the
 *     customer's private `spaces/...` paths to `consultations/{id}/walls/...`, so designers never
 *     need access to anyone's space. It is idempotent and retried when a designer claims the job.
 *
 * Workflow after purchase (claim, proposal, revision, close): proposals.ts.
 */
import crypto from 'crypto';
import { CONSULTATION_CREDIT_PREFIX, MAX_WALLS_PER_SPACE, type ConsultationDoc, type SpaceWall } from '../../src/types/consultation';
import { ApiError } from './errors';
import { paiseToRupees } from './money';
import type { OrderDoc } from './orders';
import type { DocData, DocStore } from './store';
import type { StoreConfig } from './storeConfig';

const DAY_MS = 24 * 3600_000;

/** What the order freezes at purchase time. Everything payment confirmation needs, no further reads. */
export interface ConsultationPurchase {
  spaceId: string;
  spaceName: string;
  roomType: string;
  budgetBand: ConsultationDoc['budgetBand'];
  notes: string;
  walls: SpaceWall[];
  customerName: string;
  turnaroundDays: number;
  creditTowardsOrder: boolean;
  creditValidityDays: number;
}

export const spacePath = (uid: string, spaceId: string) => `users/${uid}/spaces/${spaceId}`;
export const consultationPath = (id: string) => `consultations/${id}`;
export const creditCouponId = (orderId: string) => `cc_${orderId}`;
export const wallSnapshotPath = (consultationId: string, wallId: string) => `consultations/${consultationId}/walls/${wallId}.jpg`;

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const finiteNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Wall as stored in the space document; anything malformed is dropped rather than trusted. */
function wallFromDoc(raw: unknown, uid: string, spaceId: string): SpaceWall | null {
  const w = raw as Record<string, unknown> | null;
  const id = typeof w?.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(w.id) ? w.id : null;
  const widthCm = finiteNumber(w?.widthCm);
  const heightCm = finiteNumber(w?.heightCm);
  if (!w || !id || widthCm === null || heightCm === null || widthCm <= 0 || heightCm <= 0) return null;
  // Only the wall's own photo path is accepted, so a tampered document cannot make the server copy another file.
  const ownPath = `spaces/${uid}/${spaceId}/${id}.jpg`;
  const hasPhoto = w.photoPath === ownPath;
  return {
    id,
    name: text(w.name, 80) || 'Wall',
    widthCm: Math.min(widthCm, 3000),
    heightCm: Math.min(heightCm, 1500),
    pxPerCm: hasPhoto ? finiteNumber(w.pxPerCm) : null,
    photoPath: hasPhoto ? ownPath : null,
    photoWidth: hasPhoto ? finiteNumber(w.photoWidth) : null,
    photoHeight: hasPhoto ? finiteNumber(w.photoHeight) : null,
    notes: text(w.notes, 1000),
  };
}

const BUDGET_IDS = new Set(['under_10k', '10k_25k', '25k_50k', 'over_50k']);

/** Reads the customer's own space and freezes it, with the store's consultation terms, for the order. */
export async function loadConsultationPurchase(
  store: DocStore,
  config: StoreConfig,
  params: { uid: string; spaceId: string; customerName: string },
): Promise<ConsultationPurchase> {
  const c = config.consultation;
  if (!c.enabled) throw new ApiError(409, 'CONFLICT', 'Design consultations are not available right now.');
  const data = await store.get(spacePath(params.uid, params.spaceId));
  if (!data) throw new ApiError(404, 'NOT_FOUND', 'This space could not be found.');
  const walls = (Array.isArray(data.walls) ? data.walls : [])
    .slice(0, MAX_WALLS_PER_SPACE)
    .map(w => wallFromDoc(w, params.uid, params.spaceId))
    .filter((w): w is SpaceWall => w !== null);
  if (!walls.some(w => w.photoPath)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Add at least one wall with a photo before asking for design help.');
  }
  return {
    spaceId: params.spaceId,
    spaceName: text(data.name, 80) || 'My space',
    roomType: text(data.roomType, 24),
    budgetBand: typeof data.budgetBand === 'string' && BUDGET_IDS.has(data.budgetBand) ? (data.budgetBand as ConsultationDoc['budgetBand']) : null,
    notes: text(data.notes, 2000),
    walls,
    customerName: params.customerName,
    turnaroundDays: c.turnaroundDays,
    creditTowardsOrder: c.creditTowardsOrder,
    creditValidityDays: c.creditValidityDays,
  };
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Hard to guess and easy to read out: DESIGN- plus eight characters. */
export function generateCreditCode(bytes: Buffer = crypto.randomBytes(8)): string {
  return CONSULTATION_CREDIT_PREFIX + Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export interface ConsultationWrites {
  consultation: ConsultationDoc;
  /** Coupon document (rupee amounts, as the coupon engine reads them), or null when there is no credit. */
  coupon: DocData | null;
  notificationExtra: { creditCode: string | null; creditPaise: number; creditExpiresAt: number | null };
}

/**
 * Documents to create when the consultation order is paid (pure). The credit is the fee before GST
 * (`unit price`), applied by the coupon engine as a pre-tax discount like any other coupon.
 */
export function planConsultationOnPayment(order: OrderDoc, creditCode: string, now: number): ConsultationWrites | null {
  const purchase = order.consultation;
  if (!purchase || !order.userId) return null;
  const feePaise = order.items[0]?.unitPricePaise ?? 0;
  const expiresAt = now + purchase.creditValidityDays * DAY_MS;
  const credit = purchase.creditTowardsOrder && feePaise > 0;
  const consultation: ConsultationDoc = {
    id: order.id,
    orderId: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    customerName: purchase.customerName,
    status: 'new',
    outcome: null,
    spaceId: purchase.spaceId,
    spaceName: purchase.spaceName,
    roomType: purchase.roomType,
    budgetBand: purchase.budgetBand,
    notes: purchase.notes,
    walls: purchase.walls.map(w => ({ ...w, photoPath: w.photoPath ? wallSnapshotPath(order.id, w.id) : null })),
    photosReady: !purchase.walls.some(w => w.photoPath),
    pricePaise: feePaise,
    turnaroundDays: purchase.turnaroundDays,
    createdAt: now,
    dueAt: now + purchase.turnaroundDays * DAY_MS,
    assignedUid: null,
    assignedName: null,
    proposal: null,
    revisionsUsed: 0,
    revisionNote: null,
    credit: credit ? { code: creditCode, amountInr: paiseToRupees(feePaise), expiresAt } : null,
    creditRedeemedAt: null,
    creditRedeemedOrderId: null,
    updatedAt: now,
  };
  const coupon: DocData | null = credit
    ? {
        code: creditCode,
        description: 'Design consultation credit',
        discountType: 'fixed',
        discountValue: paiseToRupees(feePaise),
        usedCount: 0,
        maxUsageCount: 1,
        maxUsagePerCustomer: 1,
        expiryDate: new Date(expiresAt).toISOString(),
        isActive: true,
        // Bound to the paying customer: no one else can redeem the code (coupons.ts, boundEmail).
        boundEmail: order.email.toLowerCase(),
        consultationId: order.id,
        source: 'consultation_credit',
        createdAt: now,
        updatedAt: now,
      }
    : null;
  return {
    consultation,
    coupon,
    notificationExtra: credit
      ? { creditCode, creditPaise: feePaise, creditExpiresAt: expiresAt }
      : { creditCode: null, creditPaise: 0, creditExpiresAt: null },
  };
}

/** File copy between two bucket paths (Admin SDK in production, a fake in tests). */
export interface PhotoStorage {
  copy(fromPath: string, toPath: string): Promise<void>;
}

/**
 * Copies the wall photos of a paid consultation into its own storage folder, then flags the document.
 * Safe to run twice. A failure leaves `photosReady` false so the queue shows it and a claim retries.
 * Returns whether every photo is in place.
 */
export async function copyConsultationPhotos(
  store: DocStore,
  storage: PhotoStorage,
  orderId: string,
  now = Date.now(),
): Promise<boolean> {
  const order = (await store.get(`orders/${orderId}`)) as unknown as OrderDoc | null;
  const consultation = (await store.get(consultationPath(orderId))) as unknown as ConsultationDoc | null;
  if (!order?.consultation || !consultation) return false;
  if (consultation.photosReady) return true;
  let ok = true;
  for (const wall of order.consultation.walls) {
    if (!wall.photoPath) continue;
    try {
      await storage.copy(wall.photoPath, wallSnapshotPath(orderId, wall.id));
    } catch (err) {
      ok = false;
      console.error(`[consultations] could not copy photo of wall ${wall.id} for ${orderId}`, err);
    }
  }
  if (ok) await store.update(consultationPath(orderId), { photosReady: true, updatedAt: now });
  return ok;
}
