// CommissionPayModal.jsx — Registrar el pago de comisiones de un profesional.
//
// El administrador elige cómo pagó. En efectivo, el pago sale de la caja de
// la sucursal (o queda pendiente para la próxima caja si está cerrada). Lo
// registra el backend en una transacción: no se puede pagar dos veces.

import { useState } from 'react';
import { Button, Modal, Field, Select } from '../../shared/ui';
import { isCashMethod } from '../../shared/cash/cashModel';
import { bs } from './CashCard';

/**
 * props:
 *  professional  { id, name }
 *  amount        comisión pendiente que se muestra (el backend recalcula)
 *  periodLabel   texto del periodo
 *  paymentMethods métodos configurados del negocio
 *  onPay(method) => Promise<{ ok, error?, data? }>
 */
export default function CommissionPayModal({ professional, amount, periodLabel, paymentMethods = [], onPay, onClose }) {
  const methods = paymentMethods.filter((m) => m && m.toLowerCase() !== 'pendiente');
  const [method, setMethod] = useState(methods.find(isCashMethod) || methods[0] || 'Efectivo');
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  async function submit() {
    setError('');
    const r = await onPay(method);
    if (!r.ok) return setError(r.error);
    setDone(r.data);
  }

  if (done) {
    return (
      <Modal open onClose={onClose} title="Pago registrado" size="sm" footer={<Button onClick={onClose}>Listo</Button>}>
        <div className="space-y-2 text-sm text-nexus-text-secondary">
          <p><span className="font-semibold text-nexus-text">{bs(done.monto)}</span> pagados a {professional?.name} en {done.method.toLowerCase()}.</p>
          {done.isCash && !done.pendingCashSession && <p>Se descontó del efectivo esperado de la caja{done.scopeName ? ` de ${done.scopeName}` : ''}.</p>}
          {done.isCash && done.pendingCashSession && <p>La caja{done.scopeName ? ` de ${done.scopeName}` : ''} está cerrada: la salida quedó registrada y se descontará de la próxima caja que abras.</p>}
          {!done.isCash && <p>No afecta el efectivo de la caja.</p>}
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Pagar comisiones" description={`${professional?.name || ''}${periodLabel ? ` · ${periodLabel}` : ''}`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Registrar pago</Button></>}>
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-nexus-text-secondary">Comisión pendiente</span>
          <span className="text-xl font-bold text-nexus-primary nx-num">{bs(amount)}</span>
        </div>
        <Field label="¿Cómo le pagaste?" error={error}
          hint={isCashMethod(method) ? 'Sale del efectivo de la caja.' : 'No toca el efectivo de la caja.'}>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {methods.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
