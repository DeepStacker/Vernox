/**
 * New order: staff enter a counter (walk-in) sale or an order taken by phone, WhatsApp, email or from a trade
 * enquiry. The server prices it with the storefront engine (QUOTE_STAFF_ORDER previews the totals) and creates
 * it with CREATE_STAFF_ORDER: paid in person (cash / UPI / card / bank transfer), by a Razorpay payment link
 * sent to the customer, or cash on delivery. A counter handover is delivered and GST-invoiced at once, so the
 * invoice can be printed for the customer before they leave.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Copy, FileText, MessageCircle, Plus, Trash2 } from 'lucide-react';
import { finishName } from '@/lib/catalog';
import { INDIAN_STATES_AND_UTS } from '@/lib/checkout/validation';
import { usePincodeAutofill } from '@/lib/shipping/usePincodeAutofill';
import { useB2bInquiries } from '@/lib/data/b2b';
import { downloadTaxDocument } from '@/lib/data/orderOps';
import { useProducts } from '@/lib/data/products';
import { findCustomerByPhone, quoteStaffOrder, useCreateStaffOrder, type CustomerLookup, type StaffOrderCreated, type StaffOrderItem, type StaffOrderQuote } from '@/lib/data/staffOrders';
import { formatInr } from '@/lib/orders/finance';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  OFFLINE_PAYMENT_MODES, OFFLINE_PAYMENT_MODE_LABELS, PAYMENT_LINK_TTL_HOURS, STAFF_ORDER_CHANNELS, STAFF_ORDER_CHANNEL_LABELS,
  type OfflinePaymentMode, type StaffOrderChannel, type StaffPaymentMethod,
} from '@/types/staffOrders';

const newKey = () => `staff-${crypto.randomUUID()}`;
const EMPTY_CUSTOMER = { name: '', phone: '', email: '', address: '', city: '', state: '', pincode: '' };
const PAYMENT_LABELS: Record<StaffPaymentMethod, string> = {
  offline: 'Paid now (cash, UPI, card, bank)',
  payment_link: 'Send a payment link',
  cod: 'Cash on delivery',
};
const STATUS_NOTE: Record<string, string> = {
  Delivered: 'Handed over and invoiced. Print the invoice for the customer.',
  Paid: 'Paid. It is now in the Orders list and the production queue.',
  Confirmed_COD: 'Confirmed for cash on delivery. It is now in the Orders list and the production queue.',
  Pending_Payment: 'Waiting for payment. It moves to production by itself once the customer pays.',
};
/** wa.me needs the international number without "+"; Indian 10-digit mobiles get the 91 prefix. */
const waNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
};

function ItemPicker({ onAdd }: { onAdd: (item: StaffOrderItem) => void }) {
  const { data: products = [], isLoading } = useProducts();
  const [productId, setProductId] = useState('');
  const product = products.find(p => p.id === productId);
  const [sizeLabel, setSizeLabel] = useState('');
  const [finish, setFinish] = useState('');
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    setSizeLabel(product?.sizes[0]?.label ?? '');
    setFinish(product?.finishes[0] ?? '');
  }, [product]);

  const add = () => {
    if (!product || !finish) return;
    onAdd({ productId: product.id, sizeLabel: sizeLabel || undefined, finish, quantity });
    setQuantity(1);
  };

  return (
    <div className="grid gap-3 rounded-lg border border-dashed border-border p-3 sm:grid-cols-[2fr_1fr_1fr_5rem_auto] sm:items-end">
      <div className="block text-sm font-medium"><label htmlFor="new-order-piece">Piece</label>
        <select id="new-order-piece" value={productId} onChange={e => setProductId(e.target.value)} className="field mt-1 font-normal" disabled={isLoading}>
          <option value="">{isLoading ? 'Loading…' : 'Choose a piece'}</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>{p.name}{p.trackInventory ? ` (${p.stock} in stock)` : ''}</option>
          ))}
        </select>
      </div>
      <div className="block text-sm font-medium"><label htmlFor="new-order-size">Size</label>
        <select id="new-order-size" value={sizeLabel} onChange={e => setSizeLabel(e.target.value)} className="field mt-1 font-normal" disabled={!product?.sizes.length}>
          {!product?.sizes.length && <option value="">Standard</option>}
          {product?.sizes.map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
        </select>
      </div>
      <div className="block text-sm font-medium"><label htmlFor="new-order-finish">Finish</label>
        <select id="new-order-finish" value={finish} onChange={e => setFinish(e.target.value)} className="field mt-1 font-normal" disabled={!product}>
          {product?.finishes.map(f => <option key={f} value={f}>{finishName(f)}</option>)}
        </select>
      </div>
      <label className="block text-sm font-medium">Qty
        <input type="number" min={1} max={99} value={quantity} onChange={e => setQuantity(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} className="field mt-1 font-normal" />
      </label>
      <button type="button" onClick={add} disabled={!product || !finish} className="btn-secondary inline-flex items-center gap-1.5">
        <Plus className="h-4 w-4" /> Add
      </button>
    </div>
  );
}

