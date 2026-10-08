import { useMemo, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { X, Plus, Trash2, Pencil } from 'lucide-react';
import { db } from '../../firebase/config';
import { canUse } from '../capabilities/capabilityModel';
import AppointmentStatusBadge from '../appointments/AppointmentStatusBadge';
import { useClientCitas } from './useClientCitas';
import {
  buildClientHistory,
  normalizeClientProfile,
  CONTACT_CHANNELS,
  BOOKING_CHANNEL_LABELS,
} from './clientHistoryModel';

/**
 * Ficha completa del cliente (genérica para cualquier tipo de negocio).
 * Pestañas: Perfil · Actividad (línea de tiempo) · Citas · Servicios · Pagos · Notas.
 * Escribe SOLO en negocios/{negocioId}/clientes/{client.id} con merge, así que
 * los campos existentes (name, phone, visits, totalSpent...) no se tocan.
 */

// `capability`: capacidad del plan que habilita la pestaña (ver capabilityModel).
const TABS = [
  { id: 'perfil', label: 'Perfil' },
  { id: 'actividad', label: 'Actividad', capability: 'historialCliente' },
  { id: 'citas', label: 'Citas', capability: 'historialCliente' },
  { id: 'servicios', label: 'Servicios', capability: 'historialCliente' },
  { id: 'pagos', label: 'Pagos', capability: 'historialCliente' },
  { id: 'notas', label: 'Notas', capability: 'fichaCliente' },
];

const GENERIC_FIELD_SUGGESTIONS = ['Alergias', 'Empresa', 'Cómo nos conoció', 'Observaciones'];

const KIND_STYLES = {
  appointment: 'bg-nexus-info-bg text-nexus-info-text',
  service: 'bg-nexus-success-bg text-nexus-success-text',
  cancel: 'bg-nexus-error-bg text-nexus-error-text',
  payment: 'bg-nexus-warning-bg text-nexus-warning-text',
  note: 'bg-nexus-primary-soft text-nexus-primary',
  client: 'bg-nexus-surface-hover text-nexus-text-secondary',
};

const inputCls = 'w-full bg-nexus-background border border-nexus-border rounded-lg p-2.5 text-xs text-nexus-text outline-none focus:border-nexus-primary disabled:opacity-70 disabled:cursor-default';
const labelCls = 'text-[10px] text-nexus-text-secondary font-bold block mb-1 uppercase tracking-wider';

const money = (n) => `${Number(n || 0).toFixed(Number.isInteger(Number(n)) ? 0 : 2)} Bs`;
const fmtDate = (d) => {
  if (!d) return '—';
  const m = String(d).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
};
const fmtDateTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fmtDate(iso);
  return `${fmtDate(d.toISOString())} ${d.toTimeString().slice(0, 5)}`;
};
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

function Empty({ children }) {
  return <p className="text-center text-xs text-nexus-text-muted py-8">{children}</p>;
}

