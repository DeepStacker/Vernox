import { Switch } from '@/components/ui/switch';
import { resizePlate } from '@/lib/studio/api';
import { availableFinishes, finishPreset, thicknessOptions } from '@/lib/studio/materials';
import { hasFeature } from '@/lib/studio/modes';
import type { Mounting, PlateStyle } from '@/lib/studio/schema';
import { SIMPLE_PLATE_SHAPES, STUDIO_SHAPES, studioShapePath } from '@/lib/studio/shapes';
import { useStudio } from '@/lib/studio/store';
import { getTemplate } from '@/lib/studio/templates/registry';
import { t } from '@/lib/studio/i18n';
import { cn } from '@/lib/utils';
import { useStudioUi, type LengthUnit } from '../uiStore';
import { Field, NumberField, Section, Segmented } from './fields';
import { FinishSwatch } from './FinishSwatch';

function ShapeTile({ id, active, onClick }: { id: string; active: boolean; onClick: () => void }) {
  const name = STUDIO_SHAPES.find(s => s.id === id)?.name ?? id;
  return (
    <button
      type="button"
      title={name}
      aria-label={name}
      aria-pressed={active}
      onClick={onClick}
      className={cn('flex aspect-square items-center justify-center rounded-md border p-1.5 transition-colors', active ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/40')}
    >
      <svg viewBox="-2 -2 44 44" className="h-full w-full" aria-hidden="true">
        <path d={studioShapePath(id, 40, 40, 4)} fill="currentColor" className="text-foreground/70" />
      </svg>
    </button>
  );
}

export function PlatePanel({ pricedFinishes }: { pricedFinishes: string[] }) {
  const doc = useStudio(s => s.doc);
  const mode = useStudioUi(s => s.mode);
  const unit = useStudioUi(s => s.unit);
  const setUnit = useStudioUi(s => s.setUnit);
  const { updatePlate, updateMaterial, updateMounting, setAutoBridges, setTemplateFields, loadDocumentTracked } = useStudio.getState();
  const plate = doc.plate;
  const template = doc.template ? getTemplate(doc.template.id) : undefined;
  const shapes = hasFeature(mode, 'all-shapes') ? STUDIO_SHAPES.map(s => s.id) : [...SIMPLE_PLATE_SHAPES];
  const finishes = availableFinishes(mode, pricedFinishes);
  if (!finishes.some(f => f.id === doc.material.finish)) finishes.push(finishPreset(doc.material.finish));

  const setSize = (widthMm: number, heightMm: number) => {
    if (mode === 'simple') loadDocumentTracked(resizePlate(doc, widthMm, heightMm));
    else updatePlate({ widthMm, heightMm });
  };

  return (
    <div className="flex flex-col">
      {template && doc.template && (
        <Section>
          {template.fields.map(f => (
            <Field key={f.key} label={f.label}>
              {f.multiline ? (
                <textarea
                  className="min-h-[64px] rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
                  value={doc.template?.fields[f.key] ?? ''}
                  onChange={e => setTemplateFields({ [f.key]: e.target.value })}
                />
              ) : (
                <input
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                  value={doc.template?.fields[f.key] ?? ''}
                  onChange={e => setTemplateFields({ [f.key]: e.target.value })}
                />
              )}
            </Field>
          ))}
        </Section>
      )}

      <Section title={t('review.finish')}>
        <div className="grid grid-cols-4 gap-2">
          {finishes.map(f => (
            <FinishSwatch key={f.id} finish={f.id} active={doc.material.finish === f.id} onClick={() => updateMaterial({ finish: f.id, thicknessMm: f.defaultThicknessMm })} />
          ))}
        </div>
        <Segmented
          label={`${t('review.thickness')} (mm)`}
          value={String(doc.material.thicknessMm)}
          options={thicknessOptions(doc.material.finish).filter(n => mode === 'pro' || n <= 3).map(n => ({ value: String(n), label: String(n) }))}
          onChange={v => updateMaterial({ thicknessMm: Number(v) })}
        />
      </Section>

      <Section title={t('plate.title')}>
        <Segmented<PlateStyle>
          label=""
          value={plate.style}
          options={(['solid', 'frame', 'none'] as const).map(v => ({ value: v, label: t(`plate.style.${v}`) }))}
          onChange={style => updatePlate({ style })}
        />
        <div className="grid grid-cols-4 gap-2">
          {shapes.map(id => <ShapeTile key={id} id={id} active={plate.shapeId === id} onClick={() => updatePlate({ shapeId: id })} />)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Width" length value={plate.widthMm} min={20} max={3000} onChange={w => setSize(w, plate.heightMm)} />
          <NumberField label="Height" length value={plate.heightMm} min={20} max={1500} onChange={h => setSize(plate.widthMm, h)} />
          {(plate.shapeId === 'rectangle' || plate.shapeId === 'square') && (
            <NumberField label="Corners" length value={plate.cornerRadiusMm} min={0} max={Math.min(plate.widthMm, plate.heightMm) / 2} onChange={r => updatePlate({ cornerRadiusMm: r })} />
          )}
          {plate.style === 'frame' && <NumberField label="Border" length value={plate.borderMm} min={3} max={200} onChange={b => updatePlate({ borderMm: b })} />}
        </div>
      </Section>

      <Section title={t('tool.hole')}>
        <Segmented<Mounting['preset']>
          label=""
          value={doc.mounting.preset}
          options={[
            { value: 'none', label: 'None' },
            { value: 'top-2', label: '2 top' },
            { value: 'corners-4', label: '4 corners' },
            { value: 'center-1', label: '1 top' },
          ]}
          onChange={preset => updateMounting({ preset })}
        />
        {mode === 'pro' && doc.mounting.preset !== 'none' && (
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Hole Ø" length value={doc.mounting.diameterMm} min={2} max={20} step={0.5} onChange={d => updateMounting({ diameterMm: d })} />
            <NumberField label="Inset" length value={doc.mounting.insetMm} min={5} max={200} onChange={d => updateMounting({ insetMm: d })} />
          </div>
        )}
        {mode === 'pro' && (
          <Segmented<LengthUnit>
            label="Units"
            value={unit}
            options={(['mm', 'cm', 'in'] as const).map(u => ({ value: u, label: u }))}
            onChange={setUnit}
          />
        )}
        {hasFeature(mode, 'manual-bridges-toggle') && (
          <label className="flex items-center justify-between text-sm">
            <span>Auto bridges</span>
            <Switch checked={doc.manufacturing.autoBridges} onCheckedChange={setAutoBridges} />
          </label>
        )}
      </Section>
    </div>
  );
}
