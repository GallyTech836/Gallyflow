// FinanzasSection.jsx — Finanzas del dueño: cuánto entró, salió y quedó en el
// mes, dónde está la plata (caja y cuentas) y el historial con su origen.
// Datos reales del backend (/api/finanzas). Los saldos se calculan allá a
// partir de los cobros, pagos de comisiones, salidas de caja y gastos: aquí solo se muestran.
// Pestañas: Resumen (con Administrar cuentas) y Gastos.

import { useCallback, useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, TrendingUp, Plus, ArrowLeft, RefreshCw, Trash2 } from 'lucide-react';
import { Card, Button, Badge, SegmentedControl, LoadingState, EmptyState, useConfirm } from '../../shared/ui';
import SectionTabs from '../SectionTabs';
import { bs, bs2, sbs, initials, prevMonth, cap } from './finanzasFormat';
import { getFinanzasEstado, getFinanzasResumen, getGastos, deleteGasto, stopFijo } from './finanzasApi';
import { SetupModal, AccountModal, DepositModal, GastoModal, PayModal, whenLabel } from './FinanzasModals';

const HIST_LIMIT = 8;
const SEG_COLORS = { com: '#A1A1AA', exp: '#D4D4D8', pos: 'var(--nx-success)', neg: 'var(--nx-error)' };

