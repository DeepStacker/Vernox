/**
 * Production PDF (A4 workshop sheet) — kept apart from exportCAM.ts so jsPDF only loads
 * where a PDF is actually produced.
 */
import { jsPDF } from 'jspdf';
import { machineContours } from './studio/production';
import type { ProductionGeometry } from './studio/schema';

export interface ProductionFileMeta {
  reference?: string;
  title?: string;
  customerEmail?: string;
  notes?: string;
  quantity?: number;
}

/**
 * A4 workshop sheet: material, size, cut statistics and a scaled drawing. The studio imports
 * this module lazily, so jsPDF never lands in the studio's initial bundle.
 */
export function exportProductionPDF(prod: ProductionGeometry, meta: ProductionFileMeta = {}): jsPDF {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 15;
  const pageW = 210;
  const contours = machineContours(prod, false);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('Vernox — production sheet', margin, 18);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  if (meta.reference) pdf.text(meta.reference, pageW - margin, 18, { align: 'right' });

  let cutLength = 0;
  for (const c of contours) {
    for (let i = 1; i < c.ring.length; i++) cutLength += Math.hypot(c.ring[i].x - c.ring[i - 1].x, c.ring[i].y - c.ring[i - 1].y);
  }
  const rows: [string, string][] = [
    ['Design', meta.title ?? '—'],
    ['Size', `${prod.widthMm.toFixed(1)} × ${prod.heightMm.toFixed(1)} mm`],
    ['Material', `${prod.substrate.replace(/_/g, ' ')}, ${prod.thicknessMm} mm`],
    ['Finish', prod.finish.replace(/_/g, ' ')],
    ['Kerf', `${prod.kerfMm} mm (files are nominal unless marked compensated)`],
    ['Contours', `${contours.filter(c => c.role === 'inner').length} inner, ${contours.filter(c => c.role === 'outer').length} outer, ${contours.filter(c => c.role === 'score').length} score`],
    ['Cut length', `${(cutLength / 1000).toFixed(2)} m`],
    ['Quantity', String(meta.quantity ?? 1)],
  ];
  if (meta.customerEmail) rows.push(['Customer', meta.customerEmail]);
  if (meta.notes) rows.push(['Notes', meta.notes]);
  let y = 28;
  for (const [k, v] of rows) {
    pdf.setTextColor(110);
    pdf.text(k, margin, y);
    pdf.setTextColor(20);
    pdf.text(v, margin + 30, y);
    y += 5.5;
  }

  // Drawing, scaled to fit the remaining page.
  const boxTop = y + 6;
  const boxW = pageW - margin * 2;
  const boxH = 297 - margin - boxTop;
  const scale = Math.min(boxW / prod.widthMm, boxH / prod.heightMm, 1);
  const ox = margin + (boxW - prod.widthMm * scale) / 2;
  const oy = boxTop + (boxH - prod.heightMm * scale) / 2;
  pdf.setDrawColor(200);
  pdf.rect(margin, boxTop, boxW, boxH);
  pdf.setLineWidth(0.2);
  for (const c of contours) {
    const color = c.role === 'inner' ? [225, 29, 72] : c.role === 'score' ? [37, 99, 235] : [17, 17, 17];
    pdf.setDrawColor(color[0], color[1], color[2]);
    const pts = c.ring;
    for (let i = 1; i < pts.length; i++) pdf.line(ox + pts[i - 1].x * scale, oy + pts[i - 1].y * scale, ox + pts[i].x * scale, oy + pts[i].y * scale);
    if (c.closed && pts.length > 2) pdf.line(ox + pts[pts.length - 1].x * scale, oy + pts[pts.length - 1].y * scale, ox + pts[0].x * scale, oy + pts[0].y * scale);
  }
  pdf.setTextColor(110);
  pdf.setFontSize(8);
  pdf.text(`Scale 1:${(1 / scale).toFixed(scale < 1 ? 1 : 0)} — red: inner cuts (first), blue: score, black: outer (last)`, margin, 297 - margin + 5);
  return pdf;
}
