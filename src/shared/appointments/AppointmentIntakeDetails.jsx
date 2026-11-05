import { useState } from 'react';
import { ChevronDown, PawPrint } from 'lucide-react';
import { cloudinaryThumb } from '../cloudinary/uploadImage';
import { formatIntakeValue } from '../bookingForms/bookingFormModel';

const CANALES = {
  client: 'Link público',
  assistant: 'WhatsApp',
  admin: 'Panel admin',
  barber: 'App del equipo',
};

const ORDEN = ['petName', 'breed', 'size', 'age', 'lastService'];

/**
 * Datos del formulario guardados en la cita (`intake`, peluquería canina).
 * Plegable para no cargar el detalle de la cita. No se muestra si la cita no
 * tiene formulario (citas viejas y otros tipos de negocio).
 */
export default function AppointmentIntakeDetails({ appointment }) {
  const [open, setOpen] = useState(false);
  const intake = appointment?.intake;
  const values = intake?.values;
  if (!values || typeof values !== 'object' || Object.keys(values).length === 0) return null;

  const labels = intake.labels || {};
  const keys = [...ORDEN.filter((k) => k in values), ...Object.keys(values).filter((k) => !ORDEN.includes(k) && k !== 'photo')];
  const photo = typeof values.photo === 'string' && values.photo.startsWith('https://') ? values.photo : '';
  const titulo = intake.type === 'mascota' ? 'Mascota' : 'Datos de la reserva';
  const resumen = [values.petName, values.breed].filter(Boolean).join(' · ');
  const canal = CANALES[appointment.bookedBy] || null;

  return (
    <div className="rounded-lg border border-nexus-border bg-nexus-background">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left cursor-pointer"
      >
        {photo ? (
          <img src={cloudinaryThumb(photo, 120)} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover border border-nexus-border" />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-nexus-surface text-nexus-text-secondary">
            <PawPrint className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-nexus-text-secondary">{titulo}</span>
          <span className="block truncate text-sm font-semibold text-nexus-text">{resumen || 'Ver datos'}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-nexus-text-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-nexus-border px-3 py-3">
          <div className="flex gap-3">
            {photo && (
              <a href={photo} target="_blank" rel="noopener noreferrer" className="shrink-0" aria-label="Ver foto completa">
                <img src={cloudinaryThumb(photo, 300)} alt="" className="h-24 w-24 rounded-lg object-cover border border-nexus-border" />
              </a>
            )}
            <dl className="grid min-w-0 flex-1 grid-cols-[auto,1fr] gap-x-3 gap-y-1.5 text-sm">
              {keys.map((k) => {
                const v = formatIntakeValue(k, values[k]);
                if (!v) return null;
                return (
                  <div key={k} className="contents">
                    <dt className="text-nexus-text-secondary">{labels[k] || k}</dt>
                    <dd className="min-w-0 break-words font-semibold text-nexus-text">{v}</dd>
                  </div>
                );
              })}
              {canal && (
                <div className="contents">
                  <dt className="text-nexus-text-secondary">Reservó por</dt>
                  <dd className="font-semibold text-nexus-text">{canal}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
