import React, { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { MessageCircle, ToggleRight, ToggleLeft } from 'lucide-react';
import { db } from '../../firebase/config';
import { useBusinessTerms } from '../../shared/businessProfiles/useBusinessProfile';
import AssistantPersonalitySection from './AssistantPersonalitySection';
import WhatsAppNumbersPanel from './WhatsAppNumbersPanel';

// Asistente de reservas por WhatsApp (backend en Railway).
// Lee/escribe negocios/{negocioId}.assistantConfig:
//   enabled       -> lo controla el admin aquí (sin el campo = activo)
//   displayPhone  -> lo guarda el backend al recibir mensajes
//   lastMessageAt -> idem (se actualiza como máximo cada 10 min)
// El número se conecta en el panel "Número de WhatsApp" (WhatsAppNumbersPanel,
// por el backend: whatsappAccounts no se lee desde el front).

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

// Anticipación mínima para que el cliente reprograme por WhatsApp
// (assistantConfig.changeMinHours; sin el campo = 2 h).
const OPCIONES_ANTICIPACION = [
  { value: 0, label: 'Sin límite (hasta la hora)' },
  { value: 1, label: 'Hasta 1 hora antes' },
  { value: 2, label: 'Hasta 2 horas antes' },
  { value: 3, label: 'Hasta 3 horas antes' },
  { value: 6, label: 'Hasta 6 horas antes' },
  { value: 12, label: 'Hasta 12 horas antes' },
  { value: 24, label: 'Hasta 24 horas antes' },
];

export default function AssistantSection({ negocioId }) {
  const { tl, g } = useBusinessTerms();
  const [negocio, setNegocio] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [numeros, setNumeros] = useState(null); // del panel de números
  const onNumbersChange = useCallback((lista) => setNumeros(lista), []);

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
  const conectado = Boolean((numeros && numeros.length > 0) || negocio?.whatsappPhoneNumberId);
  const activo = config.enabled !== false;
  const ultimoMensaje = haceCuanto(config.lastMessageAt);

  const horasCambio = typeof config.changeMinHours === 'number' ? config.changeMinHours : 2;

  const guardarHorasCambio = async (valor) => {
    if (!negocioId || saving) return;
    setSaving(true);
    setError('');
    try {
      await setDoc(doc(db, 'negocios', negocioId), { assistantConfig: { changeMinHours: Number(valor) } }, { merge: true });
    } catch (err) {
      console.error('[AssistantSection] Error al guardar anticipación:', err);
      setError('No se pudo guardar el cambio. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };



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
      <div className="bg-nexus-surface border border-nexus-border rounded-xl p-4 sm:p-5 shadow-[var(--nx-shadow-sm)] text-xs text-nexus-text-muted">
        Cargando…
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start animate-fadeIn">
     <div className="space-y-4 min-w-0">
      <WhatsAppNumbersPanel negocioId={negocioId} onNumbersChange={onNumbersChange} />

      <div className="bg-nexus-surface border border-nexus-border rounded-xl p-4 sm:p-5 shadow-[var(--nx-shadow-sm)]">
        <div className="flex items-center gap-2.5 mb-1">
          <MessageCircle className="w-5 h-5 text-nexus-primary" aria-hidden="true" />
          <h3 className="text-base font-semibold text-nexus-text">Asistente de WhatsApp</h3>
        </div>
        <p className="text-sm text-nexus-text-secondary mb-4">
          Tus {tl('clients')} pueden reservar escribiendo a tu número de WhatsApp. {g('appointment', 'Los', 'Las')} {tl('appointments')} aparecen en la agenda al instante.
        </p>

        {conectado && (
          <p className="text-sm text-nexus-text-secondary">
            {ultimoMensaje ? `Último mensaje recibido ${ultimoMensaje}.` : 'Aún no se recibieron mensajes.'}
          </p>
        )}
        {!conectado && numeros !== null && (
          <p className="text-sm text-nexus-text-secondary">Conecta tu número arriba para activar el asistente.</p>
        )}

        <div className={`mt-4 flex items-center justify-between gap-3 p-3 bg-nexus-background border border-nexus-border rounded-xl ${conectado ? '' : 'opacity-50'}`}>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-nexus-text">Responder automáticamente</p>
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
              <ToggleRight className="w-9 h-9 text-nexus-success" />
            ) : (
              <ToggleLeft className="w-9 h-9 text-nexus-text-muted" />
            )}
          </button>
        </div>
        <div className={`mt-3 p-3 bg-nexus-background border border-nexus-border rounded-xl ${conectado ? '' : 'opacity-50'}`}>
          <p className="text-sm font-semibold text-nexus-text">Reprogramar por WhatsApp</p>
          <p className="text-xs text-nexus-text-muted mb-2">
            Hasta cuándo {g('client', 'el', 'la')} {tl('client')} puede cambiar su {tl('appointment')} sin hablar con el negocio.
          </p>
          <select
            value={horasCambio}
            onChange={(e) => guardarHorasCambio(e.target.value)}
            disabled={!conectado || saving}
            className="w-full bg-nexus-surface border border-nexus-border rounded-lg px-3 py-2 text-base sm:text-sm text-nexus-text disabled:cursor-not-allowed"
          >
            {OPCIONES_ANTICIPACION.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>       
        {error && <p className="mt-2 text-xs text-nexus-error-text">{error}</p>}
      </div>

      <div className="bg-nexus-surface border border-nexus-border rounded-xl p-4 sm:p-5 shadow-[var(--nx-shadow-sm)]">
        <h3 className="text-base font-semibold text-nexus-text mb-3">Cómo funciona</h3>
        <ul className="space-y-2 text-sm text-nexus-text-secondary list-disc pl-4">
          <li>{g('client', 'El', 'La')} {tl('client')} elige {g('service', 'uno o varios', 'una o varias')} {tl('services')}, {g('professional', 'el', 'la')} {tl('professional')}, el día y la hora. Solo se ofrecen horarios realmente libres.</li>
          <li>Con «Cualquier {tl('professional')}» {g('appointment', 'el', 'la')} {tl('appointment')} queda como <b>Pendiente</b>: si solo {g('professional', 'un', 'una')} {tl('professional')} está libre se asigna {g('appointment', 'solo', 'sola')}; si hay {g('professional', 'varios', 'varias')}, decides tú.</li>
          <li>Con «Hablar con alguien» recibes un aviso y el asistente deja de responder en ese chat por 2 horas para que una persona atienda. Si {g('client', 'el', 'la')} {tl('client')} escribe «menu», vuelve el asistente.</li>
          <li>Si {g('client', 'el', 'la')} {tl('client')} ya tiene {g('appointment', 'un', 'una')} {tl('appointment')}, el saludo se lo muestra con la opción <b>Reprogramar</b> (día, hora y {tl('professional')}), respetando la anticipación que elijas arriba. Para cancelar, {g('client', 'el', 'la')} {tl('client')} debe hablar con el negocio.</li>
          <li>{g('professional', 'El', 'La')} {tl('professional')} recibe la notificación de cada reserva nueva o reprogramada.</li>
        </ul>
      </div>
     </div>

      <div className="min-w-0">
        <AssistantPersonalitySection
          negocioId={negocioId}
          personalidad={config.personalidad}
          businessName={negocio?.heroConfig?.businessName || ''}
        />
      </div>
    </div>
  );
}
