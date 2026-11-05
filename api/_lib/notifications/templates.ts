/**
 * Customer message templates (pure). Email gets subject/text/html; SMS gets an
 * ordered variable list because Indian SMS must use DLT-registered templates
 * (the template text lives with MSG91/DLT, see DEPLOYMENT.md), with
 * var1 = customer first name, var2 = order number, var3 = event-specific value.
 */
import { paiseToRupees } from '../money';
import type { NotificationEvent, NotificationPayload, RenderedMessage } from './types';

export function siteUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.VITE_SITE_URL?.trim() || 'https://vernox.in').replace(/\/+$/, '');
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const rupees = (paise: number) =>
  `Rs. ${paiseToRupees(paise).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Copy {
  subject: string;
  lines: string[];
  smsValue: string;
  link?: { label: string; url: string };
}

function copyFor(event: NotificationEvent, p: NotificationPayload, base: string): Copy {
  const trackPage = `${base}/track-order?id=${encodeURIComponent(p.orderId)}`;
  const tracking = p.trackingUrl || trackPage;
  switch (event) {
    case 'order_confirmed':
      return p.paymentMethod === 'cod'
        ? {
            subject: `Order ${p.orderNumber} confirmed (Cash on Delivery)`,
            lines: [
              `Thank you for your order. It is confirmed for Cash on Delivery.`,
              `Please keep ${rupees(p.totalPaise)} ready when the courier arrives.`,
              `Each piece is made to order in our workshop; we will tell you when it ships.`,
            ],
            smsValue: rupees(p.totalPaise),
            link: { label: 'View your order', url: trackPage },
          }
        : {
            subject: `Order ${p.orderNumber} confirmed`,
            lines: [
              `Thank you. We have received your payment of ${rupees(p.totalPaise)} and your order is confirmed.`,
              `Each piece is made to order in our workshop; we will tell you when it ships.`,
            ],
            smsValue: rupees(p.totalPaise),
            link: { label: 'View your order', url: trackPage },
          };
    case 'in_production':
      return {
        subject: `Order ${p.orderNumber} is in production`,
        lines: [`Our workshop has started making your order.`],
        smsValue: 'in production',
        link: { label: 'Track your order', url: trackPage },
      };
    case 'shipped':
      return {
        subject: `Order ${p.orderNumber} has shipped`,
        lines: [
          `Your order is on its way${p.courier ? ` with ${p.courier}` : ''}.`,
          ...(p.awb ? [`Tracking number (AWB): ${p.awb}`] : []),
          ...(p.paymentMethod === 'cod' ? [`Amount to pay on delivery: ${rupees(p.totalPaise)}.`] : []),
        ],
        smsValue: p.awb ?? p.orderNumber, // DLT variables are capped at 30 characters, too short for URLs
        link: { label: 'Track your shipment', url: tracking },
      };
    case 'out_for_delivery':
      return {
        subject: `Order ${p.orderNumber} is out for delivery`,
        lines: [
          `Your order will be delivered today.`,
          ...(p.paymentMethod === 'cod' ? [`Please keep ${rupees(p.totalPaise)} ready for the courier.`] : []),
        ],
        smsValue: p.awb ?? p.orderNumber, // DLT variables are capped at 30 characters, too short for URLs
        link: { label: 'Track your shipment', url: tracking },
      };
    case 'delivered':
      return {
        subject: `Order ${p.orderNumber} has been delivered`,
        lines: [
          `Your order has been delivered. We hope you love it.`,
          `If anything arrived damaged, request a return from your order page within the return window.`,
          `A short review helps other customers and our workshop.`,
        ],
        smsValue: `${base}/account`,
        link: { label: 'Review your purchase', url: `${base}/account` },
      };
    case 'cancelled':
      return {
        subject: `Order ${p.orderNumber} has been cancelled`,
        lines: [
          `Your order has been cancelled.`,
          ...(p.paymentMethod === 'prepaid' ? [`Any amount paid will be refunded to the original payment method.`] : []),
          ...(p.note ? [`Note: ${p.note}`] : []),
        ],
        smsValue: 'cancelled',
      };
    case 'refund_processed':
      return {
        subject: `Refund processed for order ${p.orderNumber}`,
        lines: [
          `A refund of ${rupees(p.refundAmountPaise ?? 0)} has been processed.`,
          `Banks usually credit it within 5-7 working days.`,
        ],
        smsValue: rupees(p.refundAmountPaise ?? 0),
      };
    case 'return_requested':
      return {
        subject: `Return request received for order ${p.orderNumber}`,
        lines: [`We have received your return request and will review it within 2 working days.`],
        smsValue: 'received',
        link: { label: 'View your order', url: trackPage },
      };
    case 'return_approved':
      return {
        subject: `Return approved for order ${p.orderNumber}`,
        lines: [`Your return has been approved. We will arrange the pickup and contact you with details.`, ...(p.note ? [`Note: ${p.note}`] : [])],
        smsValue: 'approved',
      };
    case 'return_rejected':
      return {
        subject: `Update on your return for order ${p.orderNumber}`,
        lines: [`We could not approve this return.`, ...(p.note ? [`Reason: ${p.note}`] : []), `Reply to this email if you need help.`],
        smsValue: 'not approved',
      };
    case 'return_received':
      return {
        subject: `We have received your return for order ${p.orderNumber}`,
        lines: [`Your returned item has reached our workshop. We will complete the refund or replacement shortly.`],
        smsValue: 'received at our workshop',
      };
  }
}

export function renderNotification(event: NotificationEvent, payload: NotificationPayload, env: NodeJS.ProcessEnv = process.env): RenderedMessage {
  const base = siteUrl(env);
  const copy = copyFor(event, payload, base);
  const firstName = payload.customerName.trim().split(/\s+/)[0] || 'there';
  const greeting = `Hello ${firstName},`;
  const sign = 'Vernox, made in India';
  const text = [greeting, '', ...copy.lines, ...(copy.link ? ['', `${copy.link.label}: ${copy.link.url}`] : []), '', `Order ${payload.orderNumber}`, sign].join('\n');
  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    ...copy.lines.map(l => `<p>${escapeHtml(l)}</p>`),
    copy.link ? `<p><a href="${escapeHtml(copy.link.url)}">${escapeHtml(copy.link.label)}</a></p>` : '',
    `<p style="color:#666;font-size:12px">Order ${escapeHtml(payload.orderNumber)}<br>${escapeHtml(sign)}</p>`,
  ].join('');
  return { subject: copy.subject, text, html, smsVars: [firstName, payload.orderNumber, copy.smsValue] };
}
