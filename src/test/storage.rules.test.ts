// @vitest-environment node
/**
 * Cloud Storage security rules tests (spaces/, consultations/, review-uploads/ and reviews/ paths). Needs both the Firestore and
 * the Storage emulators, because the consultation rules read `consultations/{id}` to find its owner:
 *   npm run test:rules                    (emulators:exec starts both and sets the host variables)
 * or, against emulators that are already running for project <id>:
 *   GCLOUD_PROJECT=<id> FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 \
 *     npx vitest run src/test/storage.rules.test.ts
 * Storage's cross-service Firestore lookup only reaches the emulator's own project, so the project id must
 * match it (GCLOUD_PROJECT). The test uses its own ids and removes what it creates; it never clears data.
 * Skipped without the emulators.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';
import { afterAll, beforeAll, describe, it } from 'vitest';

const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;

const CONSULTATION = 'rulestest-consultation';
const OWNER = 'rulestest-alice';
const WALL = `consultations/${CONSULTATION}/walls/w1.jpg`;
const PREVIEW = (name: string) => `consultations/${CONSULTATION}/previews/${name}`;
const SPACE = (name: string) => `spaces/${OWNER}/s1/${name}`;
const REVIEW_UPLOAD = (name: string, uid = OWNER) => `review-uploads/${uid}/${name}`;
const PUBLIC_REVIEW_PHOTO = 'reviews/rulestest-review/1.webp';

describe.skipIf(!firestoreHost || !storageHost)('storage.rules', () => {
  let env: RulesTestEnvironment;
  const google = { email_verified: true, firebase: { sign_in_provider: 'google.com' as const } };
  const storageAs = (uid: string, claims: Record<string, unknown> = {}) => env.authenticatedContext(uid, { ...google, ...claims }).storage();
  const guest = () => env.unauthenticatedContext().storage();
  const bytes = (size = 10) => new Uint8Array(size);
  const jpeg = { contentType: 'image/jpeg' };
  const png = { contentType: 'image/png' };
  const webp = { contentType: 'image/webp' };
  const created = [WALL, PREVIEW('i1.png'), SPACE('w1.jpg'), REVIEW_UPLOAD('p1.webp'), PUBLIC_REVIEW_PHOTO];

  beforeAll(async () => {
    const [fHost, fPort] = firestoreHost!.split(':');
    const [sHost, sPort] = storageHost!.split(':');
    env = await initializeTestEnvironment({
      projectId: process.env.GCLOUD_PROJECT || 'demo-vernox',
      firestore: { host: fHost, port: Number(fPort), rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') },
      storage: { host: sHost, port: Number(sPort), rules: readFileSync(resolve(__dirname, '../../storage.rules'), 'utf8') },
    });
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), `consultations/${CONSULTATION}`), { userId: OWNER, status: 'new' });
      await uploadBytes(ref(ctx.storage(), WALL), bytes(), jpeg);
      await uploadBytes(ref(ctx.storage(), PREVIEW('i1.png')), bytes(), png);
      await uploadBytes(ref(ctx.storage(), SPACE('w1.jpg')), bytes(), jpeg);
      await uploadBytes(ref(ctx.storage(), REVIEW_UPLOAD('p1.webp')), bytes(), webp);
      await uploadBytes(ref(ctx.storage(), PUBLIC_REVIEW_PHOTO), bytes(), webp);
    });
  });

  afterAll(async () => {
    if (!env) return;
    await env.withSecurityRulesDisabled(async ctx => {
      await deleteDoc(doc(ctx.firestore(), `consultations/${CONSULTATION}`));
      for (const path of created) await deleteObject(ref(ctx.storage(), path)).catch(() => undefined);
    });
    await env.cleanup();
  });

  it('spaces: only the owner, with a verified email, reads and writes wall photos', async () => {
    const owner = storageAs(OWNER);
    await assertSucceeds(getBytes(ref(owner, SPACE('w1.jpg'))));
    await assertSucceeds(uploadBytes(ref(owner, SPACE('w2.jpg')), bytes(), jpeg));
    await assertSucceeds(deleteObject(ref(owner, SPACE('w2.jpg'))));
    for (const other of [storageAs('mallory'), guest(), storageAs('d', { role: 'designer' }), storageAs('a', { role: 'super_admin' })]) {
      await assertFails(getBytes(ref(other, SPACE('w1.jpg'))));
      await assertFails(uploadBytes(ref(other, SPACE('w3.jpg')), bytes(), jpeg));
      await assertFails(deleteObject(ref(other, SPACE('w1.jpg'))));
    }
    const unverified = env.authenticatedContext(OWNER, { email_verified: false, firebase: { sign_in_provider: 'password' } }).storage();
    await assertFails(uploadBytes(ref(unverified, SPACE('w4.jpg')), bytes(), jpeg));
    await assertFails(getBytes(ref(unverified, SPACE('w1.jpg'))));
  });

  it('spaces: images only, up to 5 MB, with a safe file name', async () => {
    const owner = storageAs(OWNER);
    await assertFails(uploadBytes(ref(owner, SPACE('w5.jpg')), bytes(), { contentType: 'text/html' }));
    await assertFails(uploadBytes(ref(owner, SPACE('w5.jpg')), bytes(5 * 1024 * 1024 + 1), jpeg));
    await assertFails(uploadBytes(ref(owner, SPACE('..bad.jpg')), bytes(), jpeg));
    await assertFails(uploadBytes(ref(owner, SPACE('w5.exe')), bytes(), jpeg));
  });

  it('catalogue photos: public read; only catalogue staff upload WebP up to 2 MB', async () => {
    const path = 'products/vx-001/abc123.webp';
    created.push(path);
    await assertSucceeds(uploadBytes(ref(storageAs('c', { role: 'catalog_manager' }), path), bytes(), webp));
    await assertSucceeds(getBytes(ref(guest(), path)));
    for (const denied of [storageAs(OWNER), guest(), storageAs('sup', { role: 'support' }), storageAs('d', { role: 'designer' })]) {
      await assertFails(uploadBytes(ref(denied, 'products/vx-001/x1.webp'), bytes(), webp));
      await assertFails(deleteObject(ref(denied, path)));
    }
    const admin = storageAs('a', { role: 'admin' });
    await assertFails(uploadBytes(ref(admin, 'products/vx-001/x2.jpg'), bytes(), jpeg));
    await assertFails(uploadBytes(ref(admin, 'products/vx-001/x3.webp'), bytes(2 * 1024 * 1024 + 1), webp));
  });

  it('QC photos: order staff upload WebP; order readers view; the customer and other staff cannot', async () => {
    const path = 'qc/ord_rulestest/p1.webp';
    created.push(path);
    const production = storageAs('p', { role: 'production' });
    await assertSucceeds(uploadBytes(ref(production, path), bytes(), webp));
    // Evidence is immutable: no overwrite, no delete, even by a super admin.
    await assertFails(uploadBytes(ref(storageAs('s', { role: 'super_admin' }), path), bytes(), webp));
    await assertFails(deleteObject(ref(storageAs('s', { role: 'super_admin' }), path)));
    for (const reader of ['support', 'finance', 'shipping', 'admin']) await assertSucceeds(getBytes(ref(storageAs(reader, { role: reader }), path)));
    for (const denied of [storageAs(OWNER), guest(), storageAs('c', { role: 'catalog_manager' }), storageAs('d', { role: 'designer' })]) {
      await assertFails(getBytes(ref(denied, path)));
    }
    for (const denied of [storageAs(OWNER), storageAs('sup', { role: 'support' }), storageAs('f', { role: 'finance' })]) {
      await assertFails(uploadBytes(ref(denied, 'qc/ord_rulestest/p2.webp'), bytes(), webp));
    }
    await assertFails(uploadBytes(ref(production, 'qc/ord_rulestest/p3.jpg'), bytes(), jpeg));
    await assertFails(uploadBytes(ref(production, 'qc/ord_rulestest/p4.webp'), bytes(2 * 1024 * 1024 + 1), webp));
  });

  it('consultation photos: the customer and consultation staff read; no client writes a wall snapshot', async () => {
    for (const reader of [storageAs(OWNER), storageAs('d', { role: 'designer' }), storageAs('a', { role: 'admin' }), storageAs('s', { role: 'super_admin' })]) {
      await assertSucceeds(getBytes(ref(reader, WALL)));
      await assertSucceeds(getBytes(ref(reader, PREVIEW('i1.png'))));
    }
    for (const denied of [storageAs('mallory'), guest(), storageAs('sup', { role: 'support' }), storageAs('f', { role: 'finance' })]) {
      await assertFails(getBytes(ref(denied, WALL)));
      await assertFails(getBytes(ref(denied, PREVIEW('i1.png'))));
    }
    for (const writer of [storageAs(OWNER), storageAs('d', { role: 'designer' }), storageAs('a', { role: 'super_admin' })]) {
      await assertFails(uploadBytes(ref(writer, `consultations/${CONSULTATION}/walls/w9.jpg`), bytes(), jpeg));
    }
  });

  it('consultation previews: written and removed only by consultation staff, as images', async () => {
    const designer = storageAs('d', { role: 'designer' });
    await assertSucceeds(uploadBytes(ref(designer, PREVIEW('i2.png')), bytes(), png));
    await assertFails(uploadBytes(ref(designer, PREVIEW('i3.png')), bytes(), { contentType: 'text/plain' }));
    await assertFails(uploadBytes(ref(designer, PREVIEW('i4.html')), bytes(), png));
    await assertSucceeds(deleteObject(ref(designer, PREVIEW('i2.png'))));
    for (const other of [storageAs(OWNER), storageAs('sup', { role: 'support' }), guest()]) {
      await assertFails(uploadBytes(ref(other, PREVIEW('i5.png')), bytes(), png));
      await assertFails(deleteObject(ref(other, PREVIEW('i1.png'))));
    }
  });
  it('review uploads: the owner creates, reads and deletes WebP up to 2 MB with a safe name', async () => {
    const owner = storageAs(OWNER);
    await assertSucceeds(getBytes(ref(owner, REVIEW_UPLOAD('p1.webp'))));
    await assertSucceeds(uploadBytes(ref(owner, REVIEW_UPLOAD('p2.webp')), bytes(), webp));
    await assertSucceeds(deleteObject(ref(owner, REVIEW_UPLOAD('p2.webp'))));
    await assertFails(uploadBytes(ref(owner, REVIEW_UPLOAD('p3.webp')), bytes(), jpeg));
    await assertFails(uploadBytes(ref(owner, REVIEW_UPLOAD('p3.webp')), bytes(2 * 1024 * 1024 + 1), webp));
    await assertFails(uploadBytes(ref(owner, REVIEW_UPLOAD('p3.jpg')), bytes(), webp));
    await assertFails(uploadBytes(ref(owner, REVIEW_UPLOAD('..bad.webp')), bytes(), webp));
    await assertFails(uploadBytes(ref(owner, REVIEW_UPLOAD('p1.webp')), bytes(), webp)); // never overwritten
    const unverified = env.authenticatedContext(OWNER, { email_verified: false, firebase: { sign_in_provider: 'password' } }).storage();
    await assertFails(uploadBytes(ref(unverified, REVIEW_UPLOAD('p4.webp')), bytes(), webp));
    await assertFails(getBytes(ref(unverified, REVIEW_UPLOAD('p1.webp'))));
  });

  it('review uploads: review moderators read; everyone else is denied, and nobody writes into another folder', async () => {
    for (const role of ['super_admin', 'admin', 'catalog_manager', 'support']) {
      await assertSucceeds(getBytes(ref(storageAs(`m-${role}`, { role }), REVIEW_UPLOAD('p1.webp'))));
    }
    for (const denied of [storageAs('mallory'), guest(), storageAs('d', { role: 'designer' }), storageAs('f', { role: 'finance' })]) {
      await assertFails(getBytes(ref(denied, REVIEW_UPLOAD('p1.webp'))));
    }
    for (const other of [storageAs('mallory'), guest(), storageAs('sup', { role: 'support' })]) {
      await assertFails(uploadBytes(ref(other, REVIEW_UPLOAD('p5.webp')), bytes(), webp));
      await assertFails(deleteObject(ref(other, REVIEW_UPLOAD('p1.webp'))));
    }
  });

  it('published review photos: public read, never written from a client', async () => {
    await assertSucceeds(getBytes(ref(guest(), PUBLIC_REVIEW_PHOTO)));
    for (const writer of [storageAs(OWNER), guest(), storageAs('a', { role: 'super_admin' }), storageAs('sup', { role: 'support' })]) {
      await assertFails(uploadBytes(ref(writer, 'reviews/rulestest-review/2.webp'), bytes(), webp));
      await assertFails(deleteObject(ref(writer, PUBLIC_REVIEW_PHOTO)));
    }
  });
});
