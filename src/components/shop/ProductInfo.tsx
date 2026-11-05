import { Star } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { finishName, formatSizeCm, formatSizeInches, type Product, type ProductFaq, type ProductSize } from '@/lib/catalog';
import type { Review } from '@/types/store';

const INDOOR_OUTDOOR = { indoor: 'Indoor use', outdoor: 'Outdoor use', both: 'Indoor and covered outdoor use' } as const;

export function SpecsTable({ product, size, finish }: { product: Product; size: ProductSize; finish: string }) {
  const rows: [string, string][] = [
    ['Material', product.material ?? 'Mild steel sheet'],
    ['Thickness', `${product.thicknessMm ?? 1.5} mm`],
    ['Finish', finishName(finish)],
    ['Size', `${formatSizeCm(size)} (${formatSizeInches(size)})`],
    ['Mounting', product.mounting ?? 'Standoff spacers, 2.5 cm off the wall'],
    ['Weight', product.weightKg ? `About ${product.weightKg} kg (approx., largest size)` : 'Shared at dispatch'],
    ['Use', INDOOR_OUTDOOR[product.indoorOutdoor ?? 'indoor']],
    ['Lead time', `${product.leadTimeDays ?? 7} working days (made to order), plus delivery`],
    ['Care', 'Wipe with a soft dry or slightly damp cloth. Avoid abrasive cleaners.'],
  ];
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Specifications</caption>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-border last:border-0">
            <th scope="row" className="w-1/3 py-2.5 pr-3 text-left font-medium text-muted-foreground">{k}</th>
            <td className="py-2.5">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function defaultFaqs(product: Product): ProductFaq[] {
  return product.faqs ?? [
    { q: 'How is it mounted?', a: `It comes with standoff spacers and screws that hold it 2.5 cm off the wall. You need a drill, a pencil and a spirit level.` },
    { q: 'Will it rust?', a: product.indoorOutdoor === 'both' || product.indoorOutdoor === 'outdoor'
      ? 'This design is built for balconies and covered outdoor walls. Choose Corten Rust, Stainless or Black Powder Coat for the best outdoor life.'
      : 'It is made for indoor walls. Keep it away from direct rain and constant moisture.' },
    { q: 'Can I change the size or add a name?', a: 'Pick any listed size on this page. For a different size, a name or your own artwork, use "Customise this design" to open the Studio.' },
    { q: 'Is cash on delivery available?', a: 'Yes, for this ready design. COD is not available for custom Studio pieces.' },
    { q: 'How is it packed?', a: 'Flat-packed in protective foam and a rigid carton, so the finish arrives intact. If it arrives damaged, see our Returns page.' },
  ];
}

export function ProductFaq({ product }: { product: Product }) {
  return (
    <Accordion type="single" collapsible>
      {defaultFaqs(product).map((f, i) => (
        <AccordionItem key={f.q} value={`q${i}`}>
          <AccordionTrigger className="text-left text-base">{f.q}</AccordionTrigger>
          <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export function ProductReviews({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground">
        No reviews yet. Be the first to review this design once your order arrives.
      </p>
    );
  }
  const average = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <span className="text-xl font-semibold text-foreground">{average.toFixed(1)}</span> out of 5 from {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
      </p>
      <ul className="space-y-4">
        {reviews.slice(0, 6).map(r => (
          <li key={r.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-1" aria-label={`${r.rating} out of 5`}>
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} className={i < r.rating ? 'h-4 w-4 fill-brass text-brass' : 'h-4 w-4 text-border'} aria-hidden="true" />
              ))}
            </div>
            <p className="mt-2 text-sm">{r.comment}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {r.customerName}{r.location ? `, ${r.location}` : ''}
              {r.verified ? ' · Verified buyer' : ''}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
