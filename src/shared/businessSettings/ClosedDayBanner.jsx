import React from 'react';
import { CalendarOff, Clock } from 'lucide-react';
import { findClosure, findSpecialHours, closureLabel } from './closedDaysModel';

// Aviso en la agenda (Admin y Barber) cuando el día elegido está marcado como
// cerrado / feriado, o tiene un horario especial, en Configuración > Negocio >
// Días cerrados.
export default function ClosedDayBanner({ closedDays, date, branch = null }) {
  const cierre = findClosure(closedDays, date, branch);
  const especial = cierre ? null : findSpecialHours(closedDays, date, branch);
  if (!cierre && !especial) return null;
  const entrada = cierre || especial;
  const Icon = cierre ? CalendarOff : Clock;
  const suc = entrada.branch ? `la sucursal ${entrada.branch}` : 'el negocio';
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-xl border border-nexus-warning/30 bg-nexus-warning-bg px-3 py-2.5 text-sm text-nexus-warning-text"
    >
      <Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      {cierre ? (
        <p>
          <span className="font-semibold">{closureLabel(cierre)}.</span>{' '}
          {entrada.branch ? `La sucursal ${entrada.branch} está cerrada` : 'El negocio está cerrado'} este día: el link
          público y el asistente de WhatsApp no ofrecen horarios. Solo se puede agendar en sobrehorario.
        </p>
      ) : (
        <p>
          <span className="font-semibold">{closureLabel(especial)}: {especial.openStart} – {especial.openEnd}.</span>{' '}
          Este día {suc} solo atiende en ese horario; fuera de él solo se puede agendar en sobrehorario.
        </p>
      )}
    </div>
  );
}
