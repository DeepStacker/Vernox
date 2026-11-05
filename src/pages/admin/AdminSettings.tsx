/**
 * Admin store settings: the `settings/store` document. Pricing basics (tax, shipping, currency, store
 * name) and business details (seller/GST, contact, COD, lead times, returns) are separate forms,
 * plus a read-only export of public catalog content. There is no client-side import or reset;
 * bulk data changes belong to server-side tooling with audit trails.
 */

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { AdminPageHeader } from '@/components/admin/AdminUi';
import { AtelierSelect } from '@/components/ui/select';
import { useAdminData } from '@/lib/data/adminData';
import { useSettingsMutations } from '@/lib/data/settings';
import { BusinessSettingsForm } from './settings/BusinessSettingsForm';

export function AdminSettings() {
  const { products, categories, homepageSettings, topics, storeConfig } = useAdminData();
  const { updateStoreConfig } = useSettingsMutations();

  const fromConfig = () => ({
    storeName: storeConfig.storeName,
    currency: storeConfig.currency || '₹',
    gstRatePercent: storeConfig.gstRatePercent,
    freeShippingThreshold: storeConfig.freeShippingThreshold,
    shippingFee: storeConfig.shippingFee,
  });
  const [form, setForm] = useState(fromConfig);
  const [isSaving, setIsSaving] = useState(false);

  // Re-sync when the stored document loads or changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fromConfig only reads storeConfig
  useEffect(() => { setForm(fromConfig()); }, [storeConfig]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const saved = await updateStoreConfig({
      storeName: form.storeName.trim(),
      currency: form.currency,
      gstRatePercent: Number(form.gstRatePercent),
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

  const label = 'text-sm font-semibold';

  return (
    <div className="mx-auto max-w-4xl animate-fade-in space-y-8 pb-12">
      <AdminPageHeader title="Settings" line="Tax and shipping used by the storefront and checkout, and the business details behind invoices, contact and COD." />

      <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-border bg-card p-5 shadow-soft">
        <h3 className="font-display text-xl">Store and pricing</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className={label}>Store name</span>
            <input type="text" required value={form.storeName} onChange={e => setForm({ ...form, storeName: e.target.value })} className="field" />
          </label>
          <div className="space-y-1">
            <span className={label}>Currency symbol</span>
            <AtelierSelect value={form.currency} onValueChange={val => setForm({ ...form, currency: val })} className="field" options={[{ value: '₹', label: '₹ (INR - Rupee)' }]} />
          </div>
          <label className="space-y-1">
            <span className={label}>GST rate (%)</span>
            <input type="number" required min={0} max={100} step={0.1} value={form.gstRatePercent} onChange={e => setForm({ ...form, gstRatePercent: Number(e.target.value) })} className="field font-mono" />
          </label>
          <label className="space-y-1">
            <span className={label}>Free shipping above (₹)</span>
            <input type="number" required min={0} value={form.freeShippingThreshold} onChange={e => setForm({ ...form, freeShippingThreshold: Number(e.target.value) })} className="field font-mono" />
          </label>
          <label className="space-y-1">
            <span className={label}>Standard shipping (₹)</span>
            <input type="number" required min={0} value={form.shippingFee} onChange={e => setForm({ ...form, shippingFee: Number(e.target.value) })} className="field font-mono" />
          </label>
        </div>
        <div className="flex justify-end border-t border-border pt-4">
          <button type="submit" disabled={isSaving} className="btn-primary">{isSaving ? 'Saving…' : 'Save store settings'}</button>
        </div>
      </form>

      <BusinessSettingsForm config={storeConfig} />

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-5 shadow-soft">
        <div>
          <h3 className="font-display text-xl">Catalog export</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Downloads products, categories, topics and homepage settings as JSON. Orders and customer data are not included.</p>
        </div>
        <button onClick={handleDownloadCatalog} className="btn-secondary shrink-0"><Download className="h-4 w-4" /> Download</button>
      </div>
    </div>
  );
}
