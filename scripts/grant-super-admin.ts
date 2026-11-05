/**
 * One-off bootstrap: grant the `super_admin` staff role to an existing account.
 *
 *   FIREBASE_SERVICE_ACCOUNT_BASE64=... npx tsx scripts/grant-super-admin.ts owner@example.com
 *   (or GOOGLE_APPLICATION_CREDENTIALS=/path/key.json; or FIRESTORE_EMULATOR_HOST +
 *    FIREBASE_AUTH_EMULATOR_HOST + FIREBASE_PROJECT_ID for the emulators)
 *
 * The user must already have signed up (and, for email/password, verified the
 * email). After this, further staff are managed with the SET_STAFF_ROLE admin
 * action. The user must sign out and in again (or refresh the ID token) to pick
 * up the claim.
 */
import { getAdminAuth, getDb } from '../api/_lib/firebaseAdmin';
import type { StaffMember } from '../src/types/admin';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    console.error('Usage: npx tsx scripts/grant-super-admin.ts <email>');
    process.exit(1);
  }

  const auth = getAdminAuth();
  const user = await auth.getUserByEmail(email);
  if (user.providerData.some(p => p.providerId === 'password') && !user.emailVerified) {
    console.warn(`Warning: ${email} has not verified its email; staff access is refused until it does.`);
  }

  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), role: 'super_admin' });
  const member: StaffMember = {
    uid: user.uid,
    email,
    ...(user.displayName ? { name: user.displayName } : {}),
    role: 'super_admin',
    updatedAt: Date.now(),
    updatedBy: 'bootstrap-script',
  };
  const db = getDb();
  await db.doc(`staff/${user.uid}`).set(member);
  await db.collection('audit_logs').add({
    timestamp: Date.now(),
    actorUid: 'bootstrap-script',
    adminEmail: 'bootstrap-script',
    adminName: 'bootstrap-script',
    adminRole: 'system',
    action: 'STAFF_ROLE_SET',
    targetType: 'staff',
    targetId: user.uid,
    details: { email, role: 'super_admin' },
    source: 'server',
  });
  console.log(`Granted super_admin to ${email} (uid ${user.uid}).`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
