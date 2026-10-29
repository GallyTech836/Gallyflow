import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, Plus, History, Pencil, Ban, ChevronLeft, ChevronRight } from 'lucide-react';
import { Modal, Button, Field, Input, Select, Textarea, Badge, EmptyState, LoadingState } from '../ui';
import { useBusinessTerms } from '../businessProfiles/useBusinessProfile';
import ServicePicker from './ServicePicker';
import { estimateTotal, toServiceInputs } from './servicePickerModel';
import { listRegistros, listCorrecciones, correctRegistro, voidRegistro, getRegistrosResumen } from './registrosApi';
import {
  PERIODS, periodRange, shiftPeriod, canGoNext, clampRef, periodLabel, dayTitle, monthName, groupByDay,
  summarize, needsPin, describeChange, dayLabel, todayKey, GENERAL_CLIENT,
} from './registroModel';

const money = (n) => `Bs ${Math.round((Number(n) || 0) * 100) / 100}`;

/**
 * Lista de "Servicios registrados" (plan Nexus Control), con detalle,
 * historial de correcciones, corregir y anular. Todo pasa por el backend
 * (/api/servicios-registrados).
 *
 * Periodos de calendario: Día / Semana (lun–dom) / Mes / Año, con ◀ ▶ y
 * calendario (nunca al futuro). Semana y Mes se agrupan por día; Año muestra
 * los totales por mes (desde el backend) y al tocar un mes abre ese Mes.
 * Solo se lee el rango visible.
 *
 * Props:
 * - isAdmin: admin ve todos, filtra por profesional, corrige y anula. El
 *   barbero solo ve los suyos y su detalle (no corrige ni anula).
 * - showPrices / showCommissions: permisos del barbero (solo en pantalla).
 * - professionals, services, clients, paymentMethods
 * - refreshKey: cambia para volver a cargar (ej. después de registrar).
 * - onRegister: abre el modal de registrar (botón del encabezado).
 * - registerDesktopOnly: ese botón solo en escritorio (en celular hay barra fija).
 * - onToast(msg, tipo)
 */
