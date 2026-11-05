import { useRef } from 'react';
import { FileUp, Grid3x3, Keyboard, Layers, LayoutTemplate, MousePointer2, Shapes, Square, Type, Upload, type LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { t, type MessageKey } from '@/lib/studio/i18n';
import { hasFeature, toolsFor, type ToolId } from '@/lib/studio/modes';
import { useStudio } from '@/lib/studio/store';
import { cn } from '@/lib/utils';
import { addTextObject, importVectorFile } from './actions';
import { useStudioUi, type Panel } from './uiStore';

const TOOL_META: Record<ToolId, { icon: LucideIcon; label: MessageKey; panel?: Panel }> = {
  select: { icon: MousePointer2, label: 'tool.select' },
  templates: { icon: LayoutTemplate, label: 'tool.templates', panel: 'templates' },
  text: { icon: Type, label: 'tool.text' },
  shape: { icon: Shapes, label: 'tool.shape', panel: 'shape' },
  upload: { icon: Upload, label: 'tool.upload' },
  import: { icon: FileUp, label: 'tool.import' },
  plate: { icon: Square, label: 'tool.plate', panel: 'plate' },
  layers: { icon: Layers, label: 'tool.layers', panel: 'layers' },
};

/** Left rail (desktop) / bottom row (mobile) of icon tools, driven by the mode's tool list. */
export function ToolRail({ orientation = 'vertical' }: { orientation?: 'vertical' | 'horizontal' }) {
  const mode = useStudioUi(s => s.mode);
  const panel = useStudioUi(s => s.panel);
  const showGrid = useStudioUi(s => s.showGrid);
  const importRef = useRef<HTMLInputElement>(null);

  const run = (id: ToolId) => {
    const ui = useStudioUi.getState();
    const meta = TOOL_META[id];
    if (id === 'select') { useStudio.getState().select([]); ui.setPanel(null); return; }
    if (id === 'text') { addTextObject(); ui.setPanel('inspect'); return; }
    if (id === 'upload') { ui.openTrace(); return; }
    if (id === 'import') { importRef.current?.click(); return; }
    ui.setPanel(panel === meta.panel ? null : meta.panel ?? null);
  };

  const horizontal = orientation === 'horizontal';
  return (
    <nav
      aria-label="Tools"
      className={cn('flex shrink-0 gap-1 bg-card', horizontal ? 'w-full justify-around border-t border-border px-1 py-1' : 'w-14 flex-col items-center border-r border-border py-2')}
    >
      {toolsFor(mode).map(id => {
        const meta = TOOL_META[id];
        const Icon = meta.icon;
        const active = Boolean(meta.panel && panel === meta.panel);
        return (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => run(id)}
                aria-label={t(meta.label)}
                aria-pressed={active}
                className={cn('flex h-11 w-11 items-center justify-center rounded-lg transition-colors', active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted')}
              >
                <Icon className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side={horizontal ? 'top' : 'right'}>{t(meta.label)}</TooltipContent>
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
      <input ref={importRef} type="file" accept=".svg,.dxf,image/svg+xml" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void importVectorFile(f); e.target.value = ''; }} />
    </nav>
  );
}
