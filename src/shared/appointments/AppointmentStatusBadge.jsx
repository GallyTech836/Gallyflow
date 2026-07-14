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
      [STATUS.PENDING]: 'bg-slate-800/60 border-slate-500/30 text-slate-200',
      [STATUS.CONFIRMED]: 'bg-indigo-950/40 border-indigo-500/30 text-indigo-100',
      [STATUS.IN_PROCESS]: 'bg-[#3D250D] border-amber-500/40 text-amber-100',
      [STATUS.COMPLETED]: 'bg-[#0E3524] border-emerald-500/30 text-emerald-100',
      [STATUS.CANCELLED]: 'bg-rose-950/40 border-rose-500/30 text-rose-200',
    },
    defaultColor: 'bg-slate-800/60 border-slate-500/30 text-slate-200',
  },

  // Replica EXACTA del badge que ya existía en BarberApp.jsx
  // (línea ~1248-1254): mismas clases, mismos hex, mismo fallback
  // a "ámbar" para cualquier estado que no sea completed/confirmed
  // (pending, in-process, cancelled) — igual que el ternario original.
  barber: {
    wrapperBase: 'font-black uppercase tracking-wider rounded-md',
    sizeClasses: {
      sm: 'text-[9px] px-2.5 py-1',
      xs: 'text-[9px] px-2.5 py-1',
    },
    colors: {
      [STATUS.COMPLETED]: 'bg-[#082F1D] text-[#34D399] border-[#10B981]/20',
      [STATUS.CONFIRMED]: 'bg-[#0B2545] text-[#60A5FA] border-[#3B82F6]/20',
    },
    defaultColor: 'bg-[#3A2208] text-[#FBBF24] border-[#F59E0B]/20',
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