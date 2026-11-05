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
import { STAFF_ROLES, isStaffRole, roleHasPermission, type Permission, type StaffMember } from '../src/types/admin';
import { auditInTransaction, buildAuditEntry, recordAudit } from './_lib/audit';
import { requireStaff, type StaffUser } from './_lib/auth';
import { normaliseCouponCode } from './_lib/coupons';
import { ApiError, badRequest, sendError } from './_lib/errors';
import { getAdminAuth, getStore } from './_lib/firebaseAdmin';
import { clientIp } from './_lib/http';
import { canTransition, STAFF_SETTABLE_STATUSES, type OrderStatus } from './_lib/orderLifecycle';
import { asOrder, orderPath } from './_lib/orders';
import { enforceRateLimit, RATE_LIMITS } from './_lib/rateLimit';
import { arrayUnion, type DocStore } from './_lib/store';

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
        if (!canTransition(order.status, p.status)) {
          throw new ApiError(409, 'CONFLICT', `An order in status ${order.status} cannot move to ${p.status}.`);
        }
        tx.update(orderPath(order.id), {
          status: p.status,
          statusHistory: arrayUnion({ status: p.status, at: now, by: ctx.actor.uid, ...(p.note ? { note: p.note } : {}) }),
          ...(p.tracking ? { tracking: p.tracking } : {}),
          updatedAt: now,
        });
        auditInTransaction(ctx.store, tx, audit(ctx, 'ORDER_STATUS_UPDATED', 'order', order.id, { from: order.status, to: p.status }));
      });
      return { orderId: p.orderId, status: p.status };
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
      await ctx.store.set(
        `reviews/${r.id}`,
        { ...r, ...(r.conciergeResponse ? { conciergeRespondedAt: now } : {}), moderatedBy: ctx.actor.uid, updatedAt: now },
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
      await ctx.store.delete(`reviews/${reviewId}`);
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
