import { Hammer, PackageCheck, ShieldCheck, Truck, type LucideIcon } from 'lucide-react';

const POINTS: { icon: LucideIcon; title: string }[] = [
  { icon: Hammer, title: 'Made to order' },
  { icon: Truck, title: 'Ships across India' },
  { icon: ShieldCheck, title: 'Secure payments' },
  { icon: PackageCheck, title: 'Easy replacement' },
];

export function TrustStrip() {
  return (
    <section aria-label="Why Vernox" className="border-b border-border bg-background">
      <ul className="container grid grid-cols-2 gap-x-4 gap-y-3 py-4 lg:grid-cols-4">
        {POINTS.map(({ icon: Icon, title }) => (
          <li key={title} className="flex items-center justify-center gap-2 text-sm font-medium">
            <Icon className="h-5 w-5 shrink-0 text-brass" aria-hidden="true" />
            {title}
          </li>
        ))}
      </ul>
    </section>
  );
}
