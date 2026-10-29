import { useEffect, useRef, useState } from 'react';
import { CalendarClock, MessageCircle } from 'lucide-react';
import { Modal, Button } from '../ui';
import { getSubscriptionNotice, ackSubscriptionNotice } from './subscriptionNoticeApi';

function cuando(dias) {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  return `en ${dias} días`;
}

/**
 * Aviso de vencimiento de la suscripción o la prueba gratuita (solo admin).
 * Se consulta una vez por carga. Solo se cierra con "Aceptar": sin X, sin
 * Escape y sin clic afuera. Si el backend falla, no muestra nada.
 */
export default function SubscriptionNoticeModal() {
  const [notice, setNotice] = useState(null);
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    getSubscriptionNotice().then((data) => {
      if (data?.show) setNotice(data);
    });
  }, []);

  if (!notice) return null;

  const titulo = notice.tipo === 'trial'
    ? `Tu prueba gratuita termina ${cuando(notice.diasRestantes)}`
    : `Tu suscripción vence ${cuando(notice.diasRestantes)}`;

  const aceptar = async () => {
    await ackSubscriptionNotice(notice);
    setNotice(null);
  };

  const abrirWhatsapp = () => {
    window.open(notice.whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  // Sin onClose: el Modal no muestra X ni cierra con Escape o clic afuera.
  return (
    <Modal size="sm" z={80}>
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-nexus-surface-hover text-nexus-text">
          <CalendarClock size={22} aria-hidden="true" />
        </span>
        <h2 className="text-lg font-semibold text-nexus-text">{titulo}</h2>
        <p className="text-sm text-nexus-text-secondary">Renueva para no perder el acceso.</p>
        <div className="mt-2 flex w-full flex-col-reverse items-center justify-center gap-2 sm:flex-row">
          {notice.whatsappUrl && (
            <Button variant="secondary" icon={MessageCircle} onClick={abrirWhatsapp} className="w-full sm:w-auto">
              Escribir por WhatsApp
            </Button>
          )}
          <Button onClick={aceptar} className="w-full sm:w-auto sm:min-w-32">
            Aceptar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
