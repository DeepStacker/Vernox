/** Support-console helpers: order search matching, customer aggregation and message snippets. */
import type { Order } from '@/types/store';
import { ORDER_STATUS_LABELS } from './orderStateMachine';

const digits = (s: string) => s.replace(/\D/g, '');

/** Normalises an Indian mobile number to 91XXXXXXXXXX, or null if it cannot be one. */
export function normaliseIndianPhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const d = digits(raw);
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith('0')) return `91${d.slice(1)}`;
  if (d.length === 12 && d.startsWith('91')) return d;
  return null;
}

export function whatsappLink(phone: string | undefined, text: string): string | null {
  const n = normaliseIndianPhone(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

/** True when the query matches order number/id, email, phone, pincode or customer name. */
export function matchesOrder(order: Order, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qDigits = digits(q);
  if ((order.orderNumber ?? '').toLowerCase().includes(q) || order.id.toLowerCase().includes(q)) return true;
  if (order.email.toLowerCase().includes(q)) return true;
  if ((order.customerName ?? '').toLowerCase().includes(q)) return true;
  if (qDigits.length >= 4 && digits(order.phone ?? '').includes(qDigits)) return true;
  if (qDigits.length >= 3 && (order.shippingPincode ?? '').replace(/\s/g, '').startsWith(qDigits)) return true;
  return false;
}

export interface CustomerSummary {
  email: string;
  name: string;
  phone?: string;
  orderCount: number;
  lifetimeValue: number;
  lastOrderAt: number;
  orders: Order[];
}

/** Aggregates one customer's orders; lifetime value counts only orders `isRevenue` accepts. */
export function summariseCustomer(email: string, orders: readonly Order[], isRevenue: (o: Order) => boolean): CustomerSummary {
  const key = email.trim().toLowerCase();
  const mine = orders.filter(o => o.email.toLowerCase() === key).sort((a, b) => b.placedAt - a.placedAt);
  return {
    email: key,
    name: mine.find(o => o.customerName)?.customerName ?? key,
    phone: mine.find(o => o.phone)?.phone,
    orderCount: mine.length,
    lifetimeValue: mine.filter(isRevenue).reduce((s, o) => s + o.total, 0),
    lastOrderAt: mine[0]?.placedAt ?? 0,
    orders: mine,
  };
}

export interface MessageSnippet {
  id: 'status' | 'delay' | 'tracking';
  label: string;
  text: string;
}

const firstName = (o: Order) => (o.customerName ?? '').trim().split(/\s+/)[0] || 'there';
const ref = (o: Order) => o.orderNumber || o.id;

/** Ready-to-paste customer messages. The tracking snippet exists only once tracking is recorded. */
export function messageSnippets(order: Order, storeName: string): MessageSnippet[] {
  const hi = `Hi ${firstName(order)},`;
  const sign = `Team ${storeName}`;
  const snippets: MessageSnippet[] = [
    {
      id: 'status', label: 'Status update',
      text: `${hi}\nYour order ${ref(order)} is now: ${ORDER_STATUS_LABELS[order.status]}. We will keep you posted as it moves along.\n${sign}`,
    },
    {
      id: 'delay', label: 'Delay apology',
      text: `${hi}\nSorry, your order ${ref(order)} is taking longer than we promised. Each piece is made to order and yours needs a little more time to get right. We will update you as soon as it moves to the next stage.\n${sign}`,
    },
  ];
  const t = order.tracking;
  if (t?.trackingNumber) {
    snippets.push({
      id: 'tracking', label: 'Tracking details',
      text: `${hi}\nYour order ${ref(order)} has shipped${t.carrier ? ` with ${t.carrier}` : ''}. Tracking number: ${t.trackingNumber}.${t.url ? ` Track here: ${t.url}` : ''}\n${sign}`,
    });
  }
  return snippets;
}
