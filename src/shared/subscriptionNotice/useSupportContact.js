import { useEffect, useState } from 'react';
import { getSupportContact } from './subscriptionNoticeApi';

/**
 * Enlace de WhatsApp a soporte de Nexus para la pantalla de negocio bloqueado.
 * Solo consulta mientras `enabled` (negocio bloqueado). Sin número o si falla: null.
 */
export function useSupportContact(enabled) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    getSupportContact().then((data) => { if (alive) setUrl(data?.whatsappUrl || null); });
    return () => { alive = false; };
  }, [enabled]);
  return enabled ? url : null;
}
