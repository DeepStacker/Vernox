import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { finishPreset } from '@/lib/studio/materials';
import { studioShapePath } from '@/lib/studio/shapes';
import { listTemplates, templateDefaults, type StudioTemplate } from '@/lib/studio/templates/registry';
import '@/lib/studio/templates/definitions';
import { fontById } from '@/lib/studio/text/fonts';
import { cn } from '@/lib/utils';
import { startFromTemplate } from '../actions';

/** Lightweight preview: plate outline in its finish + the template's text in a system font. */
export function TemplateThumb({ template }: { template: StudioTemplate }) {
  const built = template.build(templateDefaults(template));
  const w = built.plate?.widthMm ?? 300;
  const h = built.plate?.heightMm ?? 200;
  const style = built.plate?.style ?? 'solid';
  const swatch = finishPreset(template.finish).swatch;
  const gid = `tpl-${template.id}`;
  const d = studioShapePath(built.plate?.shapeId ?? 'rectangle', w, h, built.plate?.cornerRadiusMm ?? 0);
  const metal = `url(#${gid})`;
  return (
    <svg viewBox={`${-w * 0.08} ${-h * 0.08} ${w * 1.16} ${h * 1.16}`} className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          {swatch.map((c, i) => <stop key={i} offset={i / Math.max(1, swatch.length - 1)} stopColor={c} />)}
        </linearGradient>
      </defs>
      {style === 'none' ? null : style === 'frame'
        ? <path d={d} fill="none" stroke={metal} strokeWidth={(built.plate?.borderMm ?? 15) * 2} />
        : <path d={d} fill={metal} />}
      {built.objects?.map(o => o.kind === 'text' ? (
        <text
          key={o.id}
          x={o.x}
          y={o.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={o.sizeMm * 1.35}
          fontFamily={fontById(o.fontId).previewFamily}
          fill={o.op === 'cut' ? 'hsl(var(--muted))' : metal}
        >
          {o.text.split('\n')[0]}
        </text>
      ) : o.kind === 'shape' ? (
        <path key={o.id} d={studioShapePath(o.shapeId, o.widthMm, o.heightMm)} transform={`translate(${o.x - o.widthMm / 2} ${o.y - o.heightMm / 2})`} fill={o.op === 'cut' ? 'hsl(var(--muted))' : metal} />
      ) : null)}
    </svg>
  );
}

export function TemplatesGrid({ className, columns = 2 }: { className?: string; columns?: number }) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className={cn('grid gap-3', columns === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2', className)}>
      {listTemplates().map(tpl => (
        <button
          key={tpl.id}
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            setBusy(tpl.id);
            try { await startFromTemplate(tpl.id); } finally { setBusy(null); }
          }}
          className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="relative flex h-40 items-center justify-center overflow-hidden bg-muted p-3">
            <TemplateThumb template={tpl} />
            {busy === tpl.id && <Loader2 className="absolute h-6 w-6 animate-spin text-primary" />}
          </span>
          <span className="px-3 py-2 text-sm text-foreground">{tpl.name}</span>
        </button>
      ))}
    </div>
  );
}
