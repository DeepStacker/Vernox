/**
 * "Print receipt": a thermal receipt (80 or 58 mm) for one order, printed with window.print(). While printing,
 * the receipt is mounted straight under <body> and a print-only stylesheet hides everything else and sets the
 * paper size; the stylesheet is mounted only then because @page applies to the whole document. Seller details
 * come from store settings, the invoice number and tax split from the order's invoice (see lib/orders/receipt.ts).
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';
import { useStaffOrder } from '@/lib/data/orders';
import { useOrderDocuments } from '@/lib/data/orderOps';
import { useStoreConfig } from '@/lib/data/settings';
import { buildReceipt, type Receipt, type ReceiptWidth } from '@/lib/orders/receipt';
import type { Order } from '@/types/store';

const WIDTH_KEY = 'vernox.receiptWidth';

function readWidth(): ReceiptWidth {
  try {
    return localStorage.getItem(WIDTH_KEY) === '58' ? '58' : '80';
  } catch {
    return '80'; // storage blocked (private window): the default is fine
  }
}

const RECEIPT_ID = 'vernox-receipt';

/** Paper is 80 or 58 mm wide; the printable column is a little narrower than the roll. */
const printCss = (width: ReceiptWidth) => `
@media screen { #${RECEIPT_ID} { display: none; } }
@media print {
  @page { size: ${width}mm auto; margin: 0; }
  body > *:not(#${RECEIPT_ID}) { display: none !important; }
  html, body { background: #fff !important; margin: 0 !important; }
  #${RECEIPT_ID} { display: block; width: ${width === '80' ? 72 : 50}mm; margin: 0 auto; padding: 3mm 0; color: #000; background: #fff;
    font: ${width === '80' ? 12 : 10.5}px/1.35 ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }
  #${RECEIPT_ID} .rc-c { text-align: center; }
  #${RECEIPT_ID} .rc-b { font-weight: 700; }
  #${RECEIPT_ID} .rc-row { display: flex; justify-content: space-between; gap: 2mm; }
  #${RECEIPT_ID} .rc-row > :last-child { text-align: right; white-space: nowrap; }
  #${RECEIPT_ID} .rc-hr { border-top: 1px dashed #000; margin: 1.5mm 0; }
  #${RECEIPT_ID} .rc-d { font-size: 0.9em; }
}`;

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={`rc-row${strong ? ' rc-b' : ''}`}><span>{label}</span><span>{value}</span></div>
);

function ReceiptBody({ receipt }: { receipt: Receipt }) {
  const { seller, customer } = receipt;
  return (
    <>
      <div className="rc-c">
        <div className="rc-b">{seller.name}</div>
        {seller.addressLines.map(l => <div key={l}>{l}</div>)}
        {seller.gstin && <div>GSTIN {seller.gstin}</div>}
        {seller.phone && <div>Tel {seller.phone}</div>}
      </div>
      <div className="rc-hr" />
      <div className="rc-c rc-b">{receipt.title}</div>
      {receipt.invoiceNumber && <Row label="Invoice" value={receipt.invoiceNumber} />}
      <Row label="Order" value={receipt.orderNumber} />
      <Row label="Date" value={receipt.dateText} />
      {customer && <Row label={customer.name || 'Customer'} value={customer.phone} />}
      <div className="rc-hr" />
      {receipt.lines.map((l, i) => (
        <div key={i}>
          <div className="rc-b">{l.name}</div>
          <div className="rc-row rc-d"><span>{l.detail ? `${l.detail} × ${l.quantity}` : `× ${l.quantity}`}</span><span>{l.amount}</span></div>
        </div>
      ))}
      <div className="rc-hr" />
      {receipt.totals.map(r => <Row key={r.label} {...r} />)}
      <div className="rc-hr" />
      {receipt.payment.map(r => <Row key={r.label} {...r} />)}
      <div className="rc-hr" />
      <div className="rc-c rc-d">{receipt.footer.map(l => <div key={l}>{l}</div>)}</div>
    </>
  );
}

/** Pass the loaded order, or only its id (the success screen of New order) and the order is read for staff. */
export function PrintReceiptButton({ order, orderId }: { order?: Order; orderId?: string }) {
  const loaded = useStaffOrder(orderId ?? null, !order);
  const resolved = order ?? loaded.data ?? null;
  const docs = useOrderDocuments(resolved?.id ?? null);
  const { data: config } = useStoreConfig();
  const [width, setWidth] = useState<ReceiptWidth>(readWidth);
  const [printing, setPrinting] = useState(false);

  const receipt = useMemo(() => (resolved ? buildReceipt({ order: resolved, config, invoice: docs.data?.invoice }) : null), [resolved, config, docs.data?.invoice]);

  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done, { once: true });
    window.print();
    return () => window.removeEventListener('afterprint', done);
  }, [printing]);

  const chooseWidth = (next: ReceiptWidth) => {
    setWidth(next);
    try {
      localStorage.setItem(WIDTH_KEY, next);
    } catch {
      // not remembered; the choice still applies to this session
    }
  };

  const start = () => {
    if (!receipt) return toast.error('The order is still loading. Try again in a moment.');
    setPrinting(true);
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className="btn-secondary inline-flex items-center gap-1.5" onClick={start} disabled={!receipt}>
        <Printer className="h-4 w-4" /> Print receipt
      </button>
      <select aria-label="Receipt paper width" value={width} onChange={e => chooseWidth(e.target.value as ReceiptWidth)} className="field w-auto py-1 text-sm">
        <option value="80">80 mm paper</option>
        <option value="58">58 mm paper</option>
      </select>
      {printing && receipt && createPortal(
        <div id={RECEIPT_ID}><style>{printCss(width)}</style><ReceiptBody receipt={receipt} /></div>,
        document.body,
      )}
    </span>
  );
}
