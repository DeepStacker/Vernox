/**
 * Renders a stored TaxDocument (invoice or credit note) to PDF on demand.
 *
 * pdf-lib was chosen over pdfkit: it is pure JavaScript with no filesystem font
 * files (pdfkit reads .afm files from disk, which serverless bundlers routinely
 * drop), has no native dependencies and works identically on Vercel and Node.
 * The standard Helvetica font only covers WinAnsi, so text is transliterated:
 * '₹' becomes 'Rs.' and other non-Latin characters are replaced. Embedding a
 * Unicode TTF (via @pdf-lib/fontkit) is the upgrade path if customer names in
 * Indian scripts must print verbatim.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { paiseToRupees } from '../money';
import type { TaxDocument } from './invoice';

const PAGE = { width: 595.28, height: 841.89, margin: 40 }; // A4 portrait, points

function winAnsi(value: string): string {
  return value
    .replace(/₹/g, 'Rs.')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[·•]/g, '-')
    .replace(/×/g, 'x')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

const amount = (paise: number) =>
  paiseToRupees(paise).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const percent = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;

const istDate = (ms: number) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10).split('-').reverse().join('-');

class Writer {
  page: PDFPage;
  y: number;
  constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont) {
    this.page = doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }
  ensure(space: number) {
    if (this.y - space < PAGE.margin) {
      this.page = this.doc.addPage([PAGE.width, PAGE.height]);
      this.y = PAGE.height - PAGE.margin;
    }
  }
  text(value: string, x: number, opts: { size?: number; bold?: boolean; align?: 'left' | 'right'; width?: number } = {}) {
    const size = opts.size ?? 9;
    const font = opts.bold ? this.bold : this.font;
    let str = winAnsi(value);
    if (opts.width) {
      // Truncate to the column; '.' marks the cut (WinAnsi has no ellipsis in Helvetica's encoding here).
      while (str.length > 1 && font.widthOfTextAtSize(str, size) > opts.width) str = `${str.slice(0, -2)}.`;
    }
    const drawX = opts.align === 'right' ? x - font.widthOfTextAtSize(str, size) : x;
    this.page.drawText(str, { x: drawX, y: this.y, size, font, color: rgb(0.1, 0.1, 0.1) });
  }
  line() {
    this.page.drawLine({
      start: { x: PAGE.margin, y: this.y + 3 },
      end: { x: PAGE.width - PAGE.margin, y: this.y + 3 },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
  }
  down(points: number) {
    this.y -= points;
  }
}

export async function renderTaxDocumentPdf(docData: TaxDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${docData.type === 'invoice' ? 'Tax Invoice' : 'Credit Note'} ${docData.number}`);
  pdf.setProducer('Vernox');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(pdf, font, bold);
  const left = PAGE.margin;
  const right = PAGE.width - PAGE.margin;
  const s = docData.seller;
  const intra = docData.supplyType === 'intra_state';

  w.text(docData.type === 'invoice' ? 'TAX INVOICE' : 'CREDIT NOTE', left, { size: 16, bold: true });
  w.text(`No. ${docData.number}`, right, { size: 10, bold: true, align: 'right' });
  w.down(16);
  w.text(`Date: ${istDate(docData.issuedAt)}`, right, { align: 'right' });
  w.text(`Order: ${docData.orderNumber}`, left);
  w.down(12);
  if (docData.againstInvoice) {
    w.text(`Against invoice ${docData.againstInvoice.number}${docData.reason ? ` - ${docData.reason}` : ''}`, left, { width: right - left });
    w.down(12);
  }
  w.down(8);

  // Seller and buyer blocks side by side.
  const col2 = left + (right - left) / 2 + 10;
  const startY = w.y;
  w.text('Sold by', left, { bold: true });
  w.down(12);
  for (const row of [
    s.legalName + (s.tradeName && s.tradeName !== s.legalName ? ` (${s.tradeName})` : ''),
    s.address,
    `${s.city}${s.city ? ', ' : ''}${s.state} ${s.pincode}`,
    `GSTIN: ${s.gstin}   State code: ${s.stateCode}`,
    ...(s.email || s.phone ? [[s.email, s.phone].filter(Boolean).join('  ')] : []),
  ]) {
    w.text(row, left, { width: col2 - left - 12 });
    w.down(11);
  }
  const sellerEnd = w.y;
  w.y = startY;
  const b = docData.buyer;
  w.text('Bill to / Ship to', col2, { bold: true });
  w.down(12);
  for (const row of [b.name, b.address, `${b.city}, ${b.state} ${b.pincode}`, `Place of supply: ${docData.placeOfSupply.state} (${docData.placeOfSupply.stateCode ?? '--'})`, 'Unregistered buyer (B2C)']) {
    w.text(row, col2, { width: right - col2 });
    w.down(11);
  }
  w.y = Math.min(sellerEnd, w.y) - 10;

  // Line table.
  // Intra-state: CGST and SGST columns; inter-state: one IGST column (tax1).
  const cols = intra
    ? { desc: left, hsn: 250, qty: 300, taxable: 375, rate: 410, tax1: 460, tax2: 510, total: right }
    : { desc: left, hsn: 270, qty: 320, taxable: 400, rate: 440, tax1: 500, tax2: 0, total: right };
  w.line();
  w.down(10);
  w.text('Description', cols.desc, { bold: true, size: 8 });
  w.text('HSN/SAC', cols.hsn, { bold: true, size: 8 });
  w.text('Qty', cols.qty, { bold: true, size: 8, align: 'right' });
  w.text('Taxable', cols.taxable, { bold: true, size: 8, align: 'right' });
  w.text('GST', cols.rate, { bold: true, size: 8, align: 'right' });
  if (intra) {
    w.text('CGST', cols.tax1, { bold: true, size: 8, align: 'right' });
    w.text('SGST', cols.tax2, { bold: true, size: 8, align: 'right' });
  } else {
    w.text('IGST', cols.tax1, { bold: true, size: 8, align: 'right' });
  }
  w.text('Total', cols.total, { bold: true, size: 8, align: 'right' });
  w.down(6);
  w.line();
  w.down(10);
  for (const l of docData.lines) {
    w.ensure(30);
    w.text(l.description, cols.desc, { size: 8, width: cols.hsn - cols.desc - 6 });
    w.text(l.hsnCode, cols.hsn, { size: 8 });
    w.text(String(l.quantity), cols.qty, { size: 8, align: 'right' });
    w.text(amount(l.taxablePaise), cols.taxable, { size: 8, align: 'right' });
    w.text(percent(l.gstRateBps), cols.rate, { size: 8, align: 'right' });
    if (intra) {
      w.text(amount(l.cgstPaise), cols.tax1, { size: 8, align: 'right' });
      w.text(amount(l.sgstPaise), cols.tax2, { size: 8, align: 'right' });
    } else {
      w.text(amount(l.igstPaise), cols.tax1, { size: 8, align: 'right' });
    }
    w.text(amount(l.totalPaise), cols.total, { size: 8, align: 'right' });
    if (l.discountPaise > 0) {
      w.down(10);
      w.text(`  Value ${amount(l.grossPaise)} less discount ${amount(l.discountPaise)}`, cols.desc, { size: 7 });
    }
    w.down(13);
  }
  w.line();
  w.down(12);

  const t = docData.totals;
  const summary: Array<[string, number]> = [
    ['Taxable value', t.taxablePaise],
    ...(intra
      ? ([
          ['CGST', t.cgstPaise],
          ['SGST', t.sgstPaise],
        ] as Array<[string, number]>)
      : ([['IGST', t.igstPaise]] as Array<[string, number]>)),
    [docData.type === 'invoice' ? 'Invoice total (Rs.)' : 'Credit total (Rs.)', t.totalPaise],
  ];
  for (const [label, value] of summary) {
    w.ensure(14);
    const isTotal = label.includes('total');
    w.text(label, right - 120, { bold: isTotal, align: 'right' });
    w.text(amount(value), right, { bold: isTotal, align: 'right' });
    w.down(12);
  }
  w.down(10);
  w.ensure(50);
  for (const note of [
    'Prices are exclusive of GST; GST is charged as shown above. Amounts in Indian Rupees.',
    'Tax payable on reverse charge: No.',
    docData.paymentMethod === 'cod' ? 'Payment: Cash on delivery.' : docData.paymentMethod === 'replacement' ? 'Replacement supply.' : 'Payment: Prepaid online.',
    'This is a computer-generated document and does not require a signature.',
  ]) {
    w.text(note, left, { size: 7.5, width: right - left });
    w.down(10);
  }
  return pdf.save();
}
