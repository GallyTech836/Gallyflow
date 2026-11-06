// CashCard.jsx — Caja del día en el Dashboard (una por sucursal).
//
// Abrir, registrar salidas, cerrar (el sobre), ver cierres anteriores y
// corregir un cierre con el PIN de Analítica. Todos los cálculos los hace
// el backend; aquí solo se repite la validación del sobre para avisar antes
// de enviar (misma función: src/shared/cash/cashModel.js).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wallet, RefreshCw, History, CircleArrowDown, Lock, LockOpen, TriangleAlert, CircleCheck } from 'lucide-react';
import { Button, Modal, Field, Input, Textarea, Badge, Spinner } from '../../shared/ui';
import { validateClose, round2 } from '../../shared/cash/cashModel';
import {
  getCurrentCash, listCashSessions, getCashSession, openCash, addCashOut, closeCash, correctCashSession,
} from './cashApi';

export const bs = (n) => `Bs ${Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : '—');
const fechaLarga = (iso) => (iso ? new Date(iso).toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' }) : '—');
const fechaCorta = (iso) => (iso ? new Date(iso).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' }) : '—');
const quien = (p) => p?.email || 'Administrador';

function diffLabel(d) {
  if (d === 0) return { text: 'Cuadra', tone: 'success' };
  if (d > 0) return { text: `Sobran ${bs(d)}`, tone: 'warning' };
  return { text: `Faltan ${bs(Math.abs(d))}`, tone: 'danger' };
}

function Row({ label, value, strong = false, muted = false, className = '' }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-sm ${className}`}>
      <span className={muted ? 'text-nexus-text-muted' : 'text-nexus-text-secondary'}>{label}</span>
      <span className={`nx-num shrink-0 ${strong ? 'font-bold text-nexus-text' : 'font-semibold text-nexus-text'}`}>{value}</span>
    </div>
  );
}

/** Desglose de un resumen: fondo, métodos, salidas y efectivo esperado. */
function SummaryBlock({ summary, salidas = [] }) {
  if (!summary) return null;
  const cash = summary.byMethod.filter((m) => m.isCash);
  const other = summary.byMethod.filter((m) => !m.isCash);
  const activas = salidas.filter((s) => !s.voided);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-nexus-text-muted">Efectivo en la caja</p>
        <Row label="Fondo inicial (cambio)" value={bs(summary.openingFund)} />
        {cash.map((m) => <Row key={m.method} label={`Cobrado en ${m.method.toLowerCase()}`} value={bs(m.amount)} />)}
        {activas.map((s) => (
          <Row key={s.id} label={<>Salida: {s.reason}{s.attachedOnOpen ? <span className="text-nexus-text-muted"> (registrada con la caja cerrada)</span> : null}</>} value={`− ${bs(s.amount)}`} />
        ))}
        <Row label="Efectivo esperado" value={bs(summary.expectedCash)} strong className="pt-1.5 border-t border-nexus-border" />
      </div>
      {other.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-nexus-text-muted">Cobros que no son efectivo (no van al sobre)</p>
          {other.map((m) => <Row key={m.method} label={m.method} value={bs(m.amount)} />)}
        </div>
      )}
      <div className="flex items-baseline justify-between gap-3 rounded-lg bg-nexus-background border border-nexus-border px-3 py-2">
        <span className="text-sm text-nexus-text-secondary">Total de ventas del día</span>
        <span className="nx-num font-bold text-nexus-primary">{bs(summary.totalSales)}</span>
      </div>
    </div>
  );
}

/** Lo que se escribe detrás del sobre. */
function EnvelopeView({ session }) {
  const c = session?.close;
  if (!c) return null;
  const d = diffLabel(c.difference);
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Row label="Fecha" value={fechaLarga(session.closedAt)} />
        <Row label="Sucursal" value={session.scopeName} />
        <Row label="Abrió" value={`${quien(session.openedBy)} · ${hora(session.openedAt)}`} />
        <Row label="Cerró" value={`${quien(session.closedBy)} · ${hora(session.closedAt)}`} />
      </div>
      <SummaryBlock summary={c.summary} salidas={c.salidas} />
      <div className="space-y-1.5 rounded-xl border-2 border-nexus-text/80 p-3">
        <Row label="Efectivo contado" value={bs(c.countedCash)} strong />
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-nexus-text-secondary">Diferencia</span>
          <Badge tone={d.tone}>{d.text}</Badge>
        </div>
        <Row label="Se guarda en el sobre" value={bs(c.envelopeAmount)} strong />
        <Row label="Queda de fondo para mañana" value={bs(c.nextFund)} />
      </div>
      {c.note ? <p className="text-sm text-nexus-text-secondary">Nota: {c.note}</p> : null}
    </div>
  );
}

