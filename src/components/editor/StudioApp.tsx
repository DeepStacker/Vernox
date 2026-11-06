/**
 * The studio shell: Start → Design → Review, Simple/Pro mode, desktop and mobile layouts.
 * Engine services (shaping, analysis worker, autosave) run from hooks here; the canvas is
 * a lazy chunk so the start screen loads without Konva.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Redo2, Save, Table2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from 'zustand';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { saveProject } from '@/lib/projectStorage';
import { t } from '@/lib/studio/i18n';
import { createText } from '@/lib/studio/document';
import { hasFeature } from '@/lib/studio/modes';
import { redo, undo, useStudio } from '@/lib/studio/store';
import { getTemplate } from '@/lib/studio/templates/registry';
import { cn } from '@/lib/utils';
import { importVectorFile, startBlank, startFromTemplate } from './actions';
import { BatchStep } from './batch/BatchStep';
import { BottomBar } from './BottomBar';
import { Inspector, InspectorBody } from './Inspector';
import { ReviewStep } from './ReviewStep';
import { ShortcutsDialog } from './ShortcutsDialog';
import { StartStep } from './StartStep';
import { STUDIO_SHORTCUTS } from './shortcuts';
import { ToolRail } from './ToolRail';
import { TraceDialog } from './TraceDialog';
import { useStudioUi, type StudioStep } from './uiStore';
import { useAddToCart } from './useAddToCart';
import { useAutosave, useCutRules, useGeometryAnalysis, useStudioContext, useTextOutlines } from './useStudioRuntime';

const StudioCanvas = lazy(() => import('./canvas/StudioCanvas'));

const STEPS: StudioStep[] = ['start', 'design', 'review'];

function UndoRedo() {
  const canUndo = useStore(useStudio.temporal, s => s.pastStates.length > 0);
  const canRedo = useStore(useStudio.temporal, s => s.futureStates.length > 0);
  return (
    <div className="flex items-center">
      <button type="button" onClick={undo} disabled={!canUndo} aria-label={t('tool.undo')} title={t('tool.undo')} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
      <button type="button" onClick={redo} disabled={!canRedo} aria-label={t('tool.redo')} title={t('tool.redo')} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>
    </div>
  );
}

function Header() {
  const step = useStudioUi(s => s.step);
  const mode = useStudioUi(s => s.mode);
  const setStep = useStudioUi(s => s.setStep);
  const setMode = useStudioUi(s => s.setMode);
  const save = () => {
    const doc = useStudio.getState().doc;
    try {
      saveProject(doc.name || getTemplate(doc.template?.id ?? '')?.name || 'My design', doc, doc.id);
      toast.success('Saved');
    } catch {
      toast.error(t('error.storage'));
    }
  };
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-2 sm:px-3">
      <Link to="/shop" className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted" aria-label="Back to shop"><ArrowLeft className="h-4 w-4" /></Link>
      <nav aria-label="Steps" className="flex items-center gap-1 text-sm">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            disabled={s !== 'start' && step === 'start'}
            onClick={() => setStep(s)}
            aria-current={step === s ? 'step' : undefined}
            className={cn('rounded-md px-2 py-1 disabled:opacity-40', step === s ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            <span className={cn('text-xs text-muted-foreground', step === s && 'mr-1')}>{i + 1}</span>
            <span className={cn(step !== s && 'hidden sm:inline', 'sm:ml-1')}>{t(`step.${s}`)}</span>
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-1">
        {step !== 'start' && (
          <button type="button" onClick={() => setStep(step === 'batch' ? 'design' : 'batch')} aria-pressed={step === 'batch'} aria-label={t('step.batch')} title={t('step.batch')}
            className={cn('flex h-9 items-center gap-1 rounded-md px-2 text-sm hover:bg-muted', step === 'batch' && 'bg-muted font-semibold')}>
            <Table2 className="h-4 w-4" /><span className="hidden sm:inline">{t('step.batch')}</span>
          </button>
        )}
        {(step === 'design' || step === 'review') && <UndoRedo />}
        {step !== 'start' && <button type="button" onClick={save} aria-label="Save design" title="Save design" className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"><Save className="h-4 w-4" /></button>}
        <div role="radiogroup" aria-label="Mode" className="flex rounded-full border border-border p-0.5 text-xs">
          {(['simple', 'pro'] as const).map(m => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
              className={cn('rounded-full px-2 py-1 sm:px-3', mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
              {t(`mode.${m}`)}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

/** `/studio?template=…&text=…&finish=…&w=…&h=…` (used by "Customise this design" links). */
function useDeepLink() {
  const [params] = useSearchParams();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const template = params.get('template');
    const text = params.get('text')?.slice(0, 200);
    const finish = params.get('finish') ?? undefined;
    const w = Number(params.get('w')) || undefined;
    const h = Number(params.get('h')) || undefined;
    if (template && getTemplate(template)) {
      const first = getTemplate(template)?.fields[0]?.key;
      void startFromTemplate(template, text && first ? { [first]: text } : {}, { finish, widthMm: w, heightMm: h });
    } else if (text || finish || w || h) {
      startBlank({ ...(w ? { widthMm: w } : {}), ...(h ? { heightMm: h } : {}) }, finish);
      if (text) {
        const d = useStudio.getState().doc;
        useStudio.getState().addObjects([createText({ text, x: d.plate.widthMm / 2, y: d.plate.heightMm / 2, sizeMm: Math.round(d.plate.heightMm * 0.2) })], false);
      }
    }
  }, [params]);
}

