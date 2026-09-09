import { STATUS, getLabel } from './statusModel';

// Cada variante define SOLO sus clases visuales: el wrapper base,
// el tamaño y la paleta de color por estado. La lógica (qué estado,
// qué label corresponde) vive una sola vez en el componente y en
// statusModel.js. Nada de esto duplica lógica entre variantes,
// solo cambia la "piel" de cada app.

const VARIANTS = {
  // Paleta y wrapper que ya tenía el componente (pensada para Admin).
  // Admin todavía no lo usa en ningún lado, así que esto no cambia
  // nada visualmente hoy; queda listo para cuando se integre.
  admin: {
    wrapperBase: 'inline-flex items-center rounded border font-bold whitespace-nowrap',
    sizeClasses: {
      sm: 'text-[10px] px-2 py-1',
      xs: 'text-[8px] px-1.5 py-0.5',
    },
    colors: {
      [STATUS.PENDING]: 'bg-nexus-surface-hover border-nexus-border text-nexus-text-secondary',
      [STATUS.CONFIRMED]: 'bg-nexus-info-bg border-nexus-info/30 text-nexus-info-text',
      [STATUS.IN_PROCESS]: 'bg-nexus-warning-bg border-nexus-warning/40 text-nexus-warning-text',
      [STATUS.COMPLETED]: 'bg-nexus-success-bg border-nexus-success/30 text-nexus-success-text',
      [STATUS.CANCELLED]: 'bg-nexus-error-bg border-nexus-error/30 text-nexus-error-text',
    },
    defaultColor: 'bg-nexus-surface-hover border-nexus-border text-nexus-text-secondary',
  },

  // Replica del badge que ya existía en BarberApp.jsx, ahora con los
  // mismos tokens de estado que usa la variante admin — antes tenían
  // hex propios y coincidían por casualidad; ahora coinciden a propósito.
  barber: {
    wrapperBase: 'font-black uppercase tracking-wider rounded-md',
    sizeClasses: {
      sm: 'text-[9px] px-2.5 py-1',
      xs: 'text-[9px] px-2.5 py-1',
    },
    colors: {
      [STATUS.COMPLETED]: 'bg-nexus-success-bg text-nexus-success-text border-nexus-success/20',
      [STATUS.CONFIRMED]: 'bg-nexus-info-bg text-nexus-info-text border-nexus-info/20',
    },
    defaultColor: 'bg-nexus-warning-bg text-nexus-warning-text border-nexus-warning/20',
  },
};

/**
 * Badge de solo lectura para mostrar el estado de una cita.
 * La lógica de estado/label es compartida (statusModel.js); el
 * aspecto visual depende de `variant` para que cada app conserve
 * exactamente su diseño actual.
 *
 * Props:
 * - status: uno de los valores de STATUS (string crudo de Firestore)
 * - variant: 'admin' (default) | 'barber' — qué paleta/wrapper usar
 * - size: 'sm' (default) | 'xs' — tamaño de texto/padding
 */
export default function AppointmentStatusBadge({ status, variant = 'admin', size = 'sm' }) {
  const config = VARIANTS[variant] || VARIANTS.admin;
  const color = config.colors[status] || config.defaultColor;
  const sizeClass = config.sizeClasses[size] || config.sizeClasses.sm;
  const label = getLabel(status);

  return (
    <span className={`${config.wrapperBase} ${color} ${sizeClass}`}>
      {label}
    </span>
  );
}