interface Option<T extends string> { id: T; label: string }

/** Multi-select as toggle chips (44px tap targets). */
export function ChipSelect<T extends string>({ label, options, value, onChange, error }: {
  label: string; options: readonly Option<T>[]; value: readonly T[]; onChange: (next: T[]) => void; error?: string;
}) {
  const toggle = (id: T) => onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(o => (
          <button key={o.id} type="button" aria-pressed={value.includes(o.id)} onClick={() => toggle(o.id)}
            className={`min-h-11 rounded-full border px-4 text-sm ${value.includes(o.id) ? 'border-oxblood bg-oxblood text-ivory' : 'border-border bg-background'}`}>
            {o.label}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </fieldset>
  );
}
