/**
 * The app's Firebase Storage instance, imported lazily so the SDK stays out of the storefront's first
 * load (it has its own chunk, see vite.config.ts). Paths and access rules: storage.rules.
 */
import type { FirebaseStorage } from 'firebase/storage';
import { app } from '@/lib/firebase';

let instance: Promise<FirebaseStorage> | null = null;

export function appStorage(): Promise<FirebaseStorage> {
  instance ??= import('firebase/storage').then(({ getStorage, connectStorageEmulator }) => {
    const storage = getStorage(app);
    if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
      connectStorageEmulator(storage, import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1', 9199);
    }
    return storage;
  });
  return instance;
}
