import { STATUS, getLabel } from './statusModel';
import { useBusinessTerms } from '../businessProfiles/useBusinessProfile';
import Badge from '../ui/Badge';

// Fase 4: un solo aspecto para el estado de una cita en todas las apps.
// La lógica (qué estado, qué label y su género) sigue en statusModel.js.
const TONE_BY_STATUS = {
  [STATUS.PENDING]: 'neutral',
  [STATUS.CONFIRMED]: 'info',
  [STATUS.IN_PROCESS]: 'warning',
  [STATUS.COMPLETED]: 'success',
  [STATUS.CANCELLED]: 'danger',
};

/**
 * Badge de solo lectura para mostrar el estado de una cita.
 * Props:
 * - status: uno de los valores de STATUS (string crudo de Firestore)
 * - variant / size: se ignoran (compatibilidad); el aspecto ya es único.
 */
export default function AppointmentStatusBadge({ status, className = '' }) {
  const terms = useBusinessTerms();
  return (
    <Badge tone={TONE_BY_STATUS[status] || 'neutral'} className={className}>
      {getLabel(status, terms)}
    </Badge>
  );
}
