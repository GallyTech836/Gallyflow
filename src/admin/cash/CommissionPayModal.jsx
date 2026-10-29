// CommissionPayModal.jsx — Registrar el pago de comisiones de un profesional.
//
// Lo usan el administrador (paga) y el propio profesional desde BarberApp
// (registra que le pagaron: who="staff"). Se elige el método. En efectivo, el
// pago sale de la caja de la sucursal (o queda pendiente para la próxima caja
// si está cerrada). Lo registra el backend en una transacción: no se puede
// pagar dos veces.

import { useState } from 'react';
import { Button, Modal, Field, Select } from '../../shared/ui';
import { isCashMethod } from '../../shared/cash/cashModel';

// Igual que bs() de CashCard; local para no cargar la caja en BarberApp.
const bs = (n) => `Bs ${Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * props:
 *  professional  { id, name }
 *  amount        comisión pendiente que se muestra (el backend recalcula)
 *  periodLabel   texto del periodo
 *  paymentMethods métodos configurados del negocio
 *  onPay(method) => Promise<{ ok, error?, data? }>
 *  who           'admin' (por defecto) | 'staff' (el profesional registra su cobro)
 */
export default function CommissionPayModal({ professional, amount, periodLabel, paymentMethods = [], onPay, onClose, who = 'admin' }) {
  const staff = who === 'staff';
  const methods = paymentMethods.filter((m) => m && m.toLowerCase() !== 'pendiente');
  const [method, setMethod] = useState(methods.find(isCashMethod) || methods[0] || 'Efectivo');
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setError('');
    setBusy(true);
    const r = await onPay(method);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setDone(r.data);
  }

  if (done) {
    return (
      <Modal open onClose={onClose} title={staff ? 'Cobro registrado' : 'Pago registrado'} size="sm" footer={<Button onClick={onClose}>Listo</Button>}>
        <div className="space-y-2 text-sm text-nexus-text-secondary">
          {staff
            ? <p>Registraste <span className="font-semibold text-nexus-text">{bs(done.monto)}</span> cobrados en {done.method.toLowerCase()}.</p>
            : <p><span className="font-semibold text-nexus-text">{bs(done.monto)}</span> pagados a {professional?.name} en {done.method.toLowerCase()}.</p>}
          {!staff && done.isCash && !done.pendingCashSession && <p>Se descontó del efectivo esperado de la caja{done.scopeName ? ` de ${done.scopeName}` : ''}.</p>}
          {!staff && done.isCash && done.pendingCashSession && <p>La caja{done.scopeName ? ` de ${done.scopeName}` : ''} está cerrada: la salida quedó registrada y se descontará de la próxima caja que abras.</p>}
          {!staff && !done.isCash && <p>No afecta el efectivo de la caja.</p>}
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={staff ? 'Cobrar comisiones' : 'Pagar comisiones'}
      description={staff ? (periodLabel || '') : `${professional?.name || ''}${periodLabel ? ` · ${periodLabel}` : ''}`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={submit} disabled={busy}>{busy ? 'Guardando…' : staff ? 'Registrar cobro' : 'Registrar pago'}</Button></>}>
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-nexus-text-secondary">Comisión pendiente</span>
          <span className="text-xl font-bold text-nexus-primary nx-num">{bs(amount)}</span>
        </div>
        <Field label={staff ? '¿Cómo te pagaron?' : '¿Cómo le pagaste?'} error={error}
          hint={staff ? undefined : (isCashMethod(method) ? 'Sale del efectivo de la caja.' : 'No toca el efectivo de la caja.')}>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {methods.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
