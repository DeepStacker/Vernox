import { useRef } from 'react';
import { FileUp, Flower2, Grid3x3, Keyboard, Layers, LayoutGrid, LayoutTemplate, MousePointer2, Pencil, PenTool, Shapes, Square, Type, Upload, type LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { t, type MessageKey } from '@/lib/studio/i18n';
import { hasFeature, toolsFor, type ToolId } from '@/lib/studio/modes';
import { useStudio } from '@/lib/studio/store';
import { cn } from '@/lib/utils';
import { addTextObject, importVectorFile } from './actions';
import { setDrawTool } from './drawActions';
import { useDrawStore } from './drawStore';
import { useStudioUi, type Panel } from './uiStore';

interface ToolMeta { icon: LucideIcon; label: MessageKey; /** Short caption under the icon. */ short: MessageKey; simpleLabel?: MessageKey; panel?: Panel }

const TOOL_META: Record<ToolId, ToolMeta> = {
  select: { icon: MousePointer2, label: 'tool.select', short: 'tool.short.select' },
  templates: { icon: LayoutTemplate, label: 'tool.templates', short: 'tool.short.templates', panel: 'templates' },
  text: { icon: Type, label: 'tool.text', short: 'tool.short.text' },
  elements: { icon: Flower2, label: 'tool.elements', short: 'tool.short.elements', panel: 'elements' },
  shape: { icon: Shapes, label: 'tool.shape', short: 'tool.short.shape', panel: 'shape' },
  pen: { icon: PenTool, label: 'tool.pen', short: 'tool.short.draw', simpleLabel: 'tool.pen.simple' },
  pencil: { icon: Pencil, label: 'tool.pencil', short: 'tool.short.freehand', simpleLabel: 'tool.pencil.simple' },
  patterns: { icon: LayoutGrid, label: 'tool.patterns', short: 'tool.short.patterns', panel: 'patterns' },
  upload: { icon: Upload, label: 'tool.upload', short: 'tool.short.upload' },
  import: { icon: FileUp, label: 'tool.import', short: 'tool.short.import' },
  plate: { icon: Square, label: 'tool.plate', short: 'tool.short.plate', panel: 'plate' },
  layers: { icon: Layers, label: 'tool.layers', short: 'tool.short.layers', panel: 'layers' },
};

/** Left rail (desktop) / bottom row (mobile) of icon tools, driven by the mode's tool list. */
export function ToolRail({ orientation = 'vertical' }: { orientation?: 'vertical' | 'horizontal' }) {
  const mode = useStudioUi(s => s.mode);
  const panel = useStudioUi(s => s.panel);
  const showGrid = useStudioUi(s => s.showGrid);
  const drawTool = useDrawStore(s => s.tool);
  const importRef = useRef<HTMLInputElement>(null);

  const run = (id: ToolId) => {
    const ui = useStudioUi.getState();
    const meta = TOOL_META[id];
    if (id === 'select') { setDrawTool('select'); useStudio.getState().select([]); ui.setPanel(null); return; }
    if (id === 'pen' || id === 'pencil') { setDrawTool(drawTool === id ? 'select' : id); return; }
    if (id === 'text') { addTextObject(); ui.setPanel('inspect'); return; }
    if (id === 'upload') { ui.openTrace(); return; }
    if (id === 'import') { importRef.current?.click(); return; }
    ui.setPanel(panel === meta.panel ? null : meta.panel ?? null);
  };

  const horizontal = orientation === 'horizontal';
  return (
    <nav
      aria-label="Tools"
      className={cn('flex shrink-0 gap-0.5 bg-card', horizontal ? 'w-full overflow-x-auto border-t border-border px-1 py-1' : 'w-[4.5rem] flex-col items-center overflow-y-auto border-r border-border py-2')}
    >
      {toolsFor(mode).map(id => {
        const meta = TOOL_META[id];
        const Icon = meta.icon;
        const active = Boolean(meta.panel && panel === meta.panel) || drawTool === id;
        const label = t(mode === 'simple' && meta.simpleLabel ? meta.simpleLabel : meta.label);
        return (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => run(id)}
                aria-label={label}
                aria-pressed={active}
                className={cn('flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 transition-colors', horizontal ? 'h-14 w-16' : 'w-16', active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted')}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] leading-none">{t(meta.short)}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side={horizontal ? 'top' : 'right'}>{label}</TooltipContent>
          </Tooltip>
        );
      })}
      {!horizontal && hasFeature(mode, 'grid') && (
        <button type="button" onClick={() => useStudioUi.getState().toggleGrid()} aria-label="Grid (G)" aria-pressed={showGrid} title="Grid (G)"
          className={cn('mt-auto flex h-11 w-11 items-center justify-center rounded-lg', showGrid ? 'bg-muted' : 'hover:bg-muted')}>
          <Grid3x3 className="h-5 w-5" />
        </button>
      )}
      {!horizontal && (
        <button type="button" onClick={() => useStudioUi.getState().setShortcutsOpen(true)} aria-label={t('tool.shortcuts')} title={t('tool.shortcuts')}
          className={cn('flex h-11 w-11 items-center justify-center rounded-lg hover:bg-muted', !hasFeature(mode, 'grid') && 'mt-auto')}>
          <Keyboard className="h-5 w-5" />
        </button>
      )}
      <input ref={importRef} type="file" accept=".svg,.dxf,.pdf,.ai,image/svg+xml,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void importVectorFile(f); e.target.value = ''; }} />
    </nav>
  );
}
