import { useState, useMemo, useEffect, useId } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { formatServicePrice } from '../servicePricing/servicePricing';
import { calculateTotals } from './serviceSelection';
import { useBusinessTerms } from '../businessProfiles/useBusinessProfile';
import { Modal, Button, Field, Input, Select, Textarea } from '../ui';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Devuelve el nombre del día (en español, igual formato que availableDays del
// servicio) para una fecha 'YYYY-MM-DD'. Devuelve null si no hay fecha.
function getDayName(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return DAY_NAMES[d.getDay()];
}

// Detecta el país por prefijo de teléfono. Lógica extraída de AdminApp.jsx.
function detectPhoneCountry(phoneNum) {
  const phone = phoneNum ? phoneNum.toString().trim() : '';
  if (!phone) return null;
  const countries = [
    { code: '+591', country: 'Bolivia',   flag: '🇧🇴' },
    { code: '+55',  country: 'Brasil',    flag: '🇧🇷' },
    { code: '+54',  country: 'Argentina', flag: '🇦🇷' },
    { code: '+56',  country: 'Chile',     flag: '🇨🇱' },
    { code: '+57',  country: 'Colombia',  flag: '🇨🇴' },
    { code: '+51',  country: 'Perú',      flag: '🇵🇪' },
    { code: '+52',  country: 'México',    flag: '🇲🇽' },
    { code: '+34',  country: 'España',    flag: '🇪🇸' },
    { code: '+1',   country: 'USA',       flag: '🇺🇸' },
  ];
  if (phone.startsWith('+')) {
    const sorted = [...countries].sort((a, b) => b.code.length - a.code.length);
    for (const c of sorted) {
      if (phone.startsWith(c.code)) return { ...c, isInternational: true };
    }
  } else {
    if (/^[367]/.test(phone)) return { code: '+591', country: 'Bolivia', flag: '🇧🇴', isInternational: false };
  }
  return null;
}

/**
 * Modal compartido para CREAR una nueva cita.
 * El componente gestiona su propio estado de formulario internamente.
 * El padre recibe el draft completo en onSubmit(draft) y ejecuta
 * su propia lógica de dominio (validación de conflictos, Firestore, etc.).
 *
 * Props:
 * - services: array de servicios del negocio
 * - professionals: array de profesionales disponibles para elegir
 * - clients: array de clientes para búsqueda (pasar [] si no aplica)
 * - initialDate: string YYYY-MM-DD — fecha preseleccionada
 * - initialTime: string HH:MM — hora preseleccionada (default '12:00')
 * - fixedProfessional: objeto barber — si se pasa, el profesional es
 *   autocompletado y no editable (caso Barber: solo ve sus propias citas)
 * - onSubmit(draft): función que recibe el objeto del formulario completo
 * - onClose: función para cerrar el modal
 */
export default function AppointmentCreateModal({
  services = [],
  professionals = [],
  clients = [],
  initialDate = '',
  initialTime = '12:00',
  initialProfessionalId = null,
  fixedProfessional = null,
  onSubmit,
  onClose,
}) {
  const terms = useBusinessTerms();
  // ── Estado interno del formulario ──────────────────────────────────
  const [draft, setDraft] = useState({
    clientName: '',
    phone: '',
    clientId: null,
    serviceIds: services[0] ? [services[0].id] : [],
    professionalId: fixedProfessional?.id || initialProfessionalId || 'pending',
    date: initialDate,
    time: initialTime,
    paymentMethod: 'Pendiente',
    notes: '',
    overtime: false,
    serviceDurations: {},
  });

  // ── Estado de UI ───────────────────────────────────────────────────
  const [clientSearch, setClientSearch] = useState('');
  const [showClientList, setShowClientList] = useState(false);
  const [showServicesList, setShowServicesList] = useState(false);
  const [isNewClient, setIsNewClient] = useState(false);
  const [showClientPhone, setShowClientPhone] = useState(false);

  // ── Derivados ──────────────────────────────────────────────────────
  const detectedCountry = useMemo(() => detectPhoneCountry(draft.phone), [draft.phone]);

  const filteredClients = useMemo(() => {
    if (!clientSearch || !clients.length) return clients;
    return clients.filter(c =>
      c?.name?.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c?.phone?.includes(clientSearch)
    );
  }, [clientSearch, clients]);

  // Servicios visibles ese día de la semana. Si un servicio no tiene
  // availableDays configurado (o viene vacío), se considera visible todos
  // los días — así no rompemos servicios creados antes de esta funcionalidad.
  //
  // Además, si hay un profesional seleccionado (o fijo, en Barber), solo se
  // muestran los servicios asignados en su campo `services`, que es un array
  // de objetos { serviceId, commissionEnabled, type, value } (también se tolera
  // un array de strings). Con "Pendiente" no se filtra por profesional.
  const servicesForDate = useMemo(() => {
    const dayName = getDayName(draft.date);
    const byDate = !dayName
      ? services
      : services.filter(s => !s?.availableDays?.length || s.availableDays.includes(dayName));

    const professional =
      fixedProfessional ||
      (draft.professionalId && draft.professionalId !== 'pending'
        ? professionals.find(b => b?.id === draft.professionalId)
        : null);

    if (!professional) return byDate;

    const assignedIds = new Set(
      (Array.isArray(professional.services) ? professional.services : [])
        .map(a => (typeof a === 'string' ? a : a?.serviceId))
        .filter(Boolean)
        .map(String)
    );

    return byDate.filter(s => assignedIds.has(String(s?.id)));
  }, [services, draft.date, draft.professionalId, professionals, fixedProfessional]);

  // Si cambia la fecha y algún servicio ya elegido deja de estar disponible
  // ese día, lo deseleccionamos automáticamente.
  useEffect(() => {
    setDraft(prev => {
      const validIds = servicesForDate.map(s => s.id);
      const filteredIds = prev.serviceIds.filter(id => validIds.includes(id));
      if (filteredIds.length === prev.serviceIds.length) return prev;
      return { ...prev, serviceIds: filteredIds };
    });
  }, [servicesForDate]);

  const change = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));
  const selectedClient = !isNewClient && draft.clientId && draft.clientName
    ? { name: draft.clientName, phone: draft.phone }
    : null;

  const toggleService = (serviceId) => {
    setDraft(prev => ({
      ...prev,
      serviceIds: prev.serviceIds.includes(serviceId)
        ? prev.serviceIds.filter(id => id !== serviceId)
        : [...prev.serviceIds, serviceId],
    }));
  };

  const changeServiceDuration = (serviceId, minutes) => {
    setDraft(prev => ({
      ...prev,
      serviceDurations: { ...prev.serviceDurations, [serviceId]: minutes },
    }));
  };

  // Evita reservas duplicadas por doble toque: mientras se guarda, el
  // formulario ignora nuevos envíos (la lógica de onSubmit no cambia).
  const [submitting, setSubmitting] = useState(false);
  const formId = useId();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (draft.serviceIds.length === 0) return;
    if (!String(draft.clientName || '').trim()) return;
  
    const servicesForCita = servicesForDate
      .filter(s => draft.serviceIds.includes(s.id))
      .map(s => {
        const customDuration = draft.overtime && draft.serviceDurations[s.id];
        return {
          serviceId: s.id,
          serviceName: s.name,
          price: s.price || 0,
          duration: customDuration ? Number(draft.serviceDurations[s.id]) : (s.duration || 30),
        };
      });
    const { totalPrice, totalDuration } = calculateTotals(servicesForCita);
  
    setSubmitting(true);
    try {
      await onSubmit({
        ...draft,
        services: servicesForCita,
        serviceId: servicesForCita[0]?.serviceId || '',
        serviceName: servicesForCita.map(s => s.serviceName).join(' + '),
        price: totalPrice,
        duration: totalDuration,
        overtime: !!draft.overtime,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const noClient = !String(draft.clientName || '').trim();
  const secondaryBtn = 'inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-nexus-primary/20 bg-nexus-primary-soft px-3 text-sm font-semibold text-nexus-primary whitespace-nowrap cursor-pointer hover:brightness-95';

  return (
    <Modal
      onClose={onClose}
      title={`Agendar ${terms.g('appointment', 'nuevo', 'nueva')} ${terms.tl('appointment')}`}
      size="md"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} fullWidth className="sm:w-auto">Cancelar</Button>
          <Button type="submit" form={formId} loading={submitting} disabled={noClient} fullWidth className="sm:w-auto">
            Confirmar reserva
          </Button>
        </>
      )}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">

        {/* ── Cliente ─────────────────────────────────────────── */}
        <Field label={terms.t('client')} required>
          {selectedClient && (
            <div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowClientPhone(v => !v)}
                  aria-expanded={showClientPhone}
                  className="flex h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-nexus-border bg-nexus-background px-3 text-left text-sm text-nexus-text cursor-pointer"
                >
                  <span className="truncate font-semibold">{selectedClient.name}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-nexus-text-secondary transition-transform ${showClientPhone ? 'rotate-180' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    change('clientId', null);
                    change('clientName', '');
                    change('phone', '');
                    setClientSearch('');
                    setShowClientPhone(false);
                    setShowClientList(true);
                  }}
                  className={secondaryBtn}
                >
                  Cambiar
                </button>
              </div>
              {showClientPhone && (
                <p className="nx-num mt-1.5 rounded-lg border border-nexus-border bg-nexus-background px-3 py-2 text-sm text-nexus-text">
                  {selectedClient.phone && selectedClient.phone !== 'N/A' ? selectedClient.phone : 'Teléfono no registrado'}
                </p>
              )}
            </div>
          )}
          <div className={`flex flex-col gap-2 sm:flex-row ${selectedClient ? 'hidden' : ''}`}>
            <div className="relative flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="h-4 w-4 text-nexus-text-muted" />
              </span>
              <Input
                type="text"
                placeholder="Buscar por nombre o número..."
                value={clientSearch}
                onChange={(e) => { setClientSearch(e.target.value); setShowClientList(true); }}
                onFocus={() => setShowClientList(true)}
                className="pl-9"
              />
            </div>
            <button
              type="button"
              onClick={() => { setIsNewClient(v => !v); change('clientName', ''); change('phone', ''); change('clientId', null); setClientSearch(''); }}
              className={secondaryBtn}
            >
              {isNewClient ? 'Elegir existente' : `+ ${terms.g('client', 'Nuevo', 'Nueva')} ${terms.tl('client')}`}
            </button>
          </div>

          {/* Resultados de búsqueda (en el flujo, para que no se corten dentro de la ventana) */}
          {!isNewClient && showClientList && clients.length > 0 && !selectedClient && (
            <div className="max-h-52 divide-y divide-nexus-border overflow-y-auto rounded-lg border border-nexus-border bg-nexus-surface">
              {filteredClients.map(c => (
                <button
                  type="button"
                  key={c?.id}
                  onClick={() => {
                    change('clientName', c?.name);
                    change('phone', c?.phone || '');
                    change('clientId', c?.id);
                    setClientSearch(c?.name);
                    setShowClientList(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-nexus-surface-hover cursor-pointer"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-nexus-text">{c?.name}</span>
                    <span className="nx-num block text-xs text-nexus-text-muted">{c?.phone}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-nexus-primary-soft px-2 py-0.5 text-xs font-medium text-nexus-primary">
                    {c?.visits ?? 0} visitas
                  </span>
                </button>
              ))}
              {filteredClients.length === 0 && (
                <p className="p-3 text-center text-sm text-nexus-text-muted">No se encontraron {terms.tl('clients')}</p>
              )}
            </div>
          )}
        </Field>

        {/* ── Datos de nuevo cliente ───────────────────────── */}
        {isNewClient && (
          <div className="space-y-3 rounded-xl border border-nexus-border bg-nexus-background p-3">
            <Field label="Nombre completo" required>
              <Input
                type="text"
                required={isNewClient}
                value={draft.clientName}
                onChange={(e) => change('clientName', e.target.value)}
                placeholder="Ej. Sebastián Mendoza"
              />
            </Field>
            <Field
              label="Número de teléfono"
              hint={detectedCountry?.isInternational ? `${terms.t('client')} internacional detectado (${detectedCountry.country})` : null}
            >
              <div className="flex h-10 items-center gap-2 rounded-lg border border-nexus-border bg-nexus-surface px-3 focus-within:border-nexus-primary">
                {detectedCountry && (
                  <span className="flex shrink-0 items-center gap-1 text-sm">
                    <span>{detectedCountry.flag}</span>
                    <span className="nx-num text-xs font-medium text-nexus-text-secondary">{detectedCountry.code}</span>
                  </span>
                )}
                <input
                  type="tel"
                  inputMode="tel"
                  value={draft.phone}
                  onChange={(e) => change('phone', e.target.value.replace(/[^0-9+]/g, ''))}
                  placeholder="70231122"
                  className="nx-num w-full border-0 bg-transparent text-base text-nexus-text outline-none sm:text-sm"
                />
              </div>
            </Field>
          </div>
        )}

        {/* ── Servicio y Profesional ───────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={terms.t('services')} required>
            <button
              type="button"
              onClick={() => setShowServicesList(prev => !prev)}
              aria-expanded={showServicesList}
              className="flex h-10 w-full items-center justify-between rounded-lg border border-nexus-border bg-nexus-surface px-3 text-left text-base text-nexus-text sm:text-sm cursor-pointer"
            >
              <span className="truncate">
                {draft.serviceIds.length > 0
                  ? servicesForDate.filter(s => draft.serviceIds.includes(s.id)).map(s => s.name).join(', ')
                  : `Selecciona ${terms.tl('services')}...`}
              </span>
              <ChevronDown className={`ml-2 h-4 w-4 shrink-0 text-nexus-text-secondary transition-transform ${showServicesList ? 'rotate-180' : ''}`} />
            </button>
            {showServicesList && (
              <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-nexus-border bg-nexus-background p-1">
                {servicesForDate.length === 0 && (
                  <p className="p-2 text-sm text-nexus-text-muted">No hay {terms.tl('services')} disponibles para el día seleccionado.</p>
                )}
                {servicesForDate.map(s => (
                  <label key={s?.id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm text-nexus-text hover:bg-nexus-surface">
                    <input
                      type="checkbox"
                      checked={draft.serviceIds.includes(s?.id)}
                      onChange={() => toggleService(s?.id)}
                      className="h-4 w-4 shrink-0 accent-nexus-primary"
                    />
                    <span className="min-w-0 flex-1">{s?.name}</span>
                    <span className="nx-num shrink-0 text-nexus-text-secondary">{formatServicePrice(s)}</span>
                  </label>
                ))}
              </div>
            )}
          </Field>

          <Field label={terms.t('professional')} required>
            {fixedProfessional ? (
              <Input type="text" value={fixedProfessional.name} disabled />
            ) : (
              <Select
                required
                value={draft.professionalId}
                onChange={(e) => change('professionalId', e.target.value)}
              >
                <option value="pending">Sin {terms.tl('professional')} (pendiente)</option>
                {professionals.filter(b => b?.active).map(b => (
                  <option key={b?.id} value={b?.id}>{b?.name}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        {/* ── Sobre Horario ─────────────────────────────────── */}
        <label htmlFor="overtime-toggle" className="flex min-h-10 cursor-pointer select-none items-center gap-3 rounded-lg border border-nexus-border bg-nexus-background px-3 py-2">
          <input
            type="checkbox"
            id="overtime-toggle"
            checked={draft.overtime}
            onChange={(e) => change('overtime', e.target.checked)}
            className="h-4 w-4 shrink-0 accent-nexus-warning"
          />
          <span className="text-sm text-nexus-text">
            Ajustar la duración de {terms.g('service', 'los', 'las')} {terms.tl('services')}
          </span>
        </label>

        {draft.overtime && draft.serviceIds.length > 0 && (
          <div className="space-y-2 rounded-lg border border-nexus-warning/30 bg-nexus-warning-bg p-3">
            <p className="text-xs font-medium text-nexus-warning-text">Duración por {terms.tl('service')} (minutos)</p>
            {services.filter(s => draft.serviceIds.includes(s?.id)).map(s => (
              <div key={s?.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-sm text-nexus-text">{s?.name}</span>
                <Input
                  type="number"
                  min="5"
                  step="5"
                  inputMode="numeric"
                  aria-label={`Duración de ${s?.name} en minutos`}
                  value={draft.serviceDurations[s?.id] ?? s?.duration ?? 30}
                  onChange={(e) => changeServiceDuration(s?.id, e.target.value)}
                  className="nx-num w-20 text-center"
                />
              </div>
            ))}
          </div>
        )}

        {/* ── Fecha y Hora ─────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha" required>
            <Input
              type="date"
              required
              value={draft.date}
              onChange={(e) => change('date', e.target.value)}
              className="nx-num"
            />
          </Field>
          <Field label="Hora" required>
            <Input
              type="time"
              required
              value={draft.time}
              onChange={(e) => change('time', e.target.value)}
              className="nx-num"
            />
          </Field>
        </div>

        {/* ── Notas ────────────────────────────────────────── */}
        <Field label="Notas internas (opcional)">
          <Textarea
            rows={2}
            placeholder="Ej: requiere camilla, alérgico a ciertos aceites..."
            value={draft.notes}
            onChange={(e) => change('notes', e.target.value)}
          />
        </Field>

        {noClient && (
          <p className="text-sm text-nexus-error-text">Selecciona {terms.g('client', 'un', 'una')} {terms.tl('client')} (o crea {terms.g('client', 'uno nuevo', 'una nueva')}) para poder reservar.</p>
        )}
      </form>
    </Modal>
  );
}
