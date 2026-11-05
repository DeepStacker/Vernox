import { categories, finishLabels, ROOMS, THEMES } from '@/lib/catalog';
import { PRICE_BANDS, SIZE_BANDS, type ListingFilters } from '@/lib/storefront/listing';

interface Props {
  filters: ListingFilters;
  onChange: (next: ListingFilters) => void;
  idPrefix: string;
}

// Finish ids offered in the filter (the catalogue's server-accepted finishes).
const FILTER_FINISHES = ['black_patina', 'brass', 'antique_brass', 'gold', 'copper', 'corten_rust', 'stainless'] as const;

function RadioGroup({ legend, name, value, options, onSelect }: {
  legend: string; name: string; value: string; options: { id: string; label: string }[]; onSelect: (id: string) => void;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      {[{ id: '', label: 'All' }, ...options].map(o => (
        <label key={o.id || 'all'} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
          <input type="radio" name={name} checked={value === o.id} onChange={() => onSelect(o.id)} className="h-4 w-4 accent-[#5B262C]" />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

export function FilterPanel({ filters, onChange, idPrefix }: Props) {
  const set = (patch: Partial<ListingFilters>) => onChange({ ...filters, ...patch });
  const toggleFinish = (id: string) =>
    set({ finishes: filters.finishes.includes(id) ? filters.finishes.filter(f => f !== id) : [...filters.finishes, id] });

  return (
    <div className="space-y-6">
      <RadioGroup legend="Room" name={`${idPrefix}-room`} value={filters.room} onSelect={room => set({ room })} options={ROOMS.map(r => ({ id: r.id, label: r.name }))} />
      <RadioGroup legend="Theme" name={`${idPrefix}-theme`} value={filters.theme} onSelect={theme => set({ theme })} options={THEMES.map(t => ({ id: t.id, label: t.name }))} />
      <RadioGroup legend="Category" name={`${idPrefix}-category`} value={filters.category} onSelect={category => set({ category })} options={categories.map(c => ({ id: c.id, label: c.name }))} />

      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm font-semibold">Finish</legend>
        {FILTER_FINISHES.map(id => (
          <label key={id} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={filters.finishes.includes(id)} onChange={() => toggleFinish(id)} className="h-4 w-4 accent-[#5B262C]" />
            <span className="h-4 w-4 rounded-full border border-border" style={{ background: finishLabels[id].swatch }} aria-hidden="true" />
            {finishLabels[id].name}
          </label>
        ))}
      </fieldset>

      <RadioGroup legend="Size" name={`${idPrefix}-size`} value={filters.size} onSelect={size => set({ size })} options={SIZE_BANDS.map(b => ({ id: b.id, label: b.label }))} />
      <RadioGroup legend="Price (excl. GST)" name={`${idPrefix}-price`} value={filters.price} onSelect={price => set({ price })} options={PRICE_BANDS.map(b => ({ id: b.id, label: b.label }))} />

      <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={filters.ready} onChange={e => set({ ready: e.target.checked })} className="h-4 w-4 accent-[#5B262C]" />
        In stock only
      </label>
    </div>
  );
}
