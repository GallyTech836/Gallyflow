import React from 'react';
import { CalendarOff } from 'lucide-react';
import { findClosure, closureLabel } from './closedDaysModel';

// Aviso en la agenda (Admin y Barber) cuando el día elegido está marcado como
// cerrado / feriado en Configuración > Negocio > Días cerrados.
export default function ClosedDayBanner({ closedDays, date, branch = null }) {
  const cierre = findClosure(closedDays, date, branch);
  if (!cierre) return null;
  const donde = cierre.branch ? `La sucursal ${cierre.branch} está cerrada` : 'El negocio está cerrado';
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-xl border border-nexus-warning/30 bg-nexus-warning-bg px-3 py-2.5 text-sm text-nexus-warning-text"
    >
      <CalendarOff className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-semibold">{closureLabel(cierre)}.</span>{' '}
        {donde} este día: el link público y el asistente de WhatsApp no ofrecen horarios.
        Solo se puede agendar en sobrehorario.
      </p>
    </div>
  );
}