export default function ClientProfileModal({
  negocioId,
  client,
  professionals = [],
  services = [],
  fieldSuggestions = [],
  onClose,
  onToast = () => {},
  capabilities = null, // null = todo habilitado (compatibilidad)
}) {
  const allow = (key) => !capabilities || canUse(capabilities, key);
  const visibleTabs = TABS.filter((t) => !t.capability || allow(t.capability));
  const [tab, setTab] = useState('perfil');
  const { citas, loading, error, reload } = useClientCitas(negocioId, client);
  const history = useMemo(() => buildClientHistory(client, citas, { professionals }), [client, citas, professionals]);
  const profile = useMemo(() => normalizeClientProfile(client), [client]);

  // Borrador editable del perfil (se re-inicializa solo si cambia de cliente).
  const [draftFor, setDraftFor] = useState(client.id);
  const [draft, setDraft] = useState(() => ({
    name: client.name || '',
    phone: client.phone && client.phone !== 'N/A' ? client.phone : '',
    email: profile.email,
    birthDate: profile.birthDate,
    address: profile.address,
    preferences: profile.preferences,
    customFields: profile.customFields,
  }));
  if (draftFor !== client.id) {
    setDraftFor(client.id);
    setDraft({
      name: client.name || '',
      phone: client.phone && client.phone !== 'N/A' ? client.phone : '',
      email: profile.email, birthDate: profile.birthDate, address: profile.address,
      preferences: profile.preferences, customFields: profile.customFields,
    });
  }

  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [noteText, setNoteText] = useState('');

  const clientRef = () => doc(db, 'negocios', negocioId, 'clientes', client.id);
  const cancelEdit = () => {
    setDraft({
      name: client.name || '',
      phone: client.phone && client.phone !== 'N/A' ? client.phone : '',
      email: profile.email, birthDate: profile.birthDate, address: profile.address,
      preferences: profile.preferences, customFields: profile.customFields,
    });
    setEditing(false);
  };

  const saveProfile = async () => {
    if (!draft.name.trim()) { onToast('El nombre del cliente es obligatorio.', 'error'); return; }
    setSaving(true);
    try {
      await setDoc(clientRef(), {
        name: draft.name.trim(),
        phone: draft.phone.trim() || 'N/A',
        email: draft.email.trim(),
        birthDate: draft.birthDate,
        address: draft.address.trim(),
        preferences: draft.preferences,
        customFields: draft.customFields.filter((f) => f.label.trim()),
      }, { merge: true });
      onToast('Ficha del cliente guardada.');
      setEditing(false);
    } catch (err) {
      onToast('Error al guardar la ficha: ' + err.message, 'error');
    }
    setSaving(false);
  };

  const addNote = async () => {
    const text = noteText.trim();
    if (!text) return;
    try {
      await setDoc(clientRef(), { notes: [{ id: uid(), text, createdAt: new Date().toISOString() }, ...profile.notes] }, { merge: true });
      setNoteText('');
    } catch (err) {
      onToast('Error al guardar la nota: ' + err.message, 'error');
    }
  };

  const deleteNote = async (id) => {
    try {
      await setDoc(clientRef(), { notes: profile.notes.filter((n) => n.id !== id) }, { merge: true });
    } catch (err) {
      onToast('Error al eliminar la nota: ' + err.message, 'error');
    }
  };

  const setPref = (k, v) => setDraft((d) => ({ ...d, preferences: { ...d.preferences, [k]: v } }));
  const setField = (id, k, v) => setDraft((d) => ({ ...d, customFields: d.customFields.map((f) => (f.id === id ? { ...f, [k]: v } : f)) }));
  const suggestions = [...new Set([...GENERIC_FIELD_SUGGESTIONS, ...fieldSuggestions])];
  const { stats } = history;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-nexus-surface border border-nexus-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden">

        {/* Cabecera + métricas sobre fondo suave */}
        <div className="bg-gradient-to-b from-nexus-surface-hover to-nexus-background border-b border-nexus-border">
        <div className="p-5 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-full bg-nexus-primary-soft text-nexus-primary font-black flex items-center justify-center text-lg shrink-0 ring-2 ring-nexus-surface">
                {(client.name || '?').trim().charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-extrabold text-nexus-text truncate">{client.name}</h3>
                <p className="text-[11px] text-nexus-text-muted font-mono">{client.phone && client.phone !== 'N/A' ? client.phone : 'Sin teléfono'}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => { setTab('perfil'); setEditing(true); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-nexus-border bg-nexus-surface hover:bg-nexus-surface-hover text-[10px] font-black tracking-wider text-nexus-text cursor-pointer"
              >
                <Pencil className="w-3 h-3" />
                EDITAR
              </button>
              <button onClick={onClose} className="p-1.5 hover:bg-nexus-surface-hover rounded-lg text-nexus-text-secondary cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 px-5 pb-5">
            {[
              ['Citas', stats.total],
              ['Completadas', stats.completed],
              ['Total pagado', money(stats.totalPaid)],
              ['Última visita', fmtDate(stats.lastVisit || client.lastVisit)],
            ].map(([l, v]) => (
              <div key={l} className="bg-nexus-surface border border-nexus-border rounded-2xl px-3.5 py-3 shadow-sm">
                <span className="text-[9px] uppercase tracking-wider text-nexus-text-muted font-bold block">{l}</span>
                <span className="text-sm font-black text-nexus-text">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pestañas */}
        <div className="flex gap-1 px-4 pt-3 overflow-x-auto no-scrollbar">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                tab === t.id ? 'bg-nexus-primary text-white' : 'bg-nexus-background text-nexus-text-secondary hover:text-nexus-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab !== 'perfil' && tab !== 'notas' && loading && <Empty>Cargando historial...</Empty>}
          {tab !== 'perfil' && tab !== 'notas' && error && (
            <div className="text-center py-6 space-y-2">
              <p className="text-xs text-nexus-error-text">{error}</p>
              <button onClick={reload} className="px-3 py-1.5 bg-nexus-surface border border-nexus-border rounded-lg text-xs font-bold text-nexus-text cursor-pointer">Reintentar</button>
            </div>
          )}

          {/* PERFIL */}
          {tab === 'perfil' && (
            <div className="space-y-5">
              <fieldset disabled={!editing} className="space-y-5 min-w-0 border-0 p-0 m-0">
              <div>
                <h4 className="text-[11px] font-black uppercase text-nexus-text-secondary tracking-wider font-mono mb-2">Información básica</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className={labelCls}>Nombre *</label><input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
                  <div><label className={labelCls}>Teléfono / Celular</label><input type="tel" className={inputCls} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></div>
                  <div><label className={labelCls}>Correo</label><input type="email" className={inputCls} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
                  <div><label className={labelCls}>Fecha de nacimiento</label><input type="date" className={inputCls} value={draft.birthDate} onChange={(e) => setDraft({ ...draft, birthDate: e.target.value })} /></div>
                  <div className="sm:col-span-2"><label className={labelCls}>Dirección</label><input className={inputCls} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></div>
                </div>
              </div>

              {allow('preferenciasCliente') && (
              <div>
                <h4 className="text-[11px] font-black uppercase text-nexus-text-secondary tracking-wider font-mono mb-2">Preferencias</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Profesional preferido</label>
                    <select className={inputCls} value={draft.preferences.preferredProfessionalId} onChange={(e) => setPref('preferredProfessionalId', e.target.value)}>
                      <option value="">Sin preferencia</option>
                      {professionals.filter((p) => p?.active !== false).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Canal de contacto</label>
                    <select className={inputCls} value={draft.preferences.contactChannel} onChange={(e) => setPref('contactChannel', e.target.value)}>
                      {CONTACT_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Detalle de preferencias</label>
                    <textarea rows={2} className={inputCls} placeholder="Ej. prefiere horarios de tarde, evita..." value={draft.preferences.details} onChange={(e) => setPref('details', e.target.value)} />
                  </div>
                </div>
              </div>
              )}

              {allow('camposPersonalizados') && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[11px] font-black uppercase text-nexus-text-secondary tracking-wider font-mono">Campos personalizados</h4>
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, customFields: [...d.customFields, { id: uid(), label: '', value: '' }] }))}
                    className="text-[10px] text-nexus-primary font-bold flex items-center gap-1 cursor-pointer"
                  ><Plus className="w-3 h-3" /> Agregar campo</button>
                </div>
                <datalist id="client-field-suggestions">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
                {draft.customFields.length === 0 && <p className="text-[11px] text-nexus-text-muted">Agrega datos propios de tu negocio (alergias, empresa, medidas, etc.).</p>}
                <div className="space-y-2">
                  {draft.customFields.map((f) => (
                    <div key={f.id} className="flex gap-2">
                      <input list="client-field-suggestions" className={`${inputCls} w-2/5`} placeholder="Campo" value={f.label} onChange={(e) => setField(f.id, 'label', e.target.value)} />
                      <input className={inputCls} placeholder="Valor" value={f.value} onChange={(e) => setField(f.id, 'value', e.target.value)} />
                      <button type="button" onClick={() => setDraft((d) => ({ ...d, customFields: d.customFields.filter((x) => x.id !== f.id) }))} className="p-2 text-nexus-error-text hover:bg-nexus-error-bg rounded-lg cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
              )}

              </fieldset>

              {editing && (
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={cancelEdit} className="px-4 py-2 bg-nexus-surface border border-nexus-border text-nexus-text-secondary text-xs font-semibold rounded-lg hover:bg-nexus-surface-hover cursor-pointer">
                    Cancelar
                  </button>
                  <button onClick={saveProfile} disabled={saving} className="px-5 py-2 bg-nexus-primary hover:bg-nexus-primary-hover text-white text-xs font-bold rounded-lg shadow-md cursor-pointer disabled:opacity-50">
                    {saving ? 'Guardando...' : 'Guardar ficha'}
                  </button>
                </div>
              )}

              
            </div>
          )}

          {/* ACTIVIDAD */}
          {tab === 'actividad' && !loading && !error && (
            history.timeline.length === 0 ? <Empty>Este cliente aún no tiene actividad.</Empty> : (
              <ol className="relative border-l border-nexus-border ml-2 space-y-4">
                {history.timeline.map((ev) => (
                  <li key={ev.id} className="pl-4 relative">
                    <span className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border border-nexus-surface ${KIND_STYLES[ev.kind]?.split(' ')[0] || 'bg-nexus-border'}`} />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${KIND_STYLES[ev.kind] || ''}`}>{ev.title}</span>
                        {ev.detail && <p className="text-xs text-nexus-text-secondary mt-1 break-words">{ev.detail}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        {typeof ev.amount === 'number' && <span className="text-xs font-black text-nexus-text block">{money(ev.amount)}</span>}
                        <span className="text-[10px] text-nexus-text-muted font-mono">{fmtDateTime(ev.at)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )
          )}

          {/* CITAS */}
          {tab === 'citas' && !loading && !error && (
            history.appointments.length === 0 ? <Empty>Sin citas registradas.</Empty> : (
              <div className="space-y-2">
                {history.appointments.map((a) => (
                  <div key={a.id} className="bg-nexus-background border border-nexus-border rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-nexus-text font-mono">{fmtDate(a.date)} · {a.time}</span>
                      <AppointmentStatusBadge status={a.status} size="xs" />
                    </div>
                    <p className="text-xs text-nexus-text mt-1">{a.serviceLabel}</p>
                    <p className="text-[10px] text-nexus-text-muted mt-0.5">
                      {[a.professionalName, a.branch, a.bookedBy && (BOOKING_CHANNEL_LABELS[a.bookedBy] || a.bookedBy)].filter(Boolean).join(' · ')}
                    </p>
                    {a.notes && <p className="text-[10px] italic text-nexus-text-secondary mt-1">Nota: {a.notes}</p>}
                  </div>
                ))}
              </div>
            )
          )}

          {/* SERVICIOS */}
          {tab === 'servicios' && !loading && !error && (
            history.services.length === 0 ? <Empty>Sin servicios registrados.</Empty> : (
              <div className="space-y-2">
                {history.services.map((s) => (
                  <div key={s.key} className="flex items-center justify-between bg-nexus-background border border-nexus-border rounded-xl p-3">
                    <div>
                      <p className="text-xs font-bold text-nexus-text">{s.name}</p>
                      <p className="text-[10px] text-nexus-text-muted">{s.count} {s.count === 1 ? 'vez' : 'veces'} · último: {fmtDate(s.lastDate)}</p>
                    </div>
                    <span className="text-xs font-black text-nexus-text">{money(s.spent)}</span>
                  </div>
                ))}
              </div>
            )
          )}

          {/* PAGOS */}
          {tab === 'pagos' && !loading && !error && (
            history.payments.length === 0 ? <Empty>Sin pagos registrados.</Empty> : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-nexus-success-bg text-nexus-success-text text-[11px] font-bold">Total: {money(stats.totalPaid)}</span>
                  <span className="px-2.5 py-1 rounded-lg bg-nexus-surface-hover text-nexus-text-secondary text-[11px] font-bold">Ticket promedio: {money(stats.averageTicket)}</span>
                  {Object.entries(history.byMethod).map(([m, v]) => (
                    <span key={m} className="px-2.5 py-1 rounded-lg bg-nexus-surface-hover text-nexus-text-secondary text-[11px] font-bold">{m}: {money(v)}</span>
                  ))}
                </div>
                <div className="space-y-2">
                  {history.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between bg-nexus-background border border-nexus-border rounded-xl p-3">
                      <div>
                        <p className="text-xs font-bold text-nexus-text">{p.label}</p>
                        <p className="text-[10px] text-nexus-text-muted font-mono">{fmtDate(p.date)} · {p.method}</p>
                      </div>
                      <span className="text-xs font-black text-nexus-text">{money(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}

          {/* NOTAS */}
          {tab === 'notas' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <textarea rows={2} className={inputCls} placeholder="Escribe una nota sobre este cliente..." value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                <button onClick={addNote} disabled={!noteText.trim()} className="px-3 bg-nexus-primary text-white text-xs font-bold rounded-lg cursor-pointer disabled:opacity-40">Agregar</button>
              </div>
              {profile.notes.length === 0 ? <Empty>Sin notas.</Empty> : profile.notes.map((n) => (
                <div key={n.id} className="bg-nexus-background border border-nexus-border rounded-xl p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-nexus-text whitespace-pre-wrap break-words">{n.text}</p>
                    <p className="text-[10px] text-nexus-text-muted font-mono mt-1">{fmtDateTime(n.createdAt)}</p>
                  </div>
                  <button onClick={() => deleteNote(n.id)} className="p-1 text-nexus-error-text hover:bg-nexus-error-bg rounded cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          </div>
  
          
        </div>
      </div>
    );
  }
