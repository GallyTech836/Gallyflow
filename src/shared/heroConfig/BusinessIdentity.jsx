import { Star } from 'lucide-react';
import Avatar from '../avatar/Avatar';
import { cloudinaryThumb } from '../cloudinary/uploadImage';
import { heroDescription } from './heroConfigModel';

/**
 * Identidad pública del negocio: logo, nombre, calificación (solo si el
 * dueño la activó), texto destacado y descripción. La usan la pantalla
 * principal del link público, «Más información» y la vista previa del
 * admin, así que se ve igual en los tres lugares.
 *
 * Todo viene de heroConfig. Sin logo se muestran las iniciales del negocio;
 * sin descripción propia no se muestra ningún texto genérico.
 */
export default function BusinessIdentity({ config, compact = false, showDescription = true, headingLevel = 1 }) {
  const { businessName = '', logo = '', showRating = false, rating, highlightText = '' } = config || {};
  const Heading = headingLevel === 2 ? 'h2' : 'h1';
  const ratingValue = Number(rating);
  const hasRating = !!showRating && Number.isFinite(ratingValue) && ratingValue > 0;
  const description = showDescription ? heroDescription(config) : '';
  const logoBox = compact ? 'w-11 h-11 rounded-lg' : 'w-14 h-14 rounded-xl';

  return (
    <div className="w-full text-left">
      <div className={`flex items-center ${compact ? 'gap-2.5' : 'gap-3.5'}`}>
        {logo ? (
          <img
            src={cloudinaryThumb(logo, 240)}
            alt={businessName}
            className={`${logoBox} shrink-0 object-cover border border-nexus-border bg-nexus-surface`}
          />
        ) : (
          <Avatar name={businessName} className={`${logoBox} border border-nexus-border`} textClassName={compact ? 'text-sm' : 'text-base'} />
        )}
        <div className="min-w-0 flex-1">
          <Heading
            className={`${compact ? 'text-base' : 'text-xl sm:text-2xl'} font-bold tracking-tight text-nexus-text leading-tight break-words`}
          >
            {businessName}
          </Heading>
          {(hasRating || highlightText) && (
            <p className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 ${compact ? 'text-[11px]' : 'text-sm'} text-nexus-text-secondary`}>
              {hasRating && (
                <span className="inline-flex items-center gap-1 font-semibold text-nexus-text nx-num">
                  <Star size={compact ? 11 : 14} className="text-amber-400 fill-amber-400" aria-hidden="true" />
                  {ratingValue.toFixed(1)}
                  <span className="sr-only">de calificación</span>
                </span>
              )}
              {hasRating && highlightText && <span aria-hidden="true" className="text-nexus-text-muted">·</span>}
              {highlightText && <span className="min-w-0 break-words">{highlightText}</span>}
            </p>
          )}
        </div>
      </div>
      {description && (
        <p className={`${compact ? 'mt-2.5 text-xs' : 'mt-4 text-[15px]'} text-nexus-text-secondary leading-relaxed`}>
          {description}
        </p>
      )}
    </div>
  );
}
