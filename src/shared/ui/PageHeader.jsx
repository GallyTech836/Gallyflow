/** Título de sección con acciones. En celular las acciones bajan debajo del título. */
export default function PageHeader({ title, subtitle, actions = null, className = '' }) {
    return (
      <div className={`mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${className}`}>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-nexus-text sm:text-xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-nexus-text-secondary">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    );
  }
  