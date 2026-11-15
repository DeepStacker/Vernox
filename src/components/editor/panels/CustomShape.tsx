import { useState } from 'react';
import { DEFAULT_PARAMETRIC, PARAMETRIC_LIMITS, parametricShape, type ParametricKind, type ParametricParams } from '@/lib/studio/elements/parametric';
import { addParametricShape } from '../actions';
import { Field, Section, Segmented } from './fields';

const KINDS: { value: ParametricKind; label: string }[] = [
  { value: 'polygon', label: 'Polygon' },
  { value: 'star', label: 'Star' },
  { value: 'ring', label: 'Ring' },
  { value: 'spiral', label: 'Spiral' },
];

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <Field label={`${label}: ${Number.isInteger(step) ? value : value.toFixed(2)}`}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full" />
    </Field>
  );
}

/** Builder for shapes with a parameter: polygon sides, star points and depth, ring width, spiral turns. */
export function CustomShape() {
  const [kind, setKind] = useState<ParametricKind>('polygon');
  const [params, setParams] = useState<ParametricParams>(DEFAULT_PARAMETRIC);
  const set = (patch: Partial<ParametricParams>) => setParams(p => ({ ...p, ...patch }));
  const L = PARAMETRIC_LIMITS;
  const spiral = kind === 'spiral';
  return (
    <Section title="Make a shape">
      <Segmented<ParametricKind> label="" value={kind} options={KINDS} onChange={setKind} />
      <svg viewBox="-55 -55 110 110" className="mx-auto h-24 w-24 text-foreground/70" aria-hidden="true">
        <path d={parametricShape(kind, 100, params).d} fill={spiral ? 'none' : 'currentColor'} stroke={spiral ? 'currentColor' : 'none'} strokeWidth={2} />
      </svg>
      {kind === 'polygon' && <Slider label="Sides" value={params.sides} min={L.sides.min} max={L.sides.max} step={1} onChange={v => set({ sides: v })} />}
      {kind === 'star' && (
        <>
          <Slider label="Points" value={params.points} min={L.points.min} max={L.points.max} step={1} onChange={v => set({ points: v })} />
          <Slider label="Depth" value={Math.round((1 - params.innerRatio) * 100) / 100} min={0.1} max={0.8} step={0.05} onChange={v => set({ innerRatio: Math.round((1 - v) * 100) / 100 })} />
        </>
      )}
      {kind === 'ring' && <Slider label="Band width" value={params.bandRatio} min={L.bandRatio.min} max={L.bandRatio.max} step={0.05} onChange={v => set({ bandRatio: v })} />}
      {spiral && (
        <>
          <Slider label="Turns" value={params.turns} min={L.turns.min} max={L.turns.max} step={1} onChange={v => set({ turns: v })} />
          <p className="text-xs text-muted-foreground">A spiral is an engraved line, not a cut.</p>
        </>
      )}
      <button type="button" className="btn-secondary h-9 text-sm" onClick={() => addParametricShape(kind, params)}>Add to design</button>
    </Section>
  );
}
