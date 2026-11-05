import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import { formatSizeCm, type FinishId, type Product, type ProductSize } from '@/lib/catalog';
import { trackWallPreview, type EventData } from '@/lib/wallPreview/analytics';
import { isRoundShape, outlineForProduct } from '@/lib/wallPreview/outline';
import type { Outline } from '@/lib/wallPreview/types';
import { cn } from '@/lib/utils';
import { Chip, FinishChips, SizeChips } from './controls';
import { ArPanel } from './ArPanel';
import { FitPanel } from './FitPanel';
import { RoomScenes } from './RoomScenes';
import { YourWall } from './YourWall';
import type { WallCanvasHandle } from './WallCanvas';

export type WallPreviewProps = {
  finish: FinishId;
  /** Where the preview is mounted; recorded with the opened event. Defaults to pdp for products, studio for outlines. */
  source?: 'pdp' | 'studio';
  /** Called when the customer taps "Choose this size" after trying another size in the preview. */
  onChooseSize?: (size: ProductSize) => void;
  /** Called when the customer picks another finish inside the preview. */
  onFinishChange?: (finish: FinishId) => void;
  /** Finishes offered in the preview; defaults to the product's. Needed for outline previews to allow switching. */
  finishes?: FinishId[];
  className?: string;
} & (
  | { product: Product; size: ProductSize; outline?: undefined }
  | { outline: Outline; product?: undefined; size?: undefined }
);