function Created({ result, phone, onNext }: { result: StaffOrderCreated; phone: string; onNext: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const link = result.paymentLink;
  const invoice = async () => {
    setDownloading(true);
    try {
      await downloadTaxDocument(result.orderId, `${result.invoiceNumber}.pdf`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The invoice could not be loaded.');
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div role="status" className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <p className="font-display text-2xl">Order {result.orderNumber} created</p>
        <p className="text-sm text-muted-foreground">{STATUS_NOTE[result.status] ?? `Status: ${result.status.replace(/_/g, ' ')}.`}</p>
      </div>
      {result.invoiceNumber && (
        <button type="button" onClick={() => void invoice()} disabled={downloading} className="btn-primary inline-flex items-center gap-1.5">
          <FileText className="h-4 w-4" /> {downloading ? 'Loading…' : `Tax invoice ${result.invoiceNumber} (PDF)`}
        </button>
      )}
      {link && (
        <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-sm">
          <p>Razorpay has sent this payment link to the customer by SMS and email (when given). It expires {new Date(link.expiresAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}; the order confirms itself when paid.</p>
          <p className="break-all font-mono">{link.url}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary inline-flex items-center gap-1.5" onClick={() => void navigator.clipboard.writeText(link.url).then(() => toast.success('Link copied'))}>
              <Copy className="h-4 w-4" /> Copy link
            </button>
            {phone && (
              <a className="btn-secondary inline-flex items-center gap-1.5" target="_blank" rel="noopener noreferrer"
                href={`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(`Your Vernox order ${result.orderNumber} is ready for payment: ${link.url}`)}`}>
                <MessageCircle className="h-4 w-4" /> Send on WhatsApp
              </a>
            )}
          </div>
        </div>
      )}
      <button type="button" onClick={onNext} className="btn-secondary">Enter another order</button>
    </div>
  );
}

export function NewOrderConsole() {
  const { permissions } = useAuth();
  const { data: products = [] } = useProducts();
  const { data: enquiries = [] } = useB2bInquiries(Boolean(permissions?.canReadB2b));
  const create = useCreateStaffOrder();
  const [channel, setChannel] = useState<StaffOrderChannel>('counter');
  const [items, setItems] = useState<StaffOrderItem[]>([]);
  const [customer, setCustomer] = useState(EMPTY_CUSTOMER);
  const [paymentMethod, setPaymentMethod] = useState<StaffPaymentMethod>('offline');
  const [mode, setMode] = useState<OfflinePaymentMode>('cash');
  const [reference, setReference] = useState('');
  const [handover, setHandover] = useState(true);
  const [couponCode, setCouponCode] = useState('');
  const [note, setNote] = useState('');
  const [tradeEnquiryId, setTradeEnquiryId] = useState('');
  const [quote, setQuote] = useState<StaffOrderQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<StaffOrderCreated | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [returning, setReturning] = useState<Extract<CustomerLookup, { found: true }> | null>(null);

  const canHandover = channel === 'counter' && paymentMethod === 'offline';
  const handingOver = canHandover && handover;
  const productName = (id: string) => products.find(p => p.id === id)?.name ?? id;
  const setField = (key: keyof typeof EMPTY_CUSTOMER) => (value: string) => setCustomer(c => ({ ...c, [key]: value }));
  // Typing the PIN fills an empty city/state (never overwrites typed values).
  usePincodeAutofill(customer.pincode, customer, patch => setCustomer(c => ({ ...c, ...patch })));
  // Any change to what is ordered is a new order, not a retry of the last one.
  const quoteInput = useMemo(
    () => ({ items, couponCode: couponCode.trim() || undefined, customerEmail: customer.email.trim() || undefined, cod: paymentMethod === 'cod', handover: handingOver }),
    [items, couponCode, customer.email, paymentMethod, handingOver],
  );
  useEffect(() => setIdempotencyKey(newKey()), [quoteInput, customer, channel, mode, reference]);

  useEffect(() => {
    if (items.length === 0) { setQuote(null); setQuoteError(null); return; }
    let live = true;
    const timer = setTimeout(() => {
      quoteStaffOrder(quoteInput)
        .then(q => { if (live) { setQuote(q); setQuoteError(null); } })
        .catch(err => { if (live) { setQuote(null); setQuoteError(err instanceof Error ? err.message : 'Could not price the order.'); } });
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [quoteInput, items.length]);

  // A returning customer's details fill in from their last order once a full mobile number is typed; fields
  // staff already filled are kept.
  const phoneDigits = customer.phone.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  useEffect(() => {
    setReturning(null);
    if (phoneDigits.length !== 10) return;
    let live = true;
    const timer = setTimeout(() => {
      findCustomerByPhone(phoneDigits)
        .then(found => {
          if (!live || !found.found) return;
          setReturning(found);
          setCustomer(c => ({
            ...c,
            name: c.name || found.name,
            email: c.email || found.email,
            ...(found.address && !c.address ? found.address : {}),
          }));
        })
        .catch(() => { /* lookup is a convenience; typing the details still works */ });
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [phoneDigits]);

  const reset = () => {
    setItems([]); setCustomer(EMPTY_CUSTOMER); setCouponCode(''); setNote(''); setReference(''); setTradeEnquiryId('');
    setCreated(null); setError(null); setReturning(null); setIdempotencyKey(newKey());
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = Object.fromEntries(Object.entries(customer).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    try {
      const result = await create.mutateAsync({
        channel,
        items,
        couponCode: couponCode.trim() || undefined,
        customer: trimmed as { name: string; phone: string },
        payment: paymentMethod === 'offline' ? { method: 'offline', mode, reference: reference.trim() } : { method: paymentMethod },
        handover: handingOver,
        idempotencyKey,
        note: note.trim() || undefined,
        tradeEnquiryId: channel === 'trade' && tradeEnquiryId ? tradeEnquiryId : undefined,
      });
      toast.success(`Order ${result.orderNumber} created`);
      setCreated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The order could not be created.');
    }
  };

  if (created) return <Created result={created} phone={customer.phone.trim()} onNext={reset} />;

  const needsReference = paymentMethod === 'offline' && mode !== 'cash';
  const ready = items.length > 0 && customer.name.trim() && customer.phone.trim() && (!needsReference || reference.trim())
    && (handingOver || (customer.address.trim() && customer.city.trim() && customer.state.trim() && customer.pincode.trim()));
  const input = (key: keyof typeof EMPTY_CUSTOMER, label: string, props: Record<string, unknown> = {}) => (
    <label className="block text-sm font-medium">{label}
      <input value={customer[key]} onChange={e => setField(key)(e.target.value)} className="field mt-1 font-normal" {...props} />
    </label>
  );

  return (
    <form onSubmit={e => void submit(e)} className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Where the order came from</h3>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Channel">
            {STAFF_ORDER_CHANNELS.map(c => (
              <button key={c} type="button" role="radio" aria-checked={channel === c} onClick={() => setChannel(c)}
                className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${channel === c ? 'bg-oxblood text-ivory' : 'bg-muted/50 text-muted-foreground'}`}>
                {STAFF_ORDER_CHANNEL_LABELS[c]}
              </button>
            ))}
          </div>
          {channel === 'trade' && enquiries.length > 0 && (
            <div className="block text-sm font-medium"><label htmlFor="new-order-enquiry">Trade enquiry (optional; marked won)</label>
              <select id="new-order-enquiry" value={tradeEnquiryId} onChange={e => setTradeEnquiryId(e.target.value)} className="field mt-1 font-normal">
                <option value="">None</option>
                {enquiries.filter(q => q.status !== 'won' && q.status !== 'lost').map(q => (
                  <option key={q.id} value={q.id}>{q.refId ?? q.id} · {q.name}{q.company ? ` (${q.company})` : ''}</option>
                ))}
              </select>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pieces</h3>
          <ItemPicker onAdd={item => setItems(list => [...list, item])} />
          {items.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {items.map((item, i) => (
                <li key={`${item.productId}-${i}`} className="flex items-center justify-between gap-2 p-3 text-sm">
                  <span>{item.quantity} × {productName(item.productId)}{item.sizeLabel ? ` · ${item.sizeLabel}` : ''} · {finishName(item.finish)}</span>
                  <button type="button" aria-label={`Remove ${productName(item.productId)}`} onClick={() => setItems(list => list.filter((_, j) => j !== i))}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Custom designs are ordered through the Studio; note any special request below.</p>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Payment</h3>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Payment">
            {(Object.keys(PAYMENT_LABELS) as StaffPaymentMethod[]).map(m => (
              <button key={m} type="button" role="radio" aria-checked={paymentMethod === m} onClick={() => setPaymentMethod(m)}
                className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${paymentMethod === m ? 'bg-oxblood text-ivory' : 'bg-muted/50 text-muted-foreground'}`}>
                {PAYMENT_LABELS[m]}
              </button>
            ))}
          </div>
          {paymentMethod === 'offline' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="block text-sm font-medium"><label htmlFor="new-order-paid-by">Paid by</label>
                <select id="new-order-paid-by" value={mode} onChange={e => setMode(e.target.value as OfflinePaymentMode)} className="field mt-1 font-normal">
                  {OFFLINE_PAYMENT_MODES.map(m => <option key={m} value={m}>{OFFLINE_PAYMENT_MODE_LABELS[m]}</option>)}
                </select>
              </div>
              <label className="block text-sm font-medium">Transaction reference{needsReference ? ' *' : ' (optional)'}
                <input value={reference} onChange={e => setReference(e.target.value)} maxLength={80} className="field mt-1 font-normal" placeholder={mode === 'upi' ? 'UTR / UPI ref' : mode === 'card' ? 'POS slip / approval code' : ''} />
              </label>
            </div>
          )}
          {paymentMethod === 'payment_link' && (
            <p className="text-xs text-muted-foreground">Razorpay sends the link by SMS and email. The pieces are held for {PAYMENT_LINK_TTL_HOURS} hours; the order confirms itself when paid.</p>
          )}
          {paymentMethod === 'cod' && <p className="text-xs text-muted-foreground">Same rules as the website: catalogue pieces only, the COD fee and order limit apply.</p>}
          {canHandover && (
            <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={handover} onChange={e => setHandover(e.target.checked)} className="h-5 w-5" />
              Customer takes the pieces now (marks delivered and issues the GST invoice)
            </label>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Customer</h3>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {returning
              ? `Returning customer: ${returning.orderCount} earlier order${returning.orderCount === 1 ? '' : 's'}, last ${returning.lastOrderNumber}. Details filled in; check them.`
              : 'Enter the mobile first: a returning customer\'s details fill in by themselves.'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {input('phone', 'Mobile *', { type: 'tel', inputMode: 'tel', maxLength: 20 })}
            {input('name', 'Name *', { maxLength: 120, autoComplete: 'off' })}
            {input('email', 'Email (for the receipt and coupons)', { type: 'email', maxLength: 254 })}
          </div>
          {!handingOver && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">{input('address', 'Delivery address *', { maxLength: 500 })}</div>
              {input('pincode', 'PIN code *', { inputMode: 'numeric', maxLength: 6 })}
              {input('city', 'City *', { maxLength: 100 })}
              <div className="block text-sm font-medium"><label htmlFor="new-order-state">State / UT *</label>
                <select id="new-order-state" value={customer.state} onChange={e => setField('state')(e.target.value)} className="field mt-1 font-normal">
                  <option value="">Choose</option>
                  {INDIAN_STATES_AND_UTS.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Coupon code
            <input value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} maxLength={40} className="field mt-1 font-mono font-normal" />
          </label>
          <label className="block text-sm font-medium sm:col-span-2">Note for the team
            <textarea rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} className="field mt-1 font-normal" placeholder="Engraving text, delivery timing, gift wrap…" />
          </label>
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <section className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm" aria-live="polite">
          <h3 className="font-semibold">Summary</h3>
          {items.length === 0 && <p className="text-muted-foreground">Add a piece to see the price.</p>}
          {quoteError && <p role="alert" className="text-destructive">{quoteError}</p>}
          {quote && (
            <>
              <ul className="space-y-1">
                {quote.lines.map((l, i) => (
                  <li key={i} className="flex justify-between gap-2"><span>{l.quantity} × {l.name}</span><span className="font-mono">{formatInr(l.lineTotalPaise)}</span></li>
                ))}
              </ul>
              <dl className="space-y-1 border-t border-border pt-2">
                {quote.totals.discountPaise > 0 && <div className="flex justify-between"><dt>Discount</dt><dd className="font-mono">−{formatInr(quote.totals.discountPaise)}</dd></div>}
                {quote.coupon && 'message' in quote.coupon && <p className="text-destructive">{quote.coupon.message}</p>}
                {!handingOver && <div className="flex justify-between"><dt>Shipping</dt><dd className="font-mono">{quote.totals.shippingPaise ? formatInr(quote.totals.shippingPaise) : 'Free'}</dd></div>}
                {quote.totals.codFeePaise > 0 && <div className="flex justify-between"><dt>COD fee</dt><dd className="font-mono">{formatInr(quote.totals.codFeePaise)}</dd></div>}
                <div className="flex justify-between"><dt>GST</dt><dd className="font-mono">{formatInr(quote.totals.taxPaise)}</dd></div>
                <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd className="font-mono">{formatInr(quote.totals.totalPaise)}</dd></div>
              </dl>
              {paymentMethod === 'offline' && <p className="text-xs text-muted-foreground">Collect exactly this amount before creating the order.</p>}
            </>
          )}
        </section>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={!ready || create.isPending || Boolean(quoteError)} className="btn-primary w-full">
          {create.isPending ? 'Creating…' : paymentMethod === 'payment_link' ? 'Create order and send link' : 'Create order'}
        </button>
      </aside>
    </form>
  );
}
