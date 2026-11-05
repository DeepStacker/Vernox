import { Circle, Eye, EyeOff, Image as ImageIcon, Lock, Shapes, Type, Unlock } from 'lucide-react';
import type { StudioObject } from '@/lib/studio/schema';
import { useStudio } from '@/lib/studio/store';
import { cn } from '@/lib/utils';
import { withGroups } from '../actions';

const ICON = { text: Type, shape: Shapes, path: ImageIcon, hole: Circle } as const;

function label(o: StudioObject): string {
  if (o.name) return o.name;
  if (o.kind === 'text') return o.text.split('\n')[0] || 'Text';
  if (o.kind === 'shape') return o.shapeId;
  if (o.kind === 'hole') return `Hole ${o.diameterMm} mm`;
  return o.source === 'trace' ? 'Traced image' : 'Path';
}

/** Layers, top of the stack first: select, rename, hide, lock. */
export function LayersPanel() {
  const objects = useStudio(s => s.doc.objects);
  const selection = useStudio(s => s.selection);
  const { select, updateObjects } = useStudio.getState();
  const rows = objects.slice().reverse();
  if (rows.length === 0) return <p className="px-4 py-6 text-sm text-muted-foreground">No objects yet.</p>;
  return (
    <ul className="flex flex-col py-2" role="listbox" aria-label="Layers" aria-multiselectable="true">
      {rows.map(o => {
        const Icon = ICON[o.kind];
        const active = selection.includes(o.id);
        return (
          <li key={o.id} role="option" aria-selected={active} className={cn('group flex items-center gap-2 px-3 py-1.5 text-sm', active ? 'bg-primary/10' : 'hover:bg-muted')}>
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              className="min-w-0 flex-1 bg-transparent text-foreground outline-none focus:ring-1 focus:ring-ring"
              value={label(o)}
              onFocus={() => select(withGroups([o.id], objects))}
              onChange={e => updateObjects({ [o.id]: { name: e.target.value } })}
              aria-label="Layer name"
            />
            {o.groupId && <span className="text-[10px] text-muted-foreground">grp</span>}
            <button type="button" aria-label={o.hidden ? 'Show' : 'Hide'} onClick={() => updateObjects({ [o.id]: { hidden: !o.hidden } })} className="text-muted-foreground hover:text-foreground">
              {o.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button type="button" aria-label={o.locked ? 'Unlock' : 'Lock'} onClick={() => updateObjects({ [o.id]: { locked: !o.locked } })} className="text-muted-foreground hover:text-foreground">
              {o.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4 opacity-40 group-hover:opacity-100" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
