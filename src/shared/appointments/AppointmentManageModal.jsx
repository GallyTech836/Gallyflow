import { useState } from 'react';
import { Trash2, ChevronDown } from 'lucide-react';
import { canEditField, canHardDelete, getAllowedNextStates } from './permissions';
import { calculateTotals, getServicesFromCita } from './serviceSelection';
import { formatServicePrice } from '../servicePricing/servicePricing';
import { useBusinessTerms } from '../businessProfiles/useBusinessProfile';

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

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-nexus-surface border border-nexus-border rounded-2xl w-full max-w-md p-5 relative shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-bold text-nexus-text">Editar o Gestionar {terms.t('appointment')}</h3>
          {allowDelete && (
            <button
              type="button"
              onClick={() => {
                onDelete(appointment.id);
                onClose();
              }}
              className="p-1 hover:bg-nexus-error-bg text-nexus-error-text rounded flex items-center gap-1 text-[10px] font-bold cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar {terms.t('appointment')}
            </button>
          )}
        </div>

        <form onSubmit={onSubmit} className="space-y-3.5">
        <div>
            <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1">{terms.t('client')} *</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowClientPhone(v => !v)}
                className="flex-1 min-w-0 flex items-center justify-between gap-2 bg-nexus-background border border-nexus-border rounded-lg p-2 text-xs text-nexus-text text-left cursor-pointer"
              >
                <span className="truncate font-bold">{appointment.clientName || 'Sin cliente'}</span>
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-nexus-text-secondary transition-transform ${showClientPhone ? 'rotate-180' : ''}`} />
              </button>
              {canEdit('clientName') && (
                <button
                  type="button"
                  onClick={() => setShowClientPicker(v => !v)}
                  className="px-2.5 py-2 bg-nexus-primary-soft text-nexus-primary border border-nexus-primary/20 rounded-lg text-[10px] font-bold whitespace-nowrap cursor-pointer"
                >
                  Cambiar
                </button>
              )}
            </div>
            {showClientPhone && (
              <p className="mt-1.5 px-2.5 py-1.5 bg-nexus-background border border-nexus-border rounded-lg text-xs text-nexus-text font-mono">
                {phoneLabel || 'Teléfono no registrado'}
              </p>
            )}
            {showClientPicker && canEdit('clientName') && (
              <div className="mt-1.5 bg-nexus-background border border-nexus-border rounded-lg p-2 space-y-1.5">
                <input
                  type="text"
                  placeholder="Buscar cliente por nombre o número..."
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                  className="w-full bg-nexus-surface border border-nexus-border rounded-lg p-2 text-xs text-nexus-text outline-none focus:border-nexus-primary"
                />
                <div className="max-h-36 overflow-y-auto divide-y divide-nexus-border">
                  {pickerClients.map(c => (
                    <button
                      type="button"
                      key={c?.id}
                      onClick={() => pickClient(c)}
                      className="w-full text-left py-1.5 px-1 hover:bg-nexus-surface-hover cursor-pointer"
                    >
                      <p className="text-xs font-bold text-nexus-text">{c?.name}</p>
                      <p className="text-[10px] text-nexus-text-muted">{isRealPhone(c?.phone) ? c.phone : 'Sin teléfono'}</p>
                    </button>
                  ))}
                  {pickerClients.length === 0 && (
                    <p className="p-2 text-[10px] text-nexus-text-muted text-center">No se encontraron clientes</p>
                  )}
                </div>
              </div>
            )}
            {clientMissing && (
              <p className="text-[10px] text-nexus-error-text mt-1">Selecciona un cliente para poder guardar la cita.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1">{terms.t('professional')} {terms.g('professional', 'Asignado', 'Asignada')} *</label>
              <select
                required
                disabled={!canEdit('professionalId')}
                value={appointment.professionalId || appointment.barberId || 'pending'}
                onChange={(e) => onChangeField('professionalId', e.target.value)}
                className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2 text-xs text-nexus-text outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="pending">Sin {terms.t('professional')} (PENDIENTE)</option>
                {(Array.isArray(candidateProfessionals) ? candidateProfessionals : (professionals || []).filter(b => b?.active)).map(b => (
                  <option key={b?.id} value={b?.id}>{b?.name}</option>
                ))}
              </select>
              {Array.isArray(candidateProfessionals) && (
                <p className="text-[9px] text-nexus-text-muted mt-1">
                  {candidateProfessionals.length > 0
                    ? 'Solo profesionales disponibles que realizan el servicio.'
                    : 'Ningún profesional disponible realiza este servicio a esta hora.'}
                </p>
              )}
            </div>

            <div>
              <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1">{terms.t('services')} *</label>
              <button
                type="button"
                onClick={() => setShowServicesList(prev => !prev)}
                className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2 text-xs text-left text-nexus-text flex items-center justify-between disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={!canEdit('serviceId')}
              >
                <span className="truncate">
                  {currentServices.length > 0
                    ? currentServices.map(s => s.serviceName).join(', ')
                    : 'Selecciona servicios...'}
                </span>
                <span className="text-nexus-text-secondary ml-2">{showServicesList ? '▲' : '▼'}</span>
              </button>
              {showServicesList && (
                <div className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2 mt-1 max-h-32 overflow-y-auto space-y-1">
                  {(services || []).map(s => (
                    <label key={s?.id} className="flex items-center gap-2 text-xs text-nexus-text cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={!canEdit('serviceId')}
                        checked={currentServices.some(cs => cs.serviceId === s?.id)}
                        onChange={() => toggleService(s)}
                      />
                      {s?.name}{showPrices ? ` (${formatServicePrice(s)})` : ''}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1">Hora de Inicio *</label>
              <input
                type="time"
                required
                disabled={!canEdit('time')}
                value={appointment.time}
                onChange={(e) => onChangeField('time', e.target.value)}
                className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2 text-xs text-nexus-text outline-none font-mono disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1">Estatus Actual</label>
              <select
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
                className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2 text-xs text-nexus-text outline-none font-bold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="pending">Por Confirmar</option>
                <option value="confirmed">Confirmada</option>
                <option value="in-process">En Atención</option>
                <option value="completed">Completada (Pagado)</option>
                <option value="cancelled">Cancelada (Inactiva)</option>
              </select>
            </div>
          </div>

          {/* Solo aparece mientras el estatus elegido es "Completada". Es obligatorio
              elegir un método real (no "Pendiente") para poder guardar. */}
          {isCompleting && (
            <div>
              <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1">¿Cómo pagó el cliente? *</label>
              <select
                required
                disabled={!canEdit('paymentMethod')}
                value={appointment.paymentMethod || ''}
                onChange={(e) => onChangeField('paymentMethod', e.target.value)}
                className={`w-full bg-nexus-background border rounded-lg p-2 text-xs text-nexus-text outline-none disabled:opacity-60 disabled:cursor-not-allowed ${
                  paymentMethodMissing ? 'border-nexus-error/60' : 'border-nexus-border'
                }`}
              >
                <option value="" disabled>Selecciona un método...</option>
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
              {paymentMethodMissing && (
                <p className="text-[10px] text-nexus-error-text mt-1">
                  Elige el método de pago para poder guardar la cita como completada.
                </p>
              )}
            </div>
          )}

{isCompleting && hasVariable && (
            <div>
              <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1">Precio final cobrado (Bs) *</label>
              <input
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
                className={`w-full bg-nexus-background border rounded-lg p-2 text-xs text-nexus-text outline-none font-mono disabled:opacity-60 disabled:cursor-not-allowed ${
                  finalPriceMissing ? 'border-nexus-error/60' : 'border-nexus-border'
                }`}
              />
              {finalPriceMissing && (
                <p className="text-[10px] text-nexus-error-text mt-1">
                  Este servicio tiene precio variable: ingresa el precio final para poder guardar la cita como completada.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1">Notas de la Reserva</label>
            <input
              type="text"
              disabled={!canEdit('notes')}
              value={appointment.notes || ''}
              onChange={(e) => onChangeField('notes', e.target.value)}
              className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2.5 text-xs text-nexus-text outline-none disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <div className="flex items-center justify-between gap-2.5 pt-3">
            <div className="flex gap-1">
              {appointment.status === 'confirmed' && canGoTo('in-process') && (
                <button
                  type="button"
                  onClick={() => {
                    onTransition('in-process');
                    onClose();
                  }}
                  className="px-2 py-1 bg-nexus-warning hover:opacity-90 text-black font-extrabold rounded text-[9px] cursor-pointer"
                >
                  Iniciar Atención
                </button>
              )}
              {appointment.status === 'in-process' && canGoTo('completed') && (
                <button
                  type="button"
                  onClick={() => { onChangeField('status', 'completed'); startFinalPrice(); }}
                  className="px-2 py-1 bg-nexus-success hover:opacity-90 text-black font-extrabold rounded text-[9px] cursor-pointer"
                >
                  Marcar Finalizado
                </button>
              )}
            </div>

            <div className="flex gap-1.5 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 bg-nexus-surface border border-nexus-border text-nexus-text-secondary text-xs font-semibold rounded-lg hover:bg-nexus-surface-hover cursor-pointer"
              >
                Salir
              </button>
              <button
                type="submit"
                disabled={!anyEditable || paymentMethodMissing || finalPriceMissing || clientMissing}
                className="px-3.5 py-1.5 bg-nexus-primary text-white text-xs font-bold rounded-lg hover:bg-nexus-primary-hover cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
