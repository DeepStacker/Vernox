import { Link } from 'react-router-dom';
import { Picture, SITE_IMAGES } from '@/components/shop/Picture';
import { ShapeThumb } from '@/components/shop/ShapeThumb';
import { ROOMS, THEMES, type RoomId } from '@/lib/catalog';

// Rooms without a photograph yet are drawn with a representative design (TODO(catalogue) in src/lib/catalog.ts).
const ROOM_PHOTOS: Partial<Record<RoomId, keyof typeof SITE_IMAGES>> = {
  living: 'livingRoom', bedroom: 'bedroom', office: 'office', entrance: 'entrance', outdoor: 'round',
};
const ROOM_SHAPES: Partial<Record<RoomId, string>> = { pooja: 'flower', kids: 'cloud' };

export function ShopByRoom() {
  return (
    <section className="container py-12" aria-labelledby="room-heading">
      <h2 id="room-heading" className="section-title mb-5">Shop by room</h2>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {ROOMS.map(room => {
          const photo = ROOM_PHOTOS[room.id];
          return (
            <li key={room.id}>
              <Link to={`/shop?room=${room.id}`} className="group block overflow-hidden rounded-lg border border-border bg-card">
                {photo ? (
                  <Picture {...SITE_IMAGES[photo]} alt="" className="aspect-[4/3] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center bg-[#EFE8DD] p-6" aria-hidden="true">
                    <ShapeThumb shapeId={ROOM_SHAPES[room.id] ?? 'circle'} finish="brass" className="h-full" />
                  </div>
                )}
                <div className="p-3">
                  <p className="font-display text-lg group-hover:text-burgundy">{room.name}</p>
                  <p className="text-xs text-muted-foreground">{room.blurb}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <h3 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Shop by theme</h3>
      <ul className="flex flex-wrap gap-2">
        {THEMES.map(t => (
          <li key={t.id}>
            <Link to={`/shop?theme=${t.id}`} className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-medium hover:border-burgundy hover:text-burgundy">
              {t.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
