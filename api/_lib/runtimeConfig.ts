/**
 * Public configuration the browser needs at runtime, so one built image runs on any domain and Firebase project.
 * Served as a classic script (`/runtime-config.js`, api/runtime-config.ts) that sets `window.__VERNOX_CONFIG__`;
 * src/lib/runtimeConfig.ts reads it and falls back to the build-time VITE_* values (Vercel builds, `vite dev`).
 *
 * Everything here is public by design (Firebase web config identifies the project, the Razorpay key id is shown in
 * the checkout). NEVER add a secret: this file is served to every visitor.
 */

export interface RuntimeConfig {
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
  siteUrl: string;
  razorpayKeyId: string;
}

const pick = (env: NodeJS.ProcessEnv, ...names: string[]): string => {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return '';
};

export function buildRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const projectId = pick(env, 'FIREBASE_WEB_PROJECT_ID', 'VITE_FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID');
  return {
    firebase: {
      apiKey: pick(env, 'FIREBASE_WEB_API_KEY', 'VITE_FIREBASE_API_KEY'),
      authDomain: pick(env, 'FIREBASE_WEB_AUTH_DOMAIN', 'VITE_FIREBASE_AUTH_DOMAIN') || (projectId ? `${projectId}.firebaseapp.com` : ''),
      projectId,
      storageBucket: pick(env, 'FIREBASE_WEB_STORAGE_BUCKET', 'VITE_FIREBASE_STORAGE_BUCKET') || (projectId ? `${projectId}.firebasestorage.app` : ''),
      messagingSenderId: pick(env, 'FIREBASE_WEB_MESSAGING_SENDER_ID', 'VITE_FIREBASE_MESSAGING_SENDER_ID'),
      appId: pick(env, 'FIREBASE_WEB_APP_ID', 'VITE_FIREBASE_APP_ID'),
    },
    siteUrl: pick(env, 'VITE_SITE_URL').replace(/\/+$/, ''),
    razorpayKeyId: pick(env, 'RAZORPAY_KEY_ID', 'VITE_RAZORPAY_KEY_ID'),
  };
}

/** The script body. `<` is escaped so a value can never close a surrounding script element. */
export function runtimeConfigScript(env: NodeJS.ProcessEnv = process.env): string {
  const json = JSON.stringify(buildRuntimeConfig(env)).replace(/</g, '\\u003c');
  return `window.__VERNOX_CONFIG__=${json};\n`;
}
