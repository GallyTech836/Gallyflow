import { useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Modal, Button, Field, Input, useConfirm } from '../ui';
import { useBusinessTerms } from '../businessProfiles/useBusinessProfile';
import ServicePicker from './ServicePicker';
import { estimateTotal, toServiceInputs } from './servicePickerModel';
import { createRegistro } from './registrosApi';
import {
  newRequestId, defaultPaymentMethod, todayKey, shiftDay, MAX_BACKDATE_DAYS, CASH_PLACEMENT_TEXT, dayLabel, GENERAL_CLIENT,
} from './registroModel';

/**
 * "Registrar servicio" (plan Nexus Control). Lo más rápido posible:
 *   Barbero: toca el servicio -> Registrar (2 toques).
 *   Admin:   toca el profesional -> el servicio -> Registrar (3 toques).
 * Fecha y hora las pone el servidor. Precio automático (solo se escribe si
 * es variable). Pago en Efectivo por defecto. Cliente opcional y oculto.
 * El admin puede activar "Otra fecha" (hasta 7 días atrás, sin hora).
 *
 * Props:
 * - services, clients, paymentMethods
 * - fixedProfessional: el barbero (siempre a su nombre). Si no viene, es admin.
 * - professionals: profesionales activos para elegir (admin)
 * - onRegistered(registro), onClose, onToast(msg, tipo)
 */
