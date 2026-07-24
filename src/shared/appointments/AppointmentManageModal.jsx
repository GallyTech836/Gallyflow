import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { canEditField, canHardDelete, getAllowedNextStates } from './permissions';
import { calculateTotals, getServicesFromCita } from './serviceSelection';

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
  onClose,
  onChangeField,   // (field, value) => void  — actualiza el draft en el padre
  onSubmit,        // (e) => void  — equivalente a handleUpdateReservation
  onDelete,        // () => void  — equivalente a handleDeleteReservation (solo admin)
  onTransition,    // (nextStatus) => void  — equivalente a handleUpdateStatus
}) {
  const [showServicesList, setShowServicesList] = useState(false);

  if (!appointment) return null;

  const canEdit = (field) => canEditField(role, field);
  const allowDelete = canHardDelete(role);
  const nextStates = getAllowedNextStates(role, appointment.status);
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

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0C0E17] border border-[#232A4C] rounded-2xl w-full max-w-md p-5 relative shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-bold text-white">Editar o Gestionar Cita</h3>
          {allowDelete && (
            <button
              type="button"
              onClick={() => {
                onDelete(appointment.id);
                onClose();
              }}
              className="p-1 hover:bg-rose-500/10 text-rose-400 rounded flex items-center gap-1 text-[10px] font-bold cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar Cita
            </button>
          )}
        </div>

        <form onSubmit={onSubmit} className="space-y-3.5">
          <div>
            <label className="text-[10px] text-slate-400 font-bold block mb-1">Nombre del Cliente *</label>
            <input
              type="text"
              required
              disabled={!canEdit('clientName')}
              value={appointment.clientName}
              onChange={(e) => onChangeField('clientName', e.target.value)}
              className="w-full bg-[#131728] border border-[#232A4C] rounded-lg p-2 text-xs text-white outline-none disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-400 font-bold block mb-1">Profesional Asignado *</label>
              <select
                required
                disabled={!canEdit('professionalId')}
                value={appointment.professionalId || appointment.barberId || 'pending'}
                onChange={(e) => onChangeField('professionalId', e.target.value)}
                className="w-full bg-[#131728] border border-[#232A4C] rounded-lg p-2 text-xs text-white outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="pending">Sin Profesional (PENDIENTE)</option>
                {(professionals || []).filter(b => b?.active).map(b => (
                  <option key={b?.id} value={b?.id}>{b?.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 font-bold block mb-1">Servicios *</label>
              <button
                type="button"
                onClick={() => setShowServicesList(prev => !prev)}
                className="w-full bg-[#131728] border border-[#232A4C] rounded-lg p-2 text-xs text-left text-white flex items-center justify-between disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={!canEdit('serviceId')}
              >
                <span className="truncate">
                  {currentServices.length > 0
                    ? currentServices.map(s => s.serviceName).join(', ')
                    : 'Selecciona servicios...'}
                </span>
                <span className="text-slate-400 ml-2">{showServicesList ? '▲' : '▼'}</span>
              </button>
              {showServicesList && (
                <div className="w-full bg-[#131728] border border-[#232A4C] rounded-lg p-2 mt-1 max-h-32 overflow-y-auto space-y-1">
                  {(services || []).map(s => (
                    <label key={s?.id} className="flex items-center gap-2 text-xs text-white cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={!canEdit('serviceId')}
                        checked={currentServices.some(cs => cs.serviceId === s?.id)}
                        onChange={() => toggleService(s)}
                      />
                      {s?.name} ({s?.price} Bs)
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-400 font-bold block mb-1">Hora de Inicio *</label>
              <input
                type="time"
                required
                disabled={!canEdit('time')}
                value={appointment.time}
                onChange={(e) => onChangeField('time', e.target.value)}
                className="w-full bg-[#131728] border border-[#232A4C] rounded-lg p-2 text-xs text-white outline-none font-mono disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 font-bold block mb-1">Estatus Actual</label>
              <select
                disabled={!canEdit('status')}
                value={appointment.status}
                onChange={(e) => onChangeField('status', e.target.value)}
                className="w-full bg-[#131728] border border-[#232A4C] rounded-lg p-2 text-xs text-white outline-none font-bold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="pending">Por Confirmar</option>
                <option value="confirmed">Confirmada</option>
                <option value="in-process">En Atención</option>
                <option value="completed">Completada (Pagado)</option>
                <option value="cancelled">Cancelada (Inactiva)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 font-bold block mb-1">Notas de la Reserva</label>
            <input
              type="text"
              disabled={!canEdit('notes')}
              value={appointment.notes || ''}
              onChange={(e) => onChangeField('notes', e.target.value)}
              className="w-full bg-[#131728] border border-[#232A4C] rounded-lg p-2.5 text-xs text-white outline-none disabled:opacity-60 disabled:cursor-not-allowed"
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
                  className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded text-[9px] cursor-pointer font-bold"
                >
                  Iniciar Atención
                </button>
              )}
              {appointment.status === 'in-process' && canGoTo('completed') && (
                <button
                  type="button"
                  onClick={() => {
                    onTransition('completed');
                    onClose();
                  }}
                  className="px-2 py-1 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded text-[9px] cursor-pointer font-bold"
                >
                  Marcar Finalizado
                </button>
              )}
            </div>

            <div className="flex gap-1.5 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-700 cursor-pointer"
              >
                Salir
              </button>
              <button
                type="submit"
                disabled={!canEdit('clientName') && !canEdit('status') && !canEdit('notes')}
                className="px-3.5 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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