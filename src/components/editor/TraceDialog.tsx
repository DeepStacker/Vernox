/**
 * Upload → trace → clean up → place. Decoding/downscaling and tracing run off the main
 * thread; a newer slider value cancels the running trace. Object URLs, the bitmap and the
 * worker are released when the dialog closes.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { centrePathData } from '@/lib/studio/geometry/path';
import { t } from '@/lib/studio/i18n';
import { DEFAULT_TRACE_OPTIONS, type TraceOptions, type TraceResult } from '@/lib/studio/trace/options';
import { decodeForTrace, TraceCancelled, Tracer } from '@/lib/studio/trace/traceClient';
import { useStudioUi } from './uiStore';
import { placePath } from './actions';

const TRACE_DEBOUNCE_MS = 150;

export function TraceDialog() {
  const open = useStudioUi(s => s.traceOpen);
  const initialFile = useStudioUi(s => s.traceFile);
  const close = useStudioUi(s => s.closeTrace);
  const [file, setFile] = useState<File | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [options, setOptions] = useState<TraceOptions>(DEFAULT_TRACE_OPTIONS);
  const [result, setResult] = useState<TraceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tracer = useRef<Tracer | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) setFile(initialFile); }, [open, initialFile]);

  // Decode the chosen file (off-thread resize) and keep an object URL for the faint backdrop.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setError(null);
    decodeForTrace(file)
      .then(b => { if (cancelled) b.close(); else setBitmap(b); })
      .catch(() => setError(t('trace.failed')));
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
      setBitmap(prev => { prev?.close(); return null; });
      setResult(null);
    };
  }, [file]);

  useEffect(() => {
    if (!bitmap) return;
    const timer = window.setTimeout(() => {
      tracer.current ??= new Tracer();
      setBusy(true);
      tracer.current.trace(bitmap, options)
        .then(r => { setResult(r); setError(r.bounds ? null : t('trace.failed')); setBusy(false); })
        .catch(err => { if (!(err instanceof TraceCancelled)) { setError(t('trace.failed')); setBusy(false); } });
    }, TRACE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [bitmap, options]);

  useEffect(() => {
    if (open) return;
    tracer.current?.dispose();
    tracer.current = null;
    setFile(null);
    setOptions(DEFAULT_TRACE_OPTIONS);
  }, [open]);

  const place = () => {
    if (!result?.d) return;
    const c = centrePathData(result.d);
    placePath(c.d, c.width, c.height, 'trace', file?.name);
    close();
  };

  const set = (patch: Partial<TraceOptions>) => setOptions(o => ({ ...o, ...patch }));

  return (
    <Dialog open={open} onOpenChange={o => !o && close()}>
      <DialogContent className="max-w-3xl gap-4 p-4 sm:p-6">
        <DialogTitle>{t('trace.title')}</DialogTitle>
        <DialogDescription className="sr-only">Upload an image, adjust the tracing and place it on the plate.</DialogDescription>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        {!file ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) setFile(f); }}
            className="flex h-56 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-primary"
          >
            <Upload className="h-6 w-6" />
            <span className="text-sm">PNG, JPG or WebP</span>
          </button>
        ) : (
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-muted">
              {previewUrl && <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full object-contain opacity-20" />}
              {result?.d && (
                <svg viewBox={`0 0 ${result.width} ${result.height}`} className="relative h-full w-full" aria-label="Traced outline">
                  <path d={result.d} fill="hsl(var(--foreground))" fillRule="evenodd" />
                </svg>
              )}
              {busy && <Loader2 className="absolute right-3 top-3 h-5 w-5 animate-spin text-primary" aria-label={t('trace.working')} />}
            </div>
            <div className="flex flex-col gap-4 text-sm">
              <label className="flex flex-col gap-2">
                <span className="flex items-center justify-between">{t('trace.threshold')}
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">Auto <Switch checked={options.threshold === null} onCheckedChange={auto => set({ threshold: auto ? null : result?.threshold ?? 128 })} /></span>
                </span>
                <Slider disabled={options.threshold === null} min={1} max={254} step={1} value={[options.threshold ?? result?.threshold ?? 128]} onValueChange={([v]) => set({ threshold: v })} />
              </label>
              <label className="flex flex-col gap-2">{t('trace.smooth')}
                <Slider min={0} max={1} step={0.05} value={[options.smoothing]} onValueChange={([v]) => set({ smoothing: v })} />
              </label>
              <label className="flex flex-col gap-2">{t('trace.despeckle')}
                <Slider min={0} max={400} step={4} value={[options.despeckle]} onValueChange={([v]) => set({ despeckle: v })} />
              </label>
              <label className="flex items-center justify-between">{t('trace.invert')}
                <Switch checked={options.invert} onCheckedChange={invert => set({ invert })} />
              </label>
              {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
              <div className="mt-auto flex gap-2">
                <button type="button" className="btn-secondary h-10 flex-1 text-sm" onClick={() => inputRef.current?.click()}>Change</button>
                <button type="button" className="btn-primary h-10 flex-1 text-sm" disabled={!result?.bounds} onClick={place}>{t('trace.place')}</button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
