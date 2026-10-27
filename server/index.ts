import http from 'http';
import { parse } from 'url';
import createOrderHandler from '../api/create-order';
import checkoutIntentHandler from '../api/checkout-intent';
import verifyPaymentHandler from '../api/verify-payment';
import validateCouponHandler from '../api/validate-coupon';
import adminHandler from '../api/admin';
import razorpayWebhookHandler from '../api/razorpay-webhook';

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-idempotency-key, x-admin-token');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
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

  if (pathname?.startsWith('/api/')) {
    let bodyBuffer = '';
    req.on('data', chunk => {
      bodyBuffer += chunk;
    });

    req.on('end', async () => {
      let parsedBody = {};
      try {
        if (bodyBuffer) parsedBody = JSON.parse(bodyBuffer);
      } catch (e) {
        // Ignore json parse error
      }

      const vercelReq = Object.assign(req, {
        body: parsedBody,
        rawBody: bodyBuffer,
        query: parse(req.url || '', true).query,
      });

      const vercelRes = Object.assign(res, {
        status(statusCode: number) {
          res.statusCode = statusCode;
          return vercelRes;
        },
        json(data: any) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
          return vercelRes;
        },
      });

      try {
        if (pathname === '/api/checkout-intent') {
          await checkoutIntentHandler(vercelReq as any, vercelRes as any);
        } else if (pathname === '/api/validate-coupon') {
          await validateCouponHandler(vercelReq as any, vercelRes as any);
        } else if (pathname === '/api/admin') {
          await adminHandler(vercelReq as any, vercelRes as any);
        } else if (pathname === '/api/create-order') {
          await createOrderHandler(vercelReq as any, vercelRes as any);
        } else if (pathname === '/api/verify-payment') {
          await verifyPaymentHandler(vercelReq as any, vercelRes as any);
        } else if (pathname === '/api/razorpay-webhook' || pathname === '/api/webhook') {
          await razorpayWebhookHandler(vercelReq as any, vercelRes as any);
        } else {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: `Endpoint ${pathname} not found` }));
        }
      } catch (err: any) {
        console.error('Server Handler Error:', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
      }
    });
    return;
  }

  res.statusCode = 404;
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Vernox API Server listening on http://0.0.0.0:${PORT}`);
  console.log(`   Firestore Emulator: ${process.env.FIRESTORE_EMULATOR_HOST || 'Live Google Cloud'}`);
});
