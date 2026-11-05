import { Link } from 'react-router-dom';
import { Picture, SITE_IMAGES } from '@/components/shop/Picture';

/** First screen: headline, one primary action, one text link. Text rises in line by line; the photo is never animated in (LCP). */
export function HomeHero() {
  return (
    <section aria-labelledby="hero-heading" className="overflow-hidden bg-secondary">
      <div className="container grid items-center gap-8 py-8 md:grid-cols-2 md:py-14">
        <div className="space-y-6">
          <h1 id="hero-heading" className="font-display text-4xl leading-tight sm:text-5xl lg:text-6xl">
            <span className="hero-rise block" style={{ '--i': 0 } as React.CSSProperties}>Metal wall art,</span>
            <span className="hero-rise block" style={{ '--i': 1 } as React.CSSProperties}>made to <span className="sheen-text">order</span>.</span>
          </h1>
          <div className="hero-rise flex flex-wrap items-center gap-4" style={{ '--i': 3 } as React.CSSProperties}>
            <Link to="/shop" className="btn-primary">Shop designs</Link>
            <Link to="/studio" className="text-sm font-semibold text-burgundy underline-offset-4 hover:underline">Design your own</Link>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg">
          <Picture
            {...SITE_IMAGES.livingRoom}
            priority
            alt="Laser-cut metal wall art above a sofa in a living room"
            className="hero-drift aspect-[4/3] w-full object-cover"
          />
        </div>
      </div>
    </section>
  );
}
