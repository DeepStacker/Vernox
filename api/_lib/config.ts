/**
 * Server environment configuration. Every variable is documented in .env.example.
 * Missing mandatory configuration throws CONFIG_ERROR (logged with the variable
 * name, returned to the client as a generic 500) — there are no silent fallbacks.
 */
import { configError } from './errors';

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw configError(`Missing required environment variable ${name}`);
  return value;
}

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
}

export function getRazorpayCredentials(): RazorpayCredentials {
  return { keyId: requireEnv('RAZORPAY_KEY_ID'), keySecret: requireEnv('RAZORPAY_KEY_SECRET') };
}

/** Webhook secret is configured separately in the Razorpay dashboard; it is never the API key secret. */
export function getRazorpayWebhookSecret(): string {
  return requireEnv('RAZORPAY_WEBHOOK_SECRET');
}

export function getCronSecret(): string {
  return requireEnv('CRON_SECRET');
}
