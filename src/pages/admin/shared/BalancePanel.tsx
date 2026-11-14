/**
 * Balance of an advance-paid order (api/_lib/orderBalance.ts): what is still owed, the payments taken, and the
 * two ways to collect the rest: money taken in person (RECORD_ORDER_PAYMENT) or a Razorpay link for exactly the
 * balance (SEND_BALANCE_LINK). Dispatch is refused on the server until the balance is 0.
 */
import { useState } from 'react';
import { Copy, IndianRupee, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { adminAction } from '@/lib/data/adminApi';
import { useOpsRunner } from '@/lib/data/orderOps';
import { formatInr } from '@/lib/orders/finance';
import { OFFLINE_PAYMENT_MODES, OFFLINE_PAYMENT_MODE_LABELS, type OfflinePaymentMode } from '@/types/staffOrders';
import type { Order } from '@/types/store';

const newKey = () => `bal${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const waNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
};

export function BalancePanel({ order, canCollect }: { order: Order; canCollect: boolean }) {
  const { run, busy } = useOpsRunner();
  const [mode, setMode] = useState<OfflinePaymentMode>('cash');
  const [reference, setReference] = useState('');
  const [rupees, setRupees] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [link, setLink] = useState<string | null>(null);
  const owed = order.balanceDuePaise ?? 0;
  const payments = order.payments ?? [];
  if (owed <= 0 && payments.length === 0) return null;

  const amountPaise = rupees ? Math.round(Number(rupees) * 100) : owed;
  const problem = !Number.isFinite(amountPaise) || amountPaise < 1 ? 'Enter an amount in rupees.'
    : amountPaise > owed ? `Only ${formatInr(owed)} is owed.`
      : mode !== 'cash' && !reference.trim() ? 'Enter the UPI, card or bank reference.' : null;

  const record = async () => {
    const result = await run(() => adminAction<{ balanceDuePaise: number }>('RECORD_ORDER_PAYMENT', {
      orderId: order.id, amountPaise, mode, reference: reference.trim(), idempotencyKey,
    }));
    if (!result.ok) { toast.error(result.error); return; }
    toast.success(result.value.balanceDuePaise ? `Recorded. ${formatInr(result.value.balanceDuePaise)} still owed.` : 'Balance paid in full. The order can be dispatched.');
    setRupees(''); setReference(''); setLink(null); setIdempotencyKey(newKey());
  };
  const sendLink = async () => {
    const result = await run(() => adminAction<{ link: { url: string } }>('SEND_BALANCE_LINK', { orderId: order.id }));
    if (!result.ok) { toast.error(result.error); return; }
    setLink(result.value.link.url);
    toast.success('Razorpay sent the balance link by SMS and email (when given).');
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
      <p className="flex items-center gap-1 font-semibold">
        <IndianRupee className="h-4 w-4" aria-hidden />
        {owed > 0 ? <>Balance due: <span className="font-mono">{formatInr(owed)}</span> (collect before dispatch)</> : 'Paid in full (advance and balance)'}
      </p>
      {payments.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {payments.map(p => (
            <li key={p.id}>
              {p.kind === 'advance' ? 'Advance' : 'Balance'} {formatInr(p.amountPaise)} · {p.mode === 'razorpay' ? 'Razorpay' : OFFLINE_PAYMENT_MODE_LABELS[p.mode as OfflinePaymentMode] ?? p.mode}
              {p.reference ? ` (${p.reference})` : ''} · {new Date(p.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </li>
          ))}
        </ul>
      )}
      {owed > 0 && canCollect && (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block text-xs font-medium">Amount (₹)
              <input value={rupees} onChange={e => setRupees(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder={String(owed / 100)} className="field mt-1 font-mono font-normal" />
            </label>
            <div className="block text-xs font-medium"><label htmlFor={`bal-mode-${order.id}`}>Paid by</label>
              <select id={`bal-mode-${order.id}`} value={mode} onChange={e => setMode(e.target.value as OfflinePaymentMode)} className="field mt-1 font-normal">
                {OFFLINE_PAYMENT_MODES.map(m => <option key={m} value={m}>{OFFLINE_PAYMENT_MODE_LABELS[m]}</option>)}
              </select>
            </div>
            <label className="block text-xs font-medium">Reference{mode === 'cash' ? ' (optional)' : ' *'}
              <input value={reference} onChange={e => setReference(e.target.value)} maxLength={80} className="field mt-1 font-normal" />
            </label>
          </div>
          {problem && rupees !== '' && <p role="alert" className="text-xs text-destructive">{problem}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || Boolean(problem)} onClick={() => void record()} className="btn-primary min-h-11">
              Record {formatInr(Number.isFinite(amountPaise) ? amountPaise : 0)} received
            </button>
            <button type="button" disabled={busy} onClick={() => void sendLink()} className="btn-secondary min-h-11">Send payment link for {formatInr(owed)}</button>
          </div>
          {link && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="break-all font-mono text-xs">{link}</span>
              <button type="button" className="btn-secondary inline-flex min-h-11 items-center gap-1" onClick={() => void navigator.clipboard.writeText(link).then(() => toast.success('Link copied'))}>
                <Copy className="h-4 w-4" /> Copy
              </button>
              {order.phone && (
                <a className="btn-secondary inline-flex min-h-11 items-center gap-1" target="_blank" rel="noopener noreferrer"
                  href={`https://wa.me/${waNumber(order.phone)}?text=${encodeURIComponent(`The balance of ${formatInr(owed)} for your Vernox order ${order.orderNumber ?? ''} can be paid here: ${link}`)}`}>
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
