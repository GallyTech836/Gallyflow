// DepositPanel.jsx — El anticipo dentro del modal de la reserva.
//   Espera anticipo  -> Confirmar anticipo / Rechazar (solo el dueño)
//   Pagado           -> cuánto pagó; al completar se cobra solo el saldo
//   Cancelada+pagado -> el dueño decide: Devolver / Quedármelo
// El barbero lo ve, pero no tiene botones (onAction llega solo para el dueño).

import { useState } from 'react';
import { Button } from '../ui';
import { holdExpired, DEPOSIT_LABELS } from './anticipoModel';

const bs = (n) => `Bs ${Math.round((Number(n) || 0) * 100) / 100}`;
const hora = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }); };
const fecha = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-BO', { day: 'numeric', month: 'short' }); };

export default function DepositPanel({ appointment, savedStatus, onAction = null }) {
  const [busy, setBusy] = useState(null);
  const d = appointment?.deposit;
  if (!d) return null;
  const status = savedStatus || appointment.status;
  const run = async (key, ...args) => { setBusy(key); try { await onAction(...args); } finally { setBusy(null); } };

  let tone = 'border-nexus-border bg-nexus-background';
  let body = null;
  let actions = null;

  if (d.status === 'awaiting' && status === 'pending') {
    const vencida = holdExpired({ ...appointment, status: 'pending' });
    tone = vencida ? 'border-nexus-error/30 bg-nexus-error-bg' : 'border-nexus-text-secondary bg-nexus-background';
    body = (
      <>
        <p className="text-sm font-semibold text-nexus-text">Espera anticipo de <span className="nx-num">{bs(d.amount)}</span> por {d.method}</p>
        {d.reportedAt && <p className="text-sm text-nexus-text">El cliente avisó que pagó a las {hora(d.reportedAt)}. Revisa tu cuenta.</p>}
        <p className="text-xs text-nexus-text-secondary">
          {vencida ? 'Venció: el horario ya está libre. Si el cliente pagó, crea la cita de nuevo.' : `Si no lo confirmas hasta las ${hora(d.expiresAt)}, se cancela solo y el horario se libera.`}
        </p>
      </>
    );
    if (onAction && !vencida) {
      actions = (
        <>
          <Button size="sm" loading={busy === 'c'} onClick={() => run('c', 'confirm')}>Confirmar anticipo</Button>
          <Button size="sm" variant="secondary" loading={busy === 'r'} onClick={() => run('r', 'reject')}>No llegó: rechazar</Button>
        </>
      );
    }
  } else if (d.status === 'paid' && status === 'cancelled') {
    tone = 'border-nexus-text-secondary bg-nexus-background';
    body = (
      <>
        <p className="text-sm font-semibold text-nexus-text">Pagó <span className="nx-num">{bs(d.amount)}</span> de anticipo. ¿Qué haces con él?</p>
        <p className="text-xs text-nexus-text-secondary">Si te lo quedas, cuenta como ingreso del negocio, sin comisión.</p>
      </>
    );
    if (onAction) {
      actions = (
        <>
          <Button size="sm" variant="secondary" loading={busy === 'f'} onClick={() => run('f', 'resolve', 'refund')}>Lo devolví</Button>
          <Button size="sm" variant="secondary" loading={busy === 't'} onClick={() => run('t', 'resolve', 'retain')}>Me lo quedo</Button>
        </>
      );
    }
  } else if (d.status === 'paid') {
    tone = 'border-nexus-success/30 bg-nexus-success-bg';
    body = (
      <p className="text-sm text-nexus-success-text">
        <b>Anticipo pagado:</b> <span className="nx-num">{bs(d.amount)}</span> por {d.method}{d.paidAt ? ` · ${fecha(d.paidAt)}` : ''}. Al terminar, cobra solo el saldo.
      </p>
    );
  } else {
    body = (
      <p className="text-sm text-nexus-text-secondary">
        <b className="text-nexus-text">{DEPOSIT_LABELS[d.status] || 'Anticipo'}:</b> <span className="nx-num">{bs(d.amount)}</span>
        {d.status === 'retained' ? ' · quedó como ingreso del negocio.' : d.status === 'refunded' ? ' · se le devolvió al cliente.' : '.'}
      </p>
    );
  }

  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      {body}
      {actions && <div className="mt-2.5 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
