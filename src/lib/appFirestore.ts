/**
 * Firestore and its functions, imported lazily so the SDK stays out of the storefront's first load
 * (the pattern of appStorage()). For code on the first-load path: AuthProvider and the wishlist.
 * Lazily loaded routes may import `db` from firestoreDb.ts directly.
 */
type FirestoreModule = typeof import('firebase/firestore') & { db: typeof import('./firestoreDb').db };

let instance: Promise<FirestoreModule> | null = null;

export function appFirestore(): Promise<FirestoreModule> {
  instance ??= Promise.all([import('firebase/firestore'), import('./firestoreDb')]).then(([sdk, { db }]) => ({ ...sdk, db }));
  return instance;
}
