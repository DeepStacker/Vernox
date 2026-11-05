/**
 * Admin store settings: the `settings/store` document (tax, shipping, currency, store name)
 * plus a read-only export of public catalog content. There is no client-side import or reset;
 * bulk data changes belong to server-side tooling with audit trails.
 */

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminData } from '@/lib/data/adminData';
import { useSettingsMutations } from '@/lib/data/settings';
import { AtelierSelect } from '@/components/ui/select';

const numberInputClass =
  'w-full bg-background border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-oxblood text-center font-mono font-bold';

export function AdminSettings() {
  const { products, categories, homepageSettings, topics, storeConfig } = useAdminData();
  const { updateStoreConfig } = useSettingsMutations();

  const [form, setForm] = useState({
    storeName: storeConfig.storeName,
    currency: storeConfig.currency || '₹',
    taxRate: storeConfig.taxRate,
    freeShippingThreshold: storeConfig.freeShippingThreshold,
    shippingFee: storeConfig.shippingFee,
  });
  const [isSaving, setIsSaving] = useState(false);

  // Re-sync when the stored document loads or changes.
  useEffect(() => {
    setForm({
      storeName: storeConfig.storeName,
      currency: storeConfig.currency || '₹',
      taxRate: storeConfig.taxRate,
      freeShippingThreshold: storeConfig.freeShippingThreshold,
      shippingFee: storeConfig.shippingFee,
    });
  }, [storeConfig]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const saved = await updateStoreConfig({
      storeName: form.storeName.trim(),
      currency: form.currency,
      taxRate: Number(form.taxRate),
      freeShippingThreshold: Number(form.freeShippingThreshold),
      shippingFee: Number(form.shippingFee),
    });
    setIsSaving(false);
    if (saved) toast.success('Store settings saved.');
  };

  const handleDownloadCatalog = () => {
    const payload = JSON.stringify({ products, categories, homepageSettings, topics, storeConfig }, null, 2);
    const link = document.createElement('a');
    link.download = `vernox-catalog-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
      <div>
        <h2 className="font-display text-3xl text-oxblood-deep">Store Settings</h2>
        <p className="text-muted-foreground text-sm">Tax, shipping and currency used by the storefront and the checkout server.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-card border border-border/70 rounded-xl p-6 shadow-soft space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Store name</label>
            <input
              type="text" required value={form.storeName}
              onChange={e => setForm({ ...form, storeName: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-oxblood transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Currency symbol</label>
            <AtelierSelect
              value={form.currency}
              onValueChange={val => setForm({ ...form, currency: val })}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-oxblood transition"
              options={[{ value: '₹', label: '₹ (INR - Rupee)' }]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:col-span-2 pt-2">
            <div className="space-y-1.5 p-3.5 rounded-lg bg-muted/20 border border-border/60">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">GST rate (%)</label>
              <input type="number" required min={0} max={100} step={0.1} value={form.taxRate}
                onChange={e => setForm({ ...form, taxRate: Number(e.target.value) })} className={numberInputClass} />
            </div>
            <div className="space-y-1.5 p-3.5 rounded-lg bg-muted/20 border border-border/60">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Free shipping above</label>
              <input type="number" required min={0} value={form.freeShippingThreshold}
                onChange={e => setForm({ ...form, freeShippingThreshold: Number(e.target.value) })} className={numberInputClass} />
            </div>
            <div className="space-y-1.5 p-3.5 rounded-lg bg-muted/20 border border-border/60">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Standard shipping</label>
              <input type="number" required min={0} value={form.shippingFee}
                onChange={e => setForm({ ...form, shippingFee: Number(e.target.value) })} className={numberInputClass} />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-border/60">
          <button type="submit" disabled={isSaving}
            className="bg-oxblood hover:bg-oxblood-deep text-ivory font-semibold px-6 py-2.5 rounded-lg text-sm transition disabled:opacity-50">
            {isSaving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>

      <div className="bg-card border border-border/70 rounded-xl p-6 shadow-soft flex items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-xl text-oxblood">Catalog export</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Downloads products, categories, topics and homepage settings as JSON. Orders and customer data are not included.</p>
        </div>
        <button onClick={handleDownloadCatalog}
          className="inline-flex items-center gap-2 px-4 py-2 bg-muted hover:bg-border rounded-lg text-xs font-semibold transition shrink-0">
          <Download className="w-4 h-4" /> Download
        </button>
      </div>
    </div>
  );
}
