import { useMemo, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { db } from '../../firebase/config';
import { canUse } from '../capabilities/capabilityModel';
import AppointmentStatusBadge from '../appointments/AppointmentStatusBadge';
import { useClientCitas } from './useClientCitas';
import {
  buildClientHistory,
  normalizeClientProfile,
  CONTACT_CHANNELS,
  bookingChannelLabel,
} from './clientHistoryModel';
import { useBusinessTerms } from '../businessProfiles/useBusinessProfile';
import { Modal, Button, IconButton, LoadingState, EmptyState } from '../ui';

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
  { id: 'citas', label: 'Citas', termKey: 'appointments', capability: 'historialCliente' },
  { id: 'servicios', label: 'Servicios', termKey: 'services', capability: 'historialCliente' },
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

// Mismo estilo que los campos de shared/ui (16px en celular para que iOS no haga zoom).
const inputCls = 'w-full min-h-10 bg-nexus-surface border border-nexus-border rounded-lg px-3 py-2 text-base sm:text-sm text-nexus-text placeholder:text-nexus-text-muted outline-none focus:border-nexus-primary focus:ring-2 focus:ring-nexus-primary/20 disabled:bg-nexus-background disabled:opacity-80 disabled:cursor-default';
const labelCls = 'text-xs font-medium text-nexus-text-secondary block mb-1.5';
const sectionTitleCls = 'text-sm font-semibold text-nexus-text mb-3';

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
  return <EmptyState description={children} className="py-8" />;
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
  const terms = useBusinessTerms();
  const allow = (key) => !capabilities || canUse(capabilities, key);
  const visibleTabs = TABS.filter((t) => !t.capability || allow(t.capability));
  const [tab, setTab] = useState('perfil');
  const { citas, loading, error, reload } = useClientCitas(negocioId, client);
  const history = useMemo(() => buildClientHistory(client, citas, { professionals, terms }), [client, citas, professionals, terms]);
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
    if (!draft.name.trim()) { onToast(`El nombre ${terms.g('client', 'del', 'de la')} ${terms.tl('client')} es obligatorio.`, 'error'); return; }
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
      onToast(`Ficha ${terms.g('client', 'del', 'de la')} ${terms.tl('client')} guardada.`);
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
    <Modal
      onClose={onClose}
      title={client.name}
      description={client.phone && client.phone !== 'N/A' ? client.phone : 'Sin teléfono'}
      size="lg"
      flush
    >
        {/* Métricas + editar */}
        <div className="border-b border-nexus-border bg-nexus-background px-5 py-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              [terms.t('appointments'), stats.total],
              [terms.g('appointment', 'Completados', 'Completadas'), stats.completed],
              ['Total pagado', money(stats.totalPaid)],
              ['Última visita', fmtDate(stats.lastVisit || client.lastVisit)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-nexus-border bg-nexus-surface px-3 py-2.5">
                <span className="block text-xs text-nexus-text-muted">{l}</span>
                <span className="nx-num block text-base font-semibold text-nexus-text">{v}</span>
              </div>
            ))}
          </div>
          {!editing && (
            <Button
              variant="secondary"
              size="sm"
              icon={Pencil}
              onClick={() => { setTab('perfil'); setEditing(true); }}
              className="mt-3"
            >
              Editar ficha
            </Button>
          )}
        </div>

        {/* Pestañas */}
        <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-nexus-border px-3 no-scrollbar">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px h-11 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors cursor-pointer ${
                tab === t.id ? 'border-nexus-primary text-nexus-primary' : 'border-transparent text-nexus-text-secondary hover:text-nexus-text'
              }`}
            >
              {t.termKey ? terms.t(t.termKey) : t.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab !== 'perfil' && tab !== 'notas' && loading && <LoadingState label="Cargando historial…" />}
          {tab !== 'perfil' && tab !== 'notas' && error && (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm text-nexus-error-text">{error}</p>
              <Button variant="secondary" size="sm" onClick={reload}>Reintentar</Button>
            </div>
          )}

          {/* PERFIL */}
          {tab === 'perfil' && (
            <div className="space-y-5">
              <fieldset disabled={!editing} className="space-y-5 min-w-0 border-0 p-0 m-0">
              <div>
                <h4 className={sectionTitleCls}>Información básica</h4>
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
                <h4 className={sectionTitleCls}>Preferencias</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>{terms.t('professional')} {terms.g('professional', 'preferido', 'preferida')}</label>
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
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-nexus-text">Campos personalizados</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Plus}
                    onClick={() => setDraft((d) => ({ ...d, customFields: [...d.customFields, { id: uid(), label: '', value: '' }] }))}
                    className="text-nexus-primary"
                  >Agregar campo</Button>
                </div>
                <datalist id="client-field-suggestions">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
                {draft.customFields.length === 0 && <p className="text-sm text-nexus-text-muted">Agrega datos propios de tu negocio (alergias, empresa, medidas, etc.).</p>}
                <div className="space-y-2">
                  {draft.customFields.map((f) => (
                    <div key={f.id} className="flex gap-2">
                      <input list="client-field-suggestions" className={`${inputCls} w-2/5`} placeholder="Campo" value={f.label} onChange={(e) => setField(f.id, 'label', e.target.value)} />
                      <input className={inputCls} placeholder="Valor" value={f.value} onChange={(e) => setField(f.id, 'value', e.target.value)} />
                      <IconButton icon={Trash2} label="Quitar campo" tone="danger" onClick={() => setDraft((d) => ({ ...d, customFields: d.customFields.filter((x) => x.id !== f.id) }))} />
                    </div>
                  ))}
                </div>
              </div>
              )}

              </fieldset>

              {editing && (
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="secondary" onClick={cancelEdit} fullWidth className="sm:w-auto">Cancelar</Button>
                  <Button onClick={saveProfile} loading={saving} fullWidth className="sm:w-auto">Guardar ficha</Button>
                </div>
              )}

              
            </div>
          )}

          {/* ACTIVIDAD */}
          {tab === 'actividad' && !loading && !error && (
            history.timeline.length === 0 ? <Empty>{terms.g('client', 'Este', 'Esta')} {terms.tl('client')} aún no tiene actividad.</Empty> : (
              <ol className="relative border-l border-nexus-border ml-2 space-y-4">
                {history.timeline.map((ev) => (
                  <li key={ev.id} className="pl-4 relative">
                    <span className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border border-nexus-surface ${KIND_STYLES[ev.kind]?.split(' ')[0] || 'bg-nexus-border'}`} />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${KIND_STYLES[ev.kind] || ''}`}>{ev.title}</span>
                        {ev.detail && <p className="mt-1 break-words text-sm text-nexus-text-secondary">{ev.detail}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        {typeof ev.amount === 'number' && <span className="nx-num block text-sm font-semibold text-nexus-text">{money(ev.amount)}</span>}
                        <span className="nx-num text-xs text-nexus-text-muted">{fmtDateTime(ev.at)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )
          )}

          {/* CITAS */}
          {tab === 'citas' && !loading && !error && (
            history.appointments.length === 0 ? <Empty>Sin {terms.tl('appointments')} {terms.g('appointment', 'registrados', 'registradas')}.</Empty> : (
              <div className="space-y-2">
                {history.appointments.map((a) => (
                  <div key={a.id} className="rounded-xl border border-nexus-border bg-nexus-background p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="nx-num text-sm font-semibold text-nexus-text">{fmtDate(a.date)} · {a.time}</span>
                      <AppointmentStatusBadge status={a.status} size="xs" />
                    </div>
                    <p className="mt-1 text-sm text-nexus-text">{a.serviceLabel}</p>
                    <p className="mt-0.5 text-xs text-nexus-text-muted">
                      {[a.professionalName, a.branch, a.bookedBy && bookingChannelLabel(a.bookedBy, terms)].filter(Boolean).join(' · ')}
                    </p>
                    {a.notes && <p className="mt-1 text-xs italic text-nexus-text-secondary">Nota: {a.notes}</p>}
                  </div>
                ))}
              </div>
            )
          )}

          {/* SERVICIOS */}
          {tab === 'servicios' && !loading && !error && (
            history.services.length === 0 ? <Empty>Sin {terms.tl('services')} {terms.g('service', 'registrados', 'registradas')}.</Empty> : (
              <div className="space-y-2">
                {history.services.map((s) => (
                  <div key={s.key} className="flex items-center justify-between gap-3 rounded-xl border border-nexus-border bg-nexus-background p-3">
                    <div>
                      <p className="text-sm font-semibold text-nexus-text">{s.name}</p>
                      <p className="text-xs text-nexus-text-muted">{s.count} {s.count === 1 ? 'vez' : 'veces'} · último: {fmtDate(s.lastDate)}</p>
                    </div>
                    <span className="nx-num text-sm font-semibold text-nexus-text">{money(s.spent)}</span>
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
                  <span className="nx-num rounded-lg bg-nexus-success-bg px-2.5 py-1 text-sm font-medium text-nexus-success-text">Total: {money(stats.totalPaid)}</span>
                  <span className="nx-num rounded-lg bg-nexus-surface-hover px-2.5 py-1 text-sm font-medium text-nexus-text-secondary">Ticket promedio: {money(stats.averageTicket)}</span>
                  {Object.entries(history.byMethod).map(([m, v]) => (
                    <span key={m} className="nx-num rounded-lg bg-nexus-surface-hover px-2.5 py-1 text-sm font-medium text-nexus-text-secondary">{m}: {money(v)}</span>
                  ))}
                </div>
                <div className="space-y-2">
                  {history.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-nexus-border bg-nexus-background p-3">
                      <div>
                        <p className="text-sm font-semibold text-nexus-text">{p.label}</p>
                        <p className="nx-num text-xs text-nexus-text-muted">{fmtDate(p.date)} · {p.method}</p>
                      </div>
                      <span className="nx-num text-sm font-semibold text-nexus-text">{money(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}

          {/* NOTAS */}
          {tab === 'notas' && (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <textarea rows={2} className={inputCls} placeholder={`Escribe una nota sobre ${terms.g('client', 'este', 'esta')} ${terms.tl('client')}...`} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                <Button onClick={addNote} disabled={!noteText.trim()} className="sm:self-stretch">Agregar</Button>
              </div>
              {profile.notes.length === 0 ? <Empty>Sin notas.</Empty> : profile.notes.map((n) => (
                <div key={n.id} className="flex items-start justify-between gap-3 rounded-xl border border-nexus-border bg-nexus-background p-3">
                  <div className="min-w-0">
                    <p className="whitespace-pre-wrap break-words text-sm text-nexus-text">{n.text}</p>
                    <p className="nx-num mt-1 text-xs text-nexus-text-muted">{fmtDateTime(n.createdAt)}</p>
                  </div>
                  <IconButton icon={Trash2} label="Eliminar nota" tone="danger" onClick={() => deleteNote(n.id)} className="-mr-1 -mt-1" />
                </div>
              ))}
            </div>
          )}
        </div>
    </Modal>
  );
}
