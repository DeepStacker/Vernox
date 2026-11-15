import { ArrowDown, ArrowUp, Combine, Copy, FlipHorizontal2, FlipVertical2, Group, LocateFixed, Repeat, Trash2, Ungroup, type LucideIcon } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { hasFeature } from '@/lib/studio/modes';
import { selectedObjects, useStudio } from '@/lib/studio/store';
import { cn } from '@/lib/utils';
import { centreSelection, combineSelection, deleteSelection, duplicateSelection, flipSelection, groupSelection } from './actions';
import { useDrawStore } from './drawStore';
import { useStudioUi } from './uiStore';

function Item({ icon: Icon, label, onClick, danger, disabled }: { icon: LucideIcon; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn('flex h-11 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40', danger && 'text-destructive')}
    >
      <Icon className="h-4 w-4" />
      <span className="text-[10px] leading-none">{label}</span>
    </button>
  );
}

const Divider = () => <span className="mx-0.5 h-7 w-px shrink-0 self-center bg-border" aria-hidden="true" />;

/**
 * Floating bar over the canvas for the selected object(s): the actions people look for first,
 * in plain words. The properties panel keeps the rest (precision fields, layers, offset…).
 */
export function ObjectToolbar() {
  const mode = useStudioUi(s => s.mode);
  const openRepeat = useStudioUi(s => s.openRepeat);
  const drawing = useDrawStore(s => s.tool !== 'select' || Boolean(s.nodeEdit));
  const objects = useStudio(useShallow(s => selectedObjects(s)));
  const reorder = useStudio(s => s.reorder);
  if (objects.length === 0 || drawing) return null;
  const ids = objects.map(o => o.id);
  const grouped = objects.some(o => o.groupId);

  return (
    <div role="toolbar" aria-label="Selected object" className="absolute left-1/2 top-2 z-10 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-card/95 p-1 shadow-md backdrop-blur">
      <Item icon={Copy} label="Duplicate" onClick={duplicateSelection} />
      {hasFeature(mode, 'flip') && <Item icon={FlipHorizontal2} label="Mirror" onClick={() => void flipSelection('x')} />}
      {hasFeature(mode, 'flip') && <Item icon={FlipVertical2} label="Flip" onClick={() => void flipSelection('y')} />}
      <Divider />
      <Item icon={ArrowUp} label="Forward" onClick={() => reorder(ids, 'forward')} />
      <Item icon={ArrowDown} label="Backward" onClick={() => reorder(ids, 'backward')} />
      {hasFeature(mode, 'centre') && <Item icon={LocateFixed} label="Centre" onClick={() => void centreSelection('both')} />}
      <Divider />
      {hasFeature(mode, 'repeat') && <Item icon={Repeat} label="Repeat" onClick={() => openRepeat('row')} />}
      {hasFeature(mode, 'combine') && objects.length >= 2 && <Item icon={Combine} label="Combine" onClick={() => void combineSelection('union')} />}
      {hasFeature(mode, 'group') && (objects.length >= 2 || grouped) && (
        <Item icon={grouped ? Ungroup : Group} label={grouped ? 'Ungroup' : 'Group'} onClick={() => groupSelection(!grouped)} />
      )}
      <Divider />
      <Item icon={Trash2} label="Delete" onClick={deleteSelection} danger />
    </div>
  );
}
