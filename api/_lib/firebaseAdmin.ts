/**
 * Firebase Admin SDK bootstrap for the serverless API.
 *
 * The API must never use the browser `firebase` SDK: it runs unauthenticated, so
 * firestore.rules deny its writes. The Admin SDK bypasses rules and is the only
 * trusted writer of orders, stock, coupons, audit logs and staff roles.
 *
 * Credentials, in order of precedence:
 *  1. FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST set → emulator, needs only a project id.
 *  2. FIREBASE_SERVICE_ACCOUNT_BASE64 → base64-encoded service-account JSON (Vercel).
 *  3. GOOGLE_APPLICATION_CREDENTIALS → path to a service-account file (Docker / local).
 * If none is set, every call fails with CONFIG_ERROR; there is no fallback.
 */
import { randomUUID } from 'crypto';
import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { PhotoStorage } from './consultations';
import type { ReviewPhotoStorage } from './reviewPhotos';
import { configError } from './errors';
import { createFirestoreStore, type DocStore } from './store';

let app: App | undefined;
let store: DocStore | undefined;

function projectIdFromEnv(): string | undefined {
  return process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
}

function initialise(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = projectIdFromEnv();

  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    if (!projectId) throw configError('Emulator mode requires FIREBASE_PROJECT_ID');
    return initializeApp({ projectId });
  }

  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  if (base64) {
    let serviceAccount: { project_id?: string; client_email?: string; private_key?: string };
    try {
      serviceAccount = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
    } catch {
      throw configError('FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid base64-encoded JSON');
    }
    if (!serviceAccount.client_email || !serviceAccount.private_key) {
      throw configError('FIREBASE_SERVICE_ACCOUNT_BASE64 is missing client_email or private_key');
    }
    return initializeApp({
      credential: cert(serviceAccount as Parameters<typeof cert>[0]),
      projectId: projectId || serviceAccount.project_id,
    });
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return initializeApp({ credential: applicationDefault(), projectId });
  }

  throw configError(
    'Firebase Admin is not configured: set FIREBASE_SERVICE_ACCOUNT_BASE64 or GOOGLE_APPLICATION_CREDENTIALS',
  );
}

export function getAdminApp(): App {
  app ??= initialise();
  return app;
}

let db: Firestore | undefined;

export function getDb(): Firestore {
  if (!db) {
    db = getFirestore(getAdminApp());
    // Optional fields are omitted rather than written as undefined (which the SDK rejects).
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

/** The production DocStore used by the handlers (Firestore via the Admin SDK). */
export function getStore(): DocStore {
  store ??= createFirestoreStore(getDb());
  return store;
}

/**
 * Copies files inside the default Storage bucket with the Admin SDK (rules do not apply).
 * Bucket: FIREBASE_STORAGE_BUCKET, else `<project id>.firebasestorage.app`. In the emulator set
 * FIREBASE_STORAGE_EMULATOR_HOST so the SDK talks to it.
 */
export function getPhotoStorage(): PhotoStorage & ReviewPhotoStorage {
  const bucket = () => {
    const app = getAdminApp();
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET?.trim() || `${app.options.projectId ?? projectIdFromEnv() ?? ''}.firebasestorage.app`;
    return getStorage(app).bucket(bucketName);
  };
  return {
    async copy(fromPath, toPath) {
      const b = bucket();
      // A GCS copy keeps the source's custom metadata, including its Firebase download token. A fresh token
      // stops the copy's URL (e.g. a published review photo) from also opening the private original.
      await b.file(fromPath).copy(b.file(toPath), { metadata: { firebaseStorageDownloadTokens: randomUUID() } });
    },
    async exists(path) {
      const [found] = await bucket().file(path).exists();
      return found;
    },
    async delete(path) {
      await bucket().file(path).delete({ ignoreNotFound: true });
    },
  };
}