// ───────────────────────── Modales ─────────────────────────

function OpenModal({ branchName, suggested, pendingCashOut, onClose, onDone }) {
  // Con fondo sugerido (lo que quedó en el último cierre) se abre con un toque.
  const [otro, setOtro] = useState(suggested == null);
  const [fund, setFund] = useState(suggested != null ? String(suggested) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pendiente = round2((pendingCashOut || []).reduce((s, m) => s + m.amount, 0));
  async function abrir(monto) {
    setError('');
    if (monto === '' || Number(monto) < 0 || !Number.isFinite(Number(monto))) return setError('Escribe cuánto efectivo hay para dar cambio (puede ser 0).');
    setBusy(true);
    await onDone(Number(monto), setError);
    setBusy(false);
  }
  return (
    <Modal open onClose={onClose} title="Abrir caja" description={branchName} size="sm"
      footer={otro ? <><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => abrir(fund)} icon={LockOpen} disabled={busy}>Abrir caja</Button></> : null}>
      <div className="space-y-4">
        {!otro ? (
          <>
            <p className="text-sm text-nexus-text-secondary">¿Con cuánto efectivo empiezas? Es el dinero para dar cambio.</p>
            <Button fullWidth icon={LockOpen} onClick={() => abrir(suggested)} disabled={busy}>
              Abrir con {bs(suggested)}
            </Button>
            <p className="-mt-2 text-center text-xs text-nexus-text-muted">Es lo que quedó de cambio en el último cierre.</p>
            <button type="button" onClick={() => setOtro(true)} className="w-full text-center text-sm font-semibold text-nexus-text-secondary underline cursor-pointer">
              Empiezo con otro monto
            </button>
            {error && <p role="alert" className="text-sm text-nexus-error-text">{error}</p>}
          </>
        ) : (
          <Field label="¿Con cuánto efectivo empiezas?" hint="Es el dinero para dar cambio. No cuenta como venta." error={error}>
            <Input type="number" inputMode="decimal" min="0" step="0.5" value={fund} onChange={(e) => setFund(e.target.value)} autoFocus />
          </Field>
        )}
        {pendiente > 0 && (
          <p className="text-sm rounded-lg bg-nexus-warning-bg text-nexus-warning-text px-3 py-2">
            Hay {bs(pendiente)} en salidas de efectivo registradas con la caja cerrada. Se descontarán de esta caja.
          </p>
        )}
      </div>
    </Modal>
  );
}

function CashOutModal({ onClose, onDone }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  async function submit() {
    setError('');
    if (!(Number(amount) > 0)) return setError('Ingresa un importe mayor a 0.');
    if (reason.trim().length < 3) return setError('Escribe el motivo.');
    return onDone(Number(amount), reason.trim(), setError);
  }
  return (
    <Modal open onClose={onClose} title="Registrar salida de efectivo" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Registrar salida</Button></>}>
      <div className="space-y-4">
        <Field label="Importe">
          <Input type="number" inputMode="decimal" min="0" step="0.5" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="Motivo" hint="Por ejemplo: compra de insumos, adelanto a un profesional." error={error}>
          <Input value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <p className="text-xs text-nexus-text-muted">Las comisiones pagadas en efectivo aparecen aquí solas.</p>
      </div>
    </Modal>
  );
}

