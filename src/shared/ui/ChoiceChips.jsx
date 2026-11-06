/**
 * Opciones como botones redondeados (en vez de una lista desplegable): se ven
 * todas de un vistazo y se elige con un toque.
 * options: [{ value, label }] o strings. value: el elegido.
 */
export default function ChoiceChips({ options = [], value, onChange, label, disabled = false, className = '' }) {
  const items = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <div className={`flex flex-wrap gap-2 ${className}`} role="radiogroup" aria-label={label}>
      {items.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange?.(o.value)}
            className={`inline-flex h-10 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${active
              ? 'border-nexus-primary bg-nexus-primary text-white'
              : 'border-nexus-border bg-nexus-surface text-nexus-text hover:bg-nexus-surface-hover'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
