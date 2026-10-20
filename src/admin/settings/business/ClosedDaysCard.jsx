import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { CalendarOff, Plus, Trash2, Clock } from 'lucide-react';
import { db } from '../../../firebase/config';
import { newClosureId, closureRangeLabel } from '../../../shared/businessSettings/closedDaysModel';

const MOTIVOS = ['Feriado', 'Vacaciones', 'Cerrado'];

function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Días cerrados / feriados (businessSettings.closedDays). Se guardan con el
 * botón "Guardar cambios" de la sección Negocio, igual que el horario.
 * Un día cerrado: el link público no muestra horarios, el asistente de
 * WhatsApp avisa que no se atiende y Admin/Barber solo agendan en sobrehorario.
 */
export default function ClosedDaysCard({ negocioId, value = [], onChange }) {
  const [branches, setBranches] = useState([]);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('Feriado');
  const [branch, setBranch] = useState('');
  // Horario especial: ese día solo se atiende de openStart a openEnd (no cierra todo el día).
  const [parcial, setParcial] = useState(false);
  const [openStart, setOpenStart] = useState('08:00');
  const [openEnd, setOpenEnd] = useState('12:00');
  const [error, setError] = useState('');
  const [verPasados, setVerPasados] = useState(false);

  useEffect(() => {
    if (!negocioId) return undefined;
    const unsub = onSnapshot(
      collection(db, 'negocios', negocioId, 'sucursales'),
      (snap) => setBranches(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((b) => b.active !== false)),
      () => setBranches([])
    );
    return () => unsub();
  }, [negocioId]);

  const variasSucursales = branches.length > 1;
  const hoy = hoyIso();
  const proximos = useMemo(() => value.filter((c) => (c.end || c.start) >= hoy), [value, hoy]);
  const pasados = useMemo(() => value.filter((c) => (c.end || c.start) < hoy).reverse(), [value, hoy]);

  const agregar = (e) => {
    e.preventDefault();
    setError('');
    if (!start) { setError('Elige la fecha.'); return; }
    const fin = end && end >= start ? end : start;
    if (end && end < start) { setError('La fecha "Hasta" no puede ser anterior a "Desde".'); return; }
    if (parcial && !(openStart && openEnd && openEnd > openStart)) {
      setError('En el horario especial, la hora de cierre debe ser después de la de apertura.');
      return;
    }
    const suc = branches.find((b) => b.id === branch);
    const repetido = value.some((c) => c.start === start && (c.end || c.start) === fin && (c.branchId || '') === (suc?.id || ''));
    if (repetido) { setError('Ese día ya está en la lista.'); return; }
    onChange([...value, {
      id: newClosureId(),
      start,
      end: fin,
      reason: reason.trim().slice(0, 60),
      branch: suc?.name || '',
      branchId: suc?.id || '',
      openStart: parcial ? openStart : '',
      openEnd: parcial ? openEnd : '',
    }].sort((a, b) => a.start.localeCompare(b.start)));
    setStart('');
    setEnd('');
    setParcial(false);
  };

  const quitar = (id) => onChange(value.filter((c) => c.id !== id));

  const inputCls = 'h-10 w-full bg-nexus-background border border-nexus-border rounded-lg px-3 text-base sm:text-sm text-nexus-text outline-none focus:border-nexus-primary';

  const Fila = ({ c, pasado }) => (
    <li className={`flex items-center gap-3 px-3 py-2.5 ${pasado ? 'opacity-50' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-nexus-text nx-num">{closureRangeLabel(c)}</p>
        <p className="text-xs text-nexus-text-secondary truncate">
          {c.openStart && c.openEnd
            ? `${c.reason ? `${c.reason} · ` : ''}Atiende solo ${c.openStart} – ${c.openEnd}`
            : (c.reason || 'Cerrado todo el día')}
          {variasSucursales || c.branch ? ` · ${c.branch || 'Todas las sucursales'}` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={() => quitar(c.id)}
        aria-label={`Quitar ${closureRangeLabel(c)}`}
        title="Quitar"
        className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg text-nexus-text-muted hover:bg-nexus-error-bg hover:text-nexus-error-text cursor-pointer"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </li>
  );

  return (
    <div className="bg-nexus-surface border border-nexus-border rounded-xl p-4 sm:p-5 shadow-[var(--nx-shadow-sm)]">
      <div className="flex items-center gap-2.5 mb-1">
        <CalendarOff className="w-5 h-5 text-nexus-primary" aria-hidden="true" />
        <h3 className="text-base font-semibold text-nexus-text">Días cerrados y feriados</h3>
      </div>
      <p className="text-sm text-nexus-text-secondary mb-4">
        Esos días el link público no muestra horarios y el asistente de WhatsApp avisa que
        no se atiende. Con «Horario especial» el día no se cierra: solo se atiende entre las
        horas que elijas (ej. 08:00 a 12:00). En la agenda, fuera de eso solo se agenda en sobrehorario.
      </p>

      <form onSubmit={agregar} className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1.2fr_auto] gap-3 items-end">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-nexus-text-secondary">Desde</span>
          <input type="date" min={hoy} value={start} onChange={(e) => setStart(e.target.value)} className={`${inputCls} nx-num`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-nexus-text-secondary">Hasta (opcional)</span>
          <input type="date" min={start || hoy} value={end} onChange={(e) => setEnd(e.target.value)} className={`${inputCls} nx-num`} />
        </label>
        <label className="col-span-2 md:col-span-1 flex flex-col gap-1">
          <span className="text-xs font-medium text-nexus-text-secondary">Motivo</span>
          <input
            type="text"
            list="nx-closed-reasons"
            maxLength={60}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: Feriado, Vacaciones..."
            className={inputCls}
          />
          <datalist id="nx-closed-reasons">
            {MOTIVOS.map((m) => <option key={m} value={m} />)}
          </datalist>
        </label>
        {variasSucursales && (
          <label className="col-span-2 md:col-span-3 md:order-last flex flex-col gap-1">
            <span className="text-xs font-medium text-nexus-text-secondary">Sucursal</span>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls}>
              <option value="">Todas las sucursales</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        <div className="col-span-2 md:col-span-4 md:order-last flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-nexus-border bg-nexus-background px-3 py-2.5">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={parcial}
              onChange={(e) => setParcial(e.target.checked)}
              className="h-4 w-4 accent-[var(--nx-primary)] cursor-pointer"
            />
            <Clock className="w-4 h-4 text-nexus-primary" aria-hidden="true" />
            <span className="text-sm font-medium text-nexus-text">Horario especial (atiende solo unas horas)</span>
          </label>
          {parcial && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5">
                <span className="text-xs text-nexus-text-secondary">De</span>
                <input type="time" value={openStart} onChange={(e) => setOpenStart(e.target.value)} aria-label="Abre a las" className="h-9 w-28 bg-nexus-surface border border-nexus-border rounded-lg px-2 text-base sm:text-sm text-nexus-text nx-num outline-none focus:border-nexus-primary" />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-xs text-nexus-text-secondary">a</span>
                <input type="time" value={openEnd} onChange={(e) => setOpenEnd(e.target.value)} aria-label="Cierra a las" className="h-9 w-28 bg-nexus-surface border border-nexus-border rounded-lg px-2 text-base sm:text-sm text-nexus-text nx-num outline-none focus:border-nexus-primary" />
              </label>
            </div>
          )}
        </div>
        <button
          type="submit"
          className="col-span-2 md:col-span-1 inline-flex h-10 items-center justify-center gap-1.5 px-4 rounded-lg bg-nexus-primary-soft text-nexus-primary border border-nexus-primary/25 hover:opacity-80 text-sm font-semibold cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Agregar
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-nexus-error-text" role="alert">{error}</p>}

      {proximos.length > 0 ? (
        <ul className="mt-4 rounded-lg border border-nexus-border divide-y divide-nexus-border">
          {proximos.map((c) => <Fila key={c.id} c={c} />)}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-nexus-text-muted">No hay días cerrados próximos.</p>
      )}

      {pasados.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setVerPasados((v) => !v)}
            className="text-sm font-medium text-nexus-primary hover:underline cursor-pointer"
          >
            {verPasados ? 'Ocultar días pasados' : `Ver días pasados (${pasados.length})`}
          </button>
          {verPasados && (
            <ul className="mt-2 rounded-lg border border-nexus-border divide-y divide-nexus-border">
              {pasados.map((c) => <Fila key={c.id} c={c} pasado />)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
