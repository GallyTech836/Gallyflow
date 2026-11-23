/**
 * Bloque gris que ocupa el lugar del contenido mientras carga.
 * Se le da la forma con className (alto, ancho, redondeo):
 *   <Skeleton className="h-4 w-32" />
 *   <Skeleton className="h-28 w-28 rounded-full" />
 * Con "reducir movimiento" activo, el pulso se apaga (regla global en tokens.css).
 */
export default function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-nexus-border/70 ${className}`} />;
}
