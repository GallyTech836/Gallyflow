import { Building2, LogOut, CreditCard, ShieldCheck, ShieldAlert, ShieldX, LayoutTemplate, User } from 'lucide-react';
import { Card, CardHeader, Button } from '../../shared/ui';
import { useNegocioPlan } from '../../shared/negocioPlan/useNegocioPlan';
import { useNegocioStatus } from '../../shared/negocioStatus/useNegocioStatus';
import { useHeroConfig } from '../../shared/heroConfig/useHeroConfig';
import { CAPABILITIES } from '../../shared/capabilities/capabilityModel';
import { cloudinaryThumb } from '../../shared/cloudinary/uploadImage';
import ActiveSessions from '../../shared/session/ActiveSessions';

const STATUS_BADGE = {
  active: { label: 'Activa', className: 'bg-nexus-success-bg text-nexus-success-text', Icon: ShieldCheck },
  trial: { label: 'Prueba', className: 'bg-nexus-warning-bg text-nexus-warning-text', Icon: ShieldCheck },
  suspended: { label: 'Suspendida', className: 'bg-nexus-error-bg text-nexus-error-text', Icon: ShieldX },
  expired: { label: 'Vencida', className: 'bg-nexus-error-bg text-nexus-error-text', Icon: ShieldAlert },
};

const initials = (name) => (name || 'N').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// Cuenta y plan: marca del negocio (logo y portada del Link Público),
// suscripción, sesión del administrador y sesiones activas.
// registrosMode (Nexus Control): el logo se edita en "Marca", sin portada.
export default function AccountSection({ negocioId, businessName, user, onLogout, onChangeSection, registrosMode = false }) {
  const { planName, capabilities, loading: planLoading } = useNegocioPlan(negocioId);
  const { status } = useNegocioStatus(negocioId);
  const { heroConfig } = useHeroConfig(negocioId);

  const statusInfo = STATUS_BADGE[status] || STATUS_BADGE.active;
  // Lo que el negocio tiene EFECTIVAMENTE (plan + complementos + excepciones),
  // con nombres legibles del catálogo. No se listan: "Próximamente", maquetas
  // no activas ni funciones que no aplican a este tipo de negocio.
  const featureEntries = CAPABILITIES
    .map((cap) => [cap, capabilities?.[cap.key]])
    .filter(([cap, val]) => cap.status !== 'soon' && !cap.core && !cap.screenSetting
      && !(cap.status === 'mock' && !val?.enabled)
      && !(cap.hideWhenOff && !val?.enabled)
      && val?.source !== 'profile');

  const name = businessName || heroConfig.businessName;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      <div className="space-y-4 min-w-0">
        {/* ── Marca ─────────────────────────────────────────────── */}
        <Card padding="none" className="overflow-hidden">
          <div className="relative h-28 bg-gradient-to-r from-nexus-primary to-nexus-accent">
            {heroConfig.cover ? (
              <img src={cloudinaryThumb(heroConfig.cover, 900)} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="absolute right-3 top-3 rounded-md bg-black/25 px-2 py-0.5 text-xs font-medium text-white">Sin portada</span>
            )}
          </div>
          <div className="relative z-10 px-4 pb-4 sm:px-5 sm:pb-5">
            <div className="flex items-start gap-3">
              <div className="-mt-8 h-16 w-16 shrink-0 overflow-hidden rounded-xl border-4 border-nexus-surface bg-nexus-surface flex items-center justify-center text-lg font-bold text-nexus-primary shadow-sm">
                {heroConfig.logo
                  ? <img src={cloudinaryThumb(heroConfig.logo, 160)} alt={name} className="h-full w-full object-cover" />
                  : initials(name)}
              </div>
              <div className="min-w-0 pt-2">
                <p className="truncate text-base font-semibold text-nexus-text">{name}</p>
                <p className="text-xs text-nexus-text-muted">Para cambiar el nombre, contacta a soporte.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {onChangeSection && (
                <Button variant="secondary" size="sm" icon={LayoutTemplate} onClick={() => onChangeSection('hero')}>
                  {registrosMode
                    ? (heroConfig.logo ? 'Cambiar logo' : 'Subir logo')
                    : (heroConfig.cover && heroConfig.logo ? 'Cambiar logo y portada' : 'Subir logo y portada')}
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* ── Cuenta ────────────────────────────────────────────── */}
        <Card>
          <CardHeader
            title={<span className="inline-flex items-center gap-2.5"><User className="w-5 h-5 text-nexus-primary" aria-hidden="true" />Cuenta</span>}
            subtitle={user?.email || undefined}
            className="mb-3"
          />
          <Button variant="danger-soft" icon={LogOut} onClick={onLogout}>Cerrar sesión</Button>
        </Card>

        <ActiveSessions />
      </div>

      {/* ── Suscripción (solo lectura) ─────────────────────────── */}
      <Card className="min-w-0">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <CreditCard className="w-5 h-5 text-nexus-primary" aria-hidden="true" />
            <h3 className="text-base font-semibold text-nexus-text">Suscripción</h3>
          </div>
          {!planLoading && (
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${statusInfo.className}`}>
              <statusInfo.Icon className="w-3.5 h-3.5" aria-hidden="true" />
              {statusInfo.label}
            </span>
          )}
        </div>
        {planLoading ? (
          <p className="text-sm text-nexus-text-muted">Cargando…</p>
        ) : (
          <>
            <div className="mb-3 rounded-lg bg-nexus-background border border-nexus-border px-3 py-2.5">
              <p className="text-xs text-nexus-text-secondary">Plan actual</p>
              <p className="text-base font-semibold text-nexus-text">{planName || 'Sin plan asignado'}</p>
            </div>
            {featureEntries.length > 0 ? (
              <ul className="divide-y divide-nexus-border/70">
                {featureEntries.map(([cap, val]) => {
                  const enabled = !!val?.enabled;
                  const limit = typeof val?.limit === 'number' ? val.limit : null;
                  const limitText = cap.limit ? (limit === null ? 'Ilimitado' : `Hasta ${limit}${cap.limit.period === 'month' ? '/mes' : ''}${cap.limit.perBranch ? ' por sucursal' : ''}`) : (val?.source === 'addon' ? 'Complemento' : 'Incluido');
                  return (
                    <li key={cap.key} className="flex items-center justify-between gap-3 text-sm py-2">
                      <span className="text-nexus-text-secondary min-w-0">{cap.label}</span>
                      <span className={`font-semibold shrink-0 nx-num ${enabled ? 'text-nexus-success-text' : 'text-nexus-text-muted'}`}>
                        {enabled ? limitText : 'No incluido'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-nexus-text-muted">Este plan no tiene funciones configuradas.</p>
            )}
            <p className="text-sm text-nexus-text-muted mt-3 flex items-center gap-1.5">
              <Building2 className="w-4 h-4" aria-hidden="true" />
              Para cambiar de plan, contacta a soporte.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
