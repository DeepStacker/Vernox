/**
 * Routes /api/* requests to the Vercel-style handlers in api/, mimicking @vercel/node: parsed
 * JSON on `req.body`, the exact bytes on `req.rawBody` (webhook signatures) and `req.query`.
 * Shared by the Node server (server/index.ts) and the Vite dev server, so local development
 * and Docker exercise the same routing.
 */
import http from 'http';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parse } from 'url';
import checkoutIntentHandler from '../api/checkout-intent';
import verifyPaymentHandler from '../api/verify-payment';
import validateCouponHandler from '../api/validate-coupon';
import orderStatusHandler from '../api/order-status';
import adminHandler from '../api/admin';
import razorpayWebhookHandler from '../api/razorpay-webhook';
import releaseReservationsHandler from '../api/cron/release-reservations';
import sendNotificationsHandler from '../api/cron/send-notifications';
import serviceabilityHandler from '../api/serviceability';
import courierWebhookHandler from '../api/courier-webhook';
import invoiceHandler from '../api/invoice';
import orderCancelHandler from '../api/order-cancel';
import returnRequestHandler from '../api/return-request';
import consultationHandler from '../api/consultation';
import engageHandler from '../api/engage';
import seoHandler from '../api/seo';
import catalogHandler from '../api/catalog';

const MAX_BODY_BYTES = 1024 * 1024;

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;
const ROUTES: Record<string, Handler> = {
  '/api/checkout-intent': checkoutIntentHandler,
  '/api/verify-payment': verifyPaymentHandler,
  '/api/validate-coupon': validateCouponHandler,
  '/api/order-status': orderStatusHandler,
  '/api/admin': adminHandler,
  '/api/razorpay-webhook': razorpayWebhookHandler,
  '/api/cron/release-reservations': releaseReservationsHandler,
  '/api/cron/send-notifications': sendNotificationsHandler,
  '/api/serviceability': serviceabilityHandler,
  '/api/courier-webhook': courierWebhookHandler,
  '/api/invoice': invoiceHandler,
  '/api/order-cancel': orderCancelHandler,
  '/api/return-request': returnRequestHandler,
  '/api/consultation': consultationHandler,
  '/api/engage': engageHandler,
  '/api/seo': seoHandler,
  '/api/catalog': catalogHandler,
};

function setSecurityAndCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse) {
  const origin = (req.headers.origin as string) || '';
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:8080',
    'https://vernox.com',
    'https://www.vernox.com',
    'https://vernox-atelier.vercel.app'
  ];

  if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production' || !origin) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export async function handleApiRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  setSecurityAndCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const { pathname } = parse(req.url || '', true);

  if (pathname === '/api/health' || pathname === '/health') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }));
    return;
  }

  const route = pathname ? ROUTES[pathname] : undefined;
  if (route) {
    const chunks: Buffer[] = [];
    let size = 0;
    let aborted = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES && !aborted) {
        aborted = true;
        sendJson(res, 413, { success: false, code: 'VALIDATION_ERROR', message: 'Request body too large' });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', async () => {
      if (aborted) return;
      const rawBody = Buffer.concat(chunks);
      let parsedBody: unknown = {};
      if (rawBody.length > 0 && (req.headers['content-type'] || '').includes('application/json')) {
        try {
          parsedBody = JSON.parse(rawBody.toString('utf8'));
        } catch {
          sendJson(res, 400, { success: false, code: 'VALIDATION_ERROR', message: 'Body is not valid JSON' });
          return;
        }
      }

      const vercelReq = Object.assign(req, {
        body: parsedBody,
        rawBody,
        query: parse(req.url || '', true).query,
      });

      const vercelRes = Object.assign(res, {
        status(statusCode: number) {
          res.statusCode = statusCode;
          return vercelRes;
        },
        json(data: unknown) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
          return vercelRes;
        },
      });

      try {
        await route(vercelReq as unknown as VercelRequest, vercelRes as unknown as VercelResponse);
      } catch (err) {
        console.error('Server Handler Error:', err);
        if (!res.headersSent) sendJson(res, 500, { success: false, code: 'INTERNAL_ERROR', message: 'Internal server error' });
      }
    });
    return;
  }

  if (pathname?.startsWith('/api/')) {
    sendJson(res, 404, { success: false, code: 'NOT_FOUND', message: `Endpoint ${pathname} not found` });
    return;
  }

  res.statusCode = 404;
  res.end('Not Found');
}
