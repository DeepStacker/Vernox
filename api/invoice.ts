/**
 * GET /api/invoice?orderId=...&email=...[&creditNoteId=...][&format=json]
 *
 * Renders the stored GST invoice (or one of the order's credit notes) as a PDF,
 * generated on demand from the immutable `invoices/{orderId}` /
 * `credit_notes/{id}` record. `format=json` lists the order's documents instead.
 * Access: the order owner (bearer token), the order's email (guests, as for
 * order-status), or staff with `orders.read`. Rate-limited per IP.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { bearerToken, optionalUser, requireStaff } from './_lib/auth';
import { ApiError, sendError } from './_lib/errors';
import { getAdminAuth, getStore } from './_lib/firebaseAdmin';
import { renderTaxDocumentPdf } from './_lib/gst/invoicePdf';
import { creditNotePath, invoicePath, type TaxDocument } from './_lib/gst/invoice';
import { assertMethod } from './_lib/http';
import { canAccessOrder, optionalEmailSchema, orderIdSchema } from './_lib/orderAccess';
import { asOrder, orderPath } from './_lib/orders';
import { enforceRateLimit, RATE_LIMITS } from './_lib/rateLimit';
import { withStoredIntegrations } from './_lib/withIntegrations';

const querySchema = z.object({
  orderId: orderIdSchema,
  email: optionalEmailSchema,
  creditNoteId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),
  format: z.enum(['pdf', 'json']).default('pdf'),
});

const summary = (d: TaxDocument) => ({
  id: d.id,
  type: d.type,
  number: d.number,
  issuedAt: d.issuedAt,
  total: d.totals.totalPaise / 100,
  againstInvoice: d.againstInvoice?.number ?? null,
});

async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['GET']);
    const q = (key: string) => (typeof req.query[key] === 'string' && req.query[key] ? (req.query[key] as string) : undefined);
    const parsed = querySchema.safeParse({ orderId: q('orderId'), email: q('email'), creditNoteId: q('creditNoteId'), format: q('format') });
    if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a valid orderId and email.');
    const { orderId, email, creditNoteId, format } = parsed.data;

    const store = getStore();
    await enforceRateLimit(store, req, RATE_LIMITS.invoice);
    const auth = getAdminAuth();
    const order = asOrder(await store.get(orderPath(orderId)));
    let allowed = canAccessOrder(order, email, await optionalUser(req, auth));
    if (!allowed && order && bearerToken(req)) {
      allowed = await requireStaff(req, auth, 'orders.read').then(() => true, () => false);
    }
    if (!order || !allowed) throw new ApiError(404, 'NOT_FOUND', 'No order matches these details.');

    res.setHeader('Cache-Control', 'no-store');
    if (format === 'json') {
      const invoice = (await store.get(invoicePath(orderId))) as unknown as TaxDocument | null;
      const notes = await store.query('credit_notes', { where: [{ field: 'orderId', op: '==', value: orderId }], limit: 50 });
      return res.status(200).json({
        success: true,
        invoice: invoice ? summary(invoice) : null,
        creditNotes: notes.map(n => summary(n.data as unknown as TaxDocument)),
      });
    }

    const document = (await store.get(creditNoteId ? creditNotePath(creditNoteId) : invoicePath(orderId))) as unknown as TaxDocument | null;
    if (!document || document.orderId !== orderId) {
      throw new ApiError(404, 'NOT_FOUND', creditNoteId ? 'Credit note not found.' : 'The invoice is issued when your order is dispatched.');
    }
    const pdf = await renderTaxDocumentPdf(document);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${document.number.replace(/\//g, '-')}.pdf"`);
    res.status(200);
    return res.end(Buffer.from(pdf));
  } catch (err) {
    return sendError(res, err, 'invoice');
  }
}

export default withStoredIntegrations(handler);
