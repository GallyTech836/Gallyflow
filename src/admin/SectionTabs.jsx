// SectionTabs.jsx — Pestañas tipo chip para secciones con dos vistas
// (Servicios | Promociones, Profesionales | Asistencia).

export default function SectionTabs({ tabs, active, onChange, ariaLabel }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="mb-4 flex flex-wrap gap-2">
      {tabs.map(({ id, label }) => {
        const on = id === active;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(id)}
            className={`h-9 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors cursor-pointer ${
              on
                ? 'border-nexus-primary bg-nexus-primary text-white shadow-sm'
                : 'border-nexus-border bg-nexus-surface text-nexus-text-secondary hover:border-nexus-primary/40 hover:text-nexus-text'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