// Cierre en dos preguntas: ¿cuánto contaste? y ¿cuánto dejas de cambio?
// El sobre se calcula solo (lo contado menos lo que queda de cambio).
function CloseModal({ cash, userEmail, onClose, onDone }) {
  const { summary, session, salidas } = cash;
  const esperado = summary.expectedCash;
  const fondoHoy = round2(session.openingFund ?? 0);
  const [counted, setCounted] = useState('');
  const [fundChoice, setFundChoice] = useState('igual'); // 'igual' | 'nada' | 'otro'
  const [fundOtro, setFundOtro] = useState('');
  const [note, setNote] = useState('');
  const [verDetalle, setVerDetalle] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const contado = counted === '' ? null : round2(counted);
  const fund = fundChoice === 'igual' ? fondoHoy : fundChoice === 'nada' ? 0 : (fundOtro === '' ? null : round2(fundOtro));
  const diferencia = contado === null ? null : round2(contado - esperado);
  const d = diferencia === null ? null : diffLabel(diferencia);
  const fondoInvalido = contado !== null && fund !== null && fund > contado;
  const sobre = contado !== null && fund !== null && !fondoInvalido ? round2(contado - fund) : null;
  const chipClass = (active) => `inline-flex h-10 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors cursor-pointer ${active
    ? 'border-nexus-primary bg-nexus-primary text-white'
    : 'border-nexus-border bg-nexus-surface text-nexus-text hover:bg-nexus-surface-hover'}`;

  async function submit() {
    if (busy) return;
    setError('');
    if (contado === null || contado < 0) return setError('Escribe cuánto efectivo contaste.');
    if (fund === null || fund < 0) return setError('Elige cuánto dejas de cambio para mañana.');
    if (fondoInvalido) return setError('No puedes dejar de cambio más de lo que contaste.');
    const check = validateClose({ expectedCash: esperado, countedCash: contado, envelopeAmount: sobre, nextFund: fund });
    if (!check.ok) return setError(check.errors[0].message);
    if (check.difference !== 0 && note.trim().length < 3) return setError('No cuadra: escribe brevemente por qué.');
    setBusy(true);
    await onDone({ sessionId: session.id, countedCash: contado, envelopeAmount: sobre, nextFund: fund, note: note.trim() }, setError);
    setBusy(false);
  }

  return (
    <Modal open onClose={onClose} title="Cerrar caja" description={`${session.scopeName} · ${fechaLarga(new Date().toISOString())} · ${userEmail || 'Administrador'}`} size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={submit} icon={Lock} disabled={busy}>{busy ? 'Cerrando…' : 'Cerrar caja'}</Button></>}>
      <div className="space-y-5">
        <div className="rounded-xl border border-nexus-border bg-nexus-background p-4 text-center">
          <p className="text-sm text-nexus-text-secondary">Deberías tener en efectivo</p>
          <p className="text-3xl font-bold text-nexus-text nx-num mt-1">{bs(esperado)}</p>
          <button type="button" onClick={() => setVerDetalle((v) => !v)} className="mt-2 text-xs font-semibold text-nexus-text-secondary underline cursor-pointer">
            {verDetalle ? 'Ocultar detalle del día' : 'Ver detalle del día'}
          </button>
          {verDetalle && <div className="mt-3 text-left"><SummaryBlock summary={summary} salidas={salidas} /></div>}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-nexus-text">1. ¿Cuánto efectivo contaste?</p>
          <p className="text-xs text-nexus-text-muted">Todos los billetes y monedas de la caja, incluido el cambio.</p>
          <div className="flex gap-2">
            <Input type="number" inputMode="decimal" min="0" step="0.5" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0" autoFocus className="nx-num" />
            <Button variant="secondary" onClick={() => setCounted(String(esperado))}>Está exacto</Button>
          </div>
          {d && (
            <Badge tone={d.tone} icon={diferencia === 0 ? CircleCheck : TriangleAlert}>{d.text}</Badge>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-nexus-text">2. ¿Cuánto dejas de cambio para mañana?</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cambio para mañana">
            <button type="button" role="radio" aria-checked={fundChoice === 'igual'} onClick={() => setFundChoice('igual')} className={chipClass(fundChoice === 'igual')}>{bs(fondoHoy)} (igual que hoy)</button>
            <button type="button" role="radio" aria-checked={fundChoice === 'nada'} onClick={() => setFundChoice('nada')} className={chipClass(fundChoice === 'nada')}>Nada</button>
            <button type="button" role="radio" aria-checked={fundChoice === 'otro'} onClick={() => setFundChoice('otro')} className={chipClass(fundChoice === 'otro')}>Otro monto</button>
          </div>
          {fundChoice === 'otro' && (
            <Input type="number" inputMode="decimal" min="0" step="0.5" value={fundOtro} onChange={(e) => setFundOtro(e.target.value)} placeholder="0" autoFocus className="nx-num" />
          )}
          {fondoInvalido && <p className="text-xs text-nexus-error-text">No puedes dejar de cambio más de lo que contaste.</p>}
        </div>

        {sobre !== null && (
          <div className="rounded-xl border-2 border-nexus-text/80 p-4 flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-nexus-text">Va al sobre</span>
            <span className="text-2xl font-bold text-nexus-text nx-num">{bs(sobre)}</span>
          </div>
        )}

        {diferencia !== null && diferencia !== 0 && (
          <Field label="¿Por qué no cuadra?" hint="Una frase basta. Ej.: di cambio de más.">
            <Textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        )}
        {error && <p role="alert" className="text-sm text-nexus-error-text">{error}</p>}
      </div>
    </Modal>
  );
}

function CorrectionForm({ session, onCancel, onSaved }) {
  const c = session.close;
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');
  const [counted, setCounted] = useState(String(c.countedCash));
  const [envelope, setEnvelope] = useState(String(c.envelopeAmount));
  const [fund, setFund] = useState(String(c.nextFund));
  const [note, setNote] = useState(c.note || '');
  const [voidIds, setVoidIds] = useState([]);
  const [error, setError] = useState('');
  const manuales = (c.salidas || []).filter((s) => s.source === 'manual' && !s.voided);

  async function submit() {
    setError('');
    if (pin.length < 4) return setError('Ingresa el PIN de Analítica.');
    if (reason.trim().length < 5) return setError('Explica el motivo de la corrección.');
    const changes = { countedCash: Number(counted), envelopeAmount: Number(envelope), nextFund: Number(fund), note };
    if (voidIds.length) changes.voidMovementIds = voidIds;
    const r = await correctCashSession(session.id, { pin, reason: reason.trim(), changes });
    if (!r.ok) return setError(r.error);
    onSaved();
  }

  return (
    <div className="space-y-3 rounded-xl border border-nexus-warning/40 bg-nexus-warning-bg/40 p-3">
      <p className="text-sm font-semibold text-nexus-text">Corregir este cierre</p>
      <p className="text-xs text-nexus-text-secondary">El cierre original no se borra; la corrección queda registrada.</p>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Contado"><Input type="number" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} /></Field>
        <Field label="Sobre"><Input type="number" inputMode="decimal" value={envelope} onChange={(e) => setEnvelope(e.target.value)} /></Field>
        <Field label="Fondo"><Input type="number" inputMode="decimal" value={fund} onChange={(e) => setFund(e.target.value)} /></Field>
      </div>
      {manuales.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-nexus-text-secondary mb-1">Anular una salida registrada por error</legend>
          {manuales.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm text-nexus-text cursor-pointer">
              <input type="checkbox" checked={voidIds.includes(s.id)} onChange={(e) => setVoidIds((v) => (e.target.checked ? [...v, s.id] : v.filter((x) => x !== s.id)))} />
              {s.reason} · {bs(s.amount)}
            </label>
          ))}
        </fieldset>
      )}
      <Field label="Nota del cierre"><Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
      <Field label="Motivo de la corrección"><Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
      <Field label="PIN de Analítica" error={error}>
        <Input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={submit}>Guardar corrección</Button>
      </div>
    </div>
  );
}

