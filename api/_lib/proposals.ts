/**
 * Design consultation workflow after purchase (purchase side: consultations.ts).
 *
 *   new ──claim──► in_progress ──send──► proposed ──accept / decline──► closed
 *                       ▲                    │
 *                       └──── revision ──────┘   (one free revision; the designer sends version 2)
 *
 * Staff (permission `consultations.manage`, enforced by /api/admin): claim, save the private draft,
 * send. Customers (their own consultation only, /api/consultation): request the revision, close.
 * Every write is one transaction; sending also enqueues the customer's `proposal_ready` notification
 * in the same transaction (one per proposal version).
 *
 * The draft lives in `consultations/{id}/private/draft`, which customers cannot read; sending copies
 * it into `consultations/{id}.proposal`, which they can. Items are validated against the live
 * catalogue and the custom-piece rules at send time, so a customer can only be offered what checkout
 * will accept: the prices they see are re-derived by the server again when they pay.
 */
import { z } from 'zod';
import {
  FREE_REVISIONS,
  MAX_PROPOSAL_ITEMS,
  type ConsultationDoc,
  type Proposal,
  type ProposalDraft,
  type ProposalItem,
} from '../../src/types/consultation';
import { auditInTransaction, buildAuditEntry } from './audit';
import type { StaffUser } from './auth';
import { consultationPath, copyConsultationPhotos, type PhotoStorage } from './consultations';
import { ApiError } from './errors';
import { enqueueNotification, payloadFromOrder, planNotification } from './notifications/outbox';
import { asOrder, orderPath } from './orders';
import { priceCatalogLine, priceCustomLine, productFromDoc, type ProductRecord } from './pricing';
import type { DocStore } from './store';
import type { StoreConfig } from './storeConfig';

const DAY_MS = 24 * 3600_000;
const MAX_DESIGN_CHARS = 200_000;
const MAX_TOTAL_DESIGN_CHARS = 600_000; // consultation + draft documents stay well under Firestore's 1 MiB

const idField = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

const proposalItemObject = z.object({
  id: idField,
  wallId: idField,
  kind: z.enum(['catalogue', 'custom']),
  productId: z.string().trim().min(1).max(128).nullable(),
  productName: z.string().trim().min(1).max(200),
  sizeLabel: z.string().trim().max(120).nullable(),
  widthMm: z.number().int().positive().max(10_000),
  heightMm: z.number().int().positive().max(10_000),
  finish: z.string().trim().min(1).max(64),
  designRef: z.string().min(2).max(MAX_DESIGN_CHARS).nullable(),
  pose: z.object({ cx: z.number().finite().min(-5000).max(5000), cy: z.number().finite().min(-5000).max(5000), rotationDeg: z.number().finite().min(-360).max(360) }),
  previewPath: z.string().max(200).nullable(),
  note: z.string().trim().max(500),
});

