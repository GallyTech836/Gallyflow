import { MessageCircle, UserCheck } from 'lucide-react';
import { Modal, EmptyState } from '../../shared/ui';
import { buildWhatsAppUrl } from '../../shared/location/whatsappLink';

const DIA_MS = 24 * 60 * 60 * 1000;

function daysSince(isoDate) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  if (!y || !m || !d) return null;
  const then = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - then) / DIA_MS);
}

function formatDate(isoDate) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  if (!y || !m || !d) return isoDate || '—';
  return new Date(y, m - 1, d).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Lista de clientes "sin volver" (última cita finalizada hace más de 30 días),
 * con la fecha de esa cita y un botón para escribirles por WhatsApp.
 * `items`: [{ key, name, phone, lastDate, visits }] ya calculados con las citas
 * finalizadas del histórico (el mismo cálculo que el número de la tarjeta).
 */
export default function InactiveClientsModal({ items, businessName = '', termClients = 'Clientes', onClose }) {
  const greeting = (name) => {
    const first = String(name || '').trim().split(/\s+/)[0];
    const hola = first ? `Hola ${first}` : 'Hola';
    return businessName
      ? `${hola}, te escribimos de ${businessName}. Hace un tiempo que no te vemos, ¿te agendamos una cita?`
      : `${hola}, hace un tiempo que no te vemos. ¿Te agendamos una cita?`;
  };

  return (
    <Modal
      title={`${termClients} sin volver`}
      description="Su última cita finalizada fue hace más de 30 días."
      size="md"
      onClose={onClose}
      flush
    >
      {items.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title="Nadie lleva más de 30 días sin volver"
          description="Todos los que atendiste vinieron en el último mes."
        />
      ) : (
        <ul className="divide-y divide-nexus-border">
          {items.map((c) => {
            const days = daysSince(c.lastDate);
            const waUrl = buildWhatsAppUrl(c.phone, greeting(c.name));
            return (
              <li key={c.key} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-nexus-text">{c.name || 'Sin nombre'}</p>
                  <p className="nx-num text-xs text-nexus-text-secondary">
                    Última: {formatDate(c.lastDate)}
                    {days != null && <> · hace {days} días</>}
                    {c.visits > 1 && <> · {c.visits} visitas</>}
                  </p>
                </div>
                {waUrl ? (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Escribir a ${c.name || 'cliente'} por WhatsApp`}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-sm font-semibold text-white hover:brightness-95"
                  >
                    <MessageCircle size={16} aria-hidden="true" />
                    Escribir
                  </a>
                ) : (
                  <span className="shrink-0 text-xs text-nexus-text-muted">Sin teléfono</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
