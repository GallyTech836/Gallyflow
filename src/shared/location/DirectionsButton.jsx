import { Navigation } from 'lucide-react';
import { buildDirectionsUrl } from './mapsLink';

/**
 * Botón "Cómo llegar" que abre Google Maps. No renderiza nada si la
 * sucursal no tiene dirección ni coordenadas.
 */
export default function DirectionsButton({ branch, compact = false, className = '' }) {
  const url = buildDirectionsUrl(branch);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center justify-center gap-1.5 bg-nexus-primary-soft text-nexus-primary border border-nexus-primary/30 hover:opacity-80 font-bold rounded-xl transition-all active:scale-[0.97] ${
        compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm w-full'
      } ${className}`}
    >
      <Navigation size={compact ? 11 : 14} />
      Cómo llegar
    </a>
  );
}

/**
 * "Cómo llegar" compacto, fijo en la esquina superior derecha de la pantalla.
 */
export function DirectionsCorner({ branch }) {
  const url = buildDirectionsUrl(branch);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={branch?.address || 'Cómo llegar'}
      className="fixed top-2 right-2 z-40 inline-flex items-center gap-1 rounded-full bg-nexus-surface/90 backdrop-blur border border-nexus-border px-2.5 py-1 text-xs font-bold text-nexus-primary shadow-sm hover:opacity-80 active:scale-95 transition-all"
    >
      <Navigation size={11} />
      Cómo llegar
    </a>
  );
}