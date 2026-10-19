import { useEffect, useMemo } from 'react';
import { ArrowLeft, ChevronRight, Clock, MapPin, Navigation, Star, Tag } from 'lucide-react';
import Avatar from '../shared/avatar/Avatar';
import { buildDirectionsUrl } from '../shared/location/mapsLink';
import { buildWhatsAppUrl } from '../shared/location/whatsappLink';
import { WhatsAppIcon } from '../shared/location/WhatsAppButton';
import { formatServicePriceFor } from '../shared/servicePricing/servicePricing';
import { useBusinessTerms } from '../shared/businessProfiles/useBusinessProfile';
import { cloudinaryThumb } from '../shared/cloudinary/uploadImage';
import {
  visibleProfessionals,
  visibleServices,
  visibleBranches,
  businessDescription,
  scheduleRows,
  whatsappContacts,
  professionalBranchLabel,
} from './businessInfoModel';

/**
 * Página pública «Más información del negocio» (dentro de ClienteApp).
 * Solo muestra datos que ClienteApp ya cargó de ESTE negocio; no hace
 * lecturas propias. Cada sección se oculta si el negocio no tiene ese dato.
 * "Elegir" en un servicio y "Reservar una cita" entran al flujo existente.
 */
export default function BusinessInfoPage({
  heroConfig,
  services = [],
  professionals = [],
  branches = [],
  businessSettings = null,
  personalPro = null,
  onReserve,
  onReserveService = null,
  onBack,
}) {
  const terms = useBusinessTerms();

  // Al entrar, se empieza a leer desde arriba.
  useEffect(() => {
    try { window.scrollTo({ top: 0 }); } catch { /* entorno sin window */ }
  }, []);

  const pros = useMemo(() => visibleProfessionals(professionals, { personalPro }), [professionals, personalPro]);
  const serviceList = useMemo(() => visibleServices(services, pros), [services, pros]);
  const branchList = useMemo(() => visibleBranches(branches, { personalPro }), [branches, personalPro]);
  const allBranches = useMemo(() => visibleBranches(branches), [branches]);
  const generalHours = useMemo(() => scheduleRows(businessSettings?.schedule), [businessSettings]);
  const contacts = useMemo(() => whatsappContacts(branchList), [branchList]);

  const name = heroConfig?.businessName || '';
  const cover = heroConfig?.cover || '';
  const logo = heroConfig?.logo || '';
  const description = businessDescription(heroConfig);
  const rating = Number(heroConfig?.rating);
  const hasRating = !!heroConfig?.showRating && Number.isFinite(rating) && rating > 0;
  const highlight = heroConfig?.highlightText || '';
  const showImages = heroConfig?.showServiceImages !== false;
  const showLocation = branchList.length > 0 || generalHours.length > 0;
  const waMessage = `Hola, quiero más información${name ? ` sobre ${name}` : ''}.`;
  const priceOf = (s) => formatServicePriceFor(s, { professional: personalPro, professionals: pros });
  const pricesVary = !personalPro && pros.length > 1
    && serviceList.some((s) => /–/.test(formatServicePriceFor(s, { professionals: pros })));
  const ctaLabel = `Reservar ${terms.g('appointment', 'un', 'una')} ${terms.tl('appointment')}`;

  return (
    // Borde #E2E8F0 de la guía visual, solo en esta página.
    <div className="flex-1 flex flex-col animate-fade-in" style={{ '--nx-border': '#E2E8F0' }}>
      {/* Barra superior: volver + título (ocupa todo el ancho) */}
      <div className="-mx-5 sm:-mx-6 -mt-5 sm:-mt-6 h-14 px-3 sm:px-4 flex items-center gap-2 bg-nexus-surface border-b border-nexus-border">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver al inicio"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-nexus-text hover:bg-nexus-surface-hover transition-colors cursor-pointer"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-nexus-text">Información del negocio</span>
      </div>

      {/* A. Información general: portada a todo el ancho + logo y nombre */}
      <header>
        {cover && (
          <div className="-mx-5 sm:-mx-6 aspect-[2/1] bg-nexus-surface-hover overflow-hidden">
            <img src={cloudinaryThumb(cover, 1000)} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className={`flex items-start gap-4 ${cover ? '' : 'mt-6'}`}>
          <div className={`shrink-0 rounded-full bg-nexus-surface ring-4 ring-nexus-background ${cover ? '-mt-10' : ''}`}>
            {logo ? (
              <img src={cloudinaryThumb(logo, 240)} alt={name} className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <Avatar name={name} className="w-20 h-20 rounded-full" textClassName="text-xl" />
            )}
          </div>
          <div className="min-w-0 flex-1 pt-2.5">
            <h1 className="text-xl font-bold text-nexus-text leading-tight break-words">{name}</h1>
            {(hasRating || highlight) && (
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-nexus-text-secondary">
                {hasRating && (
                  <span className="inline-flex items-center gap-1 font-semibold text-nexus-text nx-num">
                    <Star size={14} className="text-amber-400 fill-amber-400" aria-hidden="true" />
                    {rating.toFixed(1)}
                  </span>
                )}
                {hasRating && highlight && <span aria-hidden="true" className="text-nexus-text-muted">·</span>}
                {highlight && <span className="min-w-0 break-words">{highlight}</span>}
              </p>
            )}
            {description && <p className="mt-2 text-sm text-nexus-text-secondary leading-relaxed">{description}</p>}
          </div>
        </div>
      </header>

      {/* B. Servicios, precios y duración */}
      {serviceList.length > 0 && (
        <Section title={`${terms.t('services')} y precios`}>
          <ul className="divide-y divide-nexus-border">
            {serviceList.map((s) => {
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
                    {s.description && (
                      <span className="mt-0.5 block text-xs text-nexus-text-secondary leading-relaxed line-clamp-2">{s.description}</span>
                    )}
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-nexus-text-secondary nx-num">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <Tag size={14} className="text-nexus-text-muted" aria-hidden="true" />
                        {priceOf(s)}
                      </span>
                      {Number(s.durationMin) > 0 && (
                        <>
                          <span aria-hidden="true" className="text-nexus-text-muted">·</span>
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <Clock size={14} className="text-nexus-text-muted" aria-hidden="true" />
                            {s.durationMin} min
                          </span>
                        </>
                      )}
                    </span>
                  </span>
                  {onReserveService && (
                    <span className="shrink-0 inline-flex items-center gap-0.5 text-sm font-semibold text-nexus-primary">
                      Elegir <ChevronRight size={16} aria-hidden="true" />
                    </span>
                  )}
                </>
              );
              return (
                <li key={s.id}>
                  {onReserveService ? (
                    <button
                      type="button"
                      onClick={() => onReserveService(s)}
                      aria-label={`Reservar ${s.name}`}
                      className="w-full flex items-center gap-3 py-3.5 text-left hover:bg-nexus-surface-hover/60 transition-colors cursor-pointer"
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 py-3.5">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
          {pricesVary && (
            <p className="mt-2 text-xs text-nexus-text-muted">
              El precio puede variar según {terms.g('professional', 'el', 'la')} {terms.tl('professional')} que elijas.
            </p>
          )}
        </Section>
      )}

      {/* C. Profesionales: foto real o iniciales */}
      {pros.length > 0 && (
        <Section title={terms.t('professionals')}>
          <ul className="divide-y divide-nexus-border">
            {pros.map((p) => {
              const sucursal = professionalBranchLabel(p, allBranches);
              return (
                <li key={p.id} className="flex items-center gap-4 py-3">
                  <Avatar
                    src={p.image}
                    name={p.name}
                    className="w-16 h-16 aspect-square shrink-0 rounded-lg object-cover border border-nexus-border"
                    textClassName="text-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-nexus-text break-words">{p.name}</p>
                    {p.specialty && <p className="mt-0.5 text-sm text-nexus-text-secondary truncate">{p.specialty}</p>}
                    {sucursal && <p className="mt-0.5 text-xs text-nexus-text-muted truncate">{sucursal}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* D. Ubicación y horarios */}
      {showLocation && (
        <Section title="Ubicación y horarios">
          <div className="space-y-6">
            {branchList.map((b) => {
              const propio = String(b.schedule || '').trim();
              const directions = buildDirectionsUrl(b);
              return (
                <div key={b.id}>
                  {branchList.length > 1 && <h3 className="mb-2 text-[15px] font-semibold text-nexus-text">{b.name}</h3>}
                  {b.image && (
                    <img
                      src={cloudinaryThumb(b.image, 800)}
                      alt={`Sucursal ${b.name}`}
                      loading="lazy"
                      className="mb-3 w-full aspect-[2/1] rounded-lg object-cover border border-nexus-border"
                    />
                  )}
                  <div className="space-y-2.5">
                    {b.address && (
                      <InfoRow icon={MapPin}>{b.address}</InfoRow>
                    )}
                    {propio
                      ? <InfoRow icon={Clock}>{propio}</InfoRow>
                      : generalHours.length > 0 && <InfoRow icon={Clock}><Hours rows={generalHours} /></InfoRow>}
                  </div>
                  {directions && (
                    <a
                      href={directions}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 w-full h-12 inline-flex items-center justify-center gap-2 rounded-lg border border-nexus-border bg-nexus-surface text-sm font-semibold text-nexus-primary hover:bg-nexus-surface-hover transition-colors"
                    >
                      <Navigation size={16} aria-hidden="true" />
                      Cómo llegar
                    </a>
                  )}
                </div>
              );
            })}
            {branchList.length === 0 && (
              <InfoRow icon={Clock}><Hours rows={generalHours} /></InfoRow>
            )}
          </div>
        </Section>
      )}

      {/* E. Contacto por WhatsApp (solo con un número válido de una sucursal de este negocio) */}
      {contacts.length > 0 && (
        <Section title="Contacto">
          <div className="space-y-2">
            {contacts.map((c) => (
              <a
                key={c.branchId}
                href={buildWhatsAppUrl(c.phone, waMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-12 px-4 inline-flex items-center justify-center gap-2 rounded-lg border border-nexus-success/30 bg-nexus-success-bg text-sm font-semibold text-nexus-success-text hover:opacity-85 transition-opacity"
              >
                <WhatsAppIcon size={18} />
                <span className="truncate">
                  Contactar por WhatsApp{contacts.length > 1 && c.branchName ? ` · ${c.branchName}` : ''}
                </span>
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* F. Reservar: siempre visible al bajar, entra al mismo flujo que la portada */}
      <div className="sticky bottom-4 z-10 mt-6">
        <button
          type="button"
          onClick={onReserve}
          className="w-full h-12 px-6 rounded-lg bg-nexus-primary hover:bg-nexus-primary-hover text-white font-semibold text-[15px] shadow-md active:scale-[0.99] transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>{ctaLabel}</span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      <footer className="mt-12 pb-3 flex items-center justify-center gap-1.5 text-xs text-nexus-text-muted">
        Reservas gestionadas por
        <NexusWordmark />
      </footer>
    </div>
  );
}

/** Marca Nexus del pie de página (solo el nombre). */
function NexusWordmark() {
  return <span className="font-bold tracking-[0.2em] text-[11px] text-nexus-navy">NEXUS</span>;
}

function Section({ title, children }) {
  return (
    <section className="mt-6 pt-6 border-t border-nexus-border">
      <h2 className="mb-2 text-lg font-bold text-nexus-text">{title}</h2>
      {children}
    </section>
  );
}

function InfoRow({ icon: Icon, children }) {
  return (
    <div className="flex items-start gap-3 text-sm text-nexus-text-secondary leading-relaxed">
      <Icon size={16} className="mt-0.5 shrink-0 text-nexus-text-muted" aria-hidden="true" />
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
}

function Hours({ rows = [] }) {
  if (!rows.length) return null;
  return (
    <dl className="space-y-1">
      {rows.map((r) => (
        <div key={r.days} className="flex items-center justify-between gap-3">
          <dt>{r.days}</dt>
          <dd className={`nx-num font-medium ${r.hours === 'Cerrado' ? 'text-nexus-text-muted' : 'text-nexus-text'}`}>{r.hours}</dd>
        </div>
      ))}
    </dl>
  );
}
