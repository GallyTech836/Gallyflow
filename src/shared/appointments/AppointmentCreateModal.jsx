import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { calculateTotals } from './serviceSelection';

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
  fixedProfessional = null,
  onSubmit,
  onClose,
}) {
  // ── Estado interno del formulario ──────────────────────────────────
  const [draft, setDraft] = useState({
    clientName: '',
    phone: '',
    clientId: null,
    serviceIds: services[0] ? [services[0].id] : [],
    professionalId: fixedProfessional?.id || 'pending',
    date: initialDate,
    time: initialTime,
    paymentMethod: 'Efectivo',
    notes: '',
  });

  // ── Estado de UI ───────────────────────────────────────────────────
  const [clientSearch, setClientSearch] = useState('');
  const [showClientList, setShowClientList] = useState(false);
  const [showServicesList, setShowServicesList] = useState(false);
  const [isNewClient, setIsNewClient] = useState(false);

  // ── Derivados ──────────────────────────────────────────────────────
  const detectedCountry = useMemo(() => detectPhoneCountry(draft.phone), [draft.phone]);

  const filteredClients = useMemo(() => {
    if (!clientSearch || !clients.length) return clients;
    return clients.filter(c =>
      c?.name?.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c?.phone?.includes(clientSearch)
    );
  }, [clientSearch, clients]);

  const change = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));

  const toggleService = (serviceId) => {
    setDraft(prev => ({
      ...prev,
      serviceIds: prev.serviceIds.includes(serviceId)
        ? prev.serviceIds.filter(id => id !== serviceId)
        : [...prev.serviceIds, serviceId],
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (draft.serviceIds.length === 0) return;
  
    const servicesForCita = services
      .filter(s => draft.serviceIds.includes(s.id))
      .map(s => ({
        serviceId: s.id,
        serviceName: s.name,
        price: s.price || 0,
        duration: s.duration || 30,
      }));
    const { totalPrice, totalDuration } = calculateTotals(servicesForCita);
  
    onSubmit({
      ...draft,
      services: servicesForCita,
      serviceId: servicesForCita[0]?.serviceId || '',
      serviceName: servicesForCita.map(s => s.serviceName).join(' + '),
      price: totalPrice,
      duration: totalDuration,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0C0E17] border border-[#232A4C] rounded-2xl w-full max-w-md p-5 relative shadow-2xl">
        <h3 className="text-base font-bold text-white mb-1">Agendar Nueva Cita</h3>

        <form onSubmit={handleSubmit} className="space-y-3.5">

          {/* ── Cliente ─────────────────────────────────────────── */}
          <div className="relative">
            <label className="text-[10px] text-slate-400 font-bold block mb-1">Cliente *</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                  <Search className="w-3.5 h-3.5 text-slate-500" />
                </span>
                <input
                  type="text"
                  placeholder="Buscar por nombre o número..."
                  value={clientSearch}
                  onChange={(e) => { setClientSearch(e.target.value); setShowClientList(true); }}
                  onFocus={() => setShowClientList(true)}
                  className="w-full bg-[#131728] border border-[#232B4C] rounded-lg pl-8 pr-2.5 py-2 text-xs text-white outline-none focus:border-indigo-500"
                />
              </div>
              <button
                type="button"
                onClick={() => { setIsNewClient(v => !v); change('clientName', ''); change('phone', ''); }}
                className="px-2.5 py-2 bg-indigo-950 text-indigo-400 border border-indigo-500/20 rounded-lg text-[10px] font-bold whitespace-nowrap cursor-pointer"
              >
                {isNewClient ? 'Elegir Existente' : '+ Nuevo Cliente'}
              </button>
            </div>

            {/* Dropdown de búsqueda */}
            {!isNewClient && showClientList && clients.length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 bg-[#0F1221] border border-[#232A4C] rounded-xl shadow-2xl max-h-40 overflow-y-auto z-50 divide-y divide-[#232A4C]/30">
                {filteredClients.map(c => (
                  <div
                    key={c?.id}
                    onClick={() => {
                      change('clientName', c?.name);
                      change('phone', c?.phone || '');
                      change('clientId', c?.id);
                      setClientSearch(c?.name);
                      setShowClientList(false);
                    }}
                    className="p-2.5 hover:bg-[#1C2036] cursor-pointer flex justify-between items-center text-xs"
                  >
                    <div>
                      <p className="font-bold text-white">{c?.name}</p>
                      <p className="text-[10px] text-slate-500">{c?.phone}</p>
                    </div>
                    <span className="text-[9px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded font-bold font-mono">
                      {c?.visits ?? 0} Visitas
                    </span>
                  </div>
                ))}
                {filteredClients.length === 0 && (
                  <p className="p-3 text-[10px] text-slate-500 text-center">No se encontraron clientes</p>
                )}
              </div>
            )}
          </div>

          {/* ── Datos de nuevo cliente ───────────────────────── */}
          {isNewClient && (
            <div className="p-3 bg-[#131728] border border-indigo-500/10 rounded-xl space-y-3">
              <div>
                <label className="text-[9px] text-indigo-400 font-bold block mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  required={isNewClient}
                  value={draft.clientName}
                  onChange={(e) => change('clientName', e.target.value)}
                  placeholder="Ej. Sebastián Mendoza"
                  className="w-full bg-[#0C0E17] border border-[#232B4C] rounded-lg p-2 text-xs text-white outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[9px] text-indigo-400 font-bold block mb-1">Número de Teléfono</label>
                <div className="flex items-center bg-[#0C0E17] border border-[#232B4C] rounded-lg px-2.5 gap-2">
                  {detectedCountry && (
                    <div className="flex items-center gap-1 shrink-0 text-xs">
                      <span>{detectedCountry.flag}</span>
                      <span className="text-[9px] font-mono text-slate-400 font-bold">{detectedCountry.code}</span>
                    </div>
                  )}
                  <input
                    type="tel"
                    value={draft.phone}
                    onChange={(e) => change('phone', e.target.value.replace(/[^0-9+]/g, ''))}
                    placeholder="70231122"
                    className="w-full bg-transparent border-0 py-2.5 text-xs text-white outline-none"
                  />
                </div>
                {detectedCountry?.isInternational && (
                  <span className="text-[8px] text-indigo-400 font-bold mt-1 block">
                    Cliente internacional detectado ({detectedCountry.country})
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Servicio y Profesional ───────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-slate-400 font-bold block mb-1">Servicios *</label>
            <button
              type="button"
              onClick={() => setShowServicesList(prev => !prev)}
              className="w-full bg-[#131728] border border-[#232A4C] rounded-lg p-2 text-xs text-left text-white flex items-center justify-between"
            >
              <span className="truncate">
                {draft.serviceIds.length > 0
                  ? services.filter(s => draft.serviceIds.includes(s.id)).map(s => s.name).join(', ')
                  : 'Selecciona servicios...'}
              </span>
              <span className="text-slate-400 ml-2">{showServicesList ? '▲' : '▼'}</span>
            </button>
            {showServicesList && (
              <div className="w-full bg-[#131728] border border-[#232A4C] rounded-lg p-2 mt-1 max-h-32 overflow-y-auto space-y-1">
                {services.map(s => (
                  <label key={s?.id} className="flex items-center gap-2 text-xs text-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.serviceIds.includes(s?.id)}
                      onChange={() => toggleService(s?.id)}
                    />
                    {s?.name} ({s?.price} Bs)
                  </label>
                ))}
              </div>
            )}
          </div>

            <div>
              <label className="text-[10px] text-slate-400 font-bold block mb-1">Profesional *</label>
              {fixedProfessional ? (
                <input
                  type="text"
                  value={fixedProfessional.name}
                  disabled
                  className="w-full bg-[#131728]/40 border border-[#232A4C]/40 rounded-lg p-2 text-xs text-slate-500 outline-none disabled:cursor-not-allowed"
                />
              ) : (
                <select
                  required
                  value={draft.professionalId}
                  onChange={(e) => change('professionalId', e.target.value)}
                  className="w-full bg-[#131728] border border-[#232A4C] rounded-lg p-2 text-xs text-white outline-none focus:border-indigo-500"
                >
                  <option value="pending">Sin Profesional (PENDIENTE)</option>
                  {professionals.filter(b => b?.active).map(b => (
                    <option key={b?.id} value={b?.id}>{b?.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* ── Fecha y Hora ─────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-400 font-bold block mb-1">Fecha *</label>
              <input
                type="date"
                required
                value={draft.date}
                onChange={(e) => change('date', e.target.value)}
                className="w-full bg-[#131728] border border-[#232A4C] rounded-lg p-2 text-xs text-white outline-none focus:border-indigo-500 font-mono font-bold"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 font-bold block mb-1">Hora *</label>
              <input
                type="time"
                required
                value={draft.time}
                onChange={(e) => change('time', e.target.value)}
                className="w-full bg-[#131728] border border-[#232A4C] rounded-lg p-2 text-xs text-white outline-none"
              />
            </div>
          </div>

          {/* ── Método de Pago ───────────────────────────────── */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold block mb-1">Método de Pago</label>
            <select
              value={draft.paymentMethod}
              onChange={(e) => change('paymentMethod', e.target.value)}
              className="w-full bg-[#131728] border border-[#232A4C] rounded-lg p-2 text-xs text-white outline-none focus:border-indigo-500"
            >
              <option value="Efectivo">Efectivo</option>
              <option value="Tarjeta">Tarjeta</option>
              <option value="Transferencia">QR / Transferencia</option>
              <option value="Pendiente">Pendiente</option>
            </select>
          </div>

          {/* ── Notas ────────────────────────────────────────── */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold block mb-1">Notas Internas (Opcional)</label>
            <input
              type="text"
              placeholder="Ej: requiere camilla, alérgico a ciertos aceites..."
              value={draft.notes}
              onChange={(e) => change('notes', e.target.value)}
              className="w-full bg-[#131728] border border-[#232A4C] rounded-lg p-2 text-xs text-white outline-none focus:border-indigo-500"
            />
          </div>

          {/* ── Botones ──────────────────────────────────────── */}
          <div className="flex items-center justify-end gap-2.5 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 bg-slate-800 text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 bg-indigo-500 text-white text-xs font-bold rounded-lg hover:bg-indigo-400 cursor-pointer"
            >
              Confirmar Reserva
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}