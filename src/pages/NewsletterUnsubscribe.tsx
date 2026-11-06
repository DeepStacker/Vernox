import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ContentPage } from '@/components/shop/ContentPage';
import { useSeo } from '@/lib/seo';
import { unsubscribeFromNewsletter } from '@/lib/storefront/engageApi';

/**
 * Target of the unsubscribe link in newsletters: /newsletter/unsubscribe?h=<emailHash>&t=<token>.
 * It needs one click, so mail scanners that open links do not unsubscribe anyone.
 */
export default function NewsletterUnsubscribe() {
  useSeo({ title: 'Unsubscribe', description: 'Stop receiving Vernox emails.' });
  const [params] = useSearchParams();
  const hash = params.get('h') ?? '';
  const token = params.get('t') ?? '';
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle');

  const confirm = async () => {
    setState('sending');
    try {
      await unsubscribeFromNewsletter(hash, token);
      setState('done');
    } catch {
      setState('failed');
    }
  };

  return (
    <ContentPage title="Unsubscribe">
      {state === 'done' ? (
        <p role="status">You have been unsubscribed. You will not get our emails.</p>
      ) : (
        <div className="space-y-4">
          <p>Stop receiving Vernox newsletters?</p>
          {state === 'failed' && <p role="alert" className="text-sm text-destructive">This link is not valid. Contact us and we will remove you.</p>}
          <button type="button" className="btn-primary" disabled={state === 'sending' || !hash || !token} onClick={() => void confirm()}>
            {state === 'sending' ? 'Working…' : 'Unsubscribe'}
          </button>
        </div>
      )}
    </ContentPage>
  );
}
