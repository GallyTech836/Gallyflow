import { useId, useState } from 'react';
import { Trash2, ChevronDown } from 'lucide-react';
import { canEditField, canHardDelete, getAllowedNextStates } from './permissions';
import { calculateTotals, getServicesFromCita } from './serviceSelection';
import { getLabel } from './statusModel';
import { formatServicePrice } from '../servicePricing/servicePricing';
import { useBusinessTerms } from '../businessProfiles/useBusinessProfile';
import { Modal, Button, Field, Input, Select, Textarea, useConfirm } from '../ui';

/**
 * Modal único de gestión de cita — mismo HTML/clases que el modal
 * original de AdminApp.jsx (líneas 3958-4099). Para Barber, los
 * campos no editables quedan con `disabled`, no se cambia el tipo
 * de elemento ni el layout. La única diferencia de comportamiento
 * por rol viene de permissions.js, nunca de un `if (role === ...)`
 * hardcodeado aquí dentro salvo para decidir disabled/visible.
 */
export default function AppointmentManageModal({
  appointment,
  role,
  services = [],
  professionals = [],
  candidateProfessionals = null, // Pendiente: candidatos (activos + hacen el servicio + libres); null = lista normal
  clients = [],
  staffPermissions = null,
  showPrices = true,
  paymentMethods = ['Efectivo', 'Tarjeta', 'Transferencia'],
  onClose,
  onChangeField,   // (field, value) => void  — actualiza el draft en el padre
  onSubmit,        // (e) => void  — equivalente a handleUpdateReservation
  onDelete,        // () => void  — equivalente a handleDeleteReservation (solo admin)
  onTransition,    // (nextStatus) => void  — equivalente a handleUpdateStatus
}) {
  const terms = useBusinessTerms();
  const [showServicesList, setShowServicesList] = useState(false);
  const [showClientPhone, setShowClientPhone] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [finalPriceDraft, setFinalPriceDraft] = useState({ id: null, text: '' });
  // Ajustar la duración (Fase 4): texto que se está escribiendo en cada servicio,
  // para poder borrar y reescribir el número sin que salte a otro valor.
  const [showDuration, setShowDuration] = useState(false);
  const [durationDraft, setDurationDraft] = useState({ id: null, values: {} });
  const [saving, setSaving] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const formId = useId();

  if (!appointment) return null;

  const canEdit = (field) => canEditField(role, field, staffPermissions);
  const allowDelete = canHardDelete(role, staffPermissions);
  const nextStates = getAllowedNextStates(role, appointment.status, staffPermissions);
  const anyEditable = ['clientName', 'status', 'notes', 'time', 'serviceId'].some(canEdit);

  const isRealPhone = (p) => !!p && !['n/a', 'no especificado'].includes(String(p).trim().toLowerCase());
  const linkedClient = (clients || []).find(c => c?.id === appointment.clientId);
  const rawPhone = isRealPhone(appointment.clientPhone) ? appointment.clientPhone : (isRealPhone(linkedClient?.phone) ? linkedClient.phone : '');
  const phoneLabel = rawPhone
    ? ((appointment.countryCode && !String(rawPhone).startsWith('+')) ? `${appointment.countryCode} ${rawPhone}` : rawPhone)
    : '';
  const canGoTo = (status) => nextStates.includes(status);

  // Soporta tanto citas nuevas (appointment.services) como legacy
  // (campos planos serviceId/price/duration) vía getServicesFromCita.
  const currentServices = appointment.services && appointment.services.length > 0
    ? appointment.services
    : getServicesFromCita(appointment);

  const toggleService = (service) => {
    const exists = currentServices.some(s => s.serviceId === service.id);
    const nextServices = exists
      ? currentServices.filter(s => s.serviceId !== service.id)
      : [...currentServices, {
          serviceId: service.id,
          serviceName: service.name,
          price: service.price || 0,
          duration: service.duration || 30,
        }];

    const { totalPrice, totalDuration } = calculateTotals(nextServices);
    onChangeField('services', nextServices);
    onChangeField('serviceId', nextServices[0]?.serviceId || '');
    onChangeField('serviceName', nextServices.map(s => s.serviceName).join(' + '));
    onChangeField('price', totalPrice);
    onChangeField('duration', totalDuration);
  };

  // Mientras el estatus sea "Completada" y no haya un método de pago real
  // elegido, no se puede guardar — el botón "Guardar Cambios" queda bloqueado.
  const isCompleting = appointment.status === 'completed';
  const hasValidPayment = !!appointment.paymentMethod && appointment.paymentMethod !== 'Pendiente';
  const paymentMethodMissing = isCompleting && !hasValidPayment;
  // --- Precio variable: al finalizar hay que ingresar el precio final ---
  const catalogOf = (cs) => (services || []).find(s => s?.id === cs.serviceId);
  const isVariableSvc = (cs) => cs.priceVariable === true || catalogOf(cs)?.priceVariable === true;
  const minPriceOf = (cs) => (isVariableSvc(cs) && catalogOf(cs) ? Number(catalogOf(cs).price || 0) : Number(cs.price || 0));
  const hasVariable = currentServices.some(isVariableSvc);
  const minTotal = currentServices.reduce((sum, cs) => sum + minPriceOf(cs), 0);
  const finalPriceMissing = isCompleting && hasVariable && !(Number(appointment.price) > 0);
  const finalPriceText = finalPriceDraft.id === appointment.id ? finalPriceDraft.text : (appointment.price ?? '');

  const applyFinalPrice = (value) => {
    onChangeField('price', value);
    const final = Number(value);
    const next = currentServices.map(cs => ({ ...cs, price: isVariableSvc(cs) ? minPriceOf(cs) : cs.price }));
    const vIdx = next.findIndex(isVariableSvc);
    if (vIdx < 0) return;
    if (final > 0) {
      const others = next.reduce((sum, cs, i) => (i === vIdx ? sum : sum + Number(cs.price || 0)), 0);
      next[vIdx].price = Math.max(0, final - others);
    }
    onChangeField('services', next);
  };
  const startFinalPrice = () => {
    if (!hasVariable) return;
    setFinalPriceDraft({ id: appointment.id, text: '' });
    applyFinalPrice('');
  };
  const restoreMinPrice = () => {
    if (hasVariable && !(Number(appointment.price) > 0)) applyFinalPrice(minTotal);
  };

  // --- Duración: minutos por servicio. Se guardan en services[].duration y el
  // total en `duration` (los mismos campos que ya usa el guardado). Como el total
  // siempre se calcula desde services[], agregar o quitar otro servicio conserva
  // los minutos ya ajustados de los demás. ---
  const MIN_DURATION = 5;
  const MAX_DURATION = 720;
  const storedDuration = Number(appointment.duration) > 0
    ? Number(appointment.duration)
    : calculateTotals(currentServices).totalDuration;
  const draftValues = durationDraft.id === appointment.id ? durationDraft.values : {};
  const durationText = (cs) => (cs.serviceId in draftValues ? draftValues[cs.serviceId] : String(cs.duration ?? 30));
  const isValidMinutes = (raw) => {
    const n = Number(raw);
    return String(raw).trim() !== '' && Number.isFinite(n) && n >= MIN_DURATION && n <= MAX_DURATION;
  };
  const durationInvalid = currentServices.some(cs => cs.serviceId in draftValues && !isValidMinutes(draftValues[cs.serviceId]));
  const applyServiceDuration = (serviceId, raw) => {
    setDurationDraft({ id: appointment.id, values: { ...draftValues, [serviceId]: raw } });
    if (!isValidMinutes(raw)) return; // se mantiene el último valor válido hasta corregirlo
    const minutes = Math.round(Number(raw));
    const next = currentServices.map(cs => (cs.serviceId === serviceId ? { ...cs, duration: minutes } : cs));
    onChangeField('services', next);
    onChangeField('duration', calculateTotals(next).totalDuration);
  };
  const endTimeLabel = (() => {
    const [h, m] = String(appointment.time || '').split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
    const end = (h * 60 + m + storedDuration) % (24 * 60);
    return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
  })();

  // --- Cliente: solo se cambia eligiendo otro de la lista ---
  const clientMissing = !String(appointment.clientName || '').trim();
  const pickerClients = (clients || []).filter(c => {
    const q = clientQuery.trim().toLowerCase();
    return !q || (c?.name || '').toLowerCase().includes(q) || String(c?.phone || '').includes(q);
  }).slice(0, 30);
  const pickClient = (c) => {
    onChangeField('clientName', c?.name || '');
    onChangeField('clientId', c?.id || '');
    onChangeField('clientPhone', isRealPhone(c?.phone) ? c.phone : '');
    onChangeField('countryCode', '');
    setShowClientPicker(false);
    setClientQuery('');
  };

  // Guardar: evita doble envío mientras el padre procesa (misma lógica de onSubmit).
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try { await onSubmit(e); } finally { setSaving(false); }
  };

  // Eliminar: confirmación antes de borrar (la eliminación es la misma de siempre).
  const handleDelete = async () => {
    const ok = await confirm({
      title: `¿Eliminar ${terms.g('appointment', 'este', 'esta')} ${terms.tl('appointment')}?`,
      subject: [appointment.clientName, appointment.date, appointment.time].filter(Boolean).join(' · '),
      message: currentServices.map(s => s.serviceName).filter(Boolean).join(' + ') || null,
    });
    if (!ok) return;
    onDelete(appointment.id);
    onClose();
  };

  const saveDisabled = !anyEditable || paymentMethodMissing || finalPriceMissing || clientMissing || durationInvalid;
  const actionBtn = 'inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-nexus-primary/20 bg-nexus-primary-soft px-3 text-sm font-semibold text-nexus-primary whitespace-nowrap cursor-pointer hover:brightness-95';

  return (
    <>
    <Modal
      onClose={onClose}
      title={`Gestionar ${terms.tl('appointment')}`}
      description={[appointment.date, appointment.time].filter(Boolean).join(' · ') || null}
      size="lg"
      footer={(
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-col-reverse gap-2 sm:mr-auto sm:flex-row">
            {allowDelete && (
              <Button variant="danger-soft" icon={Trash2} onClick={handleDelete} fullWidth className="sm:w-auto">
                Eliminar
              </Button>
            )}
            {appointment.status === 'confirmed' && canGoTo('in-process') && (
              <button
                type="button"
                onClick={() => {
                  onTransition('in-process');
                  onClose();
                }}
                className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg border border-nexus-warning/40 bg-nexus-warning-bg px-3 text-sm font-semibold text-nexus-warning-text cursor-pointer hover:brightness-95"
              >
                Iniciar atención
              </button>
            )}
            {appointment.status === 'in-process' && canGoTo('completed') && (
              <button
                type="button"
                onClick={() => { onChangeField('status', 'completed'); startFinalPrice(); }}
                className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg border border-nexus-success/30 bg-nexus-success-bg px-3 text-sm font-semibold text-nexus-success-text cursor-pointer hover:brightness-95"
              >
                Marcar finalizado
              </button>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="secondary" onClick={onClose} fullWidth className="sm:w-auto">Salir</Button>
            <Button type="submit" form={formId} loading={saving} disabled={saveDisabled} fullWidth className="sm:w-auto">
              Guardar cambios
            </Button>
          </div>
        </div>
      )}
    >
      <form id={formId} onSubmit={handleFormSubmit} className="space-y-4">
        <Field
          label={terms.t('client')}
          required
          error={clientMissing ? `Selecciona ${terms.g('client', 'un', 'una')} ${terms.tl('client')} para poder guardar ${terms.g('appointment', 'el', 'la')} ${terms.tl('appointment')}.` : null}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowClientPhone(v => !v)}
              aria-expanded={showClientPhone}
              className="flex h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-nexus-border bg-nexus-background px-3 text-left text-sm text-nexus-text cursor-pointer"
            >
              <span className="truncate font-semibold">{appointment.clientName || `Sin ${terms.tl('client')}`}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-nexus-text-secondary transition-transform ${showClientPhone ? 'rotate-180' : ''}`} />
            </button>
            {canEdit('clientName') && (
              <button type="button" onClick={() => setShowClientPicker(v => !v)} className={actionBtn}>
                Cambiar
              </button>
            )}
          </div>
          {showClientPhone && (
            <p className="nx-num rounded-lg border border-nexus-border bg-nexus-background px-3 py-2 text-sm text-nexus-text">
              {phoneLabel || 'Teléfono no registrado'}
            </p>
          )}
          {showClientPicker && canEdit('clientName') && (
            <div className="space-y-2 rounded-lg border border-nexus-border bg-nexus-background p-2">
              <Input
                type="text"
                placeholder={`Buscar ${terms.tl('client')} por nombre o número...`}
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
              />
              <div className="max-h-48 divide-y divide-nexus-border overflow-y-auto">
                {pickerClients.map(c => (
                  <button
                    type="button"
                    key={c?.id}
                    onClick={() => pickClient(c)}
                    className="w-full rounded-md px-2 py-2 text-left hover:bg-nexus-surface cursor-pointer"
                  >
                    <span className="block text-sm font-semibold text-nexus-text">{c?.name}</span>
                    <span className="nx-num block text-xs text-nexus-text-muted">{isRealPhone(c?.phone) ? c.phone : 'Sin teléfono'}</span>
                  </button>
                ))}
                {pickerClients.length === 0 && (
                  <p className="p-2 text-center text-sm text-nexus-text-muted">No se encontraron {terms.tl('clients')}</p>
                )}
              </div>
            </div>
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={`${terms.t('professional')} ${terms.g('professional', 'asignado', 'asignada')}`}
            required
            hint={Array.isArray(candidateProfessionals)
              ? (candidateProfessionals.length > 0
                ? `Solo ${terms.tl('professionals')} disponibles que realizan ${terms.g('service', 'el', 'la')} ${terms.tl('service')}.`
                : `${terms.g('professional', 'Ningún', 'Ninguna')} ${terms.tl('professional')} disponible realiza ${terms.g('service', 'este', 'esta')} ${terms.tl('service')} a esta hora.`)
              : null}
          >
            <Select
              required
              disabled={!canEdit('professionalId')}
              value={appointment.professionalId || appointment.barberId || 'pending'}
              onChange={(e) => onChangeField('professionalId', e.target.value)}
            >
              <option value="pending">Sin {terms.tl('professional')} (pendiente)</option>
              {(Array.isArray(candidateProfessionals) ? candidateProfessionals : (professionals || []).filter(b => b?.active)).map(b => (
                <option key={b?.id} value={b?.id}>{b?.name}</option>
              ))}
            </Select>
          </Field>

          <Field label={terms.t('services')} required>
            <button
              type="button"
              onClick={() => setShowServicesList(prev => !prev)}
              aria-expanded={showServicesList}
              className="flex h-10 w-full items-center justify-between rounded-lg border border-nexus-border bg-nexus-surface px-3 text-left text-base text-nexus-text sm:text-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canEdit('serviceId')}
            >
              <span className="truncate">
                {currentServices.length > 0
                  ? currentServices.map(s => s.serviceName).join(', ')
                  : `Selecciona ${terms.tl('services')}...`}
              </span>
              <ChevronDown className={`ml-2 h-4 w-4 shrink-0 text-nexus-text-secondary transition-transform ${showServicesList ? 'rotate-180' : ''}`} />
            </button>
            {showServicesList && (
              <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-nexus-border bg-nexus-background p-1">
                {(services || []).map(s => (
                  <label key={s?.id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm text-nexus-text hover:bg-nexus-surface">
                    <input
                      type="checkbox"
                      disabled={!canEdit('serviceId')}
                      checked={currentServices.some(cs => cs.serviceId === s?.id)}
                      onChange={() => toggleService(s)}
                      className="h-4 w-4 shrink-0 accent-nexus-primary"
                    />
                    <span className="min-w-0 flex-1">{s?.name}</span>
                    {showPrices && <span className="nx-num shrink-0 text-nexus-text-secondary">{formatServicePrice(s)}</span>}
                  </label>
                ))}
              </div>
            )}
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Hora de inicio" required>
            <Input
              type="time"
              required
              disabled={!canEdit('time')}
              value={appointment.time}
              onChange={(e) => onChangeField('time', e.target.value)}
              className="nx-num"
            />
          </Field>

          <Field label="Estado">
            <Select
              disabled={!canEdit('status')}
              value={appointment.status}
              onChange={(e) => {
                const newStatus = e.target.value;

                onChangeField('status', newStatus);

                if (newStatus === 'completed') {
                  onChangeField('paymentMethod', '');
                  startFinalPrice();
                } else if (isCompleting) {
                  restoreMinPrice();
                }
              }}
              className="font-medium"
            >
              <option value="pending">{getLabel('pending', terms)}</option>
              <option value="confirmed">{getLabel('confirmed', terms)}</option>
              <option value="in-process">{getLabel('in-process', terms)}</option>
              <option value="completed">{getLabel('completed', terms)} (Pagado)</option>
              <option value="cancelled">{getLabel('cancelled', terms)} ({terms.g('appointment', 'Inactivo', 'Inactiva')})</option>
            </Select>
          </Field>
        </div>

        {currentServices.length > 0 && (
          <div className="rounded-lg border border-nexus-border bg-nexus-background p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-nexus-text-secondary">Duración</p>
                <p className="text-sm font-semibold text-nexus-text">
                  <span className="nx-num">{storedDuration} min</span>
                  {endTimeLabel && <span className="font-normal text-nexus-text-secondary"> · termina a las <span className="nx-num">{endTimeLabel}</span></span>}
                </p>
              </div>
              {canEdit('duration') && (
                <button
                  type="button"
                  onClick={() => setShowDuration(v => !v)}
                  aria-expanded={showDuration}
                  className={actionBtn}
                >
                  {showDuration ? 'Listo' : 'Ajustar la duración'}
                </button>
              )}
            </div>
            {showDuration && canEdit('duration') && (
              <div className="mt-3 space-y-2 border-t border-nexus-border pt-3">
                {currentServices.map(cs => (
                  <div key={cs.serviceId} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm text-nexus-text">{cs.serviceName}</span>
                    <div className="flex w-28 shrink-0 items-center gap-2">
                      <Input
                        type="number"
                        min={MIN_DURATION}
                        max={MAX_DURATION}
                        step="5"
                        inputMode="numeric"
                        aria-label={`Duración de ${cs.serviceName} en minutos`}
                        value={durationText(cs)}
                        onChange={(e) => applyServiceDuration(cs.serviceId, e.target.value)}
                        error={cs.serviceId in draftValues && !isValidMinutes(draftValues[cs.serviceId])}
                        className="nx-num text-center"
                      />
                      <span className="text-xs text-nexus-text-secondary">min</span>
                    </div>
                  </div>
                ))}
                {durationInvalid && (
                  <p role="alert" className="text-xs text-nexus-error-text">
                    Ingresa entre {MIN_DURATION} y {MAX_DURATION} minutos para cada {terms.tl('service')}.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Solo aparece mientras el estatus elegido es "Completada". Es obligatorio
            elegir un método real (no "Pendiente") para poder guardar. */}
        {isCompleting && (
          <Field
            label={`¿Cómo pagó ${terms.g('client', 'el', 'la')} ${terms.tl('client')}?`}
            required
            error={paymentMethodMissing ? `Elige el método de pago para poder guardar ${terms.g('appointment', 'el', 'la')} ${terms.tl('appointment')} como ${terms.g('appointment', 'completado', 'completada')}.` : null}
          >
            <Select
              required
              disabled={!canEdit('paymentMethod')}
              value={appointment.paymentMethod || ''}
              onChange={(e) => onChangeField('paymentMethod', e.target.value)}
              error={paymentMethodMissing}
            >
              <option value="" disabled>Selecciona un método...</option>
              {paymentMethods.map((method) => (
                <option key={method} value={method}>{method}</option>
              ))}
            </Select>
          </Field>
        )}

        {isCompleting && hasVariable && (
          <Field
            label="Precio final cobrado (Bs)"
            required
            error={finalPriceMissing ? `${terms.g('service', 'Este', 'Esta')} ${terms.tl('service')} tiene precio variable: ingresa el precio final para poder guardar ${terms.g('appointment', 'el', 'la')} ${terms.tl('appointment')} como ${terms.g('appointment', 'completado', 'completada')}.` : null}
          >
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              required
              disabled={!canEdit('price')}
              value={finalPriceText}
              placeholder={`Desde Bs ${minTotal}`}
              onChange={(e) => {
                const raw = e.target.value;
                setFinalPriceDraft({ id: appointment.id, text: raw });
                applyFinalPrice(raw === '' ? '' : Number(raw));
              }}
              error={finalPriceMissing}
              className="nx-num"
            />
          </Field>
        )}

        <Field label={`Notas ${terms.g('appointment', 'del', 'de la')} ${terms.tl('appointment')}`}>
          <Textarea
            rows={2}
            disabled={!canEdit('notes')}
            value={appointment.notes || ''}
            onChange={(e) => onChangeField('notes', e.target.value)}
          />
        </Field>
      </form>
    </Modal>
    {confirmDialog}
    </>
  );
}
