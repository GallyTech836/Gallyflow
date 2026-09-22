// AnalyticsSection.jsx
//
// Módulo de Analítica real, reemplaza el mockup anterior (porcentajes
// hardcodeados). Reutiliza getServicesFromCita — misma fuente de verdad
// que usa el resto de AdminApp para leer una cita.
//
// Props:
//   reservations  - TODAS las citas del negocio (sin filtrar por rango, para
//                    poder detectar clientes recurrentes fuera del período)
//   services      - lista de servicios del negocio
//   barbers       - lista de profesionales del negocio
//   branches      - lista de sucursales del negocio

import { useState, useMemo, useEffect } from 'react';
import { TrendingUp, Scissors, Smartphone, Users, UserRound, Lock } from 'lucide-react';
import { getServicesFromCita } from '../../shared/appointments/serviceSelection';
import { verifyFinancePin, setFinancePin, getFinanceSummary, getFinanceCommissions, getFinanceCommissionDetail, payFinanceCommission } from './financeApi';

const SECTIONS = [
  { key: 'performance', label: 'Rendimiento general', icon: TrendingUp },
  { key: 'services', label: 'Servicios', icon: Scissors },
  { key: 'channels', label: 'Canales de reserva', icon: Smartphone },
  { key: 'clients', label: 'Clientes', icon: Users },
  { key: 'professionals', label: 'Profesionales', icon: UserRound },
  { key: 'finance', label: 'Finanzas', icon: Lock },
];

const CHANNEL_LABELS = {
  admin: 'Admin',
  client: 'Link público',
  barber: 'App Barber',
  assistant: 'WhatsApp',
};

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function getRangeForPeriod(period, customStart, customEnd) {
  const hoy = new Date();
  const start = new Date(hoy);
  const end = new Date(hoy);

  if (period === 'today') {
    // start y end ya son hoy
  } else if (period === 'week') {
    const dia = hoy.getDay();
    const diff = dia === 0 ? 6 : dia - 1;
    start.setDate(hoy.getDate() - diff);
  } else if (period === 'month') {
    start.setDate(1);
  } else if (period === 'lastMonth') {
    start.setMonth(hoy.getMonth() - 1, 1);
    end.setMonth(hoy.getMonth(), 0);
  } else if (period === 'custom') {
    return { startDate: customStart || toDateStr(hoy), endDate: customEnd || toDateStr(hoy) };
  }

  return { startDate: toDateStr(start), endDate: toDateStr(end) };
}

function ingresoDeCita(cita) {
  return getServicesFromCita(cita).reduce((sum, s) => sum + Number(s?.price || 0), 0);
}

