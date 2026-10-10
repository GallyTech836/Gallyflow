import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { MessageCircle, ToggleRight, ToggleLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { db } from '../../firebase/config';
import { useBusinessTerms } from '../../shared/businessProfiles/useBusinessProfile';

// Asistente de reservas por WhatsApp (backend en Railway).
// Lee/escribe negocios/{negocioId}.assistantConfig:
//   enabled       -> lo controla el admin aquí (sin el campo = activo)
//   displayPhone  -> lo guarda el backend al recibir mensajes
//   lastMessageAt -> idem (se actualiza como máximo cada 10 min)
// El número lo conecta soporte (whatsappPhoneNumberId / whatsappAccounts).

function formatearTelefono(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('591') && d.length === 11) return `+591 ${d.slice(3)}`;
  return `+${d}`;
}

function haceCuanto(iso) {
  const t = Date.parse(iso || '');
  if (!t) return null;
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.round(h / 24);
  return `hace ${dias} día${dias === 1 ? '' : 's'}`;
}

export default function AssistantSection({ negocioId }) {
  const { tl, g } = useBusinessTerms();
  const [negocio, setNegocio] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!negocioId) return undefined;
    const unsub = onSnapshot(
      doc(db, 'negocios', negocioId),
      (snap) => setNegocio(snap.exists() ? snap.data() : {}),
      (err) => {
        console.error('[AssistantSection] Error al leer negocio:', err);
        setNegocio({});
      }
    );
    return () => unsub();
  }, [negocioId]);

  const config = negocio?.assistantConfig || {};
  const conectado = Boolean(negocio?.whatsappPhoneNumberId || config.displayPhone);
  const activo = config.enabled !== false;
  const telefono = formatearTelefono(config.displayPhone);
  const ultimoMensaje = haceCuanto(config.lastMessageAt);

  const toggleActivo = async () => {
    if (!negocioId || saving || !conectado) return;
    setSaving(true);
    setError('');
    try {
      await setDoc(doc(db, 'negocios', negocioId), { assistantConfig: { enabled: !activo } }, { merge: true });
    } catch (err) {
      console.error('[AssistantSection] Error al guardar:', err);
      setError('No se pudo guardar el cambio. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  if (!negocio) {
    return (
      <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5 text-xs text-nexus-text-muted">
        Cargando…
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5">
        <div className="flex items-center gap-2.5 mb-1">
          <MessageCircle className="w-4 h-4 text-nexus-primary" />
          <h3 className="text-sm font-bold text-nexus-text">Asistente de WhatsApp</h3>
        </div>
        <p className="text-xs text-nexus-text-muted mb-4">
          Tus {tl('clients')} pueden reservar escribiendo a tu número de WhatsApp. {g('appointment', 'Los', 'Las')} {tl('appointments')} aparecen en la agenda al instante.
        </p>

        <div className="p-4 bg-nexus-background border border-nexus-border rounded-xl flex items-start gap-3">
          {conectado ? (
            <CheckCircle2 className="w-5 h-5 text-nexus-success shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-nexus-text-muted shrink-0 mt-0.5" />
          )}
          <div className="text-xs space-y-1 min-w-0">
            {conectado ? (
              <>
                <p className="font-bold text-nexus-text">
                  Número conectado{telefono ? `: ${telefono}` : ''}
                </p>
                <p className="text-nexus-text-muted">
                  {ultimoMensaje ? `Último mensaje recibido ${ultimoMensaje}.` : 'Aún no se recibieron mensajes.'}
                </p>
              </>
            ) : (
              <>
                <p className="font-bold text-nexus-text">Sin número conectado</p>
                <p className="text-nexus-text-muted">
                  Contacta a soporte de Nexus para conectar el WhatsApp de tu negocio.
                </p>
              </>
            )}
          </div>
        </div>

        <div className={`mt-4 flex items-center justify-between gap-3 p-3 bg-nexus-background border border-nexus-border rounded-xl ${conectado ? '' : 'opacity-50'}`}>
          <div className="min-w-0">
            <p className="text-xs font-bold text-nexus-text">Responder automáticamente</p>
            <p className="text-xs text-nexus-text-muted">
              {activo
                ? `El asistente atiende y agenda ${tl('appointments')}.`
                : 'Apagado: responde que por ahora no se reciben reservas por WhatsApp.'}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleActivo}
            disabled={!conectado || saving}
            className="shrink-0 cursor-pointer disabled:cursor-not-allowed"
            aria-label={activo ? 'Desactivar asistente' : 'Activar asistente'}
          >
            {activo ? (
              <ToggleRight className="w-8 h-8 text-nexus-success" />
            ) : (
              <ToggleLeft className="w-8 h-8 text-nexus-border" />
            )}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-nexus-error-text">{error}</p>}
      </div>

      <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5">
        <h3 className="text-sm font-bold text-nexus-text mb-3">Cómo funciona</h3>
        <ul className="space-y-2 text-xs text-nexus-text-secondary list-disc pl-4">
          <li>{g('client', 'El', 'La')} {tl('client')} elige {g('service', 'uno o varios', 'una o varias')} {tl('services')}, {g('professional', 'el', 'la')} {tl('professional')}, el día y la hora. Solo se ofrecen horarios realmente libres.</li>
          <li>Con «Cualquier {tl('professional')}» {g('appointment', 'el', 'la')} {tl('appointment')} queda como <b>Pendiente</b>: si solo {g('professional', 'un', 'una')} {tl('professional')} está libre se asigna {g('appointment', 'solo', 'sola')}; si hay {g('professional', 'varios', 'varias')}, decides tú.</li>
          <li>Con «Hablar con alguien» recibes un aviso y el asistente deja de responder en ese chat por 2 horas para que una persona atienda. Si {g('client', 'el', 'la')} {tl('client')} escribe «menu», vuelve el asistente.</li>
          <li>{g('professional', 'El', 'La')} {tl('professional')} recibe la notificación de cada reserva nueva.</li>
        </ul>
      </div>
    </div>
  );
}
