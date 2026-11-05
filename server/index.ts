/**
 * Node adapter that serves the Vercel-style handlers in api/ (Docker / local).
 * It mimics @vercel/node: parsed JSON on `req.body`, plus the exact bytes on
 * `req.rawBody` for webhook signature verification.
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
};

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

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

const server = http.createServer(async (req, res) => {
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
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Vernox API server listening on http://0.0.0.0:${PORT}`);
  console.log(`   Firestore Emulator: ${process.env.FIRESTORE_EMULATOR_HOST || 'Live Google Cloud'}`);
});
