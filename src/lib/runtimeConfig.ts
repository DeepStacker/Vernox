/**
 * Public configuration injected at runtime by `/runtime-config.js` (api/_lib/runtimeConfig.ts), so one built image
 * serves any domain and Firebase project. Each reader prefers the runtime value and falls back to the build-time
 * VITE_* value, which keeps Vercel builds and `vite dev` working. Public values only; never a secret.
 */
export interface RuntimeConfig {
  firebase?: Partial<Record<'apiKey' | 'authDomain' | 'projectId' | 'storageBucket' | 'messagingSenderId' | 'appId', string>>;
  siteUrl?: string;
  razorpayKeyId?: string;
}

declare global {
  interface Window { __VERNOX_CONFIG__?: RuntimeConfig }
}

export function runtimeConfig(): RuntimeConfig {
  return (typeof window !== 'undefined' && window.__VERNOX_CONFIG__) || {};
}

/** First non-blank string, trimmed. */
export function firstNonBlank(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return '';
}
