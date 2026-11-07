/**
 * The app's Firestore instance. Kept out of src/lib/firebase.ts so the Firestore SDK is not part of the
 * storefront's first load: the storefront reads its public data from /api/catalog, and the modules
 * that import this file (account, orders, admin, studio saves) live in lazily loaded routes. Code that
 * is on the first-load path (AuthProvider, wishlist) uses `appFirestore()` (appFirestore.ts) instead.
 */
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { app } from '@/lib/firebase';

export const db = getFirestore(app);

// Local emulators (`npm run dev:local`). Vite only substitutes the literal `import.meta.env.X`
// form, so keep these reads plain. Ports match firebase.json "emulators".
if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  connectFirestoreEmulator(db, import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1', 8085);
}
