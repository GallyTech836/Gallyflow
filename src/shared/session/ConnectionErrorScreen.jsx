// Firebase no pudo restaurar la sesión a tiempo (sin conexión o muy lenta).
// No es "sesión cerrada": se ofrece reintentar, sin mandar al login.
export default function ConnectionErrorScreen({ onRetry }) {
  return (
    <div className="min-h-[100dvh] bg-nexus-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-nexus-surface border border-nexus-border rounded-2xl p-5 shadow-[var(--nx-shadow-lg)] text-center">
        <h1 className="text-lg font-bold text-nexus-text">No se pudo conectar</h1>
        <p className="text-sm text-nexus-text-secondary mt-1">Revisa tu conexión a internet. Tu sesión sigue abierta.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 w-full h-10 rounded-lg text-sm font-bold bg-nexus-primary hover:bg-nexus-primary-hover text-white transition-colors cursor-pointer"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
