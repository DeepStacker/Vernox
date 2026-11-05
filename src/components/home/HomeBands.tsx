import { Link } from 'react-router-dom';
import { Picture, SITE_IMAGES } from '@/components/shop/Picture';
import { Reveal } from '@/components/shop/Reveal';

export function StudioCta() {
  return (
    <section className="bg-secondary" aria-labelledby="studio-heading">
      <Reveal className="container grid items-center gap-6 py-10 sm:py-12 md:grid-cols-2 md:gap-10">
        <div className="group overflow-hidden rounded-lg">
          <Picture {...SITE_IMAGES.entrance} alt="A custom metal name plate at a home entrance" className="kenburns aspect-[4/3] w-full object-cover" />
        </div>
        <div className="space-y-4">
          <h2 id="studio-heading" className="section-title">Design your own</h2>
          <p className="text-muted-foreground">Name plates, logos, any shape. See the price live.</p>
          <Link to="/studio" className="btn-primary">Open the Studio</Link>
        </div>
      </Reveal>
    </section>
  );
}

const STEPS = ['Choose a design', 'We laser-cut it', 'Delivered with fittings'];

export function HowItsMade() {
  return (
    <section className="container py-10 sm:py-12" aria-labelledby="how-heading">
      <h2 id="how-heading" className="section-title mb-5">How it is made</h2>
      <ol className="grid gap-3 md:grid-cols-3">
        {STEPS.map((title, i) => (
          <Reveal as="li" key={title} index={i} className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-burgundy font-semibold text-cream">{i + 1}</span>
            <span className="font-display text-xl">{title}</span>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

export function CorporateBand() {
  return (
    <section className="container pb-10 sm:pb-12" aria-labelledby="corp-heading">
      <Reveal className="flex flex-col items-start gap-4 rounded-lg bg-burgundy p-6 text-cream sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <h2 id="corp-heading" className="font-display text-2xl text-cream sm:text-3xl">Corporate gifting and bulk orders</h2>
        <Link to="/trade" className="btn bg-cream text-burgundy hover:bg-cream/90">Get a quote</Link>
      </Reveal>
    </section>
  );
}
