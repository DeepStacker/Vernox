/**
 * Cash-on-delivery confirmation step of the checkout payment section: texts a 6-digit code to the customer's
 * mobile and exchanges it for a single-use verification token that createCheckoutIntent sends (api/_lib/codOtp.ts).
 * It renders nothing when the store has no SMS provider (the server then flags the order for confirmation by
 * phone instead), so the parent only needs `onChange`: `required` says whether the Place order button must wait for
 * `token`. It sits inside the checkout <form>, so every control is type="button" and Enter is handled here.
 */
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { fetchCodOtpStatus, sendCodOtp, verifyCodOtp } from '@/lib/storefront/engageApi';

export interface CodOtpState {
  required: boolean;
  token: string | null;
}

interface Props {
  /** Normalised 10-digit mobile; the step is inactive until it is valid. */
  phone: string | null;
  onChange: (state: CodOtpState) => void;
}

type Stage = 'loading' | 'off' | 'idle' | 'sending' | 'sent' | 'verifying' | 'verified';

export function CodOtpStep({ phone, onChange }: Props) {
  const [stage, setStage] = useState<Stage>('loading');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let live = true;
    onChangeRef.current({ required: true, token: null });
    fetchCodOtpStatus()
      .then(required => {
        if (!live) return;
        setStage(required ? 'idle' : 'off');
        onChangeRef.current({ required, token: null });
      })
      .catch(() => {
        // Could not ask: let the server decide at checkout (it answers COD_OTP_REQUIRED if a code is needed).
        if (live) setStage('off');
        onChangeRef.current({ required: false, token: null });
      });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  // Changing the number invalidates a code or verification obtained for the old one.
  const phoneRef = useRef(phone);
  useEffect(() => {
    if (phoneRef.current === phone) return;
    phoneRef.current = phone;
    setStage(s => (s === 'off' || s === 'loading' ? s : 'idle'));
    setCode('');
    setError('');
    onChangeRef.current({ required: true, token: null });
  }, [phone]);

  if (stage === 'off' || stage === 'loading') return null;

  const send = async () => {
    if (!phone) return;
    setError('');
    setStage('sending');
    try {
      const seconds = await sendCodOtp(phone);
      setWait(seconds);
      setCode('');
      setStage('sent');
    } catch (err) {
      setStage(code ? 'sent' : 'idle');
      setError(err instanceof Error ? err.message : 'We could not send the code. Please try again.');
    }
  };

  const verify = async () => {
    if (!phone || !/^[0-9]{6}$/.test(code)) {
      setError('Enter the 6-digit code from the SMS.');
      return;
    }
    setError('');
    setStage('verifying');
    try {
      const token = await verifyCodOtp(phone, code);
      setStage('verified');
      onChangeRef.current({ required: true, token });
    } catch (err) {
      setStage('sent');
      setError(err instanceof Error ? err.message : 'That code did not work. Please try again.');
    }
  };

  if (stage === 'verified') {
    return (
      <p role="status" className="flex items-center gap-2 rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> Mobile number confirmed. You can place your order.
      </p>
    );
  }

  const busy = stage === 'sending' || stage === 'verifying';
  const codeSent = stage === 'sent' || stage === 'verifying';
  return (
    <div className="space-y-3 rounded border border-border bg-background p-3 text-sm" aria-label="Confirm your mobile number">
      <p className="text-muted-foreground">
        To keep cash on delivery safe, we confirm your mobile number with a one-time code
        {phone ? <> sent to <span className="font-mono text-foreground">+91 {phone}</span></> : null}.
      </p>
      {!phone && <p className="text-xs text-muted-foreground">Enter a valid mobile number above to get your code.</p>}
      {!codeSent ? (
        <button type="button" disabled={busy || !phone} onClick={() => void send()} className="btn-secondary min-h-11 w-full sm:w-auto">
          {stage === 'sending' ? 'Sending…' : 'Send code'}
        </button>
      ) : (
        <div className="space-y-2">
          <label htmlFor="cod-otp-code" className="block font-medium">6-digit code</label>
          <div className="flex flex-wrap items-stretch gap-2">
            <input
              id="cod-otp-code"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void verify(); } }}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              aria-describedby="cod-otp-help"
              aria-invalid={error ? true : undefined}
              className="min-h-11 w-40 rounded border border-border bg-background px-3 font-mono text-lg tracking-[0.3em] outline-none focus:border-burgundy"
            />
            <button type="button" disabled={busy || code.length !== 6} onClick={() => void verify()} className="btn-primary min-h-11">
              {stage === 'verifying' ? 'Checking…' : 'Verify'}
            </button>
          </div>
          <p id="cod-otp-help" className="text-xs text-muted-foreground">
            The code is valid for 5 minutes.{' '}
            {wait > 0 ? (
              <span aria-live="off">You can ask for a new code in {wait}s.</span>
            ) : (
              <button type="button" disabled={busy} onClick={() => void send()} className="font-semibold text-burgundy underline">Resend code</button>
            )}
          </p>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
