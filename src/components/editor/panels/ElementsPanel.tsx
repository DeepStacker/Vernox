import { useState } from 'react';
import { ELEMENTS, elementPathData, type ElementCategory } from '@/lib/studio/elements/motifs';
import { cn } from '@/lib/utils';
import { addElementObject } from '../actions';
import { Section } from './fields';

const CATEGORIES: { id: ElementCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'nature', label: 'Nature' },
  { id: 'festive', label: 'Festive' },
  { id: 'animals', label: 'Animals' },
  { id: 'symbols', label: 'Symbols' },
  { id: 'borders', label: 'Borders' },
];

/** Library of decorative motifs; a tap places one sized for the plate (borders sit against the edge). */
export function ElementsPanel() {
  const [category, setCategory] = useState<ElementCategory | 'all'>('all');
  const shown = ELEMENTS.filter(e => category === 'all' || e.category === category);
  return (
    <>
      <Section>
        <p className="text-sm text-muted-foreground">Tap a motif to add it. Resize it with the corner handles; every motif is made to cut cleanly.</p>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Category">
          {CATEGORIES.map(c => (
            <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => setCategory(c.id)}
              className={cn('rounded-full border px-2.5 py-1 text-xs', category === c.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}>
              {c.label}
            </button>
          ))}
        </div>
      </Section>
      <Section>
        <div className="grid grid-cols-3 gap-2">
          {shown.map(e => (
            <button key={e.id} type="button" onClick={() => addElementObject(e.id)} title={e.name} aria-label={`Add ${e.name}`}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-border p-1.5 hover:border-foreground/40">
              <svg viewBox="-4 -4 108 108" className="h-full w-full" aria-hidden="true"><path d={elementPathData(e.id)} fill="currentColor" className="text-foreground/75" /></svg>
              <span className="w-full truncate text-center text-[10px] leading-none text-muted-foreground">{e.name}</span>
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}
