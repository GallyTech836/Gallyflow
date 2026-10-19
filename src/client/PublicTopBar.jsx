import { ChevronLeft } from 'lucide-react';

/**
 * Encabezado compacto del link público: marca Nexus + nombre del negocio.
 * Con `onBack` muestra el botón para volver (página «Más información»).
 */
export default function PublicTopBar({ title = '', onBack = null }) {
  return (
    <header className="flex items-center gap-2.5 h-10 mb-4">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver al inicio"
          className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-lg text-nexus-text-secondary hover:bg-nexus-surface-hover hover:text-nexus-text transition-colors cursor-pointer"
        >
          <ChevronLeft size={20} />
        </button>
      ) : (
        <img src="/favicon.svg" alt="Nexus" width="24" height="24" className="w-6 h-6 rounded-md shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-nexus-text">{title}</span>
      {onBack && <img src="/favicon.svg" alt="Nexus" width="20" height="20" className="w-5 h-5 rounded shrink-0 opacity-90" />}
    </header>
  );
}