export const proposalDraftSchema = z
  .object({
    items: z.array(proposalItemObject).max(MAX_PROPOSAL_ITEMS),
    note: z.string().trim().max(1000),
  })
  .superRefine((draft, ctx) => {
    const ids = new Set<string>();
    let designChars = 0;
    for (const [i, item] of draft.items.entries()) {
      if (ids.has(item.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items', i, 'id'], message: 'duplicate item id' });
      ids.add(item.id);
      designChars += item.designRef?.length ?? 0;
      if (item.kind === 'catalogue' && !item.productId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items', i, 'productId'], message: 'required for a catalogue item' });
      if (item.kind === 'custom' && !item.designRef) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items', i, 'designRef'], message: 'required for a custom design' });
    }
    if (designChars > MAX_TOTAL_DESIGN_CHARS) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'custom design data is too large' });
  }) as unknown as z.ZodType<{ items: ProposalItem[]; note: string }, z.ZodTypeDef, unknown>;

type Actor = Pick<StaffUser, 'uid' | 'email' | 'role'>;

const isAdminRole = (role: StaffUser['role']) => role === 'admin' || role === 'super_admin';
const draftPath = (id: string) => `${consultationPath(id)}/private/draft`;
const previewPathFor = (consultationId: string, itemId: string) => `consultations/${consultationId}/previews/${itemId}.png`;

async function loadConsultation(store: DocStore, id: string): Promise<ConsultationDoc> {
  const data = await store.get(consultationPath(id));
  if (!data) throw new ApiError(404, 'NOT_FOUND', 'Consultation not found.');
  return data as unknown as ConsultationDoc;
}

/** The designer takes the job (admins may take over). Retries the photo copy when it had not finished. */
export async function claimConsultation(
  store: DocStore,
  storage: PhotoStorage | null,
  params: { id: string; actor: Actor; ip?: string; now?: number },
): Promise<ConsultationDoc> {
  const now = params.now ?? Date.now();
  const updated = await store.runTransaction(async tx => {
    const data = await tx.get(consultationPath(params.id));
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Consultation not found.');
    const c = data as unknown as ConsultationDoc;
    if (c.status === 'closed') throw new ApiError(409, 'CONFLICT', 'This consultation is closed.');
    if (c.assignedUid && c.assignedUid !== params.actor.uid && !isAdminRole(params.actor.role)) {
      throw new ApiError(409, 'CONFLICT', 'This consultation is already being handled by another designer.');
    }
    const fields = {
      assignedUid: params.actor.uid,
      assignedName: (params.actor.email ?? 'designer').split('@')[0],
      status: c.status === 'new' ? 'in_progress' : c.status,
      updatedAt: now,
    };
    tx.update(consultationPath(params.id), fields);
    auditInTransaction(store, tx, buildAuditEntry({ actor: params.actor, action: 'CONSULTATION_CLAIMED', targetType: 'consultation', targetId: params.id, ip: params.ip, now }));
    return { ...c, ...fields } as ConsultationDoc;
  });
  if (!updated.photosReady && storage) {
    const ok = await copyConsultationPhotos(store, storage, params.id, now).catch(() => false);
    if (ok) return { ...updated, photosReady: true };
  }
  return updated;
}

function assertCanEdit(c: ConsultationDoc, actor: Actor) {
  if (c.status === 'closed' || c.status === 'proposed') {
    throw new ApiError(409, 'CONFLICT', c.status === 'closed' ? 'This consultation is closed.' : 'The proposal has been sent. Wait for the customer to ask for a revision.');
  }
  if (c.assignedUid !== actor.uid && !isAdminRole(actor.role)) {
    throw new ApiError(409, 'CONFLICT', 'Claim this consultation before editing its proposal.');
  }
}

/** Saves the private draft. Preview images must be the item's own file under this consultation. */
export async function saveProposalDraft(
  store: DocStore,
  params: { id: string; actor: Actor; draft: { items: ProposalItem[]; note: string }; ip?: string; now?: number },
): Promise<void> {
  const now = params.now ?? Date.now();
  for (const item of params.draft.items) {
    if (item.previewPath !== null && item.previewPath !== previewPathFor(params.id, item.id)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'A preview image does not belong to this consultation.');
    }
  }
  await store.runTransaction(async tx => {
    const c = (await tx.get(consultationPath(params.id))) as unknown as ConsultationDoc | null;
    if (!c) throw new ApiError(404, 'NOT_FOUND', 'Consultation not found.');
    assertCanEdit(c, params.actor);
    const wallIds = new Set(c.walls.map(w => w.id));
    if (params.draft.items.some(i => !wallIds.has(i.wallId))) throw new ApiError(400, 'VALIDATION_ERROR', 'An item refers to a wall that is not in this consultation.');
    const draft: ProposalDraft = { items: params.draft.items, note: params.draft.note, updatedAt: now, updatedBy: params.actor.uid };
    tx.set(draftPath(params.id), draft as unknown as Record<string, unknown>);
    tx.update(consultationPath(params.id), { updatedAt: now });
  });
}

/** Throws INVALID_ITEM when the offered piece could not be ordered as described. */
function assertOrderable(item: ProposalItem, product: ProductRecord | null, config: StoreConfig) {
  if (item.kind === 'catalogue') {
    priceCatalogLine({ productId: item.productId!, sizeLabel: item.sizeLabel ?? undefined, widthMm: item.widthMm, heightMm: item.heightMm, finish: item.finish, quantity: 1 }, product, config);
  } else {
    priceCustomLine({ productId: 'custom-bespoke', widthMm: item.widthMm, heightMm: item.heightMm, finish: item.finish, quantity: 1 }, config);
    try {
      JSON.parse(item.designRef!);
    } catch {
      throw new ApiError(400, 'INVALID_ITEM', `The custom design "${item.productName}" is not valid design data.`);
    }
  }
}

