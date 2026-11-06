/**
 * Seeds an empty (or emulator) Firestore with the launch catalog, store settings
 * and launch coupons. These static definitions are SEED DATA, not a pricing
 * authority: once seeded, the API prices only from Firestore.
 *
 *   npx tsx scripts/seed-firestore.ts            # create missing documents only
 *   npx tsx scripts/seed-firestore.ts --force    # overwrite products/settings (coupon usage is preserved)
 *
 * Credentials as for the API (see .env.example).
 */
import { getDb } from '../api/_lib/firebaseAdmin';
import { defaultSettingsDoc } from '../api/_lib/storeConfig';
import { products } from '../src/lib/catalog';
import { LAUNCH_COUPONS } from '../src/types/coupon';

const force = process.argv.includes('--force');

async function main() {
  const db = getDb();
  let written = 0;

  for (const product of products) {
    const ref = db.doc(`products/${product.id}`);
    if (!force && (await ref.get()).exists) continue;
    await ref.set({ ...product, updatedAt: Date.now() });
    written += 1;
  }

  const settingsRef = db.doc('settings/store');
  const settingsExist = (await settingsRef.get()).exists;
  if (force || !settingsExist) {
    // Same defaults as the API (api/_lib/storeConfig.ts); seller and contact fields start as placeholders.
    // --force never blanks business details the owner already entered.
    const { seller, whatsappNumber, supportPhone, supportEmail, supportHours, workshopAddress, grievanceOfficerName, grievanceOfficerEmail, ...pricing } = defaultSettingsDoc();
    const ownerFields = { seller, whatsappNumber, supportPhone, supportEmail, supportHours, workshopAddress, grievanceOfficerName, grievanceOfficerEmail };
    await settingsRef.set({ ...pricing, ...(settingsExist ? {} : ownerFields), updatedAt: Date.now() }, { merge: true });
    written += 1;
  }

  for (const [code, def] of Object.entries(LAUNCH_COUPONS)) {
    const existing = await db.collection('coupons').where('code', '==', code).limit(1).get();
    if (!existing.empty) continue;
    const now = Date.now();
    await db.collection('coupons').add({ ...def, code, usedCount: 0, createdAt: now, updatedAt: now });
    written += 1;
  }

  console.log(`Seed complete: ${written} document(s) written.`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
