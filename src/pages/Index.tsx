import { safeLocal } from '@/lib/safeStorage';
import { useState, useCallback, useEffect } from 'react';
import { EditorProvider } from '@/components/editor/EditorContext';
import { useEditor } from '@/hooks/useEditor';
import { ShapePanel } from '@/components/editor/ShapePanel';
import { DesignCanvas } from '@/components/editor/DesignCanvas';
import { ToolsPanel } from '@/components/editor/ToolsPanel';
import { TopBar } from '@/components/editor/TopBar';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Square, Layers, Settings2, Wand2, Activity, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StudioOpeningAnimation } from '@/components/editor/StudioOpeningAnimation';
import { cn } from '@/lib/utils';

function EditorLayout() {
  const { state, dispatch, addImage } = useEditor();
  const isMobile = useIsMobile();
  const [mobilePanel, setMobilePanel] = useState<'shape' | 'tools' | 'layers' | 'properties' | 'cam' | null>(null);
  useKeyboardShortcuts(dispatch, state.selectedLayerId);

  // Load custom inspection project if clicked by admin
  useEffect(() => {
    const inspectJson = safeLocal.get('vernox-custom-inspect');
    if (inspectJson) {
      try {
        const parsed = JSON.parse(inspectJson);
        dispatch({ type: 'LOAD_PROJECT', state: parsed });
      } catch (e) {
        console.error('Failed to parse inspection design project', e);
      }
      safeLocal.remove('vernox-custom-inspect');
    }
  }, [dispatch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!state.selectedLayerId) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      if (!arrows.includes(e.key)) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const layer = state.layers.find(l => l.id === state.selectedLayerId);
      if (!layer) return;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      dispatch({ type: 'UPDATE_LAYER', id: layer.id, updates: { x: layer.x + dx, y: layer.y + dy } });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.layers, state.selectedLayerId, dispatch]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      window.dispatchEvent(new CustomEvent('vernox:open-tracer', { detail: { file: files[0] } }));
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  return (
    <div
      className="h-screen flex flex-col overflow-hidden bg-background relative"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Studio Opening Calibration & Aperture Reveal Animation */}
      <StudioOpeningAnimation />

      <TopBar />
      <div className="flex flex-1 overflow-hidden relative min-w-0">
        {/* Desktop Sidebars */}
        {!isMobile && <ShapePanel />}
        
        <DesignCanvas />
        
        {!isMobile && <ToolsPanel />}

        {/* Mobile Luxury Crafting Dock */}
        {isMobile && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1 bg-background/95 backdrop-blur-xl border border-border/80 rounded-2xl shadow-2xl z-50 max-w-[94vw]">
            <button
              type="button"
              onClick={() => setMobilePanel('shape')}
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-2.5 rounded-xl text-[10px] font-medium transition-all cursor-pointer min-w-[54px]",
                mobilePanel === 'shape'
                  ? "bg-burgundy text-cream shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Square className="w-4 h-4 mb-0.5" />
              <span>Plate</span>
            </button>

            <button
              type="button"
              onClick={() => setMobilePanel('tools')}
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-2.5 rounded-xl text-[10px] font-medium transition-all cursor-pointer min-w-[54px]",
                mobilePanel === 'tools'
                  ? "bg-burgundy text-cream shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Wand2 className="w-4 h-4 mb-0.5 text-dusty-pink" />
              <span>Tools</span>
            </button>

            <button
              type="button"
              onClick={() => setMobilePanel('layers')}
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-2.5 rounded-xl text-[10px] font-medium transition-all cursor-pointer min-w-[54px]",
                mobilePanel === 'layers'
                  ? "bg-burgundy text-cream shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Layers className="w-4 h-4 mb-0.5" />
              <span>Layers</span>
            </button>

            <button
              type="button"
              onClick={() => setMobilePanel('properties')}
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-2.5 rounded-xl text-[10px] font-medium transition-all cursor-pointer min-w-[54px]",
                mobilePanel === 'properties'
                  ? "bg-burgundy text-cream shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Settings2 className="w-4 h-4 mb-0.5" />
              <span>Inspect</span>
            </button>

            <button
              type="button"
              onClick={() => setMobilePanel('cam')}
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-2.5 rounded-xl text-[10px] font-medium transition-all cursor-pointer min-w-[54px] relative",
                mobilePanel === 'cam'
                  ? "bg-burgundy text-cream shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Activity className="w-4 h-4 mb-0.5" />
              <span>CAM</span>
            </button>
          </div>
        )}

        {/* Mobile Bottom Sheets */}
        {isMobile && (
          <>
            {/* 1. Shape & Material Library Bottom Sheet */}
            <Sheet open={mobilePanel === 'shape'} onOpenChange={(open) => !open && setMobilePanel(null)}>
              <SheetContent side="bottom" className="p-0 h-[85vh] max-h-[85dvh] rounded-t-2xl overflow-hidden flex flex-col bg-card border-border">
                <div className="flex items-center justify-between p-3 border-b border-border/80 bg-muted/20 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Square className="w-4 h-4 text-burgundy" />
                    <SheetTitle className="text-xs font-semibold uppercase tracking-wider text-dark-brown font-brand m-0">
                      Plate Geometry & Materials
                    </SheetTitle>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => setMobilePanel(null)} className="h-7 w-7 text-muted-foreground">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <SheetDescription className="sr-only">
                  Select workpiece plate shape, customize millimeter dimensions and corner radiuses, and configure architectural metal finishes.
                </SheetDescription>
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  <ShapePanel />
                </div>
              </SheetContent>
            </Sheet>

            {/* 2. Tools, Layers, Inspect, CAM Bottom Sheet */}
            <Sheet open={mobilePanel !== null && mobilePanel !== 'shape'} onOpenChange={(open) => !open && setMobilePanel(null)}>
              <SheetContent side="bottom" className="p-0 h-[85vh] max-h-[85dvh] rounded-t-2xl overflow-hidden flex flex-col bg-card border-border">
                <SheetTitle className="sr-only">
                  CAD Vector Features, Layers Hierarchy, Inspection, and CAM Manufacturing Rules
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Vectorize logos with Freehand Lasso or Normal Box Crop, insert laser stencil typography, add standoff mounting holes, and validate CNC toolpath kerfs.
                </SheetDescription>
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  <ToolsPanel
                    initialTab={mobilePanel !== 'shape' && mobilePanel ? mobilePanel : 'tools'}
                    onClose={() => setMobilePanel(null)}
                    className="border-none w-full h-full min-h-0 flex-1"
                  />
                </div>
              </SheetContent>
            </Sheet>
          </>
        )}
      </div>
    </div>
  );
}

const Index = () => {
  return (
    <EditorProvider>
      <EditorLayout />
    </EditorProvider>
  );
};

export default Index;
