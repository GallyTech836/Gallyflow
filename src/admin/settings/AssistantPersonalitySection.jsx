import React, { useEffect, useMemo, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { Sparkles, Check } from 'lucide-react';
import { db } from '../../firebase/config';
import { useBusinessTerms } from '../../shared/businessProfiles/useBusinessProfile';
import { LISTA_TONOS, crearVoz, normalizarPersonalidad } from '../../shared/assistant/personalidad';

// Personalidad del asistente de WhatsApp (negocios/{id}.assistantConfig.personalidad).
// Solo cambia CÓMO habla el bot: saludo, despedida, trato tú/usted y emojis.
// Los botones, opciones y el flujo de reserva no cambian.

const OPCIONES_EMOJIS = [
  { value: 'auto', label: 'Según la personalidad' },
  { value: 'si', label: 'Sí, usar emojis' },
  { value: 'no', label: 'No usar emojis' },
];

const emojisAValor = (e) => (e === true ? 'si' : e === false ? 'no' : 'auto');
const valorAEmojis = (v) => (v === 'si' ? true : v === 'no' ? false : null);

export default function AssistantPersonalitySection({ negocioId, personalidad, businessName = '', disabled = false }) {
  const { t, tl, g } = useBusinessTerms();
  const guardada = useMemo(() => normalizarPersonalidad(personalidad), [personalidad]);
  const [draft, setDraft] = useState(guardada);
  const [saving, setSaving] = useState(false);
  const [mensaje, setMensaje] = useState('');

  // Si cambia en Firestore (otra pestaña / otro admin), se refleja.
  useEffect(() => { setDraft(guardada); }, [guardada]);

  const cambios = JSON.stringify(draft) !== JSON.stringify(guardada);
  const negocio = businessName || 'tu negocio';
  const hora = new Date().getHours();
  const voz = crearVoz(draft, { negocio, hora });
  const cita = tl('appointment');

  const set = (campo, valor) => { setMensaje(''); setDraft((d) => ({ ...d, [campo]: valor })); };

  const guardar = async () => {
    if (!negocioId || saving || !cambios) return;
    setSaving(true);
    setMensaje('');
    try {
      const limpio = normalizarPersonalidad(draft);
      await setDoc(doc(db, 'negocios', negocioId), { assistantConfig: { personalidad: limpio } }, { merge: true });
      setMensaje('Guardado. El asistente empieza a usarlo en menos de un minuto.');
    } catch (err) {
      console.error('[AssistantPersonalitySection] Error al guardar:', err);
      setMensaje('No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`bg-nexus-surface border border-nexus-border rounded-xl p-4 sm:p-5 shadow-[var(--nx-shadow-sm)] ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2.5 mb-1">
        <Sparkles className="w-5 h-5 text-nexus-primary" aria-hidden="true" />
        <h3 className="text-base font-semibold text-nexus-text">Personalidad del asistente</h3>
      </div>
      <p className="text-sm text-nexus-text-secondary mb-4">
        Elige cómo habla el asistente con tus {tl('clients')}. Solo cambia el tono de los mensajes: las opciones y la forma de reservar son las mismas.
      </p>

      {/* Tono */}
      <p className="text-sm font-semibold text-nexus-text mb-2">Personalidad</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {LISTA_TONOS.map((tono) => {
          const activo = draft.tono === tono.id;
          return (
            <button
              key={tono.id}
              type="button"
              disabled={disabled}
              onClick={() => set('tono', tono.id)}
              aria-pressed={activo}
              className={`text-left p-3 rounded-xl border transition-colors cursor-pointer disabled:cursor-not-allowed ${
                activo ? 'border-nexus-primary bg-nexus-primary-soft' : 'border-nexus-border bg-nexus-background hover:border-nexus-primary/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm font-bold ${activo ? 'text-nexus-primary' : 'text-nexus-text'}`}>{tono.label}</span>
                {activo && <Check className="w-4 h-4 text-nexus-primary shrink-0" />}
              </div>
              <p className="mt-1 text-xs text-nexus-text-secondary">{tono.descripcion}</p>
            </button>
          );
        })}
      </div>

      {/* Ajustes que se combinan con cualquier personalidad */}
      <div className="mt-4 grid grid-cols-1 gap-3">
        <div className="p-3 bg-nexus-background border border-nexus-border rounded-xl">
          <label htmlFor="asistente-emojis" className="text-sm font-semibold text-nexus-text">Emojis</label>
          <p className="text-xs text-nexus-text-muted mb-2">Puedes combinar cualquier personalidad con o sin emojis.</p>
          <select
            id="asistente-emojis"
            value={emojisAValor(draft.emojis)}
            onChange={(e) => set('emojis', valorAEmojis(e.target.value))}
            disabled={disabled}
            className="w-full bg-nexus-surface border border-nexus-border rounded-lg px-3 py-2 text-base sm:text-sm text-nexus-text disabled:cursor-not-allowed"
          >
            {OPCIONES_EMOJIS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="p-3 bg-nexus-background border border-nexus-border rounded-xl">
          <label htmlFor="asistente-saludo" className="text-sm font-semibold text-nexus-text">Saludo propio (opcional)</label>
          <p className="text-xs text-nexus-text-muted mb-2">
            Reemplaza la primera frase del saludo. Puedes usar <b>{'{nombre}'}</b> ({g('client', 'el', 'la')} {tl('client')}) y <b>{'{negocio}'}</b>. Vacío = el saludo de la personalidad.
          </p>
          <textarea
            id="asistente-saludo"
            rows={2}
            maxLength={300}
            value={draft.saludo}
            onChange={(e) => set('saludo', e.target.value)}
            disabled={disabled}
            placeholder={crearVoz({ tono: draft.tono, emojis: draft.emojis }, { negocio, hora }).bienvenida('{nombre}')}
            className="w-full bg-nexus-surface border border-nexus-border rounded-lg px-3 py-2 text-base sm:text-sm text-nexus-text disabled:cursor-not-allowed"
          />
        </div>

        <div className="p-3 bg-nexus-background border border-nexus-border rounded-xl">
          <label htmlFor="asistente-despedida" className="text-sm font-semibold text-nexus-text">Mensaje al confirmar {g('appointment', 'un', 'una')} {cita} (opcional)</label>
          <p className="text-xs text-nexus-text-muted mb-2">Se agrega al final de la confirmación. Ej.: «Llega 5 minutos antes, por favor».</p>
          <textarea
            id="asistente-despedida"
            rows={2}
            maxLength={300}
            value={draft.despedida}
            onChange={(e) => set('despedida', e.target.value)}
            disabled={disabled}
            className="w-full bg-nexus-surface border border-nexus-border rounded-lg px-3 py-2 text-base sm:text-sm text-nexus-text disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* Vista previa */}
      <p className="mt-4 text-sm font-semibold text-nexus-text mb-2">Vista previa</p>
      <div className="p-3 bg-nexus-background border border-nexus-border rounded-xl space-y-2">
        <div className="max-w-sm bg-nexus-surface border border-nexus-border rounded-xl p-3 shadow-sm">
          <Lineas texto={`${voz.bienvenida('Juan')} ${voz.ayuda()}`} />
          <div className="mt-2 flex flex-wrap gap-2">
            {[`Agendar ${cita}`, 'Hablar con alguien'].map((b) => (
              <span key={b} className="px-3 py-1.5 rounded-lg border border-nexus-border text-xs font-bold text-nexus-primary">{b}</span>
            ))}
          </div>
        </div>
        <div className="max-w-sm bg-nexus-surface border border-nexus-border rounded-xl p-3 shadow-sm">
          <Lineas texto={voz.texto(`✅ ${t('appointment')} ${g('appointment', 'confirmado', 'confirmada')} para mañana a las 10:00. ${voz.gracias()}${voz.despedida() ? `\n\n${voz.despedida()}` : ''}`)} />
        </div>
        <div className="max-w-sm bg-nexus-surface border border-nexus-border rounded-xl p-3 shadow-sm">
          <p className="text-xs text-nexus-text">{voz.texto(`${voz.noEntendi()} ¿Qué ${tl('service')} deseas?`)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={disabled || saving || !cambios}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-nexus-primary px-4 text-sm font-semibold text-white hover:bg-nexus-primary-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {saving ? 'Guardando…' : 'Guardar personalidad'}
        </button>
        {cambios && !saving && (
          <button
            type="button"
            onClick={() => { setDraft(guardada); setMensaje(''); }}
            className="text-sm font-semibold text-nexus-text-secondary hover:underline cursor-pointer"
          >
            Descartar cambios
          </button>
        )}
        {mensaje && <p className="text-xs text-nexus-text-muted">{mensaje}</p>}
      </div>
    </div>
  );
}

// Texto con saltos de línea (como se ve en WhatsApp).
function Lineas({ texto = '' }) {
  return (
    <div className="space-y-1">
      {String(texto).split(/\n+/).filter(Boolean).map((l, i) => (
        <p key={i} className="text-xs text-nexus-text">{l}</p>
      ))}
    </div>
  );
}
