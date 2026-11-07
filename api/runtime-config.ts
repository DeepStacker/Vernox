/**
 * GET /runtime-config.js — the browser's public runtime configuration (api/_lib/runtimeConfig.ts).
 * Routed here by vercel.json and by server/apiRouter.ts. Wrapped with stored integrations so a Razorpay key id
 * entered in the admin reaches the browser without a rebuild. Never cached: values change without a deploy.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendError } from './_lib/errors';
import { assertMethod } from './_lib/http';
import { runtimeConfigScript } from './_lib/runtimeConfig';
import { withStoredIntegrations } from './_lib/withIntegrations';

async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    assertMethod(req, res, ['GET', 'HEAD']);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200);
    return res.end(req.method === 'HEAD' ? undefined : runtimeConfigScript());
  } catch (err) {
    return sendError(res, err, 'runtime-config');
  }
}

export default withStoredIntegrations(handler);