export default function AnalyticsSection({ reservations, services, barbers, branches }) {
  const [activeSection, setActiveSection] = useState('performance');
  const [period, setPeriod] = useState('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');

  const [financeSession, setFinanceSession] = useState(null); // { token, expiresAt }
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [needsPinSetup, setNeedsPinSetup] = useState(false);
  const [financeSummary, setFinanceSummary] = useState(null);
  const [financeCommissions, setFinanceCommissions] = useState([]);
  const [expandedBarberId, setExpandedBarberId] = useState(null);
  const [commissionDetail, setCommissionDetail] = useState(null);

  const isFinanceUnlocked = financeSession && financeSession.expiresAt > Date.now();

  const { startDate, endDate } = useMemo(
    () => getRangeForPeriod(period, customStart, customEnd),
    [period, customStart, customEnd]
  );

  const citasEnRango = useMemo(() => {
    return (reservations || []).filter((r) => {
      if (!r?.date || r.date < startDate || r.date > endDate) return false;
      if (branchFilter !== 'all' && r.branch !== branchFilter) return false;
      return true;
    });
  }, [reservations, startDate, endDate, branchFilter]);

  const completadas = useMemo(
    () => citasEnRango.filter((r) => r.status === 'completed'),
    [citasEnRango]
  );

  const performance = useMemo(() => {
    const canceladas = citasEnRango.filter((r) => r.status === 'cancelled');
    const ingresosGenerados = completadas.reduce((sum, r) => sum + ingresoDeCita(r), 0);
    const ticketPromedio = completadas.length > 0 ? ingresosGenerados / completadas.length : 0;

    const clientesUnicos = new Set(
      completadas.map((r) => r.clientId || r.clientPhone).filter(Boolean)
    );

    let nuevos = 0, recurrentes = 0;
    clientesUnicos.forEach((key) => {
      const tuvoAntes = (reservations || []).some(
        (r) =>
          r.status === 'completed' &&
          (r.clientId === key || r.clientPhone === key) &&
          r.date < startDate
      );
      if (tuvoAntes) recurrentes += 1; else nuevos += 1;
    });

    return {
      reservas: citasEnRango.length,
      completadas: completadas.length,
      canceladas: canceladas.length,
      clientesAtendidos: clientesUnicos.size,
      clientesNuevos: nuevos,
      clientesRecurrentes: recurrentes,
      ticketPromedio,
      ingresosGenerados,
    };
  }, [citasEnRango, completadas, reservations, startDate]);

  const serviciosStats = useMemo(() => {
    const stats = {};
    completadas.forEach((cita) => {
      getServicesFromCita(cita).forEach((s) => {
        const key = s.serviceId || s.serviceName;
        if (!stats[key]) {
          stats[key] = { serviceName: s.serviceName, reservas: 0, ingreso: 0, duracionTotal: 0 };
        }
        stats[key].reservas += 1;
        stats[key].ingreso += Number(s.price || 0);
        stats[key].duracionTotal += Number(s.duration || 0);
      });
    });
    const totalIngreso = Object.values(stats).reduce((sum, s) => sum + s.ingreso, 0);
    return Object.values(stats)
      .map((s) => ({
        ...s,
        precioPromedio: s.reservas > 0 ? s.ingreso / s.reservas : 0,
        duracionPromedio: s.reservas > 0 ? s.duracionTotal / s.reservas : 0,
        participacion: totalIngreso > 0 ? (s.ingreso / totalIngreso) * 100 : 0,
      }))
      .sort((a, b) => b.ingreso - a.ingreso);
  }, [completadas]);

  const canalesStats = useMemo(() => {
    const stats = {};
    citasEnRango.forEach((cita) => {
      const canal = cita.bookedBy || 'desconocido';
      stats[canal] = (stats[canal] || 0) + 1;
    });
    const total = citasEnRango.length;
    return Object.entries(stats)
      .map(([canal, cantidad]) => ({
        canal,
        label: CHANNEL_LABELS[canal] || 'Desconocido',
        cantidad,
        porcentaje: total > 0 ? (cantidad / total) * 100 : 0,
      }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }, [citasEnRango]);

  const clientesStats = useMemo(() => {
    const todosCompletados = (reservations || []).filter((r) => r.status === 'completed');
    const clientesHistoricos = new Set(todosCompletados.map((r) => r.clientId || r.clientPhone).filter(Boolean));

    return {
      totalHistorico: clientesHistoricos.size,
      nuevosEnPeriodo: performance.clientesNuevos,
      recurrentesEnPeriodo: performance.clientesRecurrentes,
      promedioReservasPorCliente:
        performance.clientesAtendidos > 0 ? (performance.completadas / performance.clientesAtendidos).toFixed(1) : '0',
    };
  }, [reservations, performance]);

  const profesionalesStats = useMemo(() => {
    return (barbers || []).map((barber) => {
      const citasDelBarbero = completadas.filter(
        (r) => r.professionalId === barber.id || r.barberId === barber.id
      );
      const serviciosRealizados = citasDelBarbero.reduce((sum, r) => sum + getServicesFromCita(r).length, 0);
      const ingreso = citasDelBarbero.reduce((sum, r) => sum + ingresoDeCita(r), 0);
      const clientesUnicos = new Set(citasDelBarbero.map((r) => r.clientId || r.clientPhone).filter(Boolean));

      return {
        id: barber.id,
        name: barber.name,
        reservasAtendidas: citasDelBarbero.length,
        serviciosRealizados,
        clientesAtendidos: clientesUnicos.size,
        ticketPromedio: citasDelBarbero.length > 0 ? ingreso / citasDelBarbero.length : 0,
      };
    });
  }, [barbers, completadas]);

  async function handlePinSubmit() {
    setPinError('');
    if (needsPinSetup) {
      if (pinInput.length < 4) return setPinError('Mínimo 4 dígitos.');
      await setFinancePin(pinInput);
      setNeedsPinSetup(false);
      setPinInput('');
      return;
    }
    const result = await verifyFinancePin(pinInput);
    if (result.status === 409) {
      setNeedsPinSetup(true);
      setPinError('Todavía no configuraste un PIN. Crea uno ahora.');
      return;
    }
    if (!result.ok) {
      setPinError(result.error || 'PIN incorrecto.');
      return;
    }
    setFinanceSession({ token: result.sessionToken, expiresAt: Date.now() + result.expiresInMinutes * 60 * 1000 });
    setPinInput('');
  }

  async function loadFinanceData() {
    if (!isFinanceUnlocked) return;
    const [summaryRes, commissionsRes] = await Promise.all([
      getFinanceSummary(financeSession.token, { startDate, endDate, branch: branchFilter }),
      getFinanceCommissions(financeSession.token, { startDate, endDate, branch: branchFilter }),
    ]);
    if (summaryRes.status === 401) {
      setFinanceSession(null);
      return;
    }
    setFinanceSummary(summaryRes.data);
    setFinanceCommissions(commissionsRes.data);
  }

  async function handleExpandBarber(barberId) {
    if (expandedBarberId === barberId) {
      setExpandedBarberId(null);
      return;
    }
    setExpandedBarberId(barberId);
    const result = await getFinanceCommissionDetail(financeSession.token, barberId, { startDate, endDate });
    setCommissionDetail(result.data);
  }

  async function handlePagarComision(barberId) {
    await payFinanceCommission(financeSession.token, barberId, { startDate, endDate });
    loadFinanceData();
    setExpandedBarberId(null);
  }

  useEffect(() => {
    if (isFinanceUnlocked && activeSection === 'finance') {
      loadFinanceData();
    }
  }, [isFinanceUnlocked, activeSection, startDate, endDate, branchFilter]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="bg-nexus-surface border border-nexus-border rounded-lg px-3 py-2 text-sm text-nexus-text"
        >
          <option value="today">Hoy</option>
          <option value="week">Esta semana</option>
          <option value="month">Este mes</option>
          <option value="lastMonth">Mes anterior</option>
          <option value="custom">Personalizado</option>
        </select>

        {period === 'custom' && (
          <>
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="bg-nexus-surface border border-nexus-border rounded-lg px-3 py-2 text-sm text-nexus-text" />
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="bg-nexus-surface border border-nexus-border rounded-lg px-3 py-2 text-sm text-nexus-text" />
          </>
        )}

        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className="bg-nexus-surface border border-nexus-border rounded-lg px-3 py-2 text-sm text-nexus-text"
        >
          <option value="all">Todas las sucursales</option>
          {(branches || []).map((b) => (
            <option key={b?.id || b?.name} value={b?.name}>{b?.name}</option>
          ))}
        </select>
      </div>

      {/* Navegación de secciones */}
      <div className="flex flex-wrap gap-2 border-b border-nexus-border pb-2">
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveSection(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              activeSection === key ? 'bg-nexus-primary text-white' : 'bg-nexus-surface text-nexus-text-secondary hover:text-nexus-text'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {activeSection === 'performance' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Reservas" value={performance.reservas} />
          <MetricCard label="Completadas" value={performance.completadas} />
          <MetricCard label="Canceladas" value={performance.canceladas} />
          <MetricCard label="Clientes atendidos" value={performance.clientesAtendidos} />
          <MetricCard label="Clientes nuevos" value={performance.clientesNuevos} />
          <MetricCard label="Clientes recurrentes" value={performance.clientesRecurrentes} />
          <MetricCard label="Ticket promedio" value={`Bs ${performance.ticketPromedio.toFixed(2)}`} />
          <MetricCard label="Ingresos generados" value={`Bs ${performance.ingresosGenerados.toFixed(2)}`} />
        </div>
      )}

      {activeSection === 'services' && (
        <div className="space-y-2">
          <p className="text-xs text-nexus-text-secondary mb-2">
            Ordenado por ingreso generado — no es una medida de rentabilidad real (no considera costos de insumo ni tiempo de silla).
          </p>
          {serviciosStats.length === 0 && <p className="text-sm text-nexus-text-secondary">Sin datos en este período.</p>}
          {serviciosStats.map((s) => (
            <div key={s.serviceName} className="bg-nexus-surface border border-nexus-border rounded-lg p-3 flex justify-between items-center">
              <div>
                <p className="font-bold text-sm text-nexus-text">{s.serviceName}</p>
                <p className="text-xs text-nexus-text-secondary">{s.reservas} reservas · Bs {s.precioPromedio.toFixed(2)} prom. · {s.duracionPromedio.toFixed(0)} min prom.</p>
              </div>
              <div className="text-right">
                <p className="font-black text-sm text-nexus-text">Bs {s.ingreso.toFixed(2)}</p>
                <p className="text-xs text-nexus-primary">{s.participacion.toFixed(1)}%</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeSection === 'channels' && (
        <div className="space-y-2">
          {canalesStats.length === 0 && <p className="text-sm text-nexus-text-secondary">Sin datos en este período.</p>}
          {canalesStats.map((c) => (
            <div key={c.canal} className="bg-nexus-surface border border-nexus-border rounded-lg p-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-bold text-nexus-text">{c.label}</span>
                <span className="text-nexus-text-secondary">{c.cantidad} ({c.porcentaje.toFixed(1)}%)</span>
              </div>
              <div className="w-full bg-nexus-border rounded-full h-2">
                <div className="bg-nexus-primary h-2 rounded-full" style={{ width: `${c.porcentaje}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {activeSection === 'clients' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Clientes totales (histórico)" value={clientesStats.totalHistorico} />
            <MetricCard label="Nuevos en el período" value={clientesStats.nuevosEnPeriodo} />
            <MetricCard label="Recurrentes en el período" value={clientesStats.recurrentesEnPeriodo} />
            <MetricCard label="Reservas por cliente" value={clientesStats.promedioReservasPorCliente} />
          </div>
          <p className="text-xs text-nexus-text-secondary">
            Frecuencia de visita, clientes que dejaron de regresar y retención quedan pendientes — necesitan que definamos juntos un criterio (ej. "sin visitar en X días") antes de mostrarlos como dato confiable.
          </p>
        </div>
      )}

      {activeSection === 'professionals' && (
        <div className="space-y-2">
          {profesionalesStats.length === 0 && <p className="text-sm text-nexus-text-secondary">Sin profesionales.</p>}
          {profesionalesStats.map((p) => (
            <div key={p.id} className="bg-nexus-surface border border-nexus-border rounded-lg p-3">
              <p className="font-bold text-sm text-nexus-text mb-1">{p.name}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-nexus-text-secondary">
                <span>{p.reservasAtendidas} reservas</span>
                <span>{p.serviciosRealizados} servicios</span>
                <span>{p.clientesAtendidos} clientes</span>
                <span>Bs {p.ticketPromedio.toFixed(2)} ticket prom.</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeSection === 'finance' && !isFinanceUnlocked && (
        <div className="max-w-xs mx-auto bg-nexus-surface border border-nexus-border rounded-lg p-6 text-center">
          <Lock className="w-8 h-8 text-nexus-primary mx-auto mb-3" />
          <p className="font-bold text-sm text-nexus-text mb-3">
            {needsPinSetup ? 'Crea tu PIN financiero' : 'Información financiera protegida'}
          </p>
          <input
            type="password"
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            className="w-full bg-nexus-bg border border-nexus-border rounded-lg px-3 py-2 text-center text-lg tracking-widest mb-2"
            placeholder="••••"
          />
          {pinError && <p className="text-xs text-red-500 mb-2">{pinError}</p>}
          <button onClick={handlePinSubmit} className="w-full bg-nexus-primary text-white rounded-lg py-2 text-sm font-bold">
            {needsPinSetup ? 'Guardar PIN' : 'Desbloquear'}
          </button>
        </div>
      )}

      {activeSection === 'finance' && isFinanceUnlocked && (
        <div className="space-y-4">
          {!financeSummary && <p className="text-sm text-nexus-text-secondary">Cargando…</p>}

          {financeSummary && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard label="Ingresos brutos" value={`Bs ${financeSummary.ingresosBrutos.toFixed(2)}`} />
                <MetricCard label="Comisión generada" value={`Bs ${financeSummary.comisionGenerada.toFixed(2)}`} />
                <MetricCard label="Comisión pendiente" value={`Bs ${financeSummary.comisionPendiente.toFixed(2)}`} />
                <MetricCard label="Resultado barbería" value={`Bs ${financeSummary.resultadoBarberia.toFixed(2)}`} />
              </div>

              <div className="space-y-2">
                {financeCommissions.map((c) => (
                  <div key={c.barberId} className="bg-nexus-surface border border-nexus-border rounded-lg p-3">
                    <div className="flex justify-between items-center cursor-pointer" onClick={() => handleExpandBarber(c.barberId)}>
                      <p className="font-bold text-sm text-nexus-text">{c.name}</p>
                      <div className="text-right text-xs">
                        <p className="text-nexus-text-secondary">Ingresos: Bs {c.ingresosGenerados.toFixed(2)}</p>
                        <p className="text-nexus-text-secondary">Comisión: Bs {c.comisionGenerada.toFixed(2)}</p>
                        <p className="text-red-500 font-bold">Pendiente: Bs {c.comisionPendiente.toFixed(2)}</p>
                      </div>
                    </div>

                    {expandedBarberId === c.barberId && (
                      <div className="mt-3 pt-3 border-t border-nexus-border space-y-1">
                        {(commissionDetail || []).map((d) => (
                          <div key={d.citaId} className="text-xs flex justify-between text-nexus-text-secondary">
                            <span>{d.date} · {d.services.map((s) => s.serviceName).join(' + ')}</span>
                            <span>Bs {d.totalComision.toFixed(2)} {d.commissionPaid ? '✅' : ''}</span>
                          </div>
                        ))}
                        {c.comisionPendiente > 0 && (
                          <button onClick={() => handlePagarComision(c.barberId)} className="mt-2 w-full bg-nexus-primary text-white rounded-lg py-1.5 text-xs font-bold">
                            Registrar pago de Bs {c.comisionPendiente.toFixed(2)}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="bg-nexus-surface border border-nexus-border rounded-lg p-4">
      <p className="text-xs text-nexus-text-secondary uppercase tracking-wider font-mono">{label}</p>
      <p className="text-xl font-black text-nexus-text mt-1">{value}</p>
    </div>
  );
}