const FIELD_LABELS = {
  countedCash: 'Efectivo contado', envelopeAmount: 'Sobre', nextFund: 'Fondo para mañana', note: 'Nota',
  difference: 'Diferencia', expectedCash: 'Efectivo esperado', salidaAnulada: 'Salida anulada',
};
const fmtVal = (f, v) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'number' ? bs(v) : String(v));

function HistoryModal({ branchId, branchName, onClose }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);
  const [correcting, setCorrecting] = useState(false);

  const loadList = useCallback(async () => {
    const r = await listCashSessions(branchId);
    if (!r.ok) { setError(r.error); setItems([]); return; }
    setItems(r.data.items);
  }, [branchId]);
  const loadDetail = useCallback(async (id) => {
    const r = await getCashSession(id);
    if (!r.ok) { setError(r.error); return; }
    setDetail(r.data);
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  if (detail) {
    const s = detail.session;
    return (
      <Modal open onClose={onClose} title={`Cierre del ${fechaCorta(s.closedAt || s.openedAt)}`} description={s.scopeName} size="md"
        footer={<Button variant="secondary" onClick={() => { setDetail(null); setCorrecting(false); }}>Volver a la lista</Button>}>
        {s.status !== 'closed' ? (
          <p className="text-sm text-nexus-text-secondary">Esta caja sigue abierta.</p>
        ) : (
          <div className="space-y-5">
            <EnvelopeView session={s} />
            {detail.correcciones.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-nexus-text">Correcciones</p>
                {detail.correcciones.map((c) => (
                  <div key={c.id} className="rounded-lg border border-nexus-border p-3 text-sm space-y-1">
                    <p className="text-nexus-text-secondary">{fechaCorta(c.at)} {hora(c.at)} · {quien(c.by)}</p>
                    <p className="text-nexus-text">Motivo: {c.reason}</p>
                    <ul className="text-nexus-text-secondary">
                      {c.changes.map((ch, i) => <li key={i}>{FIELD_LABELS[ch.field] || ch.field}: {fmtVal(ch.field, ch.before)} → {fmtVal(ch.field, ch.after)}</li>)}
                    </ul>
                  </div>
                ))}
                <details className="text-sm">
                  <summary className="cursor-pointer text-nexus-text-secondary">Ver el cierre original</summary>
                  <div className="mt-2 space-y-1.5">
                    <Row label="Efectivo esperado" value={bs(s.originalClose?.summary?.expectedCash)} />
                    <Row label="Efectivo contado" value={bs(s.originalClose?.countedCash)} />
                    <Row label="Sobre" value={bs(s.originalClose?.envelopeAmount)} />
                    <Row label="Fondo para mañana" value={bs(s.originalClose?.nextFund)} />
                  </div>
                </details>
              </div>
            )}
            {correcting ? (
              <CorrectionForm session={s} onCancel={() => setCorrecting(false)} onSaved={async () => { setCorrecting(false); await loadDetail(s.id); loadList(); }} />
            ) : (
              <Button variant="secondary" size="sm" icon={Lock} onClick={() => setCorrecting(true)}>Corregir con PIN</Button>
            )}
          </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Cierres de caja" description={branchName} size="md">
      {error && <p className="text-sm text-nexus-error-text mb-3">{error}</p>}
      {items === null ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-nexus-text-muted text-center py-8">Todavía no hay cierres en esta sucursal.</p>
      ) : (
        <ul className="divide-y divide-nexus-border">
          {items.map((it) => {
            const d = it.difference != null ? diffLabel(it.difference) : null;
            return (
              <li key={it.id}>
                <button type="button" onClick={() => loadDetail(it.id)} className="w-full text-left py-3 flex items-center justify-between gap-3 hover:bg-nexus-surface-hover rounded-lg px-2 -mx-2 cursor-pointer">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-nexus-text capitalize">{fechaLarga(it.closedAt || it.openedAt)}</span>
                    <span className="block text-xs text-nexus-text-secondary">
                      {it.status === 'open' ? 'Abierta' : `Ventas ${bs(it.totalSales)} · Sobre ${bs(it.envelopeAmount)}`}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1 shrink-0">
                    {d && <Badge tone={d.tone}>{d.text}</Badge>}
                    {it.corrected && <Badge tone="info">Corregida</Badge>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

// ───────────────────────── Tarjeta ─────────────────────────

export default function CashCard({ branchId, branchName, userEmail, onToast }) {
  const [cash, setCash] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'open' | 'out' | 'close' | 'history' | 'closed'
  const [lastClosed, setLastClosed] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getCurrentCash(branchId);
    setLoading(false);
    if (!r.ok) { setError(r.error); return; }
    setError('');
    setCash(r.data);
  }, [branchId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const toast = useCallback((msg, type) => onToast?.(msg, type), [onToast]);
  const summary = cash?.summary;
  const cashOutTotal = useMemo(() => (summary ? summary.cashOut : 0), [summary]);

  return (
    <div className="bg-nexus-surface border border-nexus-border rounded-xl p-4 sm:p-5 shadow-sm min-w-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-base font-semibold text-nexus-text flex items-center gap-2 min-w-0">
          <Wallet className="w-4 h-4 text-nexus-text-secondary shrink-0" aria-hidden="true" />
          <span className="truncate">Caja{branchName ? ` · ${branchName}` : ''}</span>
        </h3>
        <div className="flex items-center gap-1 shrink-0">
          {cash && <Badge tone={cash.open ? 'success' : 'neutral'}>{cash.open ? 'Abierta' : 'Cerrada'}</Badge>}
          <button type="button" onClick={load} aria-label="Actualizar caja" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-nexus-text-muted hover:bg-nexus-surface-hover hover:text-nexus-text cursor-pointer">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && !cash ? (
        <div className="text-sm text-nexus-error-text py-3">{error} <button type="button" className="underline" onClick={load}>Reintentar</button></div>
      ) : !cash ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : cash.open ? (
        <div className="space-y-4">
          <p className="text-xs text-nexus-text-muted">Abierta a las {hora(cash.session.openedAt)} por {quien(cash.session.openedBy)}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">Efectivo esperado</p>
              <p className="text-2xl font-bold text-nexus-text nx-num mt-0.5">{bs(summary.expectedCash)}</p>
              <p className="text-xs text-nexus-text-muted mt-0.5">Fondo {bs(summary.openingFund)}{cashOutTotal > 0 ? ` · salidas ${bs(cashOutTotal)}` : ''}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-nexus-text-secondary">Ventas del día</p>
              <p className="text-2xl font-bold text-nexus-primary nx-num mt-0.5">{bs(summary.totalSales)}</p>
              <p className="text-xs text-nexus-text-muted mt-0.5">{summary.cobrosCount} {summary.cobrosCount === 1 ? 'cobro' : 'cobros'}, todos los métodos</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {summary.byMethod.map((m) => <Row key={m.method} label={m.method} value={bs(m.amount)} muted={m.amount === 0} />)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={Lock} onClick={() => setModal('close')}>Cerrar caja</Button>
            <Button size="sm" variant="secondary" icon={CircleArrowDown} onClick={() => setModal('out')}>Salida de efectivo</Button>
            <Button size="sm" variant="ghost" icon={History} onClick={() => setModal('history')}>Cierres</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-nexus-text-secondary">
            {cash.lastClosedAt ? `Último cierre: ${fechaCorta(cash.lastClosedAt)} a las ${hora(cash.lastClosedAt)}.` : 'Abre la caja al empezar el día con el fondo para dar cambio.'}
          </p>
          {cash.pendingCashOut?.length > 0 && (
            <p className="text-sm rounded-lg bg-nexus-warning-bg text-nexus-warning-text px-3 py-2">
              {bs(cash.pendingCashOut.reduce((s, m) => s + m.amount, 0))} en salidas de efectivo esperan la próxima apertura.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={LockOpen} onClick={() => setModal('open')}>Abrir caja</Button>
            <Button size="sm" variant="ghost" icon={History} onClick={() => setModal('history')}>Cierres</Button>
          </div>
        </div>
      )}

      {modal === 'open' && (
        <OpenModal
          branchName={branchName}
          suggested={cash?.suggestedOpeningFund}
          pendingCashOut={cash?.pendingCashOut}
          onClose={() => setModal(null)}
          onDone={async (fund, setErr) => {
            const r = await openCash(branchId, fund);
            if (!r.ok) return setErr(r.error);
            setModal(null); toast('Caja abierta'); load();
          }}
        />
      )}
      {modal === 'out' && (
        <CashOutModal
          onClose={() => setModal(null)}
          onDone={async (amount, reason, setErr) => {
            const r = await addCashOut(branchId, amount, reason);
            if (!r.ok) return setErr(r.error);
            setModal(null); toast('Salida registrada'); load();
          }}
        />
      )}
      {modal === 'close' && cash?.open && (
        <CloseModal
          cash={cash}
          userEmail={userEmail}
          onClose={() => setModal(null)}
          onDone={async (payload, setErr) => {
            const r = await closeCash(branchId, payload);
            if (!r.ok) { if (r.code === 'STALE_SESSION' || r.code === 'NOT_OPEN') load(); return setErr(r.error); }
            setLastClosed(r.data.session); setModal('closed'); toast('Caja cerrada'); load();
          }}
        />
      )}
      {modal === 'closed' && lastClosed && (
        <Modal open onClose={() => setModal(null)} title="Caja cerrada" description="Esto es lo que va escrito en el sobre." size="md"
          footer={<Button onClick={() => setModal(null)}>Listo</Button>}>
          <EnvelopeView session={lastClosed} />
        </Modal>
      )}
      {modal === 'history' && <HistoryModal branchId={branchId} branchName={branchName} onClose={() => setModal(null)} />}
    </div>
  );
}
