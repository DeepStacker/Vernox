import { Circle } from 'lucide-react';
import { hasFeature } from '@/lib/studio/modes';
import { STUDIO_SHAPES, studioShapePath } from '@/lib/studio/shapes';
import { useStudioUi } from '../uiStore';
import { addHoleObject, addShapeObject } from '../actions';
import { Section } from './fields';

const SIMPLE = ['circle', 'heart', 'star', 'rosette', 'flower', 'leaf', 'starburst', 'crescent', 'diamond', 'hexagon', 'house', 'paw'];

export function ShapesPanel() {
  const mode = useStudioUi(s => s.mode);
  const ids = hasFeature(mode, 'all-shapes') ? STUDIO_SHAPES.map(s => s.id) : SIMPLE;
  return (
    <Section>
      <div className="grid grid-cols-4 gap-2">
        {ids.map(id => {
          const name = STUDIO_SHAPES.find(s => s.id === id)?.name ?? id;
          return (
            <button key={id} type="button" title={name} aria-label={name} onClick={() => addShapeObject(id)} className="flex aspect-square items-center justify-center rounded-md border border-border p-2 hover:border-foreground/40">
              <svg viewBox="-2 -2 44 44" className="h-full w-full" aria-hidden="true"><path d={studioShapePath(id, 40, 40)} fill="currentColor" className="text-foreground/70" /></svg>
            </button>
          );
        })}
        <button type="button" title="Hole" aria-label="Add a hole" onClick={() => addHoleObject()} className="flex aspect-square items-center justify-center rounded-md border border-dashed border-border hover:border-foreground/40">
          <Circle className="h-5 w-5 text-foreground/70" />
        </button>
      </div>
    </Section>
  );
}
