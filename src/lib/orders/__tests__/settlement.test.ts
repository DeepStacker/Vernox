import { describe, expect, it } from 'vitest';
import type { Order } from '@/types/store';
import { parseSettlementCsv, reconcileSettlement, SettlementFileError } from '../settlement';

const order = (id: string, paymentId: string | null, totalPaise: number, method: 'prepaid' | 'cod' = 'prepaid') =>
  ({ id, orderNumber: id, status: 'Paid', items: [], statusHistory: [], placedAt: 1, total: totalPaise / 100,
    ops: { paymentMethod: method, razorpayPaymentId: paymentId, totalPaise, codCollectedPaise: 0, refunds: [], flags: [] } } as unknown as Order);

const FILE = [
  '﻿entity_id,type,debit,credit,amount,currency,fee,tax,settlement_id,settled_at',
  'pay_A,payment,0,2675.40,2675.40,INR,63.14,9.63,setl_1,07/11/2026',
  'pay_B,payment,0,"1,000.00","1,000.00",INR,23.60,3.60,setl_1,07/11/2026',
  'pay_X,payment,0,500,500,INR,11.80,1.80,setl_1,07/11/2026',
  'rfnd_1,refund,200,0,200,INR,0,0,setl_1,07/11/2026',
].join('\n');

describe('Razorpay settlement reconciliation', () => {
  it('matches payments by id and reports mismatches, unknown payments and unsettled captures', () => {
    const { lines } = parseSettlementCsv(FILE);
    const report = reconcileSettlement(lines, [
      order('o1', 'pay_A', 267_540),
      order('o2', 'pay_B', 99_900),
      order('o3', 'pay_C', 50_000),
      order('o4', null, 10_000, 'cod'),
    ]);
    expect(report.payments).toBe(3);
    expect(report.matched).toBe(1);
    expect(report.amountMismatches.map(m => [m.order.id, m.line.amountPaise, m.expectedPaise])).toEqual([['o2', 100_000, 99_900]]);
    expect(report.unknownPayments.map(l => l.id)).toEqual(['pay_X']);
    expect(report.notInFile.map(o => o.id)).toEqual(['o3']);
    expect(report.grossPaise).toBe(417_540);
    expect(report.refundsPaise).toBe(20_000);
    expect(report.feesPaise).toBe(9_854);
    expect(report.taxPaise).toBe(1_503);
    expect(report.netPaise).toBe(417_540 - 20_000 - 9_854);
    expect(report.settlementIds).toEqual(['setl_1']);
  });

  it('rejects a file without the settlement columns', () => {
    expect(() => parseSettlementCsv('name,total\nAsha,100')).toThrow(SettlementFileError);
  });
});
