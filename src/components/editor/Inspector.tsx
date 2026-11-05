import { X } from 'lucide-react';
import { t, type MessageKey } from '@/lib/studio/i18n';
import { useStudio } from '@/lib/studio/store';
import { LayersPanel } from './panels/LayersPanel';
import { ObjectPanel } from './panels/ObjectPanel';
import { PlatePanel } from './panels/PlatePanel';
import { ShapesPanel } from './panels/ShapesPanel';
import { TemplatesGrid } from './panels/TemplatesPanel';
import { useStudioUi, type Panel } from './uiStore';

const TITLES: Partial<Record<NonNullable<Panel>, MessageKey>> = {
  templates: 'tool.templates',
  shape: 'tool.shape',
  plate: 'tool.plate',
  layers: 'tool.layers',
};

/**
 * Contextual right panel: an explicitly opened tool panel, else the selection's properties,
 * else the plate & material settings.
 */
export function InspectorBody({ pricedFinishes }: { pricedFinishes: string[] }) {
  const panel = useStudioUi(s => s.panel);
  const hasSelection = useStudio(s => s.selection.length > 0);
  if (panel === 'templates') return <TemplatesGrid className="p-4" />;
  if (panel === 'shape') return <ShapesPanel />;
  if (panel === 'layers') return <LayersPanel />;
  if (panel === 'plate') return <PlatePanel pricedFinishes={pricedFinishes} />;
  return hasSelection ? <ObjectPanel /> : <PlatePanel pricedFinishes={pricedFinishes} />;
}

export function Inspector({ pricedFinishes }: { pricedFinishes: string[] }) {
  const panel = useStudioUi(s => s.panel);
  const setPanel = useStudioUi(s => s.setPanel);
  const title = panel ? TITLES[panel] : undefined;
  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-card" aria-label="Properties">
      {title && (
        <div className="flex h-11 items-center justify-between border-b border-border px-4 text-sm font-medium">
          {t(title)}
          <button type="button" aria-label="Close" onClick={() => setPanel(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
      )}
      <InspectorBody pricedFinishes={pricedFinishes} />
    </aside>
  );
}
