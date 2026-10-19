import { useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Clock, Clock3, MapPin, Star, Sparkles } from 'lucide-react';
import Avatar from '../shared/avatar/Avatar';
import DirectionsButton from '../shared/location/DirectionsButton';
import { buildWhatsAppUrl } from '../shared/location/whatsappLink';
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
 * lecturas propias. "Reservar ahora" vuelve al flujo de reserva existente.
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
  const generalHours = useMemo(() => scheduleRows(businessSettings?.schedule), [businessSettings]);
  const contacts = useMemo(() => whatsappContacts(branchList), [branchList]);

  const name = heroConfig?.businessName || '';
  const description = businessDescription(heroConfig);
  const showLocation = branchList.length > 0 || generalHours.length > 0;
  const waMessage = `Hola, quiero más información${name ? ` sobre ${name}` : ''}.`;

  return (
    <div className="flex-1 flex flex-col animate-fade-in py-2">
      {/* Volver */}
      <div className="mb-6 bg-nexus-surface border border-nexus-border rounded-2xl p-4 flex items-center gap-3 shadow-sm">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver al inicio"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-nexus-surface-hover hover:bg-nexus-border text-nexus-text-secondary hover:text-nexus-text transition-colors cursor-pointer"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-bold text-nexus-text">Información del negocio</span>
      </div>

      {/* A. Presentación */}
      <header className="space-y-4">
        {/* Portada + perfil (estilo red social). Sin portada se usa un fondo
            suave del mismo alto: el perfil queda siempre en el mismo lugar. */}
        <div className="bg-nexus-surface border border-nexus-border rounded-2xl overflow-hidden shadow-sm">
          <div className="relative h-32 sm:h-40 bg-gradient-to-br from-nexus-primary-soft via-nexus-primary/15 to-nexus-primary/30">
            {heroConfig?.cover && (
              <img src={cloudinaryThumb(heroConfig.cover, 1000)} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="relative px-5 pb-5">
            <div className="-mt-12 w-24 h-24 rounded-full border-4 border-nexus-surface bg-nexus-surface overflow-hidden flex items-center justify-center shadow-md">
              {heroConfig?.logo
                ? <img src={cloudinaryThumb(heroConfig.logo, 240)} alt={name} className="w-full h-full object-cover" />
                : <Sparkles className="text-nexus-primary" size={30} />}
            </div>
            <h1 className="mt-3 text-2xl font-extrabold text-nexus-text leading-tight break-words">{name}</h1>
            {(heroConfig?.showRating || heroConfig?.highlightText) && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {heroConfig?.showRating && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-nexus-text">
                    <Star size={12} className="text-amber-400 fill-amber-400" />
                    {Number(heroConfig.rating).toFixed(1)}
                  </span>
                )}
                {heroConfig?.highlightText && (
                  <span className="inline-flex items-center rounded-full bg-nexus-primary-soft border border-nexus-primary/25 px-2.5 py-0.5 text-xs font-bold text-nexus-primary">
                    {heroConfig.highlightText}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {description && <p className="text-sm text-nexus-text-secondary leading-relaxed">{description}</p>}
      </header>

      {/* B. Servicios y precios */}
      {serviceList.length > 0 && (
        <Section title={`${terms.t('services')} y precios`}>
          <ul className="bg-nexus-surface border border-nexus-border rounded-2xl divide-y divide-nexus-border">
            {serviceList.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 px-5 py-4">
                {heroConfig?.showServiceImages !== false && s.image && (
                  <img src={cloudinaryThumb(s.image, 200)} alt="" className="w-14 h-14 rounded-xl object-cover border border-nexus-border shrink-0" loading="lazy" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-nexus-text">{s.name}</p>
                  {s.description && <p className="mt-1 text-xs text-nexus-text-secondary leading-relaxed line-clamp-2">{s.description}</p>}
                  <p className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                    <span className="nx-num font-bold text-nexus-text whitespace-nowrap">
                      {formatServicePriceFor(s, { professional: personalPro, professionals: pros })}
                    </span>
                    {Number(s.durationMin) > 0 && (
                      <span className="nx-num inline-flex items-center gap-1 text-nexus-text-muted whitespace-nowrap">
                        <Clock size={12} /> {s.durationMin} min
                      </span>
                    )}
                  </p>
                </div>
                {onReserveService && (
                  <button
                    type="button"
                    onClick={() => onReserveService(s)}
                    aria-label={`Reservar ${s.name}`}
                    className="shrink-0 inline-flex h-10 items-center justify-center rounded-xl bg-nexus-primary-soft border border-nexus-primary/25 px-4 text-sm font-bold text-nexus-primary hover:brightness-95 active:scale-[0.97] transition-all cursor-pointer"
                  >
                    Reservar
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!personalPro && pros.length > 1 && serviceList.some((s) => /–/.test(formatServicePriceFor(s, { professionals: pros }))) && (
            <p className="mt-3 px-1 text-xs text-nexus-text-muted">El precio puede variar según {terms.g('professional', 'el', 'la')} {terms.tl('professional')} que elijas.</p>
          )}
        </Section>
      )}

      {/* C. Profesionales */}
      {pros.length > 0 && (
        <Section title={terms.t('professionals')}>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {pros.map((p) => {
              const sucursal = professionalBranchLabel(p, visibleBranches(branches));
              return (
                <li key={p.id} className="bg-nexus-surface border border-nexus-border rounded-2xl px-3 py-4 flex flex-col items-center text-center">
                  <Avatar src={p.image} name={p.name} className="w-16 h-16 rounded-2xl object-cover border border-nexus-border" textClassName="text-lg" />
                  <p className="mt-2 text-sm font-semibold text-nexus-text leading-tight break-words">{p.name}</p>
                  {p.specialty && <p className="mt-0.5 text-xs text-nexus-text-secondary">{p.specialty}</p>}
                  {sucursal && <p className="mt-0.5 text-xs text-nexus-text-muted">{sucursal}</p>}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* D. Ubicación y horarios */}
      {showLocation && (
        <Section title="Ubicación y horarios">
          <div className="space-y-3">
            {branchList.map((b) => {
              const propio = String(b.schedule || '').trim();
              return (
                <div key={b.id} className="bg-nexus-surface border border-nexus-border rounded-2xl overflow-hidden">
                  {b.image && (
                    <img src={cloudinaryThumb(b.image, 800)} alt={`Sucursal ${b.name}`} className="w-full h-32 object-cover" loading="lazy" />
                  )}
                  <div className="p-5">
                  <div className="flex items-start gap-3">
                    {!b.image && (
                      <div className="w-9 h-9 rounded-xl bg-nexus-primary-soft flex items-center justify-center text-nexus-primary shrink-0">
                        <MapPin size={16} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-nexus-text">{b.name}</p>
                      {b.address && <p className="mt-0.5 text-xs text-nexus-text-secondary leading-relaxed">{b.address}</p>}
                      {propio
                        ? <p className="mt-2 flex items-start gap-1.5 text-xs text-nexus-text"><Clock3 size={12} className="mt-0.5 shrink-0 text-nexus-text-muted" /> {propio}</p>
                        : <Hours rows={generalHours} />}
                    </div>
                  </div>
                  <DirectionsButton branch={b} className="mt-3" />
                  </div>
                </div>
              );
            })}
            {branchList.length === 0 && (
              <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5">
                <Hours rows={generalHours} />
              </div>
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
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-nexus-success/30 bg-nexus-success-bg px-4 py-4 text-sm font-bold text-nexus-success-text hover:opacity-80 active:scale-[0.97] transition-all"
              >
                Contactar por WhatsApp{contacts.length > 1 && c.branchName ? ` · ${c.branchName}` : ''}
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* F. Llamada final: vuelve al flujo de reserva existente */}
      <div className="sticky bottom-5 mt-6 z-10">
        <button
          type="button"
          onClick={onReserve}
          className="w-full py-4 px-8 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-bold text-sm sm:text-base rounded-2xl shadow-lg active:scale-[0.97] transition-all flex items-center justify-center gap-2"
        >
          <span>Reservar ahora</span>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-base font-bold text-nexus-text">{title}</h2>
      {children}
    </section>
  );
}

function Hours({ rows = [] }) {
  if (!rows.length) return null;
  return (
    <dl className="mt-2 space-y-1">
      {rows.map((r) => (
        <div key={r.days} className="flex items-center justify-between gap-3 text-xs">
          <dt className="text-nexus-text-secondary">{r.days}</dt>
          <dd className={`nx-num font-semibold ${r.hours === 'Cerrado' ? 'text-nexus-text-muted' : 'text-nexus-text'}`}>{r.hours}</dd>
        </div>
      ))}
    </dl>
  );
}