type Tab = 'rooms' | 'wall' | 'ar';
const TABS: { id: Tab; label: string }[] = [
  { id: 'rooms', label: 'Rooms' },
  { id: 'wall', label: 'Your wall' },
  { id: 'ar', label: '3D & AR' },
];

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function WallPreviewImpl(props: WallPreviewProps) {
  const { product, outline: outlineProp, onChooseSize, onFinishChange, className } = props;
  const sizes = product?.sizes ?? [];
  const propIndex = product ? Math.max(0, sizes.findIndex(s => s.widthMm === props.size!.widthMm && s.heightMm === props.size!.heightMm)) : -1;
  const [sizeIndex, setSizeIndex] = useState(propIndex);
  const [finish, setFinish] = useState<string>(props.finish);
  const [tab, setTab] = useState<Tab>('rooms');
  const [showFit, setShowFit] = useState(false);
  const [notice, setNotice] = useState('');
  const handleRef = useRef<WallCanvasHandle | null>(null);
  const [hasCanvas, setHasCanvas] = useState(false);
  const canvasRef = useCallback((h: WallCanvasHandle | null) => {
    handleRef.current = h;
    setHasCanvas(!!h);
  }, []);

  useEffect(() => setSizeIndex(propIndex), [propIndex]);
  useEffect(() => setFinish(props.finish), [props.finish]);

  const activeSize = product ? sizes[sizeIndex] : undefined;
  const outline = useMemo(
    () => (product ? outlineForProduct(product, activeSize!) : outlineProp!),
    [product, activeSize, outlineProp],
  );
  const eventData: EventData = useMemo(
    () => ({
      productId: product?.id ?? 'custom-design',
      size: activeSize ? formatSizeCm(activeSize) : `${Math.round(outline.widthMm / 10)} × ${Math.round(outline.heightMm / 10)} cm`,
      finish,
    }),
    [product, activeSize, outline, finish],
  );

  useEffect(() => {
    trackWallPreview('wall_preview_opened', { productId: eventData.productId, source: props.source ?? (product ? 'pdp' : 'studio') });
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeSize = (i: number) => {
    setSizeIndex(i);
    trackWallPreview('size_changed_in_preview', { productId: eventData.productId, size: formatSizeCm(sizes[i]), finish });
  };

  const finishes = (props.finishes ?? product?.finishes ?? [props.finish]) as string[];
  const round = product ? isRoundShape(product.shapeId) : false;
  const shareUrl = product && typeof window !== 'undefined'
    ? `${window.location.origin}/product/${product.slug}?size=${encodeURIComponent(activeSize!.label)}&finish=${finish}`
    : undefined;

  const filename = `vernox-${product?.slug ?? 'design'}-${eventData.size}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.png';

  const render = async () => handleRef.current?.exportPng() ?? null;
  const save = async () => {
    const blob = await render();
    if (!blob) return;
    downloadBlob(blob, filename);
    trackWallPreview('preview_saved', eventData);
  };
  const share = async () => {
    const blob = await render();
    if (!blob) return;
    const file = new File([blob], filename, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: product?.name ?? 'My Vernox design', text: 'How it looks on my wall' });
        trackWallPreview('preview_shared', { ...eventData, via: 'web-share' });
        return;
      }
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return;
    }
    downloadBlob(blob, filename);
    trackWallPreview('preview_shared', { ...eventData, via: 'download' });
    setNotice('Image saved. Share it from your gallery.');
  };

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex(t => t.id === tab);
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    setTab(TABS[(next + TABS.length) % TABS.length].id);
  };

  return (
    <section aria-label="View on your wall" className={cn('space-y-4', className)}>
      <div role="tablist" aria-label="Preview mode" onKeyDown={onTabKey} className="grid grid-cols-3 rounded-full border border-border bg-card p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`wp-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`wp-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className={cn(
              'min-h-10 rounded-full text-sm transition-colors duration-200 motion-reduce:transition-none',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burgundy',
              tab === t.id ? 'bg-burgundy text-cream' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`wp-panel-${tab}`} aria-labelledby={`wp-tab-${tab}`} className="space-y-4 animate-in fade-in duration-300 motion-reduce:animate-none">
        {tab === 'rooms' && <RoomScenes outline={outline} finish={finish} sizes={sizes} sizeIndex={sizeIndex} round={round} eventData={eventData} canvasRef={canvasRef} />}
        {tab === 'wall' && <YourWall outline={outline} finish={finish} eventData={eventData} canvasRef={canvasRef} />}
        {tab === 'ar' && (
          <ArPanel
            outline={outline}
            finish={finish}
            round={round}
            cacheKey={`${product?.id ?? 'custom'}|${activeSize?.label ?? `${outline.widthMm}x${outline.heightMm}`}|${finish}|${outline.svgPath.length}`}
            alt={`${product?.name ?? 'Your design'} in ${finish.replace(/_/g, ' ')}, ${eventData.size}`}
            shareUrl={shareUrl}
            eventData={eventData}
          />
        )}
      </div>

      {sizes.length > 1 && <SizeChips sizes={sizes} index={sizeIndex} onChange={changeSize} />}
      {finishes.length > 1 && (
        <FinishChips finishes={finishes} value={finish} onChange={f => { setFinish(f); onFinishChange?.(f as FinishId); }} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {product && onChooseSize && sizeIndex !== propIndex && (
          <button type="button" onClick={() => onChooseSize(activeSize!)} className="min-h-11 rounded-full bg-burgundy px-5 text-sm font-medium text-cream">
            Choose {formatSizeCm(activeSize!)}
          </button>
        )}
        {tab !== 'ar' && sizes.length > 1 && <Chip active={showFit} onClick={() => setShowFit(v => !v)}>Will it fit?</Chip>}
        {tab !== 'ar' && (
          <>
            <Chip onClick={save} label="Save image" ><Download className="mr-1.5 inline h-4 w-4" />Save</Chip>
            <Chip onClick={share} label="Share image"><Share2 className="mr-1.5 inline h-4 w-4" />Share</Chip>
          </>
        )}
      </div>
      {tab !== 'ar' && !hasCanvas && <p className="sr-only">Save and share are available once your wall is set up.</p>}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      {showFit && tab !== 'ar' && sizes.length > 1 && <FitPanel sizes={sizes} sizeIndex={sizeIndex} onPick={changeSize} eventData={eventData} />}
      <p className="text-xs text-muted-foreground">Shown to scale, approximately. Colours and light vary by screen and room.</p>
    </section>
  );
}
