/** Selector de opciones excluyentes (ej. Día / Semana / Mes / Año). */
export default function SegmentedControl({ options = [], value, onChange, size = 'md', className = '', ariaLabel }) {
    const h = size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm';
    return (
      <div role="radiogroup" aria-label={ariaLabel} className={`inline-flex rounded-lg border border-nexus-border bg-nexus-surface-hover p-0.5 ${className}`}>
        {options.map((opt) => {
          const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange?.(o.value)}
              className={`${h} min-w-[44px] flex-1 whitespace-nowrap rounded-md px-3 font-medium transition-colors cursor-pointer ${active ? 'bg-nexus-surface text-nexus-text shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text'}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }
  