import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ContentPage } from '@/components/shop/ContentPage';
import { useSeo } from '@/lib/seo';
import { confirmNewsletterSubscription } from '@/lib/storefront/engageApi';

/**
 * Target of the confirmation link in the double opt-in email: /newsletter/confirm?h=<emailHash>&t=<token>.
 * Confirming takes one click, so mail scanners that open links do not subscribe anyone on their own.
 */
export default function NewsletterConfirm() {
  useSeo({ title: 'Confirm your subscription', description: 'Confirm that you want to receive Vernox emails.', noindex: true });
  const [params] = useSearchParams();
  const hash = params.get('h') ?? '';
  const token = params.get('t') ?? '';
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle');

  const confirm = async () => {
    setState('sending');
    try {
      await confirmNewsletterSubscription(hash, token);
      setState('done');
    } catch {
      setState('failed');
    }
  };

  return (
    <ContentPage title="Confirm your subscription">
      {state === 'done' ? (
        <div className="space-y-4" role="status">
          <p>Thank you, you are subscribed. We will write now and then about new pieces and offers, and every email has an unsubscribe link.</p>
          <Link to="/" className="btn-primary inline-flex">Continue to the store</Link>
        </div>
      ) : (
        <div className="space-y-4">
          <p>Press the button to confirm that you want to receive the Vernox newsletter at this address.</p>
          {state === 'failed' && (
            <p role="alert" className="text-sm text-destructive">
              This link is not valid any more. If you unsubscribed, or the link is old, sign up again from the footer of the store and we will send a fresh one.
            </p>
          )}
          <button type="button" className="btn-primary" disabled={state === 'sending' || !hash || !token} onClick={() => void confirm()}>
            {state === 'sending' ? 'Working…' : 'Confirm subscription'}
          </button>
        </div>
      )}
    </ContentPage>
  );
}
