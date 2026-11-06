/**
 * Finance → Reconciliation: upload the Razorpay settlement report (Dashboard → Reports → Settlement recon,
 * CSV) and compare it with the loaded orders by payment id. Read-only; nothing is written.
 */
import { useState } from 'react';
import { AdminError, AdminSection, StatTile } from '@/components/admin/AdminUi';
import { formatInr } from '@/lib/orders/finance';
import { parseSettlementCsv, reconcileSettlement, SettlementFileError, type SettlementReport } from '@/lib/orders/settlement';
import type { Order } from '@/types/store';
import { CsvUpload, OrderLinks } from './reconFile';

export function SettlementPanel({ orders, onSelect }: { orders: readonly Order[]; onSelect: (id: string) => void }) {
  const [report, setReport] = useState<SettlementReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (file: File) => {
    setError(null);
    try {
      const { lines, truncated } = parseSettlementCsv(await file.text());
      setReport(reconcileSettlement(lines, orders, truncated));
    } catch (err) {
      setReport(null);
      setError(err instanceof SettlementFileError ? err.message : 'The file could not be read.');
    }
  };

  return (
    <AdminSection title="Razorpay settlement file" count={report ? report.amountMismatches.length + report.unknownPayments.length : undefined}>
      <div className="space-y-3">
        <CsvUpload label="Upload settlement CSV" onFile={f => void load(f)} />
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
            <OrderLinks title="Amount differs from the order" tone="bad" orders={report.amountMismatches.map(m => m.order)} onSelect={onSelect}
              detail={o => { const m = report.amountMismatches.find(x => x.order.id === o.id)!; return `settled ${formatInr(m.line.amountPaise)}, order ${formatInr(m.expectedPaise)}`; }} />
            {report.unknownPayments.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payments not in the loaded orders</h4>
                <p className="font-mono text-xs">{report.unknownPayments.slice(0, 50).map(l => `${l.id} (${formatInr(l.amountPaise)})`).join(' · ')}</p>
              </div>
            )}
            <OrderLinks title="Captured, not in this file (may settle later)" orders={report.notInFile} onSelect={onSelect} detail={o => o.ops?.razorpayPaymentId ?? ''} />
          </>
        )}
      </div>
    </AdminSection>
  );
}
