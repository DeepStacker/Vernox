// @vitest-environment node
/**
 * Cloud Storage security rules tests (spaces/ and consultations/ paths). Needs both the Firestore and
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

describe.skipIf(!firestoreHost || !storageHost)('storage.rules', () => {
  let env: RulesTestEnvironment;
  const google = { email_verified: true, firebase: { sign_in_provider: 'google.com' as const } };
  const storageAs = (uid: string, claims: Record<string, unknown> = {}) => env.authenticatedContext(uid, { ...google, ...claims }).storage();
  const guest = () => env.unauthenticatedContext().storage();
  const bytes = (size = 10) => new Uint8Array(size);
  const jpeg = { contentType: 'image/jpeg' };
  const png = { contentType: 'image/png' };
  const created = [WALL, PREVIEW('i1.png'), SPACE('w1.jpg')];

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
});