export default function FinanzasSection({ financeToken = null, onFinanceExpired, onToast, initialTab = 'resumen' }) {
  const [tab, setTab] = useState(initialTab); // 'resumen' | 'gastos'
  const [view, setView] = useState('resumen'); // dentro de Resumen: 'resumen' | 'cuentas'
  const [gastos, setGastos] = useState(null);
  const [gFilter, setGFilter] = useState('todos');
  const [confirm, confirmDialog] = useConfirm();
  const [period, setPeriod] = useState('actual'); // 'actual' | 'anterior'
  const [estado, setEstado] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // { kind: 'setup' | 'account' | 'deposit' | 'gasto' | 'pay', account?, gasto? }
  const [setupLater, setSetupLater] = useState(false);
  const [showCalc, setShowCalc] = useState(true);
  const [histAll, setHistAll] = useState(false);

  const [currentMonth, setCurrentMonth] = useState(null); // 'AAAA-MM' de hoy, lo da el backend
  const month = period === 'anterior' && currentMonth ? prevMonth(currentMonth) : null;

  const handle = useCallback((r) => {
    if (r.status === 401) { onFinanceExpired?.(); return null; }
    if (!r.ok) throw new Error(r.data?.error || 'No se pudo cargar Finanzas.');
    return r.data;
  }, [onFinanceExpired]);

  const load = useCallback(async (opts = {}) => {
    setError('');
    if (!opts.quiet) setLoading(true);
    try {
      const [e, r, g] = await Promise.all([getFinanzasEstado(financeToken), getFinanzasResumen(financeToken, opts.month ?? null), getGastos(financeToken)]);
      const est = handle(e);
      const res = handle(r);
      const gs = handle(g);
      if (est) setEstado(est);
      if (gs) setGastos(gs);
      if (res) { setResumen(res); if (res.current) setCurrentMonth(res.month); }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [financeToken, handle]);

  useEffect(() => { load({ month }); }, [load, month]);

  // Pregunta inicial: se abre sola la primera vez (salvo "Más tarde").
  useEffect(() => {
    if (estado && !estado.setupDone && !setupLater && !modal) setModal({ kind: 'setup' });
  }, [estado, setupLater, modal]);

  const afterSave = (data, msg) => {
    if (data) setEstado(data);
    setModal(null);
    if (msg) onToast?.(msg);
    load({ month, quiet: true });
  };

  const afterGasto = (data, msg) => {
    if (data) setGastos(data);
    setModal(null);
    if (msg) onToast?.(msg);
    load({ month, quiet: true });
  };

  const quitarGasto = async (g) => {
    const ok = await confirm({ title: '¿Eliminar este gasto?', subject: `${g.title} · ${bs(g.total)}`, message: g.paid > 0 ? 'Lo pagado vuelve a su cuenta.' : null });
    if (!ok) return;
    const r = await deleteGasto(financeToken, g.id);
    if (r.status === 401) return onFinanceExpired?.();
    if (!r.ok) return onToast?.(r.data?.error || 'No se pudo eliminar.', 'error');
    afterGasto(r.data, 'Gasto eliminado.');
  };

  const detenerFijo = async (f) => {
    const ok = await confirm({ title: '¿Dejar de repetir?', subject: f.title, message: 'Este mes no cambia.', confirmLabel: 'Dejar de repetir', irreversible: false });
    if (!ok) return;
    const r = await stopFijo(financeToken, f.id);
    if (r.status === 401) return onFinanceExpired?.();
    if (!r.ok) return onToast?.(r.data?.error || 'No se pudo guardar.', 'error');
    afterGasto(r.data, `«${f.title}» ya no se repite.`);
  };

  if (loading && !resumen) return <LoadingState />;
  if (error && !resumen) {
    return (
      <EmptyState
        title="No se pudo abrir Finanzas"
        description={error}
        action={<Button variant="secondary" icon={RefreshCw} onClick={() => load({ month })}>Reintentar</Button>}
      />
    );
  }

  const modalProps = { estado, token: financeToken, onExpired: onFinanceExpired };

  return (
    <div className="flex flex-col gap-4">
      {view === 'resumen' && (
        <SectionTabs
          ariaLabel="Secciones de Finanzas"
          tabs={[{ id: 'resumen', label: 'Resumen' }, { id: 'gastos', label: 'Gastos' }]}
          active={tab}
          onChange={setTab}
        />
      )}
      {tab === 'gastos' && view === 'resumen' ? (
        <Gastos
          gastos={gastos}
          filter={gFilter}
          setFilter={setGFilter}
          onNew={() => setModal({ kind: 'gasto' })}
          onPay={(g) => setModal({ kind: 'pay', gasto: g })}
          onDelete={quitarGasto}
          onStop={detenerFijo}
        />
      ) : view === 'resumen' ? (
        <Resumen
          estado={estado}
          resumen={resumen}
          gastos={gastos}
          onPagar={() => { setGFilter('pagar'); setTab('gastos'); }}
          period={period}
          setPeriod={(p) => { setPeriod(p); setHistAll(false); }}
          loading={loading}
          showCalc={showCalc}
          setShowCalc={setShowCalc}
          histAll={histAll}
          setHistAll={setHistAll}
          onDeposit={() => setModal({ kind: 'deposit' })}
          onCuentas={() => setView('cuentas')}
          onSetup={() => setModal({ kind: 'setup' })}
        />
      ) : (
        <Cuentas
          estado={estado}
          onBack={() => setView('resumen')}
          onNew={() => setModal({ kind: 'account', account: null })}
          onEdit={(a) => setModal({ kind: 'account', account: a })}
          onSetup={() => setModal({ kind: 'setup' })}
        />
      )}
      {error && resumen && <p role="alert" className="text-sm text-nexus-error-text">{error}</p>}

      {modal?.kind === 'setup' && (
        <SetupModal
          {...modalProps}
          onLater={() => { setSetupLater(true); setModal(null); }}
          onDone={(data) => afterSave(data, 'Cuentas listas.')}
        />
      )}
      {modal?.kind === 'account' && (
        <AccountModal {...modalProps} account={modal.account} onClose={() => setModal(null)} onSaved={afterSave} />
      )}
      {modal?.kind === 'deposit' && (
        <DepositModal {...modalProps} onClose={() => setModal(null)} onSaved={afterSave} />
      )}
      {modal?.kind === 'gasto' && (
        <GastoModal {...modalProps} categories={gastos?.categories || []} onClose={() => setModal(null)} onSaved={afterGasto} />
      )}
      {modal?.kind === 'pay' && (
        <PayModal {...modalProps} gasto={modal.gasto} onClose={() => setModal(null)} onSaved={afterGasto} />
      )}
      {confirmDialog}
    </div>
  );
}

// ───────────────────────── Resumen ─────────────────────────

function Trio({ icon: Icon, tone, label, value, negative = false }) {
  const tones = {
    in: 'bg-nexus-success-bg text-nexus-success-text',
    out: 'bg-nexus-surface-hover text-nexus-text-secondary',
    gain: 'bg-nexus-primary text-white',
  };
  return (
    <div className="flex items-center gap-3">
      <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${tones[tone]}`}><Icon size={20} aria-hidden="true" /></span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-nexus-text-secondary">{label}</p>
        <p className={`nx-num text-2xl font-bold leading-tight ${negative ? 'text-nexus-error-text' : 'text-nexus-text'}`}>{value}</p>
      </div>
    </div>
  );
}

function Resumen({ estado, resumen, gastos, onPagar, period, setPeriod, loading, showCalc, setShowCalc, histAll, setHistAll, onDeposit, onCuentas, onSetup }) {
  const r = resumen;
  const gain = r.ganancia;
  const base = Math.max(r.ingresos, r.comisiones + r.gastos) || 1;
  const pct = (v) => (r.ingresos ? Math.round((v / r.ingresos) * 100) : 0);
  const segs = [
    { key: 'com', label: 'Comisiones', v: r.comisiones, color: SEG_COLORS.com, pct: `${pct(r.comisiones)} %` },
    { key: 'exp', label: 'Gastos', v: r.gastos, color: SEG_COLORS.exp, pct: `${pct(r.gastos)} %` },
    gain >= 0
      ? { key: 'gain', label: 'Te queda', v: gain, color: SEG_COLORS.pos, pct: `${pct(gain)} %` }
      : { key: 'gain', label: 'Faltó', v: gain, color: SEG_COLORS.neg, pct: '' },
  ];
  const stackLabel = `De lo que entró: comisiones ${pct(r.comisiones)} %, gastos ${pct(r.gastos)} %, te queda ${pct(Math.max(gain, 0))} %`;
  const titulo = r.current ? `${cap(r.label)}, hasta hoy` : cap(r.label);
  const nota = r.current
    ? (r.daysLeft > 0 ? `Faltan ${r.daysLeft} ${r.daysLeft === 1 ? 'día' : 'días'}.` : 'Último día del mes.')
    : 'Mes completo.';

  const hist = histAll ? r.history : r.history.slice(0, HIST_LIMIT);
  const chartMax = Math.max(1, ...r.chart.flatMap((m) => [m.ingresos, m.salio]));
  const activas = (estado?.accounts || []).filter((a) => a.active);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          ariaLabel="Mes"
          options={[{ value: 'actual', label: 'Este mes' }, { value: 'anterior', label: 'Mes pasado' }]}
          value={period}
          onChange={setPeriod}
        />
        {loading && <span className="text-xs text-nexus-text-muted">Actualizando…</span>}
      </div>

      <Card>
        <p className="text-sm font-medium text-nexus-text-secondary">{titulo}</p>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Trio icon={ArrowUp} tone="in" label="Entró" value={bs(r.ingresos)} />
          <Trio icon={ArrowDown} tone="out" label="Salió" value={bs(r.salio)} />
          <Trio icon={TrendingUp} tone="gain" label="Ganancia aproximada" value={sbs(gain)} negative={gain < 0} />
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-nexus-text-secondary">¿A dónde va lo que entró?</p>
          <div className="flex h-7 overflow-hidden rounded-lg bg-nexus-surface-hover" role="img" aria-label={stackLabel}>
            {segs.map((g) => {
              const w = g.v > 0 ? Math.max(1, Math.round((g.v / base) * 1000) / 10) : 0;
              return w ? <div key={g.key} style={{ width: `${w}%`, background: g.color }} title={`${g.label} ${sbs(g.v)}`} /> : null;
            })}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {segs.map((g) => (
              <div key={g.key} className="flex items-start gap-2">
                <i className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-nexus-text">{g.label}{g.pct && ` · ${g.pct}`}</p>
                  <p className={`nx-num text-xs ${g.key === 'gain' ? (gain >= 0 ? 'text-nexus-success-text' : 'text-nexus-error-text') : 'text-nexus-text-secondary'}`}>{sbs(g.v)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-3 text-xs text-nexus-text-secondary">
          {nota}{' '}
          <button type="button" className="font-medium text-nexus-text underline underline-offset-2 cursor-pointer" onClick={() => setShowCalc(!showCalc)} aria-expanded={showCalc}>
            {showCalc ? 'Ocultar cálculo' : 'Ver cálculo'}
          </button>
        </p>
        {showCalc && (
          <div className="mt-3 flex flex-col gap-1.5 rounded-lg border border-nexus-border bg-nexus-background p-3 text-sm">
            <Row label="Entró por servicios y productos" value={bs(r.ingresos)} strong />
            <Row label="− Comisiones del mes (pagadas o no)" value={`− ${bs(r.comisiones)}`} />
            <Row label="− Gastos del mes (pagados o no)" value={`− ${bs(r.gastos)}`} />
            <div className="mt-1 border-t border-nexus-border pt-1.5"><Row label="Ganancia aproximada" value={sbs(gain)} strong /></div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <p className="text-xs font-medium text-nexus-text-secondary">Tienes en caja y banco</p>
        {estado?.setupDone ? (
          <>
            <p className="nx-num mt-1 text-2xl font-bold text-nexus-text">{bs(estado.total)}</p>
            <div className="mt-2 divide-y divide-nexus-border">
              {activas.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-nexus-text">{a.name}</span>
                  <span className={`nx-num font-semibold ${a.balance < 0 ? 'text-nexus-error-text' : 'text-nexus-text'}`}>{sbs(a.balance)}</span>
                </div>
              ))}
            </div>
            {estado.unassigned?.total ? (
              <p className="mt-2 rounded-lg border border-nexus-border p-2.5 text-xs text-nexus-text-secondary">
                {bs(estado.unassigned.total)} de {Object.keys(estado.unassigned.byMethod).join(', ')} sin cuenta.
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={onDeposit}>Deposité el sobre en el banco</Button>
              <Button variant="ghost" size="sm" onClick={onCuentas}>Administrar cuentas</Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-nexus-text-secondary">Elige a dónde llega cada cobro.</p>
            <Button size="sm" className="mt-3" onClick={onSetup}>Empezar</Button>
          </>
        )}
      </Card>

      <Card>
        <p className="text-xs font-medium text-nexus-text-secondary">Tienes que pagar</p>
        <p className="nx-num mt-1 text-2xl font-bold text-nexus-text">{bs(gastos?.owe || 0)}</p>
        {gastos?.porPagar?.length ? (
          <div className="mt-2 divide-y divide-nexus-border">
            {gastos.porPagar.slice(0, 3).map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-nexus-text">{g.title} · <span className="nx-num">{bs(g.remaining)}</span></p>
                  <p className="text-xs text-nexus-text-secondary">{whenLabel(g)}</p>
                </div>
                <StatusBadge status={g.status} />
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-nexus-text-secondary">No tienes nada por pagar.</p>
        )}
        <Button variant="secondary" size="sm" className="mt-3" onClick={onPagar}>Ver y pagar</Button>
      </Card>
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-nexus-text">Entró y salió por mes</h3>
          <div className="flex gap-3 text-xs text-nexus-text-secondary">
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-nexus-primary" aria-hidden="true" />Entró</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#A1A1AA]" aria-hidden="true" />Salió</span>
          </div>
        </div>
        <div className="grid grid-cols-6 gap-2" role="img" aria-label={r.chart.map((m) => `${m.label}: entró ${bs(m.ingresos)}, salió ${bs(m.salio)}`).join('; ')}>
          {r.chart.map((m) => (
            <div key={m.month} className="flex flex-col items-center">
              <div className="flex h-[170px] items-end gap-1">
                <div className="w-3 rounded-t bg-nexus-primary sm:w-5" style={{ height: `${Math.max(2, Math.round((m.ingresos / chartMax) * 170))}px` }} title={`Entró ${bs(m.ingresos)}`} />
                <div className="w-3 rounded-t bg-[#A1A1AA] sm:w-5" style={{ height: `${Math.max(2, Math.round((m.salio / chartMax) * 170))}px` }} title={`Salió ${bs(m.salio)}`} />
              </div>
              <p className="mt-1.5 text-xs font-semibold text-nexus-text">{m.label}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-nexus-text">Historial</h3>
        {r.history.length === 0 ? (
          <p className="py-6 text-center text-sm text-nexus-text-secondary">Todavía no hay movimientos este mes.</p>
        ) : (
          <div className="mt-2 divide-y divide-nexus-border">
            {hist.map((h, i) => <HistRow key={`${h.day}-${h.at}-${i}`} h={h} />)}
          </div>
        )}
        {!histAll && r.history.length > HIST_LIMIT && (
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setHistAll(true)}>Ver todo ({r.history.length})</Button>
        )}
      </Card>
    </>
  );
}

function Row({ label, value, strong = false }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? 'font-semibold text-nexus-text' : 'text-nexus-text-secondary'}>{label}</span>
      <span className={`nx-num whitespace-nowrap ${strong ? 'font-semibold text-nexus-text' : 'text-nexus-text-secondary'}`}>{value}</span>
    </div>
  );
}

function HistRow({ h }) {
  let value; let cls;
  if (h.type === 'in') { value = `+ ${bs(h.amount)}`; cls = 'text-nexus-success-text font-semibold'; }
  else if (h.type === 'out') { value = `− ${bs(h.amount)}`; cls = 'text-nexus-text font-semibold'; }
  else if (h.type === 'adj') { value = sbs(h.amount); cls = 'text-nexus-text-muted'; }
  else { value = bs(h.amount); cls = 'text-nexus-text-muted'; }
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-nexus-text">{h.title}</p>
        <p className="text-xs text-nexus-text-secondary">{h.dayLabel} · {h.detail}</p>
      </div>
      <span className={`nx-num shrink-0 text-sm ${cls}`}>{value}</span>
    </div>
  );
}

// ───────────────────────── Gastos ─────────────────────────

const STATUS = {
  pagado: ['Pagado', 'success'],
  vencido: ['Venció', 'danger'],
  parcial: ['Pagado en parte', 'neutral'],
  pronto: ['Vence pronto', 'neutral'],
  pendiente: ['Por pagar', 'neutral'],
};

function StatusBadge({ status }) {
  const [label, tone] = STATUS[status] || STATUS.pendiente;
  return <Badge tone={tone} className={status === 'pronto' ? 'border-nexus-text-secondary text-nexus-text' : ''}>{label}</Badge>;
}

function Gastos({ gastos, filter, setFilter, onNew, onPay, onDelete, onStop }) {
  if (!gastos) return <LoadingState />;
  let rows = [];
  if (filter === 'fijos') {
    rows = gastos.fijos.map((f) => ({
      key: f.id, title: f.title, sub: `${f.category} · día ${f.day}`, amount: bs(f.amount),
      action: <Button variant="ghost" size="sm" onClick={() => onStop(f)}>Dejar de repetir</Button>,
    }));
  } else {
    const lista = filter === 'pagar' ? gastos.porPagar : gastos.items;
    rows = lista.map((g) => ({
      key: g.id, sort: g.remaining > 0 ? `0${g.due}` : `1${g.due}`, title: g.title,
      sub: `${g.category}${g.fijoId ? ' · se repite cada mes' : ''} · ${g.remaining > 0 ? whenLabel(g).toLowerCase() : `pagado${g.lastAccount ? ` · salió de ${g.lastAccount}` : ''}`}`,
      amount: g.remaining > 0 && g.paid > 0 ? `${bs(g.remaining)} de ${bs(g.total)}` : bs(g.total),
      badge: <StatusBadge status={g.status} />,
      action: (
        <div className="flex items-center gap-1">
          {g.remaining > 0 && <Button variant="secondary" size="sm" onClick={() => onPay(g)}>Pagar</Button>}
          <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-nexus-text-muted hover:bg-nexus-surface-hover hover:text-nexus-text cursor-pointer" aria-label={`Eliminar ${g.title}`} onClick={() => onDelete(g)}>
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      ),
    }));
    if (filter === 'todos') {
      rows.push(...gastos.salidas.map((m) => ({
        key: m.id, sort: `1${m.day}`, title: m.title, sub: `Salida de caja · ${m.dayLabel} · salió de ${m.account}`,
        amount: bs(m.total), badge: <StatusBadge status="pagado" />, action: null,
      })));
    }
    // Primero lo que falta pagar (lo que vence antes arriba); después lo pagado, lo más nuevo arriba.
    rows.sort((a, b) => (a.sort[0] !== b.sort[0] ? a.sort.localeCompare(b.sort) : a.sort[0] === '0' ? a.sort.localeCompare(b.sort) : b.sort.localeCompare(a.sort)));
  }
  const vacio = { todos: 'Todavía no registraste gastos.', pagar: 'No tienes nada por pagar.', fijos: 'No tienes gastos que se repitan cada mes.' }[filter];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          ariaLabel="Mostrar"
          options={[{ value: 'todos', label: 'Todos' }, { value: 'pagar', label: 'Por pagar' }, { value: 'fijos', label: 'Se repiten cada mes' }]}
          value={filter}
          onChange={setFilter}
        />
        <Button size="lg" icon={Plus} onClick={onNew}>Registrar gasto</Button>
      </div>
      <Card padding="none" className="px-4 sm:px-5">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-nexus-text-secondary">{vacio}</p>
        ) : (
          <div className="divide-y divide-nexus-border">
            {rows.map((r) => (
              <div key={r.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="min-w-0 sm:flex-1">
                  <p className="truncate text-sm font-semibold text-nexus-text">{r.title}</p>
                  <p className="text-xs text-nexus-text-secondary">{r.sub}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  <span className="nx-num text-sm font-semibold text-nexus-text">{r.amount}</span>
                  {r.badge}
                  {r.action}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

// ───────────────────────── Cuentas ─────────────────────────

function Cuentas({ estado, onBack, onNew, onEdit, onSetup }) {
  const names = Object.fromEntries((estado?.methods || []).map((m) => [m.key, m.name]));
  const sinCuenta = estado?.unassignedMethods || [];
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <button type="button" className="inline-flex items-center gap-1 text-sm text-nexus-text-secondary hover:text-nexus-text cursor-pointer" onClick={onBack}>
            <ArrowLeft size={14} aria-hidden="true" /> Volver al resumen
          </button>
          <h3 className="mt-1.5 text-base font-semibold text-nexus-text">Tus cuentas</h3>
        </div>
        {estado?.setupDone && <Button icon={Plus} onClick={onNew}>Nueva cuenta</Button>}
      </div>

      {!estado?.setupDone ? (
        <Card>
          <p className="text-sm text-nexus-text-secondary">Elige a dónde llega cada cobro.</p>
          <Button size="sm" className="mt-3" onClick={onSetup}>Empezar</Button>
        </Card>
      ) : (
        <>
          {sinCuenta.length > 0 && (
            <p className="rounded-lg border border-nexus-text-secondary p-3 text-sm text-nexus-text">
              {sinCuenta.join(', ')} sin cuenta. Márcalo con Editar.
            </p>
          )}
          <Card padding="none" className="px-4 sm:px-5">
            <div className="divide-y divide-nexus-border">
              {estado.accounts.map((a) => (
                <div key={a.id} className={`flex items-center justify-between gap-3 py-3 ${a.active ? '' : 'opacity-60'}`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-nexus-surface-hover text-sm font-semibold text-nexus-text">{initials(a.name)}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-nexus-text">
                        {a.name}
                        <span className="ml-2 rounded-full border border-nexus-border px-2 py-0.5 text-[11px] font-medium text-nexus-text-secondary">{a.active ? a.typeLabel : 'Inactiva'}</span>
                      </p>
                      <p className="text-xs text-nexus-text-secondary">
                        {a.isCaja ? 'Recibe el efectivo de la sucursal'
                          : a.methodKeys.length ? `Recibe: ${a.methodKeys.map((k) => names[k] || k).join(', ')}`
                          : 'No recibe cobros'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`nx-num text-base font-semibold ${a.balance < 0 ? 'text-nexus-error-text' : 'text-nexus-text'}`} title={bs2(a.balance)}>{sbs(a.balance)}</span>
                    <Button variant="secondary" size="sm" onClick={() => onEdit(a)}>Editar</Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
