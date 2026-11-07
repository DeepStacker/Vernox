import { useState } from 'react';
import { toast } from 'sonner';
import { ActionDialog } from '@/components/admin/ActionDialog';
import { AdminNotice, Field, Segmented } from '@/components/admin/AdminUi';
import { opsApi, useOpsRunner, type CourierRateView } from '@/lib/data/orderOps';
import { formatInr } from '@/lib/orders/finance';
import { packageForShipment } from '@/lib/orders/shipping';
import type { Order } from '@/types/store';
import { describeSellerFields } from '../settings/settingsForm';

type Mode = 'shiprocket' | 'manual';

const PACKAGE_FIELDS = [
  { key: 'lengthCm', label: 'Length (cm)' },
  { key: 'breadthCm', label: 'Width (cm)' },
  { key: 'heightCm', label: 'Height (cm)' },
  { key: 'weightKg', label: 'Weight (kg)' },
] as const;

const rupees = (n: number | null) => (n === null ? 'n/a' : formatInr(Math.round(n * 100)));
const AUTO = 'auto';

interface Props {
  order: Order;
  open: boolean;
  onClose: () => void;
  /** Invoice-critical seller fields still empty in Settings; booking is refused server-side until they are set. */
  missingSeller: string[];
  onOpenSettings?: () => void;
}

