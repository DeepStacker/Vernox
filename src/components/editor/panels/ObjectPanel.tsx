import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical,
  ArrowDownToLine, ArrowUpToLine, Combine, Copy, FlipHorizontal2, FlipVertical2, Group, Lock, Maximize2, Trash2, Ungroup, Unlock,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Switch } from '@/components/ui/switch';
import { cloneObject } from '@/lib/studio/document';
import { hasFeature } from '@/lib/studio/modes';
import type { ObjectOp, StudioObject } from '@/lib/studio/schema';
import { selectedObjects, useStudio } from '@/lib/studio/store';
import { fontById, fontsForText } from '@/lib/studio/text/fonts';
import { t } from '@/lib/studio/i18n';
import { useStudioUi } from '../uiStore';
import { deleteSelection, duplicateSelection, groupSelection } from '../actions';
import { Field, IconButton, NumberField, Section, Segmented } from './fields';

async function runGeometry(fn: (ops: typeof import('@/lib/studio/operations')) => void) {
  fn(await import('@/lib/studio/operations'));
}

export function ObjectPanel() {
  const objects = useStudio(useShallow(s => selectedObjects(s)));
  const doc = useStudio(s => s.doc);
  const mode = useStudioUi(s => s.mode);
  const { updateObjects, reorder, replaceObjects, addObjects } = useStudio.getState();
  if (objects.length === 0) return null;
  const one: StudioObject | undefined = objects.length === 1 ? objects[0] : undefined;
  const patch = (p: Record<string, unknown>) => updateObjects(Object.fromEntries(objects.map(o => [o.id, p])));
  const ids = objects.map(o => o.id);

  return (
    <div className="flex flex-col">
      {one?.kind === 'text' && (
        <Section>
          <Field label="Text">
            <textarea
              className="min-h-[60px] rounded-md border border-input bg-background px-2 py-1.5 text-base text-foreground"
              value={one.text}
              onChange={e => patch({ text: e.target.value })}
              autoFocus={one.text === 'Your text'}
            />
          </Field>
          <Field label="Font">
            <div className="grid grid-cols-2 gap-1.5">
              {fontsForText(one.text).map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => patch({ fontId: f.id, weld: Boolean(f.weld) })}
                  aria-pressed={one.fontId === f.id}
                  className={`h-9 truncate rounded-md border px-2 text-left text-sm ${one.fontId === f.id ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-foreground/80 hover:border-foreground/40'}`}
                  style={{ fontFamily: f.previewFamily }}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Letter height" length value={one.sizeMm} min={3} max={1200} onChange={v => patch({ sizeMm: v })} />
            <NumberField label="Spacing" length value={one.letterSpacingMm} min={-50} max={200} step={0.5} onChange={v => patch({ letterSpacingMm: v })} />
          </div>
          {one.text.includes('\n') && (
            <Segmented label="Align" value={one.align} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }]} onChange={align => patch({ align })} />
          )}
          <label className="flex items-center justify-between text-sm">
            <span>Join letters</span>
            <Switch checked={one.weld} onCheckedChange={weld => patch({ weld })} />
          </label>
          <button type="button" className="btn-secondary h-9 text-sm" onClick={() => runGeometry(ops => {
            const size = ops.fitTextSize(one, doc.plate);
            if (size) updateObjects({ [one.id]: { sizeMm: size, x: doc.plate.widthMm / 2, y: doc.plate.heightMm / 2, rotation: 0 } });
          })}>
            <Maximize2 className="mr-1.5 h-4 w-4" /> Fit to plate
          </button>
          {fontById(one.fontId).stencil && <p className="text-xs text-muted-foreground">Stencil font: counters stay attached.</p>}
        </Section>
      )}

      {one?.kind === 'shape' && (
        <Section>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Width" length value={one.widthMm} min={1} max={3000} onChange={v => patch({ widthMm: v })} />
            <NumberField label="Height" length value={one.heightMm} min={1} max={1500} onChange={v => patch({ heightMm: v })} />
          </div>
        </Section>
      )}

      {one?.kind === 'hole' && (
        <Section>
          <NumberField label="Diameter" length value={one.diameterMm} min={0.5} max={300} step={0.5} onChange={v => patch({ diameterMm: v })} />
        </Section>
      )}

      {hasFeature(mode, 'object-op') && one && one.kind !== 'hole' && (
        <Section>
          <Segmented<ObjectOp>
            label=""
            value={one.op}
            options={(['cut', 'add', 'score'] as const).map(v => ({ value: v, label: t(`obj.op.${v}`) }))}
            onChange={op => patch({ op })}
          />
        </Section>
      )}

      {hasFeature(mode, 'transform-fields') && one && (
        <Section>
          <div className="grid grid-cols-3 gap-2">
            <NumberField label="X" length value={one.x} onChange={v => patch({ x: v })} />
            <NumberField label="Y" length value={one.y} onChange={v => patch({ y: v })} />
            <NumberField label="Angle" suffix="°" value={one.rotation} step={1} onChange={v => patch({ rotation: v })} />
          </div>
        </Section>
      )}

      {hasFeature(mode, 'align') && (
        <Section>
          <div className="flex flex-wrap gap-1">
            {([
              ['left', AlignStartVertical], ['hcenter', AlignCenterVertical], ['right', AlignEndVertical],
              ['top', AlignStartHorizontal], ['vcenter', AlignCenterHorizontal], ['bottom', AlignEndHorizontal],
            ] as const).map(([edge, Icon]) => (
              <IconButton key={edge} label={`Align ${edge}`} onClick={() => runGeometry(ops => updateObjects(ops.alignObjects(objects, edge, doc.plate)))}>
                <Icon className="h-4 w-4" />
              </IconButton>
            ))}
            {objects.length >= 3 && (
              <>
                <IconButton label="Distribute horizontally" onClick={() => runGeometry(ops => updateObjects(ops.distributeObjects(objects, 'x')))}><span className="text-xs">↔</span></IconButton>
                <IconButton label="Distribute vertically" onClick={() => runGeometry(ops => updateObjects(ops.distributeObjects(objects, 'y')))}><span className="text-xs">↕</span></IconButton>
              </>
            )}
          </div>
          {hasFeature(mode, 'booleans') && objects.length >= 2 && (
            <div className="grid grid-cols-4 gap-1">
              {(['union', 'subtract', 'intersect', 'exclude'] as const).map(op => (
                <button key={op} type="button" className="h-8 rounded-md border border-border text-xs capitalize hover:bg-muted" onClick={() => runGeometry(ops => {
                  const result = ops.booleanObjects(objects, op);
                  if (result) replaceObjects(ids, [result]);
                })}>
                  {op}
                </button>
              ))}
            </div>
          )}
          {hasFeature(mode, 'offset') && one && (
            <button type="button" className="btn-secondary h-9 text-sm" onClick={() => runGeometry(ops => {
              const outline = ops.offsetOutline(one, 6, 4);
              if (outline) addObjects([{ ...outline, op: 'add' }]);
            })}>
              <Combine className="mr-1.5 h-4 w-4" /> Offset outline
            </button>
          )}
        </Section>
      )}

      <Section>
        <div className="flex flex-wrap gap-1">
          <IconButton label="Duplicate (Ctrl+D)" onClick={duplicateSelection}><Copy className="h-4 w-4" /></IconButton>
          <IconButton label="Mirror horizontally" onClick={() => patch({ scaleX: -(one?.scaleX ?? 1) })} disabled={!one}><FlipHorizontal2 className="h-4 w-4" /></IconButton>
          <IconButton label="Mirror vertically" onClick={() => patch({ scaleY: -(one?.scaleY ?? 1) })} disabled={!one}><FlipVertical2 className="h-4 w-4" /></IconButton>
          <IconButton label="Bring to front (])" onClick={() => reorder(ids, 'front')}><ArrowUpToLine className="h-4 w-4" /></IconButton>
          <IconButton label="Send to back ([)" onClick={() => reorder(ids, 'back')}><ArrowDownToLine className="h-4 w-4" /></IconButton>
          {mode === 'pro' && (
            <>
              <IconButton label="Group (Ctrl+G)" onClick={() => groupSelection(true)} disabled={objects.length < 2}><Group className="h-4 w-4" /></IconButton>
              <IconButton label="Ungroup (Ctrl+Shift+G)" onClick={() => groupSelection(false)}><Ungroup className="h-4 w-4" /></IconButton>
              <IconButton label={one?.locked ? 'Unlock' : 'Lock'} onClick={() => patch({ locked: !one?.locked })} disabled={!one}>{one?.locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}</IconButton>
              <IconButton label="Mirror copy" onClick={() => runGeometry(ops => {
                if (!one) return;
                addObjects([{ ...cloneObject(one), ...ops.mirrorCopy(one, 'x', doc.plate) } as StudioObject]);
              })} disabled={!one}><span className="text-xs">⇋</span></IconButton>
            </>
          )}
          <IconButton label="Delete (Del)" onClick={deleteSelection} className="text-destructive"><Trash2 className="h-4 w-4" /></IconButton>
        </div>
      </Section>
    </div>
  );
}
