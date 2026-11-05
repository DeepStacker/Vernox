import { useState } from 'react';
import { ShapeThumb } from '@/components/shop/ShapeThumb';
import { cn } from '@/lib/utils';

interface Props {
  shapeId: string;
  finish: string;
  widthMm: number;
  heightMm: number;
}

/**
 * "View on your wall": draws the selected size to scale (1 unit = 1 cm) next to a piece of furniture
 * or a door of known size, so the customer can judge the piece before ordering. It is an illustration,
 * not a photograph. Scene units: wall 320 cm wide, 260 cm high.
 */
const SCENE = { w: 320, h: 260 };

type Room = 'living' | 'bedroom' | 'entrance';

interface Layout {
  label: string;
  reference: string;
  /** Centre of the artwork and how it is anchored: bottom edge fixed above furniture, or vertical centre at eye level. */
  centerX: number;
  anchor: { type: 'bottom' | 'center'; y: number };
}

const LAYOUTS: Record<Room, Layout> = {
  living: { label: 'Above a sofa', reference: 'Sofa 210 cm wide', centerX: 160, anchor: { type: 'bottom', y: 150 } },
  bedroom: { label: 'Behind a bed', reference: 'Bed 160 cm wide', centerX: 160, anchor: { type: 'bottom', y: 125 } },
  entrance: { label: 'Next to a door', reference: 'Door 90 × 210 cm', centerX: 225, anchor: { type: 'center', y: 110 } },
};

function Furniture({ room }: { room: Room }) {
  const fill = '#8C8173';
  const dark = '#6F655A';
  if (room === 'living') {
    return (
      <g>
        <rect x={55} y={175} width={210} height={55} rx={8} fill={fill} />
        <rect x={45} y={160} width={30} height={70} rx={8} fill={dark} />
        <rect x={245} y={160} width={30} height={70} rx={8} fill={dark} />
        <rect x={55} y={140} width={210} height={50} rx={10} fill={dark} opacity={0.85} />
        <rect x={65} y={230} width={6} height={30} fill={dark} />
        <rect x={249} y={230} width={6} height={30} fill={dark} />
      </g>
    );
  }
  if (room === 'bedroom') {
    return (
      <g>
        <rect x={80} y={150} width={160} height={110} rx={6} fill={dark} />
        <rect x={72} y={185} width={176} height={50} rx={6} fill={fill} />
        <rect x={90} y={168} width={60} height={22} rx={8} fill="#B5AA9A" />
        <rect x={170} y={168} width={60} height={22} rx={8} fill="#B5AA9A" />
      </g>
    );
  }
  return (
    <g>
      <rect x={40} y={50} width={90} height={210} rx={2} fill={dark} />
      <rect x={48} y={58} width={74} height={194} rx={2} fill={fill} />
      <circle cx={113} cy={160} r={4} fill="#D8C79A" />
    </g>
  );
}

export function RoomVisualizer({ shapeId, finish, widthMm, heightMm }: Props) {
  const [room, setRoom] = useState<Room>('living');
  const layout = LAYOUTS[room];
  const w = widthMm / 10;
  const h = heightMm / 10;
  const top = layout.anchor.type === 'bottom' ? layout.anchor.y - h : layout.anchor.y - h / 2;
  const left = layout.centerX - w / 2;
  const fits = top >= 5 && left >= 5 && left + w <= SCENE.w - 5;

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Room scene" className="flex gap-2">
        {(Object.keys(LAYOUTS) as Room[]).map(r => (
          <button
            key={r}
            role="tab"
            type="button"
            aria-selected={room === r}
            onClick={() => setRoom(r)}
            className={cn('min-h-10 rounded-full border px-3 text-sm', room === r ? 'border-burgundy bg-burgundy text-cream' : 'border-border bg-card')}
          >
            {LAYOUTS[r].label}
          </button>
        ))}
      </div>

      <div className="relative w-full overflow-hidden rounded-lg border border-border bg-[#EFE8DD]" style={{ aspectRatio: `${SCENE.w} / ${SCENE.h}` }}>
        <svg viewBox={`0 0 ${SCENE.w} ${SCENE.h}`} className="absolute inset-0 h-full w-full" role="img" aria-label={`${Math.round(w)} by ${Math.round(h)} cm piece shown to scale ${layout.label.toLowerCase()}`}>
          <rect width={SCENE.w} height={SCENE.h} fill="#EFE8DD" />
          <rect y={252} width={SCENE.w} height={8} fill="#CFC2B0" />
          <Furniture room={room} />
        </svg>
        <div className="absolute" style={{ left: `${(left / SCENE.w) * 100}%`, top: `${(top / SCENE.h) * 100}%`, width: `${(w / SCENE.w) * 100}%`, height: `${(h / SCENE.h) * 100}%` }}>
          <ShapeThumb shapeId={shapeId} finish={finish} aspect={w / h} className="h-full w-full" />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {Math.round(w)} × {Math.round(h)} cm shown to scale with {layout.reference.toLowerCase()}. Illustration only; colours and shape detail are indicative.
        {!fits && ' This size is larger than the wall area shown.'}
      </p>
    </div>
  );
}
