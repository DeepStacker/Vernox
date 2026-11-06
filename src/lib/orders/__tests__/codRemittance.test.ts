import { describe, expect, it } from 'vitest';
import type { Order } from '@/types/store';
import { parseRemittanceCsv, reconcileRemittance, RemittanceFileError } from '../codRemittance';

const cod = (id: string, awb: string | null, totalPaise: number, status = 'Delivered') =>
  ({ id, orderNumber: id, status, items: [], statusHistory: [], placedAt: 1, total: totalPaise / 100,
    ops: { paymentMethod: 'cod', razorpayPaymentId: null, totalPaise, codCollectedPaise: 0, refunds: [], flags: [],
      shipment: awb ? { provider: 'shiprocket', status: 'delivered', awb, courier: 'Delhivery', trackingUrl: null, labelUrl: null, manifestUrl: null, error: null } : null } } as unknown as Order);

const FILE = ['AWB Code,Order ID,COD Amount,UTR No,Remitted On', 'awb1,VX-1,2675.40,UTR9,06-11-2026', 'AWB2,VX-2,"1,000",UTR9,06-11-2026', 'AWB9,VX-9,500,UTR9,06-11-2026'].join('\n');

describe('COD remittance reconciliation', () => {
  it('matches by AWB, flags amount differences, unknown AWBs and delivered orders not yet remitted', () => {
    const { lines } = parseRemittanceCsv(FILE);
    const report = reconcileRemittance(lines, [cod('o1', 'AWB1', 267_540), cod('o2', 'AWB2', 99_900), cod('o3', 'AWB3', 50_000), cod('o4', 'AWB4', 10_000, 'Shipped')]);
    expect(report.matched).toBe(1);
    expect(report.amountMismatches.map(m => m.order.id)).toEqual(['o2']);
    expect(report.unknownAwbs.map(l => l.awb)).toEqual(['AWB9']);
    expect(report.outstanding.map(o => o.id)).toEqual(['o3']);
    expect(report.remittedPaise).toBe(267_540 + 100_000 + 50_000);
    expect(report.utrs).toEqual(['UTR9']);
  });

  it('rejects files without AWB and amount columns', () => {
    expect(() => parseRemittanceCsv('Order,Total\nVX-1,100')).toThrow(RemittanceFileError);
  });
});
