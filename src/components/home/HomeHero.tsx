import { Link } from 'react-router-dom';
import { Picture, SITE_IMAGES } from '@/components/shop/Picture';

export function HomeHero() {
  return (
    <section aria-labelledby="hero-heading" className="bg-secondary">
      <div className="container grid items-center gap-8 py-8 md:grid-cols-2 md:py-14">
        <div className="space-y-5">
          <p className="eyebrow">Laser-cut metal wall art · Made in India</p>
          <h1 id="hero-heading" className="font-display text-4xl leading-tight sm:text-5xl lg:text-6xl">
            Metal wall art, made to order for Indian homes.
          </h1>
          <p className="max-w-lg text-base text-muted-foreground sm:text-lg">
            Pick a ready design for your living room, pooja room or entrance, or create your own name plate or logo.
            Cut in our workshop and delivered across India.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/shop" className="btn-primary">Shop all designs</Link>
            <Link to="/studio" className="btn-secondary">Design your own</Link>
          </div>
        </div>
        <Picture
          {...SITE_IMAGES.livingRoom}
          priority
          alt="Laser-cut metal wall art above a sofa in a living room"
          className="aspect-[4/3] w-full rounded-lg object-cover"
        />
      </div>
    </section>
  );
}
