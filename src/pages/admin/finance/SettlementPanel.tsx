/**
 * Finance → Reconciliation: upload the Razorpay settlement report (Dashboard → Reports → Settlement recon,
 * CSV) and compare it with the loaded orders by payment id. Read-only; nothing is written.
 */
import { useState } from 'react';
import { Upload } from 'lucide-react';
import { AdminError, AdminSection, StatTile } from '@/components/admin/AdminUi';
import { formatInr } from '@/lib/orders/finance';
import { parseSettlementCsv, reconcileSettlement, SettlementFileError, type SettlementReport } from '@/lib/orders/settlement';
import type { Order } from '@/types/store';

export function SettlementPanel({ orders, onSelect }: { orders: readonly Order[]; onSelect: (id: string) => void }) {
  const [report, setReport] = useState<SettlementReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const { lines, truncated } = parseSettlementCsv(await file.text());
      setReport(reconcileSettlement(lines, orders, truncated));
    } catch (err) {
      setReport(null);
      setError(err instanceof SettlementFileError ? err.message : 'The file could not be read.');
    }
  };

  const orderButton = (o: Order, extra: string) => (
    <li key={o.id}>
      <button type="button" onClick={() => onSelect(o.id)} className="min-h-11 w-full rounded-lg border border-border bg-card p-3 text-left text-sm">
        <span className="font-mono font-semibold">{o.orderNumber ?? o.id}</span> <span className="text-xs text-muted-foreground">{extra}</span>
      </button>
    </li>
  );

  return (
    <AdminSection title="Razorpay settlement file" count={report ? report.amountMismatches.length + report.unknownPayments.length : undefined}>
      <div className="space-y-3">
        <label className="btn-secondary inline-flex cursor-pointer">
          <Upload className="h-4 w-4" aria-hidden /> Upload settlement CSV
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={e => { void load(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <p className="text-xs text-muted-foreground">Razorpay Dashboard → Reports → Settlement recon. Compared with the {orders.length} loaded orders; load older orders to widen it.</p>
        {error && <AdminError>{error}</AdminError>}
        {report && (
          <>
            {report.truncated && <AdminError>Only the first rows of this file were read; split it by date.</AdminError>}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label={`Payments (${report.matched}/${report.payments} match)`} value={formatInr(report.grossPaise)} />
              <StatTile label="Refunds" value={formatInr(report.refundsPaise)} />
              <StatTile label={`Fees (GST ${formatInr(report.taxPaise)})`} value={formatInr(report.feesPaise)} />
              <StatTile label="Net settled" value={formatInr(report.netPaise)} />
            </div>
            {report.amountMismatches.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-destructive">Amount differs from the order</h4>
                <ul className="space-y-2">{report.amountMismatches.map(m => orderButton(m.order, `settled ${formatInr(m.line.amountPaise)}, order ${formatInr(m.expectedPaise)}`))}</ul>
              </div>
            )}
            {report.unknownPayments.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payments not in the loaded orders</h4>
                <p className="font-mono text-xs">{report.unknownPayments.slice(0, 50).map(l => `${l.id} (${formatInr(l.amountPaise)})`).join(' · ')}</p>
              </div>
            )}
            {report.notInFile.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Captured, not in this file (may settle later)</h4>
                <ul className="space-y-2">{report.notInFile.slice(0, 50).map(o => orderButton(o, o.ops?.razorpayPaymentId ?? ''))}</ul>
              </div>
            )}
          </>
        )}
      </div>
    </AdminSection>
  );
}
