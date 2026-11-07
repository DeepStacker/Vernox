import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AdminNotice, Field } from '@/components/admin/AdminUi';
import { useSettingsMutations } from '@/lib/data/settings';
import type { StoreConfig } from '@/types/store';
import { isPlaceholderSeller } from '@/types/settings';
import { describeSellerFields, draftFromConfig, missingSellerFields, toStorePatch, validateBusiness, type BusinessDraft } from './settingsForm';

const SELLER_TEXT: Array<{ key: keyof BusinessDraft['seller']; label: string; error?: string; hint?: string; mono?: boolean }> = [
  { key: 'legalName', label: 'Legal name' },
  { key: 'tradeName', label: 'Trade name' },
  { key: 'gstin', label: 'GSTIN', error: 'gstin', hint: '15 characters, for example 29ABCDE1234F1Z5.', mono: true },
  { key: 'stateCode', label: 'GST state code', error: 'stateCode', hint: 'Two digits; must match the start of the GSTIN.', mono: true },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'pincode', label: 'PIN code', error: 'pincode', mono: true },
  { key: 'email', label: 'Billing email', error: 'sellerEmail' },
  { key: 'phone', label: 'Billing phone', error: 'sellerPhone' },
];

const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <fieldset className="space-y-3">
    <legend className="font-display text-xl">{title}</legend>
    {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    <div className="grid gap-3 sm:grid-cols-2">{children}</div>
  </fieldset>
);

