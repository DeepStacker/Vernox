import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";

// Per-environment web config (staging and production are separate projects). These values are public
// identifiers, not secrets; access is enforced by firestore.rules and storage.rules. vite.config.ts fails
// the build when they are missing, and the emulator falls back to the local demo project.
const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || (useEmulator ? 'demo-key' : ''),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || (useEmulator ? 'vernox-1b5d5.firebaseapp.com' : ''),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || (useEmulator ? 'vernox-1b5d5' : ''),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || (useEmulator ? 'vernox-1b5d5.firebasestorage.app' : ''),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};
if (!firebaseConfig.projectId) {
  throw new Error('Firebase web config is missing: set the VITE_FIREBASE_* variables (see .env.example).');
}

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Local emulators (`npm run dev:local`). Vite only substitutes the literal `import.meta.env.X`
// form, so keep these reads plain (no optional chaining) or the flag is silently undefined.
if (useEmulator) {
  const host = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';
  // Ports match firebase.json "emulators".
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
}
