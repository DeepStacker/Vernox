import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCatalog } from '@/lib/catalogContext';
import { useAuth } from '@/lib/auth/AuthProvider';
import { INDIAN_STATES_AND_UTS, normalizeIndianMobile } from '@/lib/checkout/validation';
import { purchaseConsultation } from '@/lib/consultations/consultations';
import { consultationSettings } from '@/lib/consultations/consultationModel';
import { trackSpaceEvent } from '@/lib/spaces/analytics';
import { formatINR } from '@/lib/storefront/format';
import type { SpaceDoc } from '@/types/consultation';

interface Props {
  space: SpaceDoc | null;
  onClose: () => void;
  onPurchased: (consultationId: string) => void;
}

/** Buys design help for a space through the standard prepaid checkout (server prices it, Razorpay takes payment). */
export function ConsultationPurchaseDialog({ space, onClose, onPurchased }: Props) {
  const { storeConfig } = useCatalog();
  const { user, profile } = useAuth();
  const settings = consultationSettings(storeConfig.consultation);
  const [name, setName] = useState(profile?.name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [state, setState] = useState(profile?.state ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // One purchase attempt = one idempotency key, so a double tap cannot create two orders.
  const key = useRef(crypto.randomUUID().replace(/-/g, ''));

  const pay = async () => {
    if (!space || !user?.email) return;
    const mobile = normalizeIndianMobile(phone);
    if (!name.trim() || !mobile || !state) return setError('Enter your name, a valid mobile number and your state.');
    setBusy(true);
    setError('');
    try {
      const id = await purchaseConsultation(
        { spaceId: space.id, name: name.trim(), phone: mobile, state, email: user.email, idempotencyKey: key.current },
        { storeName: storeConfig.storeName, onPaymentFailed: message => setError(message) },
      );
      if (id) {
        trackSpaceEvent('consultation_purchased', { spaceId: space.id, priceInr: settings.priceInr });
        toast.success('Payment received. Your designer will start soon.');
        onPurchased(id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the payment. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!space} onOpenChange={open => !open && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Design help for {space?.name}</DialogTitle>
          <DialogDescription>
            A designer reviews your walls and sends a proposal within {settings.turnaroundDays} days, with each piece shown on your own wall.
          </DialogDescription>
        </DialogHeader>
        <p className="font-display text-3xl">{formatINR(settings.priceInr)} <span className="text-sm font-sans text-muted-foreground">+ GST</span></p>
        {settings.creditTowardsOrder && (
          <p className="text-sm text-muted-foreground">The fee comes back as credit on your next order, valid for {settings.creditValidityDays} days.</p>
        )}
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Name</span>
            <input value={name} onChange={e => setName(e.target.value)} autoComplete="name" className="field" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Mobile number</span>
            <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" className="field" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">State</span>
            <select value={state} onChange={e => setState(e.target.value)} className="field">
              <option value="">Select your state</option>
              {INDIAN_STATES_AND_UTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button type="button" onClick={pay} disabled={busy} className="btn-primary w-full">{busy ? 'Opening payment…' : `Pay ${formatINR(settings.priceInr)} + GST`}</button>
      </DialogContent>
    </Dialog>
  );
}