/** Seller (GST invoice), contact, COD, lead-time and return-window settings of `settings/store`. */
export function BusinessSettingsForm({ config }: { config: StoreConfig }) {
  const { updateStoreConfig } = useSettingsMutations();
  const [draft, setDraft] = useState<BusinessDraft>(() => draftFromConfig(config));
  const [saving, setSaving] = useState(false);
  const errors = validateBusiness(draft);
  const hasErrors = Object.keys(errors).length > 0;
  const missing = missingSellerFields(toStorePatch(draft).seller);

  // Re-sync when the stored document loads or changes elsewhere.
  useEffect(() => { setDraft(draftFromConfig(config)); }, [config]);

  const set = <K extends keyof BusinessDraft>(key: K, value: BusinessDraft[K]) => setDraft(d => ({ ...d, [key]: value }));
  const setConsultation = <K extends keyof BusinessDraft['consultation']>(key: K, value: BusinessDraft['consultation'][K]) =>
    setDraft(d => ({ ...d, consultation: { ...d.consultation, [key]: value } }));
  const setSeller = (key: keyof BusinessDraft['seller'], value: string) => setDraft(d => ({ ...d, seller: { ...d.seller, [key]: value } }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasErrors) return;
    setSaving(true);
    const ok = await updateStoreConfig(toStorePatch(draft));
    setSaving(false);
    if (ok) toast.success('Business settings saved.');
  };

  return (
    <form onSubmit={save} className="space-y-8 rounded-lg border border-border bg-card p-5 shadow-soft">
      <Section title="Seller details" hint="Printed on every GST invoice. Shipments cannot be booked until legal name, GSTIN, address, state, state code and PIN are set.">
        {missing.length > 0 && <div className="sm:col-span-2"><AdminNotice>Still missing for invoices: {describeSellerFields(missing)}.</AdminNotice></div>}
        {missing.length === 0 && isPlaceholderSeller(draft.seller) && <div className="sm:col-span-2"><AdminNotice>These are placeholder details. Invoices are issued as specimens (SP/…) and nothing here is shown on the storefront until you enter your real GSTIN.</AdminNotice></div>}
        {SELLER_TEXT.map(f => (
          <Field key={f.key} label={f.label} hint={f.hint} error={f.error ? errors[f.error] : undefined}>
            <input value={draft.seller[f.key]} onChange={e => setSeller(f.key, f.key === 'gstin' ? e.target.value.toUpperCase() : e.target.value)}
              className={`field${f.mono ? ' font-mono' : ''}`} />
          </Field>
        ))}
      </Section>

      <Section title="Contact details" hint="Shown on the storefront. A field left empty is hidden from customers.">
        <Field label="WhatsApp number" hint="With country code, for example 919876543210." error={errors.whatsappNumber}>
          <input value={draft.whatsappNumber} onChange={e => set('whatsappNumber', e.target.value)} className="field font-mono" />
        </Field>
        <Field label="Support phone" error={errors.supportPhone}>
          <input value={draft.supportPhone} onChange={e => set('supportPhone', e.target.value)} className="field font-mono" />
        </Field>
        <Field label="Support email" error={errors.supportEmail}>
          <input type="email" value={draft.supportEmail} onChange={e => set('supportEmail', e.target.value)} className="field" />
        </Field>
        <Field label="Support hours"><input value={draft.supportHours} onChange={e => set('supportHours', e.target.value)} placeholder="Mon to Sat, 10 am to 6 pm IST" className="field" /></Field>
        <div className="sm:col-span-2">
          <Field label="Workshop address"><input value={draft.workshopAddress} onChange={e => set('workshopAddress', e.target.value)} className="field" /></Field>
        </div>
        <Field label="Grievance officer" hint="Named on the policy pages (Consumer Protection (E-Commerce) Rules and DPDP Act).">
          <input value={draft.grievanceOfficerName} onChange={e => set('grievanceOfficerName', e.target.value)} className="field" />
        </Field>
        <Field label="Grievance officer email" error={errors.grievanceOfficerEmail}>
          <input type="email" value={draft.grievanceOfficerEmail} onChange={e => set('grievanceOfficerEmail', e.target.value)} className="field" />
        </Field>
      </Section>

      <Section title="Cash on delivery" hint="Custom studio pieces are always prepaid.">
        <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2">
          <input type="checkbox" checked={draft.codEnabled} onChange={e => set('codEnabled', e.target.checked)} className="h-5 w-5 accent-primary" />
          <span className="font-semibold">Offer cash on delivery</span>
        </label>
        <label className="flex min-h-11 items-start gap-3 text-sm sm:col-span-2">
          <input type="checkbox" checked={draft.codOtpRequired} onChange={e => set('codOtpRequired', e.target.checked)} className="mt-0.5 h-5 w-5 accent-primary" />
          <span>
            <span className="font-semibold">Confirm COD orders with an SMS code</span>
            <span className="block text-muted-foreground">Customers must enter a one-time code sent to their mobile. Works once MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID are set (see Launch setup); until then COD orders are flagged for you to confirm by phone.</span>
          </span>
        </label>
        <Field label="COD fee (₹)" error={errors.codFee}><input inputMode="decimal" value={draft.codFee} onChange={e => set('codFee', e.target.value)} className="field font-mono" /></Field>
        <Field label="Largest COD order (₹)" error={errors.codMaxOrderValue}><input inputMode="decimal" value={draft.codMaxOrderValue} onChange={e => set('codMaxOrderValue', e.target.value)} className="field font-mono" /></Field>
      </Section>

      <Section title="Design consultation" hint="A paid service: a designer proposes pieces on the customer's own walls. The fee is before GST, like catalogue prices.">
        <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2">
          <input type="checkbox" checked={draft.consultation.enabled} onChange={e => setConsultation('enabled', e.target.checked)} className="h-5 w-5 accent-primary" />
          <span className="font-semibold">Offer design consultations</span>
        </label>
        <Field label="Fee (₹, before GST)" error={errors.consultationPrice}><input inputMode="decimal" value={draft.consultation.priceInr} onChange={e => setConsultation('priceInr', e.target.value)} className="field font-mono" /></Field>
        <Field label="Turnaround (days)" hint="Shown to customers and used as the designer queue's deadline." error={errors.turnaroundDays}>
          <input inputMode="numeric" value={draft.consultation.turnaroundDays} onChange={e => setConsultation('turnaroundDays', e.target.value)} className="field font-mono" />
        </Field>
        <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2">
          <input type="checkbox" checked={draft.consultation.creditTowardsOrder} onChange={e => setConsultation('creditTowardsOrder', e.target.checked)} className="h-5 w-5 accent-primary" />
          <span className="font-semibold">Credit the fee towards the customer's next order</span>
        </label>
        <Field label="Credit valid for (days)" error={errors.creditValidityDays}>
          <input inputMode="numeric" value={draft.consultation.creditValidityDays} onChange={e => setConsultation('creditValidityDays', e.target.value)} className="field font-mono" />
        </Field>
        <Field label="SAC code" hint="998391: specialty (interior) design services." error={errors.sacCode}>
          <input value={draft.consultation.sacCode} onChange={e => setConsultation('sacCode', e.target.value)} className="field font-mono" />
        </Field>
        <Field label="GST on the consultation (%)" hint="Services are taxed apart from products: 18% for SAC 998391." error={errors.consultationGst}>
          <input inputMode="decimal" value={draft.consultation.gstRatePercent} onChange={e => setConsultation('gstRatePercent', e.target.value)} className="field font-mono" />
        </Field>
      </Section>

      <Section title="Lead times and returns">
        <Field label="Standard lead time (days)" hint="Production days for catalogue items without their own." error={errors.defaultLeadTimeDays}>
          <input inputMode="numeric" value={draft.defaultLeadTimeDays} onChange={e => set('defaultLeadTimeDays', e.target.value)} className="field font-mono" />
        </Field>
        <Field label="Custom design lead time (days)" error={errors.customLeadTimeDays}>
          <input inputMode="numeric" value={draft.customLeadTimeDays} onChange={e => set('customLeadTimeDays', e.target.value)} className="field font-mono" />
        </Field>
        <Field label="Return window (days after delivery)" error={errors.returnWindowDays}>
          <input inputMode="numeric" value={draft.returnWindowDays} onChange={e => set('returnWindowDays', e.target.value)} className="field font-mono" />
        </Field>
      </Section>

      <div className="flex justify-end border-t border-border pt-4">
        <button type="submit" disabled={saving || hasErrors} className="btn-primary">{saving ? 'Saving…' : 'Save business settings'}</button>
      </div>
    </form>
  );
}
