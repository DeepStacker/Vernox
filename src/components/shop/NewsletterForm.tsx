import { useState } from 'react';
import { toast } from 'sonner';
import { isEmail } from '@/lib/storefront/contact';
import { subscribeToNewsletter } from '@/lib/storefront/engageApi';

/** Footer signup. `website` is a honeypot (hidden from people). Consent is the act of submitting, stated beside the button. */
export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEmail(email)) {
      toast.error('Please enter a valid email address.');
      return;
    }
    setState('sending');
    try {
      await subscribeToNewsletter(email, website);
      setState('done');
    } catch (err) {
      setState('idle');
      toast.error(err instanceof Error ? err.message : 'Could not subscribe. Please try again.');
    }
  };

  if (state === 'done') return <p role="status" className="text-sm">Almost done: we have emailed you a link. Open it to confirm your subscription.</p>;
  return (
    <form onSubmit={e => void submit(e)} aria-label="Newsletter" className="space-y-2">
      <p className="eyebrow font-sans">Stay in the loop</p>
      <div className="flex max-w-sm gap-2">
        <input type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address"
          aria-label="Email address" autoComplete="email" className="field min-w-0 flex-1" />
        <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
          <label>Leave this empty<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
        </div>
        <button type="submit" disabled={state === 'sending'} className="btn-primary px-4 py-2">{state === 'sending' ? '…' : 'Subscribe'}</button>
      </div>
      <p className="text-xs text-muted-foreground">New designs and offers, occasionally. Unsubscribe any time.</p>
    </form>
  );
}
