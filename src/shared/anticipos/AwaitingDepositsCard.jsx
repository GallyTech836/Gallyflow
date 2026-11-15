// AwaitingDepositsCard.jsx — Arriba de la agenda: reservas que esperan el
// anticipo. Tocar una abre su modal para confirmarla o rechazarla, sin
// buscarla día por día.
import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { holdExpired } from './anticipoModel';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function diaCorto(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return '';
  const f = new Date(`${date}T12:00:00Z`);
  return `${DIAS[f.getUTCDay()]} ${f.getUTCDate()} ${MESES[f.getUTCMonth()]}`;
}

export default function AwaitingDepositsCard({ citas = [], onOpen }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const vivas = citas.filter((c) => !holdExpired(c, now));
  if (!vivas.length) return null;

  return (
    <section aria-label="Reservas por confirmar" className="rounded-xl border border-nexus-text-secondary bg-nexus-surface p-3 sm:p-4">
      <div className="mb-2 flex items-center gap-2">
        <Clock size={16} className="text-nexus-text" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-nexus-text">
          {vivas.length === 1 ? '1 reserva espera el anticipo' : `${vivas.length} reservas esperan el anticipo`}
        </h3>
      </div>
      <ul className="divide-y divide-nexus-border">
        {vivas.slice(0, 5).map((c) => {
          const min = Math.max(0, Math.ceil((Date.parse(c.deposit?.expiresAt) - now) / 60000));
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onOpen(c)}
                className="flex w-full items-center justify-between gap-3 py-2 text-left cursor-pointer hover:opacity-80"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-nexus-text">{c.clientName || 'Cliente'} · {diaCorto(c.date)} {c.time}</span>
                  <span className={`block text-xs ${min <= 5 ? 'text-nexus-error-text' : 'text-nexus-text-secondary'}`}>
                    Anticipo Bs {c.deposit?.amount} · {c.deposit?.receiptAt ? 'envió comprobante · ' : c.deposit?.reportedAt ? 'avisó que pagó · ' : ''}vence en {min} min
                  </span>
                </span>
                <span className="shrink-0 rounded-lg border border-nexus-border px-3 py-1.5 text-xs font-semibold text-nexus-text">Revisar</span>
              </button>
            </li>
          );
        })}
      </ul>
      {vivas.length > 5 && <p className="pt-1 text-xs text-nexus-text-muted">y {vivas.length - 5} más</p>}
    </section>
  );
}
