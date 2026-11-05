import { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { AdminNotice, Field } from '@/components/admin/AdminUi';
import { fetchOrdersBetween } from '@/lib/data/orders';
import { buildCodCsv, buildOrdersCsv, buildRefundsCsv, istDate, istRange } from '@/lib/orders/finance';

type Kind = 'orders' | 'refunds' | 'cod';

const KINDS: ReadonlyArray<{ id: Kind; label: string; hint: string }> = [
  { id: 'orders', label: 'Orders with GST split', hint: 'One row per order: taxable value, CGST, SGST or IGST, shipping, COD fee, totals.' },
  { id: 'refunds', label: 'Refunds', hint: 'One row per processed refund.' },
  { id: 'cod', label: 'Cash on delivery', hint: 'COD orders with cash expected, collected and outstanding.' },
];

function saveCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** CSV export for a date range (IST days). Loads the orders placed in the range and builds the files in the browser. */
export function ExportPanel({ sellerState }: { sellerState?: string }) {
  const today = istDate(Date.now());
  const [from, setFrom] = useState(istDate(Date.now() - 29 * 24 * 3600_000));
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<Kind | null>(null);
  const range = istRange(from, to);

  const exportCsv = async (kind: Kind) => {
    if (!range) return;
    setBusy(kind);
    try {
      const { orders, truncated } = await fetchOrdersBetween(range.from, range.to);
      if (orders.length === 0) {
        toast.info('No orders were placed in that range.');
        return;
      }
      const csv = kind === 'orders' ? buildOrdersCsv(orders, { sellerState }) : kind === 'refunds' ? buildRefundsCsv(orders) : buildCodCsv(orders);
      saveCsv(`vernox-${kind}-${from}-to-${to}.csv`, csv);
      if (truncated) toast.warning('The range has more orders than one export holds. Narrow the dates and export again.');
      else toast.success(`${orders.length} order(s) exported.`);
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : 'please try again'}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid max-w-md grid-cols-2 gap-3">
        <Field label="From"><input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="field" /></Field>
        <Field label="To"><input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)} className="field" /></Field>
      </div>
      {!range && <p role="alert" className="text-sm text-destructive">Choose a valid range: the end date cannot be before the start date.</p>}
      {!sellerState && <AdminNotice>The seller state is not set in Settings, so the GST split is left empty in the orders file.</AdminNotice>}
      <ul className="space-y-2">
        {KINDS.map(k => (
          <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
            <div><p className="font-semibold">{k.label}</p><p className="text-xs text-muted-foreground">{k.hint}</p></div>
            <button type="button" className="btn-secondary" disabled={!range || busy !== null} onClick={() => void exportCsv(k.id)}>
              <Download className="h-4 w-4" /> {busy === k.id ? 'Preparing…' : 'Download CSV'}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Files hold order numbers, dates, state of supply and amounts only: no names, emails, phone numbers or addresses.</p>
    </div>
  );
}
