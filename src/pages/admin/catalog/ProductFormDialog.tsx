import { useEffect, useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { categories, finishName, ROOMS, THEMES, type Product } from '@/lib/catalog';
import { uploadProductImage } from '@/lib/data/productImages';
import { shapeDefinitions } from '@/lib/shapes';
import { ChipSelect } from './ChipSelect';
import {
  buildProduct, draftFromProduct, emptyDraft, FINISH_IDS, INDOOR_OUTDOOR, parseDraft, type ProductDraft,
} from './productForm';
import { SizesEditor } from './SizesEditor';

interface Props {
  open: boolean;
  /** Product being edited; null creates a new one. */
  product: Product | null;
  /** Prefills a NEW product from an existing one (duplicate); ignored when editing. */
  template?: Product | null;
  currency: string;
  gstRatePercent: number;
  newId: () => string;
  onClose: () => void;
  onSave: (product: Product) => Promise<boolean>;
}

const field = 'min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-oxblood';
const slugify = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {error && <span role="alert" className="block text-xs text-destructive">{error}</span>}
    </label>
  );
}

function ImageField({ label, value, error, folder, onChange }: { label: string; value: string; error?: string; folder: string; onChange: (v: string) => void }) {
  const [broken, setBroken] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => setBroken(false), [value]);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      onChange(await uploadProductImage(folder, file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The photo could not be uploaded.');
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Field label={label} error={error} hint="Upload a photo (resized to 2000 px WebP) or paste an image URL.">
            <input value={value} onChange={e => onChange(e.target.value)} placeholder="https://…" className={field} />
          </Field>
        </div>
        {/* Sibling of Field, not inside it: Field is itself a <label>. */}
        <label className={`btn-secondary mt-5 shrink-0 cursor-pointer ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
          <Upload className="h-4 w-4" aria-hidden />{uploading ? 'Uploading…' : 'Upload'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading}
            aria-label={`Upload ${label.toLowerCase()}`} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </div>
      {value.trim() && !error && (
        broken
          ? <p className="text-xs text-destructive">This image could not be loaded.</p>
          : <img src={value.trim()} alt="" onError={() => setBroken(true)} className="h-24 w-24 rounded-lg border border-border object-cover" />
      )}
    </div>
  );
}

export function ProductFormDialog({ open, product, template, currency, gstRatePercent, newId, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  // A new product's id is fixed when the dialog opens, so photos uploaded before saving land in its folder.
  const [newProductId, setNewProductId] = useState(newId);

  useEffect(() => {
    if (!open) return;
    if (!product) setNewProductId(newId());
    setDraft(product ? draftFromProduct(product) : template ? { ...draftFromProduct(template), name: `${template.name} copy`, slug: `${template.slug}-copy` } : emptyDraft());
    setErrors({});
    setSlugTouched(Boolean(product));
  }, [open, product, template, newId]);

  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => setDraft(prev => ({ ...prev, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = parseDraft(draft);
    if ('errors' in result) {
      setErrors(result.errors);
      toast.error('Fix the highlighted fields before saving.');
      return;
    }
    setErrors({});
    setSaving(true);
    const saved = await onSave(buildProduct(result.fields, product ?? { id: newProductId }, Date.now()));
    setSaving(false);
    if (saved) onClose();
  };

  const finishOptions = [...new Set([...FINISH_IDS, ...draft.finishes])].map(id => ({ id, label: finishName(id) }));

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{product ? `Edit ${product.name}` : 'New product'}</DialogTitle>
          <DialogDescription>Prices are in rupees and exclude GST. The checkout charges the price plus the size difference.</DialogDescription>
        </DialogHeader>
        <form onSubmit={e => void submit(e)} className="space-y-6" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" error={errors.name}>
              <input value={draft.name} onChange={e => { set('name', e.target.value); if (!slugTouched) set('slug', slugify(e.target.value)); }} className={field} />
            </Field>
            <Field label="Slug (URL)" error={errors.slug}>
              <input value={draft.slug} onChange={e => { setSlugTouched(true); set('slug', e.target.value); }} className={`${field} font-mono`} />
            </Field>
            <Field label="Tagline" error={errors.tagline}><input value={draft.tagline} onChange={e => set('tagline', e.target.value)} className={field} /></Field>
            <Field label="Category" error={errors.category}>
              <select value={draft.category} onChange={e => set('category', e.target.value as ProductDraft['category'])} className={field}>
                {!categories.some(c => c.id === draft.category) && <option value={draft.category}>{draft.category} (legacy)</option>}
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Base shape" error={errors.shapeId}>
              <select value={draft.shapeId} onChange={e => set('shapeId', e.target.value)} className={field}>
                {shapeDefinitions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="HSN code" error={errors.hsnCode} hint="4 to 8 digits, used on invoices"><input value={draft.hsnCode} onChange={e => set('hsnCode', e.target.value)} inputMode="numeric" className={field} /></Field>
          </div>
          <Field label="Description" error={errors.description}>
            <textarea value={draft.description} onChange={e => set('description', e.target.value)} rows={4} className={`${field} py-2`} />
          </Field>

          <fieldset className="space-y-3">
            <legend className="font-semibold">Price</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={`Price (${currency}, first size)`} error={errors.price}><input value={draft.price} onChange={e => set('price', e.target.value)} inputMode="decimal" className={field} /></Field>
              <Field label={`MRP (${currency}, optional)`} error={errors.mrp} hint="Strike-through list price; larger sizes scale with it">
                <input value={draft.mrp} onChange={e => set('mrp', e.target.value)} inputMode="decimal" className={field} />
              </Field>
            </div>
            <SizesEditor draft={draft} gstRatePercent={gstRatePercent} currency={currency} errors={errors} onChange={sizes => set('sizes', sizes)} />
            {errors.sizes && <p role="alert" className="text-xs text-destructive">{errors.sizes}</p>}
          </fieldset>

          <ChipSelect label="Finishes" options={finishOptions} value={draft.finishes} onChange={v => set('finishes', v)} error={errors.finishes} />

          <fieldset className="space-y-3">
            <legend className="font-semibold">Inventory</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Stock" error={errors.stock}><input value={draft.stock} onChange={e => set('stock', e.target.value)} inputMode="numeric" className={field} /></Field>
              <Field label="Lead time (days)" error={errors.leadTimeDays} hint="Used for workshop SLA warnings"><input value={draft.leadTimeDays} onChange={e => set('leadTimeDays', e.target.value)} inputMode="numeric" className={field} /></Field>
              <label className="flex min-h-11 items-center gap-2 self-end text-sm"><input type="checkbox" className="h-5 w-5" checked={draft.trackInventory} onChange={e => set('trackInventory', e.target.checked)} /> Track inventory</label>
            </div>
          </fieldset>

          <fieldset className="grid gap-2 sm:grid-cols-3">
            <legend className="mb-1 font-semibold">Flags</legend>
            {([['featured', 'Featured'], ['bestseller', 'Bestseller'], ['isNew', 'New'], ['customizable', 'Customisable'], ['isSample', 'Sample product (placeholder data)']] as const).map(([key, label]) => (
              <label key={key} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={draft[key]} onChange={e => set(key, e.target.checked)} /> {label}</label>
            ))}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <ImageField label="Main image" folder={product?.id ?? newProductId} value={draft.imageUrl} error={errors.imageUrl} onChange={v => set('imageUrl', v)} />
            <ImageField label="Lifestyle image" folder={product?.id ?? newProductId} value={draft.lifestyleImage} error={errors.lifestyleImage} onChange={v => set('lifestyleImage', v)} />
          </div>

          <fieldset className="space-y-3">
            <legend className="font-semibold">Specifications</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Alloy / spec" error={errors.alloySpec}><input value={draft.alloySpec} onChange={e => set('alloySpec', e.target.value)} className={field} /></Field>
              <Field label="Material" error={errors.material}><input value={draft.material} onChange={e => set('material', e.target.value)} className={field} /></Field>
              <Field label="Thickness (mm)" error={errors.thicknessMm}><input value={draft.thicknessMm} onChange={e => set('thicknessMm', e.target.value)} inputMode="decimal" className={field} /></Field>
              <Field label="Mounting" error={errors.mounting}><input value={draft.mounting} onChange={e => set('mounting', e.target.value)} className={field} /></Field>
              <Field label="Weight (kg)" error={errors.weightKg}><input value={draft.weightKg} onChange={e => set('weightKg', e.target.value)} inputMode="decimal" className={field} /></Field>
              <Field label="Indoor / outdoor" error={errors.indoorOutdoor}>
                <select value={draft.indoorOutdoor} onChange={e => set('indoorOutdoor', e.target.value as ProductDraft['indoorOutdoor'])} className={field}>
                  <option value="">Not set</option>
                  {INDOOR_OUTDOOR.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </Field>
            </div>
          </fieldset>

          <ChipSelect label="Rooms" options={ROOMS.map(r => ({ id: r.id, label: r.name }))} value={draft.rooms} onChange={v => set('rooms', v)} />
          <ChipSelect label="Themes" options={THEMES.map(t => ({ id: t.id, label: t.name }))} value={draft.themes} onChange={v => set('themes', v)} />

          <fieldset className="space-y-2">
            <legend className="font-semibold">FAQs</legend>
            {draft.faqs.map((f, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input aria-label={`FAQ ${i + 1} question`} placeholder="Question" value={f.q} onChange={e => set('faqs', draft.faqs.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} className={field} />
                <input aria-label={`FAQ ${i + 1} answer`} placeholder="Answer" value={f.a} onChange={e => set('faqs', draft.faqs.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} className={field} />
                <button type="button" aria-label={`Remove FAQ ${i + 1}`} onClick={() => set('faqs', draft.faqs.filter((_, j) => j !== i))} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg border border-border"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => set('faqs', [...draft.faqs, { q: '', a: '' }])} className="min-h-11 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold"><Plus className="h-4 w-4" /> Add FAQ</button>
          </fieldset>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-border px-5 text-sm font-semibold">Cancel</button>
            <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-oxblood px-6 text-sm font-semibold text-ivory disabled:opacity-50">{saving ? 'Saving…' : 'Save product'}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
