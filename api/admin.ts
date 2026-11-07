/**
 * /api/admin — staff operations.
 *
 * Authentication: `Authorization: Bearer <Firebase ID token>`; the `role` custom
 * claim must be a StaffRole and the action's permission must be granted by
 * STAFF_ROLE_PERMISSIONS (src/types/admin.ts). Staff sign in with Firebase Auth;
 * there is no shared password or server-issued session token.
 * Body (POST) or query (GET): `{ action, ...params }`. Every mutation is audited.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Auth } from 'firebase-admin/auth';
import { z } from 'zod';
import { appendNote } from '../src/lib/orders/orderNotes';
import { STAFF_ROLES, isStaffRole, roleHasPermission, type Permission, type StaffMember } from '../src/types/admin';
import { auditInTransaction, buildAuditEntry, recordAudit } from './_lib/audit';
import { requireStaff, type StaffUser } from './_lib/auth';
import { cancelOrder } from './_lib/cancellation';
import { normaliseCouponCode } from './_lib/coupons';
import { ApiError, badRequest, sendError } from './_lib/errors';
import { getAdminAuth, getPhotoStorage, getStore } from './_lib/firebaseAdmin';
import { applyInvoice, invoicePath, planInvoice, type TaxDocument } from './_lib/gst/invoice';
import { clientIp } from './_lib/http';
import { rupeesToPaise } from './_lib/money';
import { STAFF_SETTABLE_STATUSES, type OrderStatus } from './_lib/orderLifecycle';
import { HOLDABLE_STATUSES, HOLD_KINDS, type OrderHold } from '../src/types/orderStatus';
import { applyStatusChange, planStatusChange } from './_lib/orderTransitions';
import { asOrder, orderPath } from './_lib/orders';
import { createRazorpayGateway, createRazorpayPaymentLinkGateway, createRazorpayRefundGateway } from './_lib/razorpay';
import { enforceRateLimit, RATE_LIMITS } from './_lib/rateLimit';
import { deleteReviewAndPhotos, syncPublicReviewPhotos } from './_lib/reviewPhotos';
import { claimConsultation, proposalDraftSchema, saveProposalDraft, sendProposal } from './_lib/proposals';
import { createRefund, refundCeilingPaise } from './_lib/refunds';
import { decideReturn, markReturnReceived, returnPath } from './_lib/returns';
import { addTicketMessage, createStaffTicket, setTicketStatus, staffTicketSchema, ticketIdSchema, TICKET_STATUSES } from './_lib/tickets';
import { createShippingProvider } from './_lib/shipping';
import { applyCourierStatus, bulkShipmentDocuments, cancelShipment, courierRatesFor, createShipment, getLabel, type ManualShipmentDetails } from './_lib/shipping/shipments';
import type { PackageDetails } from './_lib/shipping/types';
import type { DocStore } from './_lib/store';
import { createStaffOrder, quoteStaffOrder, staffOrderSchema, staffQuoteSchema } from './_lib/staffOrders';
import { launchStatus } from './_lib/launchStatus';
import { loadStoreConfig } from './_lib/storeConfig';

interface ActionContext {
  store: DocStore;
  auth: Auth;
  actor: StaffUser;
  ip: string;
  params: Record<string, unknown>;
}

interface ActionDefinition {
  method: 'GET' | 'POST';
  permission: Permission | null; // null = any staff role
  run(ctx: ActionContext): Promise<Record<string, unknown>>;
}

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, params: unknown): T {
  const result = schema.safeParse(params);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw badRequest(`Invalid request: ${issue?.path.join('.') || 'params'} ${issue?.message ?? ''}`.trim());
  }
  return result.data;
}

const audit = (ctx: ActionContext, action: string, targetType: Parameters<typeof buildAuditEntry>[0]['targetType'], targetId: string, details?: Record<string, unknown>) =>
  buildAuditEntry({ actor: ctx.actor, action, targetType, targetId, details, ip: ctx.ip });

// ---------- schemas ----------

const couponSchema = z.object({
  id: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/),
  description: z.string().trim().max(300).default(''),
  discountType: z.enum(['percentage', 'fixed']),
  discountValue: z.number().positive(),
  maxDiscountLimit: z.number().nonnegative().optional(),
  minOrderValue: z.number().nonnegative().optional(),
  maxUsageCount: z.number().int().positive().optional(),
  maxUsagePerCustomer: z.number().int().positive().optional(),
  startDate: z.string().trim().max(40).optional(),
  expiryDate: z.string().trim().max(40).optional(),
  isActive: z.boolean(),
  applicableCategories: z.array(z.string().max(64)).max(50).optional(),
  applicableProductIds: z.array(z.string().max(128)).max(200).optional(),
}).refine(c => c.discountType !== 'percentage' || c.discountValue <= 100, { message: 'percentage cannot exceed 100', path: ['discountValue'] });

const reviewSchema = z.object({
  id: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/),
  productId: z.string().trim().min(1).max(128),
  customerName: z.string().trim().min(1).max(120),
  customerRole: z.string().trim().max(120).optional(),
  location: z.string().trim().max(120).optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(5000),
  placedAt: z.number().int().positive().optional(),
  verified: z.boolean().optional(),
  featured: z.boolean().optional(),
  status: z.enum(['published', 'pending', 'archived']),
  conciergeResponse: z.string().trim().max(5000).optional(),
});

const idSchema = (key: string) => z.object({ [key]: z.string().trim().regex(/^[A-Za-z0-9_-]{1,128}$/) });

const orderIdField = z.string().trim().regex(/^[A-Za-z0-9]{10,40}$/);
const consultationIdField = z.string().trim().regex(/^[A-Za-z0-9]{10,40}$/);
const reasonField = z.string().trim().min(3).max(300);
const MAX_NOTES_LENGTH = 20_000;
const MAX_BULK_DOCUMENT_ORDERS = 200;
const packageSchema = z.object({
  lengthCm: z.number().positive().max(300),
  breadthCm: z.number().positive().max(300),
  heightCm: z.number().positive().max(300),
  weightKg: z.number().positive().max(100),
});
const packageQuerySchema = {
  lengthCm: z.coerce.number().positive().max(300),
  breadthCm: z.coerce.number().positive().max(300),
  heightCm: z.coerce.number().positive().max(300),
  weightKg: z.coerce.number().positive().max(100),
};

// ---------- actions ----------

const ACTIONS: Record<string, ActionDefinition> = {
  GET_AUDIT_LOGS: {
    method: 'GET',
    permission: 'audit.read',
    async run({ store, params }) {
      const targetType = typeof params.targetType === 'string' && params.targetType ? params.targetType : undefined;
      const logs = await store.query('audit_logs', {
        where: targetType ? [{ field: 'targetType', op: '==', value: targetType }] : [],
        orderBy: { field: 'timestamp', direction: 'desc' },
        limit: 100,
      });
      return { logs: logs.map(l => ({ id: l.id, ...l.data })) };
    },
  },

  LOG_AUDIT: {
    method: 'POST',
    permission: null,
    async run(ctx) {
      const p = parse(
        z.object({
          eventAction: z.string().trim().min(1).max(80),
          targetType: z.enum(['coupon', 'order', 'product', 'category', 'customer', 'settings', 'auth', 'admin', 'staff', 'review', 'inventory', 'config']),
          targetId: z.string().trim().max(128).default('global'),
          details: z.record(z.unknown()).optional(),
        }),
        ctx.params,
      );
      const details = p.details && JSON.stringify(p.details).length <= 10_000 ? p.details : {};
      await recordAudit(ctx.store, { ...audit(ctx, p.eventAction, p.targetType, p.targetId, details), source: 'client_reported' });
      return {};
    },
  },

  LIST_STAFF: {
    method: 'GET',
    permission: 'staff.read',
    async run({ store }) {
      const staff = await store.query('staff', { orderBy: { field: 'email', direction: 'asc' }, limit: 500 });
      return { staff: staff.map(s => s.data) };
    },
  },

  SET_STAFF_ROLE: {
    method: 'POST',
    permission: 'staff.manage',
    async run(ctx) {
      const p = parse(
        z.object({
          email: z.string().trim().toLowerCase().email().optional(),
          uid: z.string().trim().min(1).max(128).optional(),
          role: z.enum(STAFF_ROLES).nullable(),
        }).refine(v => v.email || v.uid, { message: 'email or uid is required', path: ['email'] }),
        ctx.params,
      );
      const user = await (p.uid ? ctx.auth.getUser(p.uid) : ctx.auth.getUserByEmail(p.email!)).catch(() => {
        throw new ApiError(404, 'NOT_FOUND', 'No account exists for that user. They must sign up first.');
      });
      if (user.uid === ctx.actor.uid) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'You cannot change your own role. Ask another super admin.');
      }
      const previousRole = user.customClaims?.role;
      const claims = { ...(user.customClaims ?? {}) };
      if (p.role) claims.role = p.role;
      else delete claims.role;
      await ctx.auth.setCustomUserClaims(user.uid, claims);
      // Existing ID tokens keep the old claim until refreshed; revoking forces
      // re-authentication so removals and demotions apply immediately.
      if (isStaffRole(previousRole) && previousRole !== p.role) await ctx.auth.revokeRefreshTokens(user.uid);

      const member: StaffMember = {
        uid: user.uid,
        email: user.email ?? '',
        ...(user.displayName ? { name: user.displayName } : {}),
        role: p.role,
        updatedAt: Date.now(),
        updatedBy: ctx.actor.uid,
      };
      await ctx.store.set(`staff/${user.uid}`, member as unknown as Record<string, unknown>);
      await recordAudit(ctx.store, audit(ctx, 'STAFF_ROLE_SET', 'staff', user.uid, { email: user.email, previousRole: previousRole ?? null, role: p.role }));
      return { staff: member };
    },
  },

  UPDATE_ORDER_STATUS: {
    method: 'POST',
    permission: 'orders.update_status',
    async run(ctx) {
      const p = parse(
        z.object({
          orderId: z.string().trim().regex(/^[A-Za-z0-9]{10,40}$/),
          status: z.enum(STAFF_SETTABLE_STATUSES as [OrderStatus, ...OrderStatus[]]),
          note: z.string().trim().max(500).optional(),
          tracking: z.object({
            carrier: z.string().trim().max(80).optional(),
            trackingNumber: z.string().trim().max(80).optional(),
            url: z.string().trim().url().max(500).optional(),
          }).optional(),
        }),
        ctx.params,
      );
      if (p.tracking && !roleHasPermission(ctx.actor.role, 'orders.tracking')) {
        throw new ApiError(403, 'FORBIDDEN', 'Your role cannot set tracking details.');
      }
      const now = Date.now();
      await ctx.store.runTransaction(async tx => {
        const order = asOrder(await tx.get(orderPath(p.orderId)));
        if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
        const plan = await planStatusChange(tx, order, { to: p.status, by: ctx.actor.uid, note: p.note });
        applyStatusChange(tx, plan, order, now, p.tracking ? { tracking: p.tracking } : {});
        auditInTransaction(ctx.store, tx, audit(ctx, 'ORDER_STATUS_UPDATED', 'order', order.id, { from: order.status, to: p.status }));
      });
      return { orderId: p.orderId, status: p.status };
    },
  },

  // Pause fulfilment without changing the status (see OrderHold). Production raises material shortages;
  // order managers hold for any reason. Releasing resumes from the same stage.
  SET_ORDER_HOLD: {
    method: 'POST',
    permission: 'orders.update_status',
    async run(ctx) {
      const p = parse(z.object({ orderId: orderIdField, kind: z.enum(HOLD_KINDS), reason: reasonField }), ctx.params);
      const now = Date.now();
      const hold: OrderHold = { kind: p.kind, reason: p.reason, by: ctx.actor.email ?? ctx.actor.uid, at: now };
      await ctx.store.runTransaction(async tx => {
        const order = asOrder(await tx.get(orderPath(p.orderId)));
        if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
        if (!HOLDABLE_STATUSES.includes(order.status)) throw new ApiError(409, 'CONFLICT', `An order in status ${order.status} cannot be put on hold.`);
        tx.update(orderPath(order.id), { hold, updatedAt: now });
        auditInTransaction(ctx.store, tx, audit(ctx, 'ORDER_HOLD_SET', 'order', order.id, { kind: p.kind, reason: p.reason, replaced: order.hold?.kind ?? null }));
      });
      return { orderId: p.orderId, hold };
    },
  },

  RELEASE_ORDER_HOLD: {
    method: 'POST',
    permission: 'orders.update_status',
    async run(ctx) {
      const p = parse(z.object({ orderId: orderIdField, note: z.string().trim().max(300).optional() }), ctx.params);
      const now = Date.now();
      await ctx.store.runTransaction(async tx => {
        const order = asOrder(await tx.get(orderPath(p.orderId)));
        if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
        if (!order.hold) throw new ApiError(409, 'CONFLICT', 'This order is not on hold.');
        tx.update(orderPath(order.id), { hold: null, updatedAt: now });
        auditInTransaction(ctx.store, tx, audit(ctx, 'ORDER_HOLD_RELEASED', 'order', order.id, { kind: order.hold.kind, reason: order.hold.reason, note: p.note ?? null }));
      });
      return { orderId: p.orderId };
    },
  },

  /**
   * Internal note for roles that cannot write orders (support has customers.read but not
   * orders.update_status, so firestore.rules refuse its direct `notes` write). The note is
   * appended server-side inside a transaction, so concurrent notes never overwrite each other
   * and the structured `#vernox:v1` block (QC, package) is preserved by appendNote().
   */
  ADD_ORDER_NOTE: {
    method: 'POST',
    permission: 'customers.read',
    async run(ctx) {
      const p = parse(z.object({ orderId: orderIdField, note: z.string().trim().min(1).max(500) }), ctx.params);
      const now = Date.now();
      const by = ctx.actor.email ?? ctx.actor.uid;
      const notes = await ctx.store.runTransaction(async tx => {
        const order = asOrder(await tx.get(orderPath(p.orderId)));
        if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
        const next = appendNote(order.notes, p.note, by, now);
        // firestore.rules cap `notes` at 20 000 characters for the other writers; keep the same limit.
        if (next.length > MAX_NOTES_LENGTH) throw badRequest('This order has too many notes to add another.');
        tx.update(orderPath(order.id), { notes: next, updatedAt: now });
        auditInTransaction(ctx.store, tx, audit(ctx, 'ORDER_NOTE_ADDED', 'order', order.id));
        return next;
      });
      return { orderId: p.orderId, notes };
    },
  },

  // ---------- launch setup (presence of owner-provided keys and data; never their values) ----------

  GET_LAUNCH_STATUS: {
    method: 'GET',
    permission: 'settings.write',
    async run(ctx) {
      return { items: await launchStatus(ctx.store) };
    },
  },

  // ---------- staff-entered orders: counter, phone, WhatsApp, email, trade (permission orders.create) ----------

  QUOTE_STAFF_ORDER: {
    method: 'POST',
    permission: 'orders.create',
    async run(ctx) {
      const p = parse(staffQuoteSchema, ctx.params);
      return quoteStaffOrder(ctx.store, await loadStoreConfig(ctx.store), p);
    },
  },

  CREATE_STAFF_ORDER: {
    method: 'POST',
    permission: 'orders.create',
    async run(ctx) {
      const p = parse(staffOrderSchema, ctx.params);
      const config = await loadStoreConfig(ctx.store);
      const created = await createStaffOrder(
        {
          store: ctx.store,
          config,
          // Credentials are read on first use, so offline and COD orders work without Razorpay configured.
          gateway: createRazorpayGateway(),
          razorpayKeyId: '',
          shipping: createShippingProvider(ctx.store, config),
          paymentLinks: createRazorpayPaymentLinkGateway(),
        },
        p,
        ctx.actor.email ?? ctx.actor.uid,
      );
      await recordAudit(
        ctx.store,
        audit(ctx, 'STAFF_ORDER_CREATED', 'order', created.orderId, {
          channel: p.channel,
          payment: p.payment.method === 'offline' ? `offline:${p.payment.mode}` : p.payment.method,
          handover: p.handover,
          total: created.pricing.total,
        }),
      );
      return { ...created };
    },
  },

  // ---------- support tickets (permission tickets.write; reads are firestore.rules) ----------

  CREATE_TICKET: {
    method: 'POST',
    permission: 'tickets.write',
    async run(ctx) {
      const p = parse(staffTicketSchema, ctx.params);
      const created = await createStaffTicket(ctx.store, p, ctx.actor.email ?? ctx.actor.uid);
      await recordAudit(ctx.store, audit(ctx, 'TICKET_CREATED', 'ticket', created.id, { channel: p.channel }));
      return created;
    },
  },

  ADD_TICKET_MESSAGE: {
    method: 'POST',
    permission: 'tickets.write',
    async run(ctx) {
      const p = parse(
        z.object({ ticketId: ticketIdSchema, direction: z.enum(['reply', 'note']), text: z.string().trim().min(1).max(2000) }),
        ctx.params,
      );
      const ticket = await addTicketMessage(ctx.store, { id: p.ticketId, by: ctx.actor.email ?? ctx.actor.uid, direction: p.direction, text: p.text });
      await recordAudit(ctx.store, audit(ctx, 'TICKET_MESSAGE_ADDED', 'ticket', p.ticketId, { direction: p.direction }));
      return { ticketId: p.ticketId, status: ticket.status };
    },
  },

  SET_TICKET_STATUS: {
    method: 'POST',
    permission: 'tickets.write',
    async run(ctx) {
      const p = parse(z.object({ ticketId: ticketIdSchema, status: z.enum(TICKET_STATUSES) }), ctx.params);
      await setTicketStatus(ctx.store, { id: p.ticketId, status: p.status, by: ctx.actor.email ?? ctx.actor.uid });
      await recordAudit(ctx.store, audit(ctx, 'TICKET_STATUS_SET', 'ticket', p.ticketId, { status: p.status }));
      return { ticketId: p.ticketId, status: p.status };
    },
  },

  // ---------- design consultations (permission consultations.manage; reads are firestore.rules) ----------

  CLAIM_CONSULTATION: {
    method: 'POST',
    permission: 'consultations.manage',
    async run(ctx) {
      const p = parse(z.object({ consultationId: consultationIdField }), ctx.params);
      const c = await claimConsultation(ctx.store, getPhotoStorage(), { id: p.consultationId, actor: ctx.actor, ip: ctx.ip });
      return { consultationId: p.consultationId, status: c.status, photosReady: c.photosReady };
    },
  },

  SAVE_PROPOSAL_DRAFT: {
    method: 'POST',
    permission: 'consultations.manage',
    async run(ctx) {
      const p = parse(z.object({ consultationId: consultationIdField, draft: proposalDraftSchema }), ctx.params);
      await saveProposalDraft(ctx.store, { id: p.consultationId, actor: ctx.actor, draft: p.draft, ip: ctx.ip });
      return { consultationId: p.consultationId };
    },
  },

  SEND_PROPOSAL: {
    method: 'POST',
    permission: 'consultations.manage',
    async run(ctx) {
      const p = parse(z.object({ consultationId: consultationIdField }), ctx.params);
      const proposal = await sendProposal(ctx.store, await loadStoreConfig(ctx.store), { id: p.consultationId, actor: ctx.actor, ip: ctx.ip });
      return { consultationId: p.consultationId, version: proposal.version };
    },
  },

  // ---------- shipping (permission orders.tracking) ----------

  GET_COURIER_RATES: {
    method: 'GET',
    permission: 'orders.tracking',
    async run(ctx) {
      // GET params arrive as strings, hence coerce.
      const p = parse(z.object({ orderId: orderIdField, ...packageQuerySchema }), ctx.params);
      const config = await loadStoreConfig(ctx.store);
      return courierRatesFor(ctx.store, createShippingProvider(ctx.store, config), {
        orderId: p.orderId,
        package: { lengthCm: p.lengthCm, breadthCm: p.breadthCm, heightCm: p.heightCm, weightKg: p.weightKg },
      });
    },
  },

  BULK_SHIPMENT_DOCUMENTS: {
    method: 'POST',
    permission: 'orders.tracking',
    async run(ctx) {
      const p = parse(z.object({ orderIds: z.array(orderIdField).min(1).max(MAX_BULK_DOCUMENT_ORDERS) }), ctx.params);
      const config = await loadStoreConfig(ctx.store);
      return bulkShipmentDocuments(ctx.store, createShippingProvider(ctx.store, config), { orderIds: p.orderIds, actor: ctx.actor });
    },
  },

  CREATE_SHIPMENT: {
    method: 'POST',
    permission: 'orders.tracking',
    async run(ctx) {
      const p = parse(
        z.object({
          orderId: orderIdField,
          package: packageSchema.optional(),
          courierId: z.number().int().positive().optional(),
          manual: z
            .object({
              courier: z.string().trim().min(2).max(80),
              awb: z.string().trim().regex(/^[A-Za-z0-9-]{4,40}$/),
              trackingUrl: z.string().trim().url().max(500).optional(),
            })
            .optional(),
        }),
        ctx.params,
      );
      const config = await loadStoreConfig(ctx.store);
      const shipment = await createShipment(ctx.store, createShippingProvider(ctx.store, config), config, {
        orderId: p.orderId,
        courierId: p.courierId,
        package: p.package as PackageDetails | undefined, // cast: the app tsconfig (non-strict) also type-checks this file via tests
        manual: p.manual as ManualShipmentDetails | undefined,
        actor: ctx.actor,
      });
      const order = asOrder(await ctx.store.get(orderPath(p.orderId)));
      return { shipment, status: order?.status ?? null, invoiceNumber: order?.invoiceNumber ?? null };
    },
  },

  CANCEL_SHIPMENT: {
    method: 'POST',
    permission: 'orders.tracking',
    async run(ctx) {
      const p = parse(z.object({ orderId: orderIdField, reason: reasonField }), ctx.params);
      const config = await loadStoreConfig(ctx.store);
      await cancelShipment(ctx.store, createShippingProvider(ctx.store, config), { orderId: p.orderId, reason: p.reason, actor: ctx.actor });
      return { orderId: p.orderId };
    },
  },

  GET_LABEL: {
    method: 'GET',
    permission: 'orders.tracking',
    async run(ctx) {
      const p = parse(z.object({ orderId: orderIdField }), ctx.params);
      const config = await loadStoreConfig(ctx.store);
      return getLabel(ctx.store, createShippingProvider(ctx.store, config), p.orderId);
    },
  },

  UPDATE_DELIVERY_STATUS: {
    method: 'POST',
    permission: 'orders.tracking',
    async run(ctx) {
      const p = parse(
        z.object({
          orderId: orderIdField,
          status: z.enum(['Shipped', 'Out_For_Delivery', 'Delivered', 'RTO_Initiated', 'RTO_Delivered']),
          note: z.string().trim().max(200).optional(),
        }),
        ctx.params,
      );
      const outcome = await applyCourierStatus(ctx.store, {
        orderId: p.orderId,
        target: p.status,
        event: { status: `staff: ${p.note ?? p.status}`.slice(0, 200), at: new Date().toISOString() },
        by: ctx.actor.uid,
      });
      if (outcome === 'no_shipment') throw new ApiError(409, 'CONFLICT', 'Create the shipment before updating delivery status.');
      if (outcome === 'ignored') throw new ApiError(409, 'CONFLICT', `The order cannot move to ${p.status} from its current status.`);
      await recordAudit(ctx.store, audit(ctx, 'DELIVERY_STATUS_UPDATED', 'order', p.orderId, { status: p.status }));
      return { orderId: p.orderId, status: p.status };
    },
  },

  // ---------- cancellation and refunds ----------

  CANCEL_ORDER: {
    method: 'POST',
    permission: 'orders.update_status',
    async run(ctx) {
      const p = parse(z.object({ orderId: orderIdField, reason: reasonField, refund: z.boolean().default(true) }), ctx.params);
      if (p.refund && !roleHasPermission(ctx.actor.role, 'orders.refund')) {
        throw new ApiError(403, 'FORBIDDEN', 'Your role cannot refund. Cancel with refund: false and ask finance to refund.');
      }
      const order = asOrder(await ctx.store.get(orderPath(p.orderId)));
      const gateway = p.refund && order?.paymentMethod === 'prepaid' ? createRazorpayRefundGateway() : null;
      const result = await cancelOrder(ctx.store, gateway, {
        orderId: p.orderId,
        reason: p.reason,
        initiatedBy: 'staff',
        actor: ctx.actor,
        refund: p.refund,
        ip: ctx.ip,
      });
      return { orderId: p.orderId, status: result.order.status, refund: result.refund, refundError: result.refundError };
    },
  },

  CREATE_REFUND: {
    method: 'POST',
    permission: 'orders.refund',
    async run(ctx) {
      const p = parse(
        z.object({
          orderId: orderIdField,
          amount: z.number().positive().max(10_000_000),
          reason: reasonField,
          method: z.enum(['razorpay', 'manual']).default('razorpay'),
          reference: z.string().trim().min(4).max(80).optional(),
          idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
        }),
        ctx.params,
      );
      const refund = await createRefund(ctx.store, p.method === 'razorpay' ? createRazorpayRefundGateway() : null, {
        orderId: p.orderId,
        amountPaise: rupeesToPaise(p.amount),
        reason: p.reason,
        method: p.method,
        reference: p.reference,
        idempotencyKey: p.idempotencyKey,
        requestedBy: ctx.actor.uid,
        source: 'staff',
        actor: ctx.actor,
        ip: ctx.ip,
      });
      return { refund };
    },
  },

  // A paid consultation whose invoice was deferred (INVOICE_PENDING_SELLER_SETTINGS, see confirmPayment):
  // issued once the seller's GSTIN is saved. Goods are invoiced by CREATE_SHIPMENT, never here.
  ISSUE_SERVICE_INVOICE: {
    method: 'POST',
    permission: 'orders.refund',
    async run(ctx) {
      const p = parse(z.object({ orderId: orderIdField }), ctx.params);
      const { seller } = await loadStoreConfig(ctx.store);
      const now = Date.now();
      const fields = await ctx.store.runTransaction(async tx => {
        const order = asOrder(await tx.get(orderPath(p.orderId)));
        if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
        if (order.kind !== 'service') throw new ApiError(409, 'CONFLICT', 'Products are invoiced when the shipment is booked.');
        if (!order.razorpayPaymentId) throw new ApiError(409, 'CONFLICT', 'This consultation has not been paid.');
        const plan = await planInvoice(tx, order, seller, now).catch(err => {
          if (err instanceof ApiError && err.code === 'CONFIG_ERROR') {
            throw new ApiError(409, 'CONFLICT', 'Save the seller GSTIN, legal name and address in Settings first.');
          }
          throw err;
        });
        const invoice = applyInvoice(tx, plan, order, seller, now);
        tx.update(orderPath(order.id), { ...invoice, flags: order.flags.filter(f => f !== 'INVOICE_PENDING_SELLER_SETTINGS'), updatedAt: now });
        auditInTransaction(ctx.store, tx, audit(ctx, 'SERVICE_INVOICE_ISSUED', 'order', order.id, invoice));
        return invoice;
      });
      return { orderId: p.orderId, ...fields };
    },
  },

  GET_ORDER_DOCUMENTS: {
    method: 'GET',
    permission: 'orders.read',
    async run(ctx) {
      const p = parse(z.object({ orderId: orderIdField }), ctx.params);
      const order = asOrder(await ctx.store.get(orderPath(p.orderId)));
      if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.');
      const [invoiceDoc, creditNotes, refunds, ret] = await Promise.all([
        ctx.store.get(invoicePath(order.id)),
        ctx.store.query('credit_notes', { where: [{ field: 'orderId', op: '==', value: order.id }], limit: 50 }),
        ctx.store.query('refunds', { where: [{ field: 'orderId', op: '==', value: order.id }], limit: 50 }),
        ctx.store.get(returnPath(order.id)),
      ]);
      const invoice = invoiceDoc as unknown as TaxDocument | null;
      return {
        invoice: invoice ? { id: invoice.id, number: invoice.number, issuedAt: invoice.issuedAt, supplyType: invoice.supplyType, totals: invoice.totals } : null,
        creditNotes: creditNotes.map(c => {
          const d = c.data as unknown as TaxDocument;
          return { id: d.id, number: d.number, issuedAt: d.issuedAt, refundId: d.refundId ?? null, totals: d.totals };
        }),
        refunds: refunds.map(r => r.data),
        return: ret,
        refundablePaise: refundCeilingPaise(order),
        shipment: order.shipment ?? null,
      };
    },
  },

  // ---------- returns (permission orders.update_status; refunds stay with finance) ----------

  APPROVE_RETURN: {
    method: 'POST',
    permission: 'orders.update_status',
    async run(ctx) {
      const p = parse(
        z.object({ orderId: orderIdField, resolution: z.enum(['refund', 'replacement']), note: z.string().trim().max(300).optional() }),
        ctx.params,
      );
      return decideReturn(ctx.store, { orderId: p.orderId, approve: true, resolution: p.resolution, note: p.note, actor: ctx.actor });
    },
  },

  REJECT_RETURN: {
    method: 'POST',
    permission: 'orders.update_status',
    async run(ctx) {
      const p = parse(z.object({ orderId: orderIdField, reason: reasonField }), ctx.params);
      return decideReturn(ctx.store, { orderId: p.orderId, approve: false, note: p.reason, actor: ctx.actor });
    },
  },

  MARK_RETURN_RECEIVED: {
    method: 'POST',
    permission: 'orders.update_status',
    async run(ctx) {
      const p = parse(
        z.object({ orderId: orderIdField, restock: z.boolean().default(false), note: z.string().trim().max(300).optional() }),
        ctx.params,
      );
      return markReturnReceived(ctx.store, { orderId: p.orderId, restock: p.restock, note: p.note, actor: ctx.actor });
    },
  },

  SAVE_COUPON: {
    method: 'POST',
    permission: 'coupons.write',
    async run(ctx) {
      const c = parse(couponSchema, (ctx.params as { coupon?: unknown }).coupon);
      const code = normaliseCouponCode(c.code);
      const clash = await ctx.store.query('coupons', { where: [{ field: 'code', op: '==', value: code }], limit: 2 });
      const id = c.id ?? clash[0]?.id ?? ctx.store.newId('coupons');
      if (clash.some(d => d.id !== id)) throw new ApiError(409, 'CONFLICT', `Coupon code ${code} already exists.`);
      const existing = await ctx.store.get(`coupons/${id}`);
      const now = Date.now();
      const { id: _ignored, ...fields } = c;
      // usedCount is maintained only by payment confirmation.
      await ctx.store.set(
        `coupons/${id}`,
        { ...fields, code, updatedAt: now, ...(existing ? {} : { usedCount: 0, createdAt: now }) },
        { merge: true },
      );
      await recordAudit(ctx.store, audit(ctx, existing ? 'COUPON_UPDATED' : 'COUPON_CREATED', 'coupon', id, { code, discountType: c.discountType, discountValue: c.discountValue }));
      return { coupon: { id, ...fields, code } };
    },
  },

  DELETE_COUPON: {
    method: 'POST',
    permission: 'coupons.write',
    async run(ctx) {
      const { couponId } = parse(idSchema('couponId'), ctx.params) as { couponId: string };
      await ctx.store.delete(`coupons/${couponId}`);
      await recordAudit(ctx.store, audit(ctx, 'COUPON_DELETED', 'coupon', couponId));
      return {};
    },
  },

  SAVE_REVIEW: {
    method: 'POST',
    permission: 'reviews.moderate',
    async run(ctx) {
      const r = parse(reviewSchema, (ctx.params as { review?: unknown }).review);
      const now = Date.now();
      // Photos are server-owned: the schema drops any client-sent `photos`/`photoPaths`.
      const photos = await syncPublicReviewPhotos(getPhotoStorage(), r.id, await ctx.store.get(`reviews/${r.id}`), r.status);
      await ctx.store.set(
        `reviews/${r.id}`,
        { ...r, photos, ...(r.conciergeResponse ? { conciergeRespondedAt: now } : {}), moderatedBy: ctx.actor.uid, updatedAt: now },
        { merge: true },
      );
      await recordAudit(ctx.store, audit(ctx, 'REVIEW_SAVED', 'review', r.id, { productId: r.productId, status: r.status, rating: r.rating }));
      return { review: r };
    },
  },

  DELETE_REVIEW: {
    method: 'POST',
    permission: 'reviews.moderate',
    async run(ctx) {
      const { reviewId } = parse(idSchema('reviewId'), ctx.params) as { reviewId: string };
      await deleteReviewAndPhotos(ctx.store, getPhotoStorage(), reviewId);
      await recordAudit(ctx.store, audit(ctx, 'REVIEW_DELETED', 'review', reviewId));
      return {};
    },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const params = (req.method === 'GET' ? req.query : req.body) as Record<string, unknown> | undefined;
    const actionName = typeof params?.action === 'string' ? params.action : '';
    const action = ACTIONS[actionName];
    if (!action) throw badRequest(`Unknown admin action "${actionName}".`);
    if (req.method !== action.method) {
      res.setHeader('Allow', action.method);
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', `${actionName} requires ${action.method}.`);
    }

    const store = getStore();
    await enforceRateLimit(store, req, RATE_LIMITS.admin);
    const auth = getAdminAuth();
    const actor = await requireStaff(req, auth, action.permission);

    const result = await action.run({ store, auth, actor, ip: clientIp(req), params: params ?? {} });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return sendError(res, err, 'admin');
  }
}