export default function RegistrosPanel({
  isAdmin = false, showPrices = true, showCommissions = true,
  professionals = [], services = [], clients = [], paymentMethods = [],
  refreshKey = 0, onRegister, registerDesktopOnly = false, onToast,
}) {
  const terms = useBusinessTerms();
  const [period, setPeriod] = useState('dia');
  const [ref, setRef] = useState(() => todayKey()); // un día dentro del periodo que se mira
  const [proFilter, setProFilter] = useState('all');
  // Resultado de la última consulta, con su clave: si la clave no es la del
  // rango visible, se está cargando.
  const [result, setResult] = useState({ key: null, items: [], yearData: null, error: '' });
  const [openId, setOpenId] = useState(null);
  const [tick, setTick] = useState(0);

  const isYear = period === 'año';
  const range = useMemo(() => periodRange(period, ref), [period, ref]);
  const proName = useCallback((id) => professionals.find((p) => p.id === id)?.name || '—', [professionals]);
  const professionalId = isAdmin ? proFilter : undefined;
  const reqKey = `${isYear ? 'año' : 'lista'}|${range.from}|${range.to}|${professionalId || ''}|${refreshKey}|${tick}`;

  useEffect(() => {
    let cancelled = false;
    const done = (patch) => { if (!cancelled) setResult({ key: reqKey, items: [], yearData: null, error: '', ...patch }); };
    if (isYear) {
      getRegistrosResumen({ year: Number(range.from.slice(0, 4)), professionalId }).then((r) => done(r.ok
        ? { yearData: r.data }
        : { yearData: { months: [], totals: { count: 0, total: 0, commission: 0 } }, error: r.data.error || 'No se pudo cargar el resumen del año.' }));
    } else {
      listRegistros({ ...range, professionalId }).then((r) => done(r.ok
        ? { items: r.data.items || [] }
        : { error: r.data.error || 'No se pudieron cargar los registros.' }));
    }
    return () => { cancelled = true; };
  }, [reqKey, isYear, range, professionalId]);

  const loading = result.key !== reqKey;
  const items = loading ? null : result.items;
  const yearData = loading ? null : result.yearData;
  const error = loading ? '' : result.error;

  const reload = () => setTick((t) => t + 1);
  const totals = useMemo(() => summarize(items || []), [items]);
  const groups = useMemo(() => (period === 'semana' || period === 'mes' ? groupByDay(items || []) : null), [period, items]);
  const months = useMemo(() => (yearData?.months || []).filter((m) => m.count > 0).slice().reverse(), [yearData]);
  const open = (items || []).find((r) => r.id === openId) || null;
  const summary = isYear
    ? (yearData ? { count: yearData.totals.count, total: yearData.totals.total, commission: yearData.totals.commission } : null)
    : (items ? totals : null);

  const changePeriod = (p) => { setPeriod(p); setRef((r) => clampRef(r)); };
  const openMonth = (month) => { setPeriod('mes'); setRef(`${month}-01`); };
  const empty = <EmptyState icon={ClipboardList} title={`Sin ${terms.tl('services')} registrados en este periodo`} />;
  const row = (r) => (
    <RegistroRow key={r.id} r={r} isAdmin={isAdmin} showPrices={showPrices} proName={proName} onOpen={() => setOpenId(r.id)} />
  );

  return (
    <div className="space-y-4">
      <PeriodTabs value={period} onChange={changePeriod} />

      <div className="flex flex-wrap items-center gap-2">
        <PeriodNav period={period} refDay={ref} onChange={setRef} />
        {isAdmin && (
          <Select value={proFilter} onChange={(e) => setProFilter(e.target.value)} aria-label={terms.t('professional')} className="w-auto min-w-40">
            <option value="all">Todos</option>
            {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        )}
        {onRegister && (
          // Con la barra fija de celular (registerDesktopOnly), aquí solo en escritorio.
          <span className={registerDesktopOnly ? 'ml-auto hidden lg:block' : 'ml-auto'}>
            <Button icon={Plus} onClick={onRegister}>Registrar {terms.tl('service')}</Button>
          </span>
        )}
      </div>

      <div className={`grid gap-2 ${showPrices && showCommissions ? 'grid-cols-2 sm:grid-cols-3' : showPrices || showCommissions ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <Stat label={`${terms.t('services')} registrados`} value={summary ? summary.count : '—'} />
        {showPrices && <Stat label="Total" value={summary ? money(summary.total) : '—'} />}
        {showCommissions && (
          <Stat
            label="Comisiones"
            value={summary ? money(summary.commission) : '—'}
            hint={!isYear && summary && summary.commission > 0 ? `${money(summary.commissionPending)} pendiente` : null}
          />
        )}
      </div>

      {error && <p role="alert" className="rounded-lg bg-nexus-error-bg px-3 py-2 text-sm text-nexus-error-text">{error}</p>}

      {isYear ? (
        yearData === null ? <LoadingState /> : months.length === 0 ? empty : (
          <ul className="divide-y divide-nexus-border overflow-hidden rounded-xl border border-nexus-border bg-nexus-surface">
            {months.map((m) => (
              <li key={m.month}>
                <button type="button" onClick={() => openMonth(m.month)} className="flex w-full items-center gap-3 px-3 py-3 text-left cursor-pointer hover:bg-nexus-surface-hover">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-nexus-text">{monthName(m.month)}</span>
                    <span className="block text-xs text-nexus-text-secondary">{m.count} {m.count === 1 ? terms.tl('service') : terms.tl('services')}</span>
                  </span>
                  {showPrices && <span className="nx-num text-sm font-bold text-nexus-text">{money(m.total)}</span>}
                  <ChevronRight className="h-4 w-4 shrink-0 text-nexus-text-muted" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )
      ) : items === null ? (
        <LoadingState />
      ) : items.length === 0 ? (
        empty
      ) : groups ? (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.date} aria-label={dayTitle(g.date)}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 px-1">
                <h3 className="text-sm font-semibold text-nexus-text">{dayTitle(g.date)}</h3>
                <p className="nx-num text-xs text-nexus-text-secondary">
                  {g.count} {g.count === 1 ? terms.tl('service') : terms.tl('services')}{showPrices ? ` · ${money(g.total)}` : ''}
                </p>
              </div>
              <ul className="divide-y divide-nexus-border overflow-hidden rounded-xl border border-nexus-border bg-nexus-surface">
                {g.items.map(row)}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-nexus-border overflow-hidden rounded-xl border border-nexus-border bg-nexus-surface">
          {items.map(row)}
        </ul>
      )}

      {open && (
        <RegistroDetail
          registro={open}
          isAdmin={isAdmin}
          showPrices={showPrices}
          showCommissions={showCommissions}
          professionals={professionals}
          services={services}
          clients={clients}
          paymentMethods={paymentMethods}
          proName={proName}
          onClose={() => setOpenId(null)}
          onChanged={(msg) => { onToast?.(msg, 'success'); setOpenId(null); reload(); }}
        />
      )}
    </div>
  );
}

function RegistroRow({ r, isAdmin, showPrices, proName, onOpen }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className={`flex w-full items-center gap-3 px-3 py-3 text-left cursor-pointer hover:bg-nexus-surface-hover ${r.status === 'cancelled' ? 'opacity-60' : ''}`}>
        <span className="nx-num w-12 shrink-0 text-xs text-nexus-text-secondary">
          {r.backdated ? '—' : r.time}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-semibold text-nexus-text ${r.status === 'cancelled' ? 'line-through' : ''}`}>{r.serviceName}</span>
          <span className="block truncate text-xs text-nexus-text-secondary">
            {isAdmin ? `${proName(r.professionalId)} · ` : ''}{r.clientName || GENERAL_CLIENT} · {r.paymentMethod}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {showPrices && <span className="nx-num text-sm font-bold text-nexus-text">{money(r.price)}</span>}
          <RowBadges r={r} />
        </span>
      </button>
    </li>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-nexus-border bg-nexus-surface px-3 py-2.5">
      <p className="text-xs text-nexus-text-secondary">{label}</p>
      <p className="nx-num mt-0.5 text-lg font-bold text-nexus-text">{value}</p>
      {hint && <p className="nx-num text-xs text-nexus-text-secondary">{hint}</p>}
    </div>
  );
}

function RowBadges({ r }) {
  if (r.status === 'cancelled') return <Badge tone="danger">Anulado</Badge>;
  return (
    <span className="flex gap-1">
      {r.backdated && <Badge tone="info">Otra fecha</Badge>}
      {r.correctionsCount > 0 && <Badge tone="warning">Corregido</Badge>}
      {r.commissionPaid && <Badge tone="success">Pagada</Badge>}
    </span>
  );
}

// ───────────────────────── Detalle ─────────────────────────

function RegistroDetail({ registro: r, isAdmin, showPrices = true, showCommissions = true, professionals, services, clients, paymentMethods, proName, onClose, onChanged }) {
  const terms = useBusinessTerms();
  const [history, setHistory] = useState(null);
  const [mode, setMode] = useState(null); // 'correct' | 'void'

  useEffect(() => {
    let cancelled = false;
    listCorrecciones(r.id).then((res) => { if (!cancelled) setHistory(res.ok ? res.data.items || [] : []); });
    return () => { cancelled = true; };
  }, [r.id]);

  // Corregir y anular: solo el administrador (el backend responde 403 al barbero).
  const editable = isAdmin && r.status !== 'cancelled';
  const commission = Number(r.commissionSnapshot?.amount) || 0;

  if (mode === 'correct') return <CorrectForm r={r} isAdmin={isAdmin} professionals={professionals} services={services} clients={clients} paymentMethods={paymentMethods} onCancel={() => setMode(null)} onDone={onChanged} />;
  if (mode === 'void') return <VoidForm r={r} isAdmin={isAdmin} onCancel={() => setMode(null)} onDone={onChanged} />;

  return (
    <Modal
      onClose={onClose}
      title={r.serviceName}
      description={`${dayLabel(r.date)}${r.backdated ? ' · otra fecha' : ` · ${r.time}`} · ${proName(r.professionalId)}`}
      size="md"
      footer={editable ? (
        <>
          <Button variant="danger-soft" icon={Ban} onClick={() => setMode('void')} fullWidth className="sm:w-auto">Anular</Button>
          <Button icon={Pencil} onClick={() => setMode('correct')} fullWidth className="sm:w-auto">Corregir</Button>
        </>
      ) : (
        <Button variant="secondary" onClick={onClose} fullWidth className="sm:w-auto">Cerrar</Button>
      )}
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          {showPrices && <><dt className="text-nexus-text-secondary">Importe</dt><dd className="nx-num text-right font-semibold text-nexus-text">{money(r.price)}</dd></>}
          <dt className="text-nexus-text-secondary">Método de pago</dt><dd className="text-right text-nexus-text">{r.paymentMethod}</dd>
          <dt className="text-nexus-text-secondary">{terms.t('client')}</dt><dd className="truncate text-right text-nexus-text">{r.clientName || GENERAL_CLIENT}</dd>
          {showCommissions && <><dt className="text-nexus-text-secondary">Comisión</dt>
          <dd className="nx-num text-right text-nexus-text">{money(commission)} · {r.commissionPaid ? 'pagada' : 'pendiente'}</dd></>}
          <dt className="text-nexus-text-secondary">Registrado por</dt>
          <dd className="text-right text-nexus-text">{r.registeredBy?.rol === 'barber' ? proName(r.registeredBy.uid) : 'Administrador'}</dd>
        </dl>

        {(r.services || []).length > 1 && (
          <ul className="space-y-1 rounded-lg bg-nexus-background p-2.5 text-sm">
            {r.services.map((s) => (
              <li key={s.serviceId} className="flex justify-between"><span>{s.serviceName}</span>{showPrices && <span className="nx-num">{money(s.price)}</span>}</li>
            ))}
          </ul>
        )}

        {r.status === 'cancelled' && (
          <p className="rounded-lg bg-nexus-error-bg px-3 py-2 text-sm text-nexus-error-text">Anulado: {r.voidReason}</p>
        )}
        {!isAdmin && r.status !== 'cancelled' && (
          <p className="text-sm text-nexus-text-secondary">Si hay un error, avísale al administrador.</p>
        )}

        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-nexus-text"><History className="h-4 w-4" aria-hidden="true" /> Historial de cambios</h3>
          {history === null ? (
            <LoadingState />
          ) : history.length === 0 ? (
            <p className="text-sm text-nexus-text-muted">Sin cambios.</p>
          ) : (
            <ol className="space-y-2">
              {history.map((h) => (
                <li key={h.id} className="rounded-lg border border-nexus-border p-2.5 text-sm">
                  <p className="font-semibold text-nexus-text">
                    {h.type === 'void' ? 'Anulado' : 'Corregido'} · <span className="nx-num font-normal text-nexus-text-secondary">{new Date(h.at).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </p>
                  <p className="text-xs text-nexus-text-secondary">
                    {h.by?.rol === 'barber' ? proName(h.by.uid) : 'Administrador'} · Motivo: {h.reason}{h.pinVerified ? ' · con PIN' : ''}
                  </p>
                  {h.type !== 'void' && (
                    <ul className="mt-1 space-y-0.5 text-xs text-nexus-text">
                      {(h.changes || []).map((c, i) => <li key={i}>{describeChange(c, { professionals })}</li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────── Corregir ─────────────────────────

function PinField({ value, onChange }) {
  return (
    <Field label="PIN de Analítica" hint="La caja ya se cerró, la comisión ya se pagó o el registro quedó fuera de caja.">
      <Input type="password" inputMode="numeric" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function CorrectForm({ r, isAdmin, professionals, services, clients, paymentMethods, onCancel, onDone }) {
  const terms = useBusinessTerms();
  const activePros = professionals.filter((p) => p?.active !== false || p.id === r.professionalId);
  const methods = paymentMethods?.length ? paymentMethods : [r.paymentMethod];
  const [professionalId, setProfessionalId] = useState(r.professionalId);
  const [selected, setSelected] = useState(() => Object.fromEntries((r.services || []).map((s) => [s.serviceId, s.priceVariable ? String(s.price) : ''])));
  const [paymentMethod, setPaymentMethod] = useState(r.paymentMethod);
  const [clientId, setClientId] = useState(r.clientId || '');
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const professional = professionals.find((p) => p.id === professionalId) || null;
  const showPin = isAdmin && needsPin(r);

  async function save() {
    setSaving(true);
    setError('');
    const body = {
      reason,
      services: toServiceInputs(services, professional, selected),
      paymentMethod,
      clientId: clientId || null,
      ...(isAdmin && professionalId !== r.professionalId ? { professionalId } : {}),
      ...(showPin ? { pin } : {}),
    };
    const res = await correctRegistro(r.id, body);
    setSaving(false);
    if (res.ok) return onDone('Registro corregido.');
    setError(res.data.error || 'No se pudo corregir.');
  }

  return (
    <Modal
      onClose={onCancel}
      title="Corregir registro"
      size="md"
      footer={(
        <>
          <Button variant="secondary" onClick={onCancel} fullWidth className="sm:w-auto">Volver</Button>
          <Button onClick={save} loading={saving} disabled={reason.trim().length < 5 || Object.keys(selected).length === 0} fullWidth className="sm:w-auto">
            Guardar · Bs {Math.round(estimateTotal(services, professional, selected) * 100) / 100}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        {isAdmin && (
          <Field label={terms.t('professional')}>
            <Select value={professionalId} onChange={(e) => { setProfessionalId(e.target.value); setSelected({}); }}>
              {activePros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label={terms.t('services')}>
          <ServicePicker services={services} professional={professional} selected={selected} onChange={setSelected} />
        </Field>
        <Field label="Método de pago">
          <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            {[...new Set([...methods, r.paymentMethod])].map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label={terms.t('client')}>
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">{GENERAL_CLIENT}</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Motivo" required hint="Queda en el historial.">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: era corte y barba" />
        </Field>
        {showPin && <PinField value={pin} onChange={setPin} />}
        {error && <p role="alert" className="rounded-lg bg-nexus-error-bg px-3 py-2 text-sm text-nexus-error-text">{error}</p>}
      </div>
    </Modal>
  );
}

// ───────────────────────── Anular ─────────────────────────

function VoidForm({ r, isAdmin, onCancel, onDone }) {
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const showPin = isAdmin && needsPin(r);

  async function save() {
    setSaving(true);
    setError('');
    const res = await voidRegistro(r.id, { reason, ...(showPin ? { pin } : {}) });
    setSaving(false);
    if (res.ok) return onDone('Registro anulado.');
    setError(res.data.error || 'No se pudo anular.');
  }

  return (
    <Modal
      onClose={onCancel}
      title="Anular registro"
      description={`${r.serviceName} · ${money(r.price)}`}
      size="sm"
      footer={(
        <>
          <Button variant="secondary" onClick={onCancel} fullWidth className="sm:w-auto">Volver</Button>
          <Button variant="danger" onClick={save} loading={saving} disabled={reason.trim().length < 5} fullWidth className="sm:w-auto">Anular</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <p className="text-sm text-nexus-text-secondary">El registro no se borra: queda como anulado, con el motivo, y deja de contar en el importe y las comisiones.</p>
        <Field label="Motivo" required>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: lo registré dos veces" />
        </Field>
        {showPin && <PinField value={pin} onChange={setPin} />}
        {error && <p role="alert" className="rounded-lg bg-nexus-error-bg px-3 py-2 text-sm text-nexus-error-text">{error}</p>}
      </div>
    </Modal>
  );
}

/** Día / Semana / Mes / Año, con el mismo estilo que el selector de la agenda. */
function PeriodTabs({ value, onChange }) {
  return (
    <div role="group" aria-label="Periodo" className="flex w-full max-w-md items-center justify-between gap-1 rounded-2xl border border-nexus-border bg-nexus-background p-1">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => onChange(p.value)}
          aria-pressed={value === p.value}
          className={`h-10 flex-1 select-none rounded-xl px-3 text-center text-sm font-semibold transition-colors duration-200 cursor-pointer sm:px-4 ${
            value === p.value ? 'bg-nexus-primary text-white shadow-sm' : 'text-nexus-text-secondary hover:text-nexus-text'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

const PREV_LABEL = { dia: 'Día anterior', semana: 'Semana anterior', mes: 'Mes anterior', año: 'Año anterior' };
const NEXT_LABEL = { dia: 'Día siguiente', semana: 'Semana siguiente', mes: 'Mes siguiente', año: 'Año siguiente' };

/**
 * ◀ periodo ▶. Tocar la fecha o el rango abre el calendario: se elige un día
 * y se salta al periodo que lo contiene. Nunca se va al futuro.
 */
function PeriodNav({ period, refDay, onChange }) {
  const today = todayKey();
  const inputRef = useRef(null);
  const pick = (v) => { if (v && v <= today) onChange(v); };
  const openCalendar = () => {
    const el = inputRef.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  };
  const arrow = 'h-9 w-9 inline-flex items-center justify-center rounded-lg text-nexus-primary transition-colors cursor-pointer hover:bg-nexus-surface-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';
  return (
    <div className="flex h-11 items-center rounded-xl border border-nexus-border bg-nexus-surface px-1">
      <button type="button" onClick={() => onChange(shiftPeriod(period, refDay, -1))} aria-label={PREV_LABEL[period]} className={arrow}>
        <ChevronLeft className="h-5 w-5" />
      </button>
      <span className="relative">
        <button type="button" onClick={openCalendar} aria-label="Elegir fecha"
          className="nx-num min-w-28 rounded-lg px-2 py-1.5 text-center text-sm font-semibold text-nexus-text cursor-pointer hover:bg-nexus-surface-hover">
          {periodLabel(period, refDay, today)}
        </button>
        <input ref={inputRef} type="date" value={refDay} max={today} onChange={(e) => pick(e.target.value)}
          tabIndex={-1} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-0" />
      </span>
      <button type="button" onClick={() => onChange(clampRef(shiftPeriod(period, refDay, 1), today))} disabled={!canGoNext(period, refDay, today)} aria-label={NEXT_LABEL[period]} className={arrow}>
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
