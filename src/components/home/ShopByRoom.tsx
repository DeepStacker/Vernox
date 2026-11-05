import { Link } from 'react-router-dom';
import { Picture, SITE_IMAGES } from '@/components/shop/Picture';
import { Reveal } from '@/components/shop/Reveal';
import { ShapeThumb } from '@/components/shop/ShapeThumb';
import { ROOMS, type RoomId } from '@/lib/catalog';

// Rooms without a photograph yet are drawn with a representative design (TODO(catalogue) in src/lib/catalog.ts).
const ROOM_PHOTOS: Partial<Record<RoomId, keyof typeof SITE_IMAGES>> = {
  living: 'livingRoom', bedroom: 'bedroom', office: 'office', entrance: 'entrance', outdoor: 'round',
};
const ROOM_ART: Partial<Record<RoomId, { shapeId: string; name: string }>> = {
  pooja: { shapeId: 'circle', name: 'Mandala' },
  kids: { shapeId: 'cloud', name: 'Cloud' },
};

export function ShopByRoom() {
  return (
    <section className="container py-10 sm:py-12" aria-labelledby="room-heading">
      <h2 id="room-heading" className="section-title mb-5">Shop by room</h2>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {ROOMS.map((room, i) => {
          const photo = ROOM_PHOTOS[room.id];
          const art = ROOM_ART[room.id];
          return (
            <Reveal as="li" key={room.id} index={i % 4}>
              <Link to={`/shop?room=${room.id}`} className="group lift relative block overflow-hidden rounded-lg border border-border bg-card">
                <div className="aspect-[4/3] overflow-hidden">
                  {photo ? (
                    <Picture {...SITE_IMAGES[photo]} alt="" className="kenburns h-full w-full object-cover" />
                  ) : (
                    <div className="wall-tile flex h-full items-center justify-center p-6" aria-hidden="true">
                      <ShapeThumb shapeId={art?.shapeId ?? 'circle'} name={art?.name} finish="brass" className="h-full" />
                    </div>
                  )}
                </div>
                <p className="px-3 py-2.5 font-display text-lg group-hover:text-burgundy">{room.name}</p>
              </Link>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}
