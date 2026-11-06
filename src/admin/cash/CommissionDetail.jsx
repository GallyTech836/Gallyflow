// CommissionDetail.jsx — Contenido del modal «Detalle de comisiones» (Admin).
//
// Arriba, «Información de pago»: los pagos de comisión del periodo elegido
// (día, semana, mes o año) con su método, y un botón para cambiar el método.
// Abajo, cada servicio con «Pagada · Efectivo» / «Pendiente».
// Si el efectivo salió de una caja ya cerrada, el cambio pide el PIN de
// Analítica (lo valida el backend y queda como corrección de esa caja).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Badge, Button, ChoiceChips, Field, Input, Spinner } from '../../shared/ui';
import { isCashMethod } from '../../shared/cash/cashModel';
import { listCommissionPayments, changeCommissionPaymentMethod } from './cashApi';

const bs = (n) => `Bs ${Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' }) : '—');
const quien = (by) => (by?.rol === 'barber' ? 'el profesional' : by?.email || 'Administrador');

function EditMethod({ pago, methods, branchId, onCancel, onSaved }) {
  const [method, setMethod] = useState(pago.method);
  const [needPin, setNeedPin] = useState(false);
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const efecto = method === pago.method
    ? ''
    : isCashMethod(method)
      ? `Se descontarán ${bs(pago.amount)} del efectivo de la caja abierta (o de la próxima que abras).`
      : pago.isCash
        ? `Vuelven ${bs(pago.amount)} al efectivo de la caja.`
        : 'No cambia el efectivo de la caja.';

  async function guardar() {
    if (busy || method === pago.method) return;
    setError('');
    if (needPin && pin.length < 4) return setError('Ingresa el PIN de Analítica.');
    if (needPin && reason.trim().length < 5) return setError('Escribe el motivo del cambio.');
    setBusy(true);
    const r = await changeCommissionPaymentMethod(pago.id, { method, branchId, ...(needPin ? { pin, reason: reason.trim() } : {}) });
    setBusy(false);
    if (!r.ok) {
      if (r.code === 'PIN_REQUIRED') { setNeedPin(true); return setError(''); }
      return setError(r.error);
    }
    onSaved(r.data);
  }

  return (
    <div className="mt-3 space-y-3 border-t border-nexus-border pt-3">
      <ChoiceChips label="Método de pago" options={methods} value={method} onChange={setMethod} />
      {efecto && <p className="text-xs text-nexus-text-secondary">{efecto}</p>}
      {needPin && (
        <div className="space-y-3 rounded-lg bg-nexus-warning-bg/40 p-3">
          <p className="text-xs text-nexus-text-secondary">Este pago salió de una caja que ya se cerró. Para cambiarlo, ingresa el PIN de Analítica: el cierre quedará corregido.</p>
          <Field label="Motivo"><Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: le pagué por QR" /></Field>
          <Field label="PIN de Analítica"><Input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} /></Field>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-nexus-error-text">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={guardar} disabled={busy || method === pago.method}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </div>
    </div>
  );
}

/**
 * props:
 *  barber          { id, name, detalle: [{ id, serviceName, date, amount, paid }] }
 *  startDate/endDate periodo elegido (YYYY-MM-DD)
 *  branchId        sucursal del profesional (para la caja)
 *  paymentMethods  métodos del negocio
 *  emptyText       texto si no hay servicios
 *  onToast(msg)
 */
export default function CommissionDetail({ barber, startDate, endDate, branchId, paymentMethods = [], emptyText, onToast }) {
  const [pagos, setPagos] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const methods = useMemo(() => paymentMethods.filter((m) => m && m.toLowerCase() !== 'pendiente'), [paymentMethods]);

  const load = useCallback(async () => {
    const r = await listCommissionPayments({ barberId: barber.id, startDate, endDate });
    if (!r.ok) { setError(r.error); setPagos([]); return; }
    setError('');
    setPagos(r.data.items);
  }, [barber.id, startDate, endDate]);
  useEffect(() => { load(); }, [load]);

  // Método con el que se pagó cada servicio (por el pago que lo incluye).
  const metodoDe = useMemo(() => {
    const m = new Map();
    for (const p of pagos || []) for (const id of p.citaIds || []) m.set(id, p.method);
    return m;
  }, [pagos]);

  const detalle = barber.detalle || [];

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-nexus-border p-3">
        <p className="text-sm font-semibold text-nexus-text">Información de pago</p>
        {pagos === null ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : error ? (
          <p className="mt-2 text-sm text-nexus-error-text">{error}</p>
        ) : pagos.length === 0 ? (
          <p className="mt-2 text-sm text-nexus-text-muted">Todavía no hay pagos en este periodo.</p>
        ) : (
          <ul className="mt-2 divide-y divide-nexus-border">
            {pagos.map((p) => (
              <li key={p.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-nexus-text">
                      <span className="nx-num">{bs(p.amount)}</span> · {p.method}
                    </p>
                    <p className="text-xs text-nexus-text-secondary">
                      Pagado el {fecha(p.paidAt)} · registró {quien(p.createdBy)}
                      {p.methodChanges.length > 0 ? ` · método cambiado` : ''}
                    </p>
                  </div>
                  {editing !== p.id && (
                    <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(p.id)}>Editar</Button>
                  )}
                </div>
                {editing === p.id && (
                  <EditMethod
                    pago={p}
                    methods={methods}
                    branchId={branchId}
                    onCancel={() => setEditing(null)}
                    onSaved={() => { setEditing(null); onToast?.('Método de pago actualizado'); load(); }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="space-y-2">
        {detalle.map((item) => {
          const metodo = item.paid ? metodoDe.get(item.id) : null;
          return (
            <div key={item.id} className="flex items-center justify-between gap-3 bg-nexus-background border border-nexus-border rounded-lg p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-nexus-text truncate">{item.serviceName}</p>
                <p className="text-xs text-nexus-text-secondary nx-num">{item.date}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm nx-num font-bold text-nexus-primary">{bs(item.amount)}</p>
                <Badge tone={item.paid ? 'success' : 'danger'}>{item.paid ? `Pagada${metodo ? ` · ${metodo}` : ''}` : 'Pendiente'}</Badge>
              </div>
            </div>
          );
        })}
        {detalle.length === 0 && <p className="text-center text-nexus-text-muted text-sm py-6">{emptyText}</p>}
      </div>
    </div>
  );
}
