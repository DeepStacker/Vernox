/**
 * Floating bar over the canvas while drawing or editing points: a one-line hint plus the
 * buttons that keyboard users get from Enter / Backspace / Esc, so phones and tablets can do
 * everything by touch.
 */
import { Check, Spline, Trash2, Undo2, X } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { t } from '@/lib/studio/i18n';
import { cancelDrawing, deleteSelectedNode, exitNodeEdit, finishPen, setDrawTool, toggleSelectedNodeType, undoPenPoint } from '../drawActions';
import { useDrawStore } from '../drawStore';

const btn = 'inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-40';

export function DrawToolbar() {
  const tool = useDrawStore(s => s.tool);
  const penPoints = useDrawStore(s => s.pen.nodes.length);
  const smoothing = useDrawStore(s => s.smoothing);
  const nodeEdit = useDrawStore(s => s.nodeEdit);
  if (tool === 'select' && !nodeEdit) return null;

  return (
    <div role="toolbar" aria-label={t('tool.draw')} className="absolute left-1/2 top-2 z-10 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center gap-1 rounded-lg border border-border bg-card/95 px-2 py-1 shadow-md">
      {nodeEdit ? (
        <>
          <span className="hidden px-1 text-xs text-muted-foreground md:inline">{t('draw.nodes.hint')}</span>
          <button type="button" className={btn} disabled={!nodeEdit.selected} onClick={toggleSelectedNodeType}><Spline className="h-4 w-4" />{t('draw.nodes.toggle')}</button>
          <button type="button" className={btn} disabled={!nodeEdit.selected} onClick={deleteSelectedNode}><Trash2 className="h-4 w-4" />{t('draw.nodes.delete')}</button>
          <button type="button" className={`${btn} font-medium`} onClick={exitNodeEdit}><Check className="h-4 w-4" />{t('draw.done')}</button>
        </>
      ) : tool === 'pen' ? (
        <>
          <span className="hidden px-1 text-xs text-muted-foreground md:inline">{t('draw.pen.hint')}</span>
          <button type="button" className={btn} disabled={penPoints === 0} onClick={undoPenPoint}><Undo2 className="h-4 w-4" />{t('draw.undoPoint')}</button>
          <button type="button" className={btn} disabled={penPoints < 2} onClick={finishPen}><Check className="h-4 w-4" />{t('draw.finish')}</button>
          <button type="button" className={btn} onClick={cancelDrawing} aria-label={t('draw.cancel')}><X className="h-4 w-4" /><span className="hidden sm:inline">{t('draw.cancel')}</span></button>
        </>
      ) : (
        <>
          <span className="hidden px-1 text-xs text-muted-foreground md:inline">{t('draw.pencil.hint')}</span>
          <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            {t('draw.smoothing')}
            <Slider className="w-24" min={0} max={100} step={5} value={[smoothing]} onValueChange={([v]) => useDrawStore.getState().setSmoothing(v)} aria-label={t('draw.smoothing')} />
          </label>
          <button type="button" className={`${btn} font-medium`} onClick={() => setDrawTool('select')}><Check className="h-4 w-4" />{t('draw.done')}</button>
        </>
      )}
    </div>
  );
}