/** Publishes the draft to the customer as the next proposal version and notifies them. */
export async function sendProposal(
  store: DocStore,
  config: StoreConfig,
  params: { id: string; actor: Actor; ip?: string; now?: number },
): Promise<Proposal> {
  const now = params.now ?? Date.now();
  const draftData = await store.get(draftPath(params.id));
  const draft = draftData as unknown as ProposalDraft | null;
  if (!draft || draft.items.length === 0) throw new ApiError(400, 'VALIDATION_ERROR', 'Add at least one piece to the proposal first.');
  const catalogueIds = [...new Set(draft.items.filter(i => i.kind === 'catalogue').map(i => i.productId!))];
  const productDocs = await Promise.all(catalogueIds.map(id => store.get(`products/${id}`)));
  const products = new Map(catalogueIds.map((id, i) => [id, productFromDoc(id, productDocs[i])]));
  for (const item of draft.items) {
    if (!item.previewPath) throw new ApiError(400, 'VALIDATION_ERROR', `Place "${item.productName}" on a wall photo before sending.`);
    assertOrderable(item, item.kind === 'catalogue' ? products.get(item.productId!) ?? null : null, config);
  }

  return store.runTransaction(async tx => {
    const c = (await tx.get(consultationPath(params.id))) as unknown as ConsultationDoc | null;
    if (!c) throw new ApiError(404, 'NOT_FOUND', 'Consultation not found.');
    assertCanEdit(c, params.actor);
    const order = asOrder(await tx.get(orderPath(params.id)));
    if (!order) throw new ApiError(404, 'NOT_FOUND', 'The order for this consultation was not found.');
    const version = (c.proposal?.version ?? 0) + 1;
    const plan = await planNotification(tx, params.id, 'proposal_ready', `v${version}`);

    const proposal: Proposal = { version, items: draft.items, note: draft.note, sentAt: now, sentBy: params.actor.uid };
    tx.update(consultationPath(params.id), { proposal, status: 'proposed', updatedAt: now });
    enqueueNotification(tx, plan, payloadFromOrder(order, { note: draft.note || null }), now);
    auditInTransaction(store, tx, buildAuditEntry({ actor: params.actor, action: 'CONSULTATION_PROPOSAL_SENT', targetType: 'consultation', targetId: params.id, details: { version, items: draft.items.length }, ip: params.ip, now }));
    return proposal;
  });
}

function assertOwner(c: ConsultationDoc, uid: string) {
  // The same 404 for "missing" and "not yours", so consultation ids cannot be probed.
  if (c.userId !== uid) throw new ApiError(404, 'NOT_FOUND', 'Consultation not found.');
}

/** The customer's one free revision: back to the designer with a message, SLA restarted. */
export async function requestRevision(
  store: DocStore,
  params: { id: string; uid: string; message: string; now?: number },
): Promise<void> {
  const now = params.now ?? Date.now();
  await store.runTransaction(async tx => {
    const c = (await tx.get(consultationPath(params.id))) as unknown as ConsultationDoc | null;
    if (!c) throw new ApiError(404, 'NOT_FOUND', 'Consultation not found.');
    assertOwner(c, params.uid);
    if (c.status !== 'proposed') throw new ApiError(409, 'CONFLICT', 'There is no proposal to revise right now.');
    if (c.revisionsUsed >= FREE_REVISIONS) throw new ApiError(409, 'CONFLICT', 'The free revision has already been used. Please contact support for more changes.');
    tx.update(consultationPath(params.id), {
      status: 'in_progress',
      revisionsUsed: c.revisionsUsed + 1,
      revisionNote: params.message,
      dueAt: now + c.turnaroundDays * DAY_MS,
      updatedAt: now,
    });
  });
}

/** Accept or decline the proposal; either way the consultation is finished. */
export async function closeConsultation(
  store: DocStore,
  params: { id: string; uid: string; outcome: 'accepted' | 'declined'; now?: number },
): Promise<void> {
  const now = params.now ?? Date.now();
  await store.runTransaction(async tx => {
    const c = (await tx.get(consultationPath(params.id))) as unknown as ConsultationDoc | null;
    if (!c) throw new ApiError(404, 'NOT_FOUND', 'Consultation not found.');
    assertOwner(c, params.uid);
    if (c.status !== 'proposed') throw new ApiError(409, 'CONFLICT', 'There is no proposal to close right now.');
    tx.update(consultationPath(params.id), { status: 'closed', outcome: params.outcome, updatedAt: now });
  });
}