export default function RegistrarServicioModal({
  services = [],
  professionals = [],
  fixedProfessional = null,
  clients = [],
  paymentMethods = [],
  onRegistered,
  onClose,
  onToast,
}) {
  const terms = useBusinessTerms();
  const isAdmin = !fixedProfessional;
  const activePros = useMemo(() => (professionals || []).filter((p) => p?.active !== false), [professionals]);
  const methods = (paymentMethods && paymentMethods.length ? paymentMethods : ['Efectivo', 'Tarjeta', 'Transferencia']);

  const [professionalId, setProfessionalId] = useState(fixedProfessional?.id || (activePros.length === 1 ? activePros[0].id : ''));
  const [selected, setSelected] = useState({});
  const [paymentMethod, setPaymentMethod] = useState(defaultPaymentMethod(methods));
  const [showClient, setShowClient] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [clientId, setClientId] = useState(null);
  const [otherDate, setOtherDate] = useState(false);
  const today = todayKey();
  const [date, setDate] = useState(shiftDay(today, -1));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [priceErrors, setPriceErrors] = useState({});
  const [confirm, confirmDialog] = useConfirm();
  // Un id por intento de registro: si la red falla y se reintenta, el
  // servidor no lo guarda dos veces.
  const requestIdRef = useRef(newRequestId());

  const professional = fixedProfessional || activePros.find((p) => p.id === professionalId) || null;
  const total = estimateTotal(services, professional, selected);
  const count = Object.keys(selected).length;
  const client = clientId ? clients.find((c) => c.id === clientId) : null;
  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    const list = q ? clients.filter((c) => c?.name?.toLowerCase().includes(q) || String(c?.phone || '').includes(q)) : clients;
    return list.slice(0, 30);
  }, [clients, clientSearch]);

  const chooseProfessional = (id) => {
    if (id === professionalId) return;
    setProfessionalId(id);
    setSelected({}); // cada profesional tiene sus servicios y precios
    setPriceErrors({});
  };

  async function submit(confirmDuplicate = false) {
    if (submitting || !professional || count === 0) return;
    setError('');
    setPriceErrors({});
    setSubmitting(true);
    const body = {
      requestId: requestIdRef.current,
      services: toServiceInputs(services, professional, selected),
      paymentMethod,
      ...(isAdmin ? { professionalId: professional.id } : {}),
      ...(client ? { clientId: client.id } : {}),
      ...(isAdmin && otherDate ? { date } : {}),
      ...(confirmDuplicate ? { confirmDuplicate: true } : {}),
    };
    const r = await createRegistro(body);
    setSubmitting(false);

    if (r.ok) {
      const reg = r.data.registro;
      const extra = reg?.backdated && reg.cashPlacement ? ` ${CASH_PLACEMENT_TEXT[reg.cashPlacement] || ''}` : '';
      onToast?.(`${terms.t('service')} ${terms.g('service', 'registrado', 'registrada')}${reg?.backdated ? ` (${dayLabel(reg.date)})` : ''}.${extra}`, 'success');
      requestIdRef.current = newRequestId();
      onRegistered?.(reg);
      onClose?.();
      return;
    }
    const code = r.data.code;
    if (code === 'POSSIBLE_DUPLICATE') {
      const ok = await confirm({
        title: '¿Registrar otra vez?',
        message: r.data.error,
        subject: r.data.duplicateOf?.serviceName,
        confirmLabel: 'Sí, registrar',
        tone: 'primary',
        irreversible: false,
      });
      if (ok) await submit(true);
      return;
    }
    if ((code === 'PRICE_REQUIRED' || code === 'PRICE_BELOW_MIN') && r.data.serviceId) {
      setPriceErrors({ [r.data.serviceId]: r.data.error });
      return;
    }
    setError(r.data.error || 'No se pudo registrar. Inténtalo de nuevo.');
  }

  const chip = (active) => `inline-flex h-10 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors cursor-pointer ${active
    ? 'border-nexus-primary bg-nexus-primary text-white'
    : 'border-nexus-border bg-nexus-surface text-nexus-text hover:bg-nexus-surface-hover'}`;

  return (
    <Modal
      onClose={onClose}
      title={`Registrar ${terms.tl('service')}`}
      description={isAdmin ? undefined : `A tu nombre · ${otherDate ? dayLabel(date) : 'ahora'}`}
      size="md"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} fullWidth className="sm:w-auto">Cancelar</Button>
          <Button onClick={() => submit(false)} loading={submitting} disabled={!professional || count === 0} fullWidth size="lg" className="sm:w-auto">
            {count > 0 ? `Registrar · Bs ${Math.round(total * 100) / 100}` : 'Registrar'}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        {isAdmin && (
          <Field label={terms.t('professional')} required>
            {activePros.length === 0 ? (
              <p className="text-sm text-nexus-text-secondary">No hay {terms.tl('professionals')} activos.</p>
            ) : (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={terms.t('professional')}>
                {activePros.map((p) => (
                  <button key={p.id} type="button" role="radio" aria-checked={p.id === professionalId} onClick={() => chooseProfessional(p.id)} className={chip(p.id === professionalId)}>
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}

        {professional ? (
          <Field label={terms.t('service')} required>
            <ServicePicker
              services={services}
              professional={professional}
              selected={selected}
              onChange={(next) => { setSelected(next); setPriceErrors({}); }}
              errors={priceErrors}
              emptyText={`${professional.name} no tiene ${terms.tl('services')} asignados.`}
            />
          </Field>
        ) : (
          <p className="rounded-lg border border-dashed border-nexus-border px-3 py-4 text-center text-sm text-nexus-text-secondary">
            Elige {terms.g('professional', 'el', 'la')} {terms.tl('professional')} para ver sus {terms.tl('services')}.
          </p>
        )}

        <Field label="Método de pago">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Método de pago">
            {methods.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={m === paymentMethod} onClick={() => setPaymentMethod(m)} className={chip(m === paymentMethod)}>
                {m}
              </button>
            ))}
          </div>
        </Field>

        {/* Cliente: opcional y oculto. Sin elegir = "Cliente general". */}
        <div className="rounded-lg border border-nexus-border">
          <button
            type="button"
            onClick={() => setShowClient((v) => !v)}
            aria-expanded={showClient}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm cursor-pointer"
          >
            <span className="font-medium text-nexus-text">{client ? client.name : `Agregar ${terms.tl('client')}`}</span>
            <span className="flex items-center gap-2 text-xs text-nexus-text-muted">
              {client ? '' : `Opcional · ${GENERAL_CLIENT}`}
              <ChevronDown className={`h-4 w-4 transition-transform ${showClient ? 'rotate-180' : ''}`} aria-hidden="true" />
            </span>
          </button>
          {showClient && (
            <div className="space-y-2 border-t border-nexus-border p-3">
              {client && (
                <Button size="sm" variant="secondary" onClick={() => setClientId(null)}>Quitar ({GENERAL_CLIENT})</Button>
              )}
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"><Search className="h-4 w-4 text-nexus-text-muted" /></span>
                <Input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Buscar por nombre o número..." className="pl-9" />
              </div>
              <div className="max-h-44 divide-y divide-nexus-border overflow-y-auto rounded-lg border border-nexus-border">
                {filteredClients.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-nexus-text-muted">Sin resultados.</p>
                ) : filteredClients.map((c) => (
                  <button key={c.id} type="button" onClick={() => { setClientId(c.id); setShowClient(false); }} className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm cursor-pointer hover:bg-nexus-surface-hover ${c.id === clientId ? 'bg-nexus-primary-soft' : ''}`}>
                    <span className="truncate text-nexus-text">{c.name}</span>
                    <span className="nx-num text-xs text-nexus-text-muted">{c.phone && c.phone !== 'N/A' ? c.phone : ''}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Otra fecha: solo el admin. Solo día (sin hora), hasta 7 días atrás. */}
        {isAdmin && (
          <div className="rounded-lg border border-nexus-border p-3">
            <label className="flex items-center justify-between gap-3 text-sm font-medium text-nexus-text cursor-pointer">
              <span>Otra fecha</span>
              <input type="checkbox" role="switch" checked={otherDate} onChange={(e) => setOtherDate(e.target.checked)} className="h-5 w-9 cursor-pointer accent-nexus-primary" />
            </label>
            {otherDate && (
              <div className="mt-2 space-y-1.5">
                <Input type="date" value={date} min={shiftDay(today, -MAX_BACKDATE_DAYS)} max={today} onChange={(e) => setDate(e.target.value)} aria-label="Día del servicio" />
                <p className="text-xs text-nexus-text-muted">Si la caja de ese día ya se cerró, este registro no se suma a ninguna caja.</p>
              </div>
            )}
          </div>
        )}

        {error && <p role="alert" className="rounded-lg bg-nexus-error-bg px-3 py-2 text-sm text-nexus-error-text">{error}</p>}
      </div>
      {confirmDialog}
    </Modal>
  );
}
