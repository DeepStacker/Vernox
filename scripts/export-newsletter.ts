/**
 * Export current newsletter subscribers as CSV for an email service provider (none is integrated).
 *
 *   FIREBASE_SERVICE_ACCOUNT_BASE64=... npm run export:newsletter > subscribers.csv
 *
 * Columns: email, source, consent_at (ISO), unsubscribe_token, email_hash. Unsubscribed addresses are
 * left out; import only this file, and re-export before every campaign so removals are honoured.
 * An unsubscribe link for a campaign is `<site>/newsletter/unsubscribe?h=<email_hash>&t=<unsubscribe_token>`.
 * The file holds personal data and unsubscribe tokens: keep it out of the repository and delete it after use.
 */
import { getDb } from '../api/_lib/firebaseAdmin';
import type { SubscriberDoc } from '../api/_lib/newsletter';

// Prefix formula-looking cells so spreadsheets do not execute them.
const cell = (value: string) => {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

async function main() {
  const snap = await getDb().collection('newsletter_subscribers').where('status', '==', 'subscribed').get();
  console.log('email,source,consent_at,unsubscribe_token,email_hash');
  for (const doc of snap.docs) {
    const s = doc.data() as SubscriberDoc;
    console.log([s.email, s.source, new Date(s.consentAt).toISOString(), s.unsubscribeToken, doc.id].map(cell).join(','));
  }
  console.error(`Exported ${snap.size} subscribers.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
