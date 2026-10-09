/** Estado vacío que explica qué pasa y, si aplica, qué hacer. */
export default function EmptyState({ icon: Icon = null, title, description, action = null, className = '' }) {
    return (
      <div className={`flex flex-col items-center justify-center px-4 py-10 text-center ${className}`}>
        {Icon && (
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-nexus-surface-hover text-nexus-text-muted">
            <Icon size={22} aria-hidden="true" />
          </span>
        )}
        {title && <p className="text-sm font-semibold text-nexus-text">{title}</p>}
        {description && <p className="mt-1 max-w-sm text-sm text-nexus-text-secondary">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    );
  }
  