/** Books the courier: Shiprocket from the packed dimensions, or a manual courier + AWB + tracking link. */
export function CreateShipmentDialog({ order, open, onClose, missingSeller, onOpenSettings }: Props) {
  const { run, busy } = useOpsRunner();
  const saved = packageForShipment(order);
  const [mode, setMode] = useState<Mode>('shiprocket');
  const [pkg, setPkg] = useState({
    lengthCm: saved ? String(saved.lengthCm) : '', breadthCm: saved ? String(saved.breadthCm) : '',
    heightCm: saved ? String(saved.heightCm) : '', weightKg: saved ? String(saved.weightKg) : '',
  });
  const [manual, setManual] = useState({ courier: '', awb: '', trackingUrl: '' });
  const [error, setError] = useState<string | null>(null);
  const [configError, setConfigError] = useState(false);
  const [rates, setRates] = useState<CourierRateView[] | null>(null);
  const [ratesNote, setRatesNote] = useState<string | null>(null);
  const [courier, setCourier] = useState<number | typeof AUTO>(AUTO);

  const pkgNumbers = Object.fromEntries(PACKAGE_FIELDS.map(f => [f.key, Number(pkg[f.key])])) as Record<(typeof PACKAGE_FIELDS)[number]['key'], number>;
  const pkgValid = PACKAGE_FIELDS.every(f => Number.isFinite(pkgNumbers[f.key]) && pkgNumbers[f.key] > 0);
  const manualValid = manual.courier.trim().length >= 2 && /^[A-Za-z0-9-]{4,40}$/.test(manual.awb.trim())
    && (!manual.trackingUrl.trim() || /^https?:\/\/\S+$/.test(manual.trackingUrl.trim()));

  const setPackageField = (key: (typeof PACKAGE_FIELDS)[number]['key'], value: string) => {
    setPkg({ ...pkg, [key]: value });
    // Rates depend on the parcel; a changed size makes the list stale.
    setRates(null);
    setCourier(AUTO);
  };

  const loadRates = async () => {
    setError(null);
    setRatesNote(null);
    const result = await run(() => opsApi.getCourierRates(order.id, pkgNumbers));
    if (!result.ok) return setRatesNote(`Could not load courier rates: ${result.error} You can still book with Shiprocket's recommended courier.`);
    if (!result.value.automated) {
      setMode('manual');
      return setRatesNote('Courier rates are not available because Shiprocket is not configured. Enter the courier and AWB by hand.');
    }
    setRates(result.value.rates);
    setCourier(AUTO);
    if (result.value.rates.length === 0) setRatesNote('No courier serves this parcel and destination. Check the PIN and package size, or enter the courier by hand.');
  };

  const submit = async () => {
    setError(null);
    setConfigError(false);
    const result = await run(() => opsApi.createShipment(order.id, mode === 'manual'
      ? { manual: { courier: manual.courier.trim(), awb: manual.awb.trim(), ...(manual.trackingUrl.trim() ? { trackingUrl: manual.trackingUrl.trim() } : {}) } }
      : { package: pkgNumbers, ...(courier !== AUTO ? { courierId: courier } : {}) }));
    if (result.ok) {
      const s = result.value.shipment;
      toast.success(`${order.orderNumber ?? order.id}: shipment booked${s.awb ? ` (AWB ${s.awb})` : ''}`);
      onClose();
      return;
    }
    setError(result.error);
    // The server answers "not automated" when Shiprocket is not configured; hand over to manual entry.
    if (/not automated/i.test(result.error)) setMode('manual');
    if (result.code === 'CONFIG_ERROR') setConfigError(true);
  };

  return (
    <ActionDialog open={open} onClose={onClose} title={`Ship ${order.orderNumber ?? order.id}`} submitLabel="Book shipment" busy={busy}
      canSubmit={mode === 'manual' ? manualValid : pkgValid} error={error} onSubmit={submit}
      description="The GST invoice is issued when the shipment is booked.">
      {missingSeller.length > 0 && (
        <AdminNotice>
          Seller details are incomplete ({describeSellerFields(missingSeller)}), so the GST invoice cannot be issued and booking will fail.{' '}
          {onOpenSettings
            ? <button type="button" onClick={() => { onClose(); onOpenSettings(); }} className="font-semibold underline">Open Settings</button>
            : 'Ask an admin to complete them in Settings.'}
        </AdminNotice>
      )}
      {configError && (
        <AdminNotice>
          The server could not issue the invoice. Check the seller details (legal name, GSTIN, address, state, state code, PIN) in Settings.{' '}
          {onOpenSettings && <button type="button" onClick={() => { onClose(); onOpenSettings(); }} className="font-semibold underline">Open Settings</button>}
        </AdminNotice>
      )}
      <Segmented<Mode> label="Booking method" value={mode} onChange={setMode}
        options={[{ id: 'shiprocket', label: 'Shiprocket' }, { id: 'manual', label: 'Enter courier by hand' }]} />
      {ratesNote && mode === 'manual' && <AdminNotice tone="info">{ratesNote}</AdminNotice>}
      {mode === 'shiprocket' ? (
        <div className="grid grid-cols-2 gap-3">
          {PACKAGE_FIELDS.map(f => (
            <Field key={f.key} label={f.label}>
              <input type="number" inputMode="decimal" min="0" step="0.1" value={pkg[f.key]} onChange={e => setPackageField(f.key, e.target.value)} className="field" />
            </Field>
          ))}
          {!saved && <p className="col-span-2 text-xs text-muted-foreground">No package size was saved at packing; enter it here.</p>}
          <div className="col-span-2 space-y-2">
            <button type="button" className="btn-secondary" disabled={busy || !pkgValid} onClick={() => void loadRates()}>
              {rates ? 'Refresh courier rates' : 'Check courier rates'}
            </button>
            {ratesNote && <p className="text-xs text-muted-foreground">{ratesNote}</p>}
            {rates && rates.length > 0 && (
              <fieldset className="space-y-1">
                <legend className="text-sm font-semibold">Courier</legend>
                <RateOption checked={courier === AUTO} onSelect={() => setCourier(AUTO)} title="Shiprocket recommended (automatic)" detail="Shiprocket picks the courier when it assigns the AWB." />
                {rates.map(r => (
                  <RateOption key={r.courierId} checked={courier === r.courierId} onSelect={() => setCourier(r.courierId)}
                    title={`${r.name}${r.recommended ? ' (recommended)' : ''}`} detail={rateDetail(r)} />
                ))}
              </fieldset>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          <Field label="Courier"><input value={manual.courier} maxLength={80} onChange={e => setManual({ ...manual, courier: e.target.value })} className="field" /></Field>
          <Field label="AWB / tracking number" hint="4 to 40 letters, digits or hyphens.">
            <input value={manual.awb} maxLength={40} onChange={e => setManual({ ...manual, awb: e.target.value })} className="field font-mono" />
          </Field>
          <Field label="Tracking link (optional)"><input type="url" value={manual.trackingUrl} onChange={e => setManual({ ...manual, trackingUrl: e.target.value })} placeholder="https://" className="field" /></Field>
          <p className="text-xs text-muted-foreground">A manual shipment is handed over at once: the order moves to Shipped.</p>
        </div>
      )}
    </ActionDialog>
  );
}

function rateDetail(r: CourierRateView): string {
  const eta = r.estimatedDays ? `${r.estimatedDays} day${r.estimatedDays === 1 ? '' : 's'}${r.etd ? ` (by ${r.etd})` : ''}` : r.etd ?? 'ETA n/a';
  return [
    `${rupees(r.totalCharge ?? r.freightCharge)}${r.codCharge ? ` incl. COD fee ${rupees(r.codCharge)}` : ''}`,
    eta,
    r.codAvailable ? 'COD available' : 'No COD',
    r.rating !== null ? `Rating ${r.rating.toFixed(1)}` : null,
  ].filter(Boolean).join(' · ');
}

function RateOption({ checked, onSelect, title, detail }: { checked: boolean; onSelect: () => void; title: string; detail: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border p-2 text-sm">
      <input type="radio" name="courier" checked={checked} onChange={onSelect} className="mt-1 h-4 w-4 accent-primary" />
      <span><span className="block font-semibold">{title}</span><span className="block text-xs text-muted-foreground">{detail}</span></span>
    </label>
  );
}
