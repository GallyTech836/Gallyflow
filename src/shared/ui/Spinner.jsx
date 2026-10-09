/** Indicador de carga. size: 'sm' (14px) | 'md' (18px) | 'lg' (24px). */
const SIZES = { sm: 'h-3.5 w-3.5 border-2', md: 'h-[18px] w-[18px] border-2', lg: 'h-6 w-6 border-[3px]' };

export default function Spinner({ size = 'md', className = '' }) {
  return (
    <span
      role="status"
      aria-label="Cargando"
      className={`inline-block shrink-0 animate-spin rounded-full border-current border-t-transparent ${SIZES[size] || SIZES.md} ${className}`}
    />
  );
}

/** Estado de carga de una sección (no bloquea toda la pantalla). */
export function LoadingState({ label = 'Cargando…', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-10 text-sm text-nexus-text-secondary ${className}`}>
      <Spinner size="md" className="text-nexus-primary" />
      <span>{label}</span>
    </div>
  );
}
