/** "Forgot password?" for the customer and staff sign-in forms: emails a Firebase reset link to the typed address. */
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/AuthProvider';

export function ForgotPasswordButton({ email }: { email: string }) {
  const { sendPasswordReset } = useAuth();
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      toast.error('Type your email above first, then press "Forgot password?".');
      return;
    }
    setBusy(true);
    try {
      await sendPasswordReset(address);
      // Same message whether or not the account exists.
      toast.success(`If an account exists for ${address}, we have emailed a link to reset the password.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The reset email could not be sent. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={() => void send()} disabled={busy} className="text-xs font-medium text-oxblood underline-offset-2 hover:underline disabled:opacity-60">
      {busy ? 'Sending…' : 'Forgot password?'}
    </button>
  );
}
