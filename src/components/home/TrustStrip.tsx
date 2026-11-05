import { Hammer, PackageCheck, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react';
import { useCatalog } from '@/lib/catalogContext';

const POINTS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Hammer, title: 'Made to order in India', body: 'Laser-cut and finished in our workshop' },
  { icon: Sparkles, title: 'Rust-resistant finishes', body: 'Powder coat, brass, copper and more' },
  { icon: ShieldCheck, title: 'Secure payments', body: 'UPI, cards and net banking' },
  { icon: PackageCheck, title: 'Easy replacement', body: 'If it arrives damaged in transit' },
];

export function TrustStrip() {
  const { reviews } = useCatalog();
  // Only real, published reviews are summarised; nothing is shown until some exist.
  const rated = reviews.filter(r => r.rating > 0);
  const average = rated.length ? rated.reduce((sum, r) => sum + r.rating, 0) / rated.length : 0;

  return (
    <section aria-label="Why Vernox" className="border-b border-border bg-background">
      <ul className="container grid grid-cols-2 gap-4 py-5 lg:grid-cols-4">
        {POINTS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex items-start gap-3">
            <Icon className="mt-0.5 h-6 w-6 shrink-0 text-brass" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">{body}</p>
            </div>
          </li>
        ))}
      </ul>
      {rated.length > 0 && (
        <p className="container pb-4 text-center text-sm text-muted-foreground">
          Rated {average.toFixed(1)} out of 5 from {rated.length} customer {rated.length === 1 ? 'review' : 'reviews'}
        </p>
      )}
    </section>
  );
}
