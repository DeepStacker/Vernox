/**
 * Export confirmed newsletter subscribers as CSV for an email service provider (none is integrated).
 *
 *   FIREBASE_SERVICE_ACCOUNT_BASE64=... npm run export:newsletter > subscribers.csv
 *
 * Columns: email, source, consent_at (ISO), confirmed_at (ISO, empty for subscribers from before double opt-in),
 * unsubscribe_token, email_hash. Pending (unconfirmed) and unsubscribed addresses are left out; import only this file, and re-export before every campaign so removals are honoured.
 * An unsubscribe link for a campaign is `<site>/newsletter/unsubscribe?h=<email_hash>&t=<unsubscribe_token>`.
 * The file holds personal data and unsubscribe tokens: keep it out of the repository and delete it after use.
 */
import { getDb } from '../api/_lib/firebaseAdmin';
import { isDeliverableSubscriber, type SubscriberDoc } from '../api/_lib/newsletter';

// Prefix formula-looking cells so spreadsheets do not execute them.
const cell = (value: string) => {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

async function main() {
  const snap = await getDb().collection('newsletter_subscribers').get();
  const confirmed = snap.docs.filter(doc => isDeliverableSubscriber(doc.data() as SubscriberDoc));
  console.log('email,source,consent_at,confirmed_at,unsubscribe_token,email_hash');
  for (const doc of confirmed) {
    const s = doc.data() as SubscriberDoc;
    const row = [s.email, s.source, new Date(s.consentAt).toISOString(), s.confirmedAt ? new Date(s.confirmedAt).toISOString() : '', s.unsubscribeToken, doc.id];
    console.log(row.map(cell).join(','));
  }
  console.error(`Exported ${confirmed.length} confirmed subscribers (${snap.size - confirmed.length} pending or unsubscribed left out).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
