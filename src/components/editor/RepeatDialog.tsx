/**
 * Repeat and symmetry: copies of the selection in a row, a grid, a circle, or as an N-fold
 * (mandala) pattern around the plate centre. One undoable action; copies are real objects
 * that keep cut / solid / engrave and are grouped with the original.
 */
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { selectionBounds } from '@/lib/studio/operations';
import {
  gridRepeat, linearRepeat, MAX_DOCUMENT_OBJECTS, MAX_REPEAT_COPIES, radialRepeat, RepeatLimitError, symmetryCopies, type RepeatResult,
} from '@/lib/studio/repeat';
import { selectedObjects, useStudio } from '@/lib/studio/store';
import { applyRepeatResult } from './actions';
import { Field, NumberField, Segmented } from './panels/fields';
import { useStudioUi, type RepeatTab } from './uiStore';

const TABS: { value: RepeatTab; label: string }[] = [
  { value: 'row', label: 'Row' },
  { value: 'grid', label: 'Grid' },
  { value: 'circle', label: 'Circle' },
  { value: 'mandala', label: 'Mandala' },
];

const HINTS: Record<RepeatTab, string> = {
  row: 'Copies in a line, one after another.',
  grid: 'Copies in rows and columns.',
  circle: 'Copies around the middle of the plate, like petals or a wreath.',
  mandala: 'Repeats your design in equal turns around the middle of the plate, with an optional mirror image, for mandalas and rosettes.',
};

