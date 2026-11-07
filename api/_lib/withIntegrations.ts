/**
 * Wraps every API handler so integration keys entered in the admin (integrationSecrets.ts) are in process.env
 * before the handler reads them. A failure to load them is logged and the request continues with the environment
 * alone, so a database hiccup never takes the API down.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStore } from './firebaseAdmin';
import { applyStoredIntegrations } from './integrationSecrets';

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

export function withStoredIntegrations(handler: Handler): Handler {
  return async (req, res) => {
    try {
      await applyStoredIntegrations(getStore());
    } catch (err) {
      console.error('[integrations] stored keys not loaded:', err instanceof Error ? err.message : err);
    }
    return handler(req, res);
  };
}
