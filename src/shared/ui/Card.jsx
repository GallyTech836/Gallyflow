/** Contenedor básico. padding: 'none' | 'sm' | 'md'. Evitar tarjetas dentro de tarjetas. */
const PADDING = { none: '', sm: 'p-3 sm:p-4', md: 'p-4 sm:p-5' };

export default function Card({ as: Tag = 'div', padding = 'md', className = '', children, ...rest }) {
  return (
    <Tag className={`rounded-xl border border-nexus-border bg-nexus-surface shadow-[var(--nx-shadow-sm)] ${PADDING[padding] ?? PADDING.md} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

/** Encabezado de tarjeta: título, descripción opcional y acciones a la derecha. */
export function CardHeader({ title, subtitle, actions, className = '' }) {
  return (
    <div className={`mb-4 flex flex-wrap items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-nexus-text">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-nexus-text-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
