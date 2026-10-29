import { Ban, Clock3, CalendarX2, PauseCircle, MessageCircle } from 'lucide-react';

// Textos por app. `cliente` y `staff` nunca mencionan suscripción, plan ni soporte.
const VARIANTS = {
  cliente: () => ({
    tone: 'neutral',
    Icon: CalendarX2,
    title: 'Reservas no disponibles',
    message: 'Por el momento no estamos recibiendo reservas en línea. Comunícate con el negocio para más información.',
  }),
  staff: () => ({
    tone: 'neutral',
    Icon: PauseCircle,
    title: 'Acceso no disponible',
    message: 'El acceso al panel está pausado. Consulta con el administrador del negocio.',
  }),
  admin: (status) => (status === 'expired'
    ? { tone: 'neutral', Icon: Clock3, title: 'Tu suscripción venció', message: 'Renueva para volver a usar Nexus. Tus datos están guardados.', actionLabel: 'Renovar suscripción' }
    : { tone: 'neutral', Icon: Ban, title: 'Cuenta suspendida', message: 'Comunícate con nosotros para reactivarla. Tus datos están guardados.', actionLabel: 'Contactar a soporte' }),
};

// Sin variante: comportamiento original (ej. "Acceso no incluido en el plan").
function legacy(status) {
  const isExpired = status === 'expired';
  return {
    tone: 'error',
    Icon: isExpired ? Clock3 : Ban,
    title: isExpired ? 'Suscripción vencida' : 'Cuenta suspendida',
    message: isExpired
      ? 'Tu periodo de suscripción venció. Contacta a soporte para renovar y seguir usando la plataforma.'
      : 'Esta cuenta fue suspendida temporalmente. Contacta a soporte para más información.',
  };
}

const TONES = {
  error: { box: 'bg-nexus-error-bg border-nexus-error/25', icon: 'text-nexus-error' },
  neutral: { box: 'bg-nexus-surface-hover border-nexus-border', icon: 'text-nexus-text-muted' },
};

/**
 * Pantalla de negocio bloqueado / acceso no disponible.
 * - `variant`: 'cliente' | 'staff' | 'admin' (textos e ícono de cada app).
 * - `title` / `message`: opcionales, tienen prioridad sobre la variante.
 * - `actions`: botones de enlace [{ label, href }] (ej. WhatsApp). Se omiten los que no tienen href;
 *   sin label usan el texto de la variante (admin: según vencida / suspendida).
 */
export default function SuspendedScreen({ status, variant, onLogout, title, message, actions = [] }) {
  const base = VARIANTS[variant]?.(status) || legacy(status);
  const tone = TONES[base.tone] || TONES.error;
  const { Icon } = base;
  const links = actions.filter((a) => a?.href);

  return (
    <div className="min-h-screen bg-nexus-background flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className={`w-16 h-16 mx-auto rounded-2xl border flex items-center justify-center ${tone.box}`}>
          <Icon className={`w-8 h-8 ${tone.icon}`} aria-hidden="true" />
        </div>
        <h1 className="text-lg font-bold text-nexus-text">{title || base.title}</h1>
        <p className="text-sm text-nexus-text-secondary leading-relaxed">{message || base.message}</p>
        {links.length > 0 && (
          <div className="flex flex-col gap-2 pt-2">
            {links.map((a) => (
              <a
                key={a.href}
                href={a.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-nexus-primary px-4 text-sm font-medium text-white shadow-sm hover:bg-nexus-primary-hover"
              >
                <MessageCircle size={18} aria-hidden="true" />
                {a.label || base.actionLabel}
              </a>
            ))}
          </div>
        )}
        {onLogout && (
          <button
            onClick={onLogout}
            className="mt-2 text-xs text-nexus-text-muted hover:text-nexus-text-secondary underline"
          >
            Cerrar sesión
          </button>
        )}
      </div>
    </div>
  );
}