function RepeatForm({ initial }: { initial: RepeatTab }) {
  const plate = useStudio(s => s.doc.plate);
  const objectCount = useStudio(s => s.doc.objects.length);
  const selection = useStudio(useShallow(s => selectedObjects(s)));
  const close = useStudioUi(s => s.closeRepeat);
  const [tab, setTab] = useState<RepeatTab>(initial);

  const box = selectionBounds(selection);
  const centre = { x: plate.widthMm / 2, y: plate.heightMm / 2 };
  const ownRadius = box ? Math.hypot((box.minX + box.maxX) / 2 - centre.x, (box.minY + box.maxY) / 2 - centre.y) : 0;

  const [row, setRow] = useState({ count: 5, gapMm: 10, angleDeg: 0 });
  const [grid, setGrid] = useState({ rows: 3, columns: 3, gapXMm: 10, gapYMm: 10 });
  const [circle, setCircle] = useState({ count: 8, radiusMm: Math.round(ownRadius > 5 ? ownRadius : Math.min(plate.widthMm, plate.heightMm) * 0.3), rotateCopies: true, sweepDeg: 360 });
  const [mandala, setMandala] = useState({ folds: 8, mirror: false });

  const copies = tab === 'row' ? row.count - 1
    : tab === 'grid' ? grid.rows * grid.columns - 1
      : tab === 'circle' ? circle.count - 1
        : mandala.folds * (mandala.mirror ? 2 : 1) - 1;
  const perSet = selection.length;
  const tooMany = copies > MAX_REPEAT_COPIES || objectCount + copies * perSet > MAX_DOCUMENT_OBJECTS;

  const make = (): RepeatResult => {
    switch (tab) {
      case 'row': return linearRepeat(selection, row);
      case 'grid': return gridRepeat(selection, grid);
      case 'circle': return radialRepeat(selection, { count: circle.count, centre, radiusMm: circle.radiusMm, rotateCopies: circle.rotateCopies, sweepDeg: circle.sweepDeg });
      case 'mandala': return symmetryCopies(selection, { folds: mandala.folds, mirror: mandala.mirror, centre });
    }
  };

  const apply = () => {
    try {
      const result = make();
      if (result.copies.length === 0) { toast.error('Nothing to repeat: raise the number of copies.'); return; }
      applyRepeatResult(result, selection.map(o => o.id));
      toast.success(`Added ${result.copies.length} ${result.copies.length === 1 ? 'copy' : 'copies'}`);
      close();
    } catch (err) {
      toast.error(err instanceof RepeatLimitError ? err.message : 'Could not repeat this selection.');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Segmented<RepeatTab> label="" value={tab} options={TABS} onChange={setTab} />
      <p className="text-sm text-muted-foreground">{HINTS[tab]}</p>

      {tab === 'row' && (
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Copies in all" value={row.count} min={2} max={MAX_REPEAT_COPIES} onChange={count => setRow(r => ({ ...r, count: Math.round(count) }))} />
          <NumberField label="Gap between" length value={row.gapMm} min={-500} max={1000} onChange={gapMm => setRow(r => ({ ...r, gapMm }))} />
          <Segmented<'across' | 'down' | 'angle'>
            label=""
            value={row.angleDeg === 0 ? 'across' : row.angleDeg === 90 ? 'down' : 'angle'}
            options={[{ value: 'across', label: 'Across' }, { value: 'down', label: 'Down' }, { value: 'angle', label: 'Angled' }]}
            onChange={v => setRow(r => ({ ...r, angleDeg: v === 'across' ? 0 : v === 'down' ? 90 : r.angleDeg === 0 || r.angleDeg === 90 ? 45 : r.angleDeg }))}
          />
          <NumberField label="Angle" suffix="°" value={row.angleDeg} min={-360} max={360} onChange={angleDeg => setRow(r => ({ ...r, angleDeg }))} />
        </div>
      )}

      {tab === 'grid' && (
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Rows" value={grid.rows} min={1} max={50} onChange={rows => setGrid(g => ({ ...g, rows: Math.round(rows) }))} />
          <NumberField label="Columns" value={grid.columns} min={1} max={50} onChange={columns => setGrid(g => ({ ...g, columns: Math.round(columns) }))} />
          <NumberField label="Gap across" length value={grid.gapXMm} min={-500} max={1000} onChange={gapXMm => setGrid(g => ({ ...g, gapXMm }))} />
          <NumberField label="Gap down" length value={grid.gapYMm} min={-500} max={1000} onChange={gapYMm => setGrid(g => ({ ...g, gapYMm }))} />
        </div>
      )}

      {tab === 'circle' && (
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Copies in all" value={circle.count} min={2} max={MAX_REPEAT_COPIES} onChange={count => setCircle(c => ({ ...c, count: Math.round(count) }))} />
          <NumberField label="Radius" length value={circle.radiusMm} min={0} max={3000} onChange={radiusMm => setCircle(c => ({ ...c, radiusMm }))} />
          <NumberField label="Spread over" suffix="°" value={circle.sweepDeg} min={10} max={360} onChange={sweepDeg => setCircle(c => ({ ...c, sweepDeg }))} />
          <Field label="Turn each copy">
            <label className="flex h-9 items-center gap-2 text-sm text-foreground">
              <Switch checked={circle.rotateCopies} onCheckedChange={rotateCopies => setCircle(c => ({ ...c, rotateCopies }))} />
              {circle.rotateCopies ? 'Face outward' : 'Keep upright'}
            </label>
          </Field>
        </div>
      )}

      {tab === 'mandala' && (
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Turns (folds)" value={mandala.folds} min={1} max={64} onChange={folds => setMandala(m => ({ ...m, folds: Math.round(folds) }))} />
          <Field label="Mirror image">
            <label className="flex h-9 items-center gap-2 text-sm text-foreground">
              <Switch checked={mandala.mirror} onCheckedChange={mirror => setMandala(m => ({ ...m, mirror }))} />
              {mandala.mirror ? 'Mirror each turn' : 'No mirror'}
            </label>
          </Field>
        </div>
      )}

      <p className={tooMany ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'} role={tooMany ? 'alert' : undefined}>
        {tooMany
          ? `Too many: at most ${MAX_REPEAT_COPIES} copies at a time, and ${MAX_DOCUMENT_OBJECTS} objects in a design.`
          : copies >= 1 ? `Adds ${copies} ${copies === 1 ? 'copy' : 'copies'}${perSet > 1 ? ` of the ${perSet} selected objects` : ''}, grouped with the original.` : 'Raise the number to add copies.'}
      </p>

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary h-10 px-4 text-sm" onClick={close}>Cancel</button>
        <button type="button" className="btn-primary h-10 px-4 text-sm" disabled={tooMany || copies < 1 || selection.length === 0} onClick={apply}>
          {tab === 'mandala' ? 'Apply symmetry' : 'Repeat'}
        </button>
      </div>
    </div>
  );
}

export function RepeatDialog() {
  const tab = useStudioUi(s => s.repeatTab);
  const close = useStudioUi(s => s.closeRepeat);
  const hasSelection = useStudio(s => s.selection.length > 0);
  return (
    <Dialog open={tab !== null && hasSelection} onOpenChange={open => !open && close()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Repeat &amp; symmetry</DialogTitle>
        <DialogDescription className="sr-only">Make copies of the selected objects in a row, grid or circle, or around the plate centre.</DialogDescription>
        {tab && <RepeatForm initial={tab} />}
      </DialogContent>
    </Dialog>
  );
}