export function StudioApp() {
  const step = useStudioUi(s => s.step);
  const mode = useStudioUi(s => s.mode);
  const panel = useStudioUi(s => s.panel);
  const hasSelection = useStudio(s => s.selection.length > 0);
  const isMobile = useIsMobile();
  const ctx = useStudioContext();
  const rules = useCutRules(ctx);
  const pricedFinishes = useMemo(() => Object.keys(ctx.rates), [ctx.rates]);
  const { addToCart, adding } = useAddToCart(ctx);

  useDeepLink();
  useTextOutlines();
  useGeometryAnalysis(ctx);
  useAutosave(step !== 'start');
  useKeyboardShortcuts(STUDIO_SHORTCUTS, step === 'design');

  const onDrop = useCallback((e: React.DragEvent) => {
    const file = e.dataTransfer.files[0];
    if (!file) return;
    e.preventDefault();
    if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') useStudioUi.getState().openTrace(file);
    else if (/\.(svg|dxf)$/i.test(file.name)) void importVectorFile(file);
  }, []);

  const designPrimary = isMobile
    ? { label: t('bar.next'), run: () => useStudioUi.getState().setStep('review') }
    : { label: t('bar.addToCart'), run: () => void addToCart(1) };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background" onDragOver={e => e.preventDefault()} onDrop={onDrop}>
      <Header />
      {step === 'start' && <StartStep />}
      {step === 'design' && (
        <>
          <div className="flex min-h-0 flex-1">
            {!isMobile && <ToolRail />}
            <main className="relative min-w-0 flex-1">
              <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
                <StudioCanvas showRulers={!isMobile && hasFeature(mode, 'rulers')} />
              </Suspense>
              {isMobile && hasSelection && panel === null && (
                <button type="button" onClick={() => useStudioUi.getState().setPanel('inspect')} className="btn-primary absolute bottom-3 right-3 h-11 gap-1.5 rounded-full px-4 text-sm shadow-lg">
                  <Pencil className="h-4 w-4" /> Edit
                </button>
              )}
            </main>
            {!isMobile && <Inspector pricedFinishes={pricedFinishes} />}
          </div>
          {isMobile && <ToolRail orientation="horizontal" />}
          <BottomBar ctx={ctx} rules={rules} primaryLabel={designPrimary.label} onPrimary={designPrimary.run} busy={adding}>
            {!isMobile && <button type="button" className="btn-secondary h-10 px-3 text-sm" onClick={() => useStudioUi.getState().setStep('review')}>{t('bar.next')}</button>}
          </BottomBar>
          {isMobile && (
            <Drawer open={panel !== null} onOpenChange={o => !o && useStudioUi.getState().setPanel(null)}>
              <DrawerContent className="max-h-[80dvh]">
                <DrawerTitle className="sr-only">{t('tool.plate')}</DrawerTitle>
                <DrawerDescription className="sr-only">Edit the selected item or the plate.</DrawerDescription>
                <div className="overflow-y-auto pb-6"><InspectorBody pricedFinishes={pricedFinishes} /></div>
              </DrawerContent>
            </Drawer>
          )}
        </>
      )}
      {step === 'batch' && <BatchStep ctx={ctx} />}
      {step === 'review' && <ReviewStep ctx={ctx} rules={rules} pricedFinishes={pricedFinishes} />}
      <TraceDialog />
      <ShortcutsDialog />
    </div>
  );
}
