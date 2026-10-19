import { ChevronRight } from 'lucide-react';
import { cloudinaryThumb } from '../shared/cloudinary/uploadImage';

/**
 * Lista pública de servicios: filas con nombre, duración y precio.
 * Si se pasa `onSelect`, cada fila completa es el botón para reservar ese
 * servicio (sin repetir un botón "Reservar" en cada fila).
 *
 * `priceOf(service)` devuelve el texto del precio ya formateado por la
 * lógica existente (formatServicePriceFor); aquí no se calcula nada.
 */
export default function PublicServiceList({ services = [], priceOf, onSelect = null, showImages = false, showDescription = false }) {
  if (!services.length) return null;
  return (
    <ul className="rounded-xl border border-nexus-border bg-nexus-surface divide-y divide-nexus-border overflow-hidden">
      {services.map((s) => {
        const duration = Number(s.durationMin) > 0 ? `${s.durationMin} min` : '';
        const content = (
          <>
            {showImages && s.image && (
              <img
                src={cloudinaryThumb(s.image, 160)}
                alt=""
                loading="lazy"
                className="w-12 h-12 rounded-lg object-cover border border-nexus-border shrink-0"
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-nexus-text leading-snug break-words">{s.name}</span>
              {showDescription && s.description && (
                <span className="mt-0.5 block text-xs text-nexus-text-secondary leading-relaxed line-clamp-2">{s.description}</span>
              )}
              {duration && <span className="mt-0.5 block text-xs text-nexus-text-muted nx-num">{duration}</span>}
            </span>
            <span className="shrink-0 text-sm font-semibold text-nexus-text nx-num whitespace-nowrap">{priceOf ? priceOf(s) : ''}</span>
            {onSelect && <ChevronRight size={16} className="shrink-0 -mr-1 text-nexus-text-muted" aria-hidden="true" />}
          </>
        );
        return (
          <li key={s.id}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(s)}
                aria-label={`Reservar ${s.name}`}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-nexus-surface-hover active:bg-nexus-surface-hover transition-colors cursor-pointer"
              >
                {content}
              </button>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
