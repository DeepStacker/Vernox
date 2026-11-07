/**
 * Printable workshop documents (job sheet, packing slip) as standalone HTML. Built as strings and
 * printed from a separate window so the admin shell's styles cannot affect the page layout.
 * Every dynamic value is HTML-escaped: order data is customer-supplied.
 */
import { formatSizeCm } from '@/lib/catalog';
import type { Order, OrderItem, Product } from '@/types/store';
import { hasCustomDesign } from './camDocument';
import { code39Svg } from './code39';
import { freeText, parseNotes, QC_CHECKS, type PackageInfo } from './orderNotes';
import { ORDER_STATUS_LABELS } from './orderStateMachine';

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

const BASE_CSS = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font: 13px/1.4 Arial, Helvetica, sans-serif; color: #111; margin: 0; }
  .sheet { page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
  h1 { font-size: 26px; margin: 0; letter-spacing: 1px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin: 16px 0 6px; border-bottom: 1px solid #111; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #555; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #eee; font-size: 11px; text-transform: uppercase; }
  .box { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #111; margin-right: 6px; vertical-align: middle; }
  .big { font-size: 20px; font-weight: bold; }
  .flag { display: inline-block; border: 1px solid #111; padding: 1px 6px; font-size: 11px; font-weight: bold; }
  .care { border: 3px solid #111; padding: 8px; text-align: center; font-size: 20px; font-weight: bold; margin-top: 16px; }
  .muted { color: #555; }
  ul.checks { list-style: none; padding: 0; margin: 0; columns: 2; }
  ul.checks li { margin: 4px 0; }
`;

function materialLine(item: OrderItem, product?: Product): string {
  const parts = [product?.material, product?.thicknessMm ? `${product.thicknessMm} mm` : ''].filter(Boolean);
  return parts.length ? parts.join(', ') : 'As per design';
}

function sizeText(item: OrderItem): string {
  const dims = item.widthMm && item.heightMm ? formatSizeCm(item) : '';
  const mm = item.widthMm && item.heightMm ? `${item.widthMm} × ${item.heightMm} mm` : '';
  return [item.sizeLabel, mm || dims].filter(Boolean).join(' / ') || 'n/a';
}

export interface PrintContext {
  products: readonly Product[];
  storeName: string;
}

function wrap(title: string, bodies: string[]): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${BASE_CSS}</style></head><body>${bodies.join('')}</body></html>`;
}

function jobSheetBody(order: Order, ctx: PrintContext): string {
  const ref = order.orderNumber || order.id;
  const notes = freeText(order.adminNotes);
  const rows = order.items.map(item => {
    const product = ctx.products.find(p => p.id === item.productId);
    return `<tr>
      <td><strong>${escapeHtml(item.productName)}</strong>${hasCustomDesign(item) ? '<br><span class="flag">CUSTOM DESIGN</span>' : ''}</td>
      <td>${escapeHtml(sizeText(item))}</td>
      <td>${escapeHtml(item.finish || 'n/a')}</td>
      <td>${escapeHtml(materialLine(item, product))}</td>
      <td class="big">${item.quantity}</td>
    </tr>`;
  }).join('');
  const stages = ['Design checked', 'Cut', 'Deburred', 'Finished', 'QC passed'];
  return `<section class="sheet">
    <div class="head">
      <div><h1>JOB SHEET</h1><div class="big">${escapeHtml(ref)}</div>
        <div class="muted">Placed ${escapeHtml(new Date(order.placedAt).toLocaleDateString('en-IN'))} · Stage: ${escapeHtml(ORDER_STATUS_LABELS[order.status])}</div>
        ${order.assignedTo ? `<div>Assigned to: ${escapeHtml(order.assignedTo)}</div>` : ''}</div>
      <div>${code39Svg(ref)}</div>
    </div>
    <h2>Items</h2>
    <table><thead><tr><th>Product</th><th>Size</th><th>Finish</th><th>Material</th><th>Qty</th></tr></thead><tbody>${rows}</tbody></table>
    ${notes ? `<h2>Internal notes</h2><div>${escapeHtml(notes).replace(/\n/g, '<br>')}</div>` : ''}
    <h2>Production checklist</h2>
    <ul class="checks">${stages.map(s => `<li><span class="box"></span>${escapeHtml(s)}</li>`).join('')}</ul>
    <h2>QC checklist (per item)</h2>
    <ul class="checks">${QC_CHECKS.map(c => `<li><span class="box"></span>${escapeHtml(c.label)}</li>`).join('')}</ul>
    <h2>Sign-off</h2><div>Operator: ______________________ &nbsp; Date: ______________</div>
  </section>`;
}

export function buildJobSheetsHtml(orders: readonly Order[], ctx: PrintContext): string {
  return wrap('Job sheet', orders.map(o => jobSheetBody(o, ctx)));
}

function packingSlipBody(order: Order, ctx: PrintContext): string {
  const ref = order.orderNumber || order.id;
  const pkg: PackageInfo | undefined = parseNotes(order.adminNotes).data.package;
  const address = [order.shippingAddress, order.shippingCity, order.shippingState, order.shippingPincode, order.shippingCountry]
    .filter(Boolean).join(', ');
  const rows = order.items.map(item => `<tr>
    <td>${escapeHtml(item.productName)}${hasCustomDesign(item) ? ' <span class="flag">CUSTOM</span>' : ''}</td>
    <td>${escapeHtml(sizeText(item))}</td><td>${escapeHtml(item.finish || 'n/a')}</td><td class="big">${item.quantity}</td></tr>`).join('');
  return `<section class="sheet">
    <div class="head">
      <div><h1>PACKING SLIP</h1><div class="big">${escapeHtml(ref)}</div><div class="muted">${escapeHtml(ctx.storeName)}</div></div>
      <div>${code39Svg(ref)}</div>
    </div>
    <h2>Ship to</h2>
    <div><strong>${escapeHtml(order.customerName || order.email)}</strong></div>
    <div>${escapeHtml(address)}</div>
    ${order.phone ? `<div>Phone: ${escapeHtml(order.phone)}</div>` : ''}
    <h2>Contents</h2>
    <table><thead><tr><th>Item</th><th>Size</th><th>Finish</th><th>Qty</th></tr></thead><tbody>${rows}</tbody></table>
    ${pkg ? `<h2>Package</h2><div>${pkg.lengthCm} × ${pkg.widthCm} × ${pkg.heightCm} cm, ${pkg.weightKg} kg</div>` : ''}
    <div class="care">HANDLE WITH CARE · METAL WALL ART</div>
  </section>`;
}

export function buildPackingSlipHtml(order: Order, ctx: PrintContext): string {
  return wrap('Packing slip', [packingSlipBody(order, ctx)]);
}

export interface ShippingLabelContext {
  storeName: string;
  /** Return address printed as "From" (seller address from settings/store); omitted when empty. */
  fromAddress?: string;
}

/**
 * Courier label for shipments booked by hand (no Shiprocket label exists for them): destination,
 * courier, AWB barcode, COD amount to collect and package weight. Shiprocket labels come from the
 * courier as a PDF and are opened from GET_LABEL instead.
 */
export function buildShippingLabelHtml(order: Order, ctx: ShippingLabelContext): string {
  return wrap('Shipping label', [shippingLabelBody(order, ctx)]);
}

/** Several manual shipments' labels in one print job, one label per page. */
export function buildShippingLabelsHtml(orders: Order[], ctx: ShippingLabelContext): string {
  return wrap('Shipping labels', orders.map(o => shippingLabelBody(o, ctx)));
}

function shippingLabelBody(order: Order, ctx: ShippingLabelContext): string {
  const ref = order.orderNumber || order.id;
  const ship = order.ops?.shipment;
  const awb = ship?.awb ?? order.tracking?.trackingNumber ?? '';
  const courier = ship?.courier ?? order.tracking?.carrier ?? '';
  const pkg = parseNotes(order.adminNotes).data.package;
  const cod = order.ops?.paymentMethod === 'cod' ? Math.max(0, (order.ops.totalPaise || Math.round(order.total * 100)) - order.ops.codCollectedPaise) / 100 : 0;
  const address = [order.shippingAddress, order.shippingCity, order.shippingState, order.shippingPincode].filter(Boolean).join(', ');
  return `<section class="sheet" style="max-width:480px">
    <div class="head"><h1>${escapeHtml(courier || 'SHIPMENT')}</h1><div class="big">${escapeHtml(ref)}</div></div>
    ${awb ? `<div style="margin:8px 0">${code39Svg(awb.toUpperCase())}<div class="big">AWB ${escapeHtml(awb)}</div></div>` : ''}
    <h2>Ship to</h2>
    <div class="big">${escapeHtml(order.customerName || order.email)}</div>
    <div>${escapeHtml(address)}</div>
    ${order.phone ? `<div>Phone: ${escapeHtml(order.phone)}</div>` : ''}
    ${cod > 0 ? `<div class="care">COLLECT CASH ₹${cod.toLocaleString('en-IN')}</div>` : '<div class="muted" style="margin-top:8px">PREPAID, do not collect</div>'}
    ${pkg ? `<h2>Package</h2><div>${pkg.lengthCm} × ${pkg.widthCm} × ${pkg.heightCm} cm, ${pkg.weightKg} kg</div>` : ''}
    ${ctx.fromAddress ? `<h2>From</h2><div>${escapeHtml(ctx.storeName)}</div><div class="muted">${escapeHtml(ctx.fromAddress)}</div>` : ''}
  </section>`;
}

/** Opens the document in a new window and prints it. Returns false when the browser blocked the popup. */
export function printHtml(html: string): boolean {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.onload = () => win.print();
  return true;
}
