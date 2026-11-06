/**
 * Finance → Reconciliation: upload the courier's COD remittance report (Shiprocket → Billing → COD
 * Remittance, CSV) and compare it with the loaded COD orders by AWB. Read-only; nothing is written.
 */
import { useState } from 'react';
import { AdminError, AdminSection, StatTile } from '@/components/admin/AdminUi';
import { parseRemittanceCsv, reconcileRemittance, RemittanceFileError, type RemittanceReport } from '@/lib/orders/codRemittance';
import { formatInr, totalPaise } from '@/lib/orders/finance';
import type { Order } from '@/types/store';
import { CsvUpload, OrderLinks } from './reconFile';

export function RemittancePanel({ orders, onSelect }: { orders: readonly Order[]; onSelect: (id: string) => void }) {
  const [report, setReport] = useState<RemittanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (file: File) => {
    setError(null);
    try {
      const { lines, truncated } = parseRemittanceCsv(await file.text());
      setReport(reconcileRemittance(lines, orders, truncated));
    } catch (err) {
      setReport(null);
      setError(err instanceof RemittanceFileError ? err.message : 'The file could not be read.');
    }
  };

  return (
    <AdminSection title="Courier COD remittance file" count={report ? report.amountMismatches.length + report.outstanding.length : undefined}>
      <div className="space-y-3">
        <CsvUpload label="Upload remittance CSV" onFile={f => void load(f)} />
        <p className="text-xs text-muted-foreground">Shiprocket → Billing → COD Remittance (export). Matched by AWB with the {orders.length} loaded orders.</p>
        {error && <AdminError>{error}</AdminError>}
        {report && (
          <>
            {report.truncated && <AdminError>Only the first rows of this file were read; split it by date.</AdminError>}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <StatTile label={`Remitted (${report.matched}/${report.lines} match)`} value={formatInr(report.remittedPaise)} />
              <StatTile label="Delivered, not remitted" value={String(report.outstanding.length)} warn={report.outstanding.length > 0} />
              <StatTile label="Bank references (UTR)" value={report.utrs.slice(0, 3).join(', ') || '—'} />
            </div>
            <OrderLinks title="Remitted amount differs from the order" tone="bad" orders={report.amountMismatches.map(m => m.order)} onSelect={onSelect}
              detail={o => { const m = report.amountMismatches.find(x => x.order.id === o.id)!; return `remitted ${formatInr(m.line.amountPaise)}, order ${formatInr(m.expectedPaise)}`; }} />
            <OrderLinks title="Delivered, not in this remittance" orders={report.outstanding} onSelect={onSelect}
              detail={o => `${o.ops?.shipment?.awb ?? ''} · ${formatInr(totalPaise(o))}`} />
            {report.unknownAwbs.length > 0 && (
              <p className="font-mono text-xs text-muted-foreground">Not in the loaded orders: {report.unknownAwbs.slice(0, 50).map(l => l.awb).join(' · ')}</p>
            )}
          </>
        )}
      </div>
    </AdminSection>
  );
}
