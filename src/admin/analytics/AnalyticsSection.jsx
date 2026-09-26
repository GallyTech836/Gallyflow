// AnalyticsSection.jsx
//
// Reutiliza el selector de período/sucursal que ya existe en AdminApp
// (agendaView/selectedDate/selectedBranch). El PIN (si el negocio lo tiene
// activado desde Super Admin) protege TODO el módulo de una sola vez.

import { useState, useMemo, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { Lock } from 'lucide-react';
import { getServicesFromCita } from '../../shared/appointments/serviceSelection';
import { verifyFinancePin, setFinancePin, getFinanceSummary, getFinanceCommissions, getFinanceCommissionDetail, payFinanceCommission } from './financeApi';

const CHANNEL_LABELS = {
  admin: 'Admin',
  client: 'Link público',
  barber: 'App Barber',
  assistant: 'WhatsApp',
};

const DIA_MS = 24 * 60 * 60 * 1000;

function parseISODate(dateStr) {
  return new Date(dateStr + 'T12:00:00');
}
function formatISODate(d) {
  return d.toISOString().slice(0, 10);
}

function isDateInSelectedRange(dateStr, selectedDate, agendaView) {
  if (!dateStr) return false;
  const date = parseISODate(dateStr);
  const refDate = parseISODate(selectedDate);

  if (agendaView === 'dia') return dateStr === selectedDate;

  if (agendaView === 'semana') {
    const day = refDate.getDay();
    const diff = refDate.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(refDate);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    return date >= startOfWeek && date <= endOfWeek;
  }
  if (agendaView === 'mes') {
    return date.getFullYear() === refDate.getFullYear() && date.getMonth() === refDate.getMonth();
  }
  if (agendaView === 'año') {
    return date.getFullYear() === refDate.getFullYear();
  }
  return false;
}

function getRangeBounds(selectedDate, agendaView) {
  const refDate = parseISODate(selectedDate);
  if (agendaView === 'dia') return { startDate: selectedDate, endDate: selectedDate };
  if (agendaView === 'semana') {
    const day = refDate.getDay();
    const diff = refDate.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(refDate);
    start.setDate(diff);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { startDate: formatISODate(start), endDate: formatISODate(end) };
  }
  if (agendaView === 'mes') {
    const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
    const end = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
    return { startDate: formatISODate(start), endDate: formatISODate(end) };
  }
  const start = new Date(refDate.getFullYear(), 0, 1);
  const end = new Date(refDate.getFullYear(), 11, 31);
  return { startDate: formatISODate(start), endDate: formatISODate(end) };
}

function ingresoDeCita(cita) {
  return getServicesFromCita(cita).reduce((sum, s) => sum + Number(s?.price || 0), 0);
}

export default function AnalyticsSection({ reservations, barbers, agendaView, selectedDate, selectedBranch, negocioId }) {
  const [analyticsPinEnabled, setAnalyticsPinEnabled] = useState(null);
  const [financeSession, setFinanceSession] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [needsPinSetup, setNeedsPinSetup] = useState(false);
  const [financeSummary, setFinanceSummary] = useState(null);
  const [financeCommissions, setFinanceCommissions] = useState([]);
  const [expandedBarberId, setExpandedBarberId] = useState(null);
  const [commissionDetail, setCommissionDetail] = useState(null);

  useEffect(() => {
    if (!negocioId) return;
    const unsub = onSnapshot(doc(db, 'negocios', negocioId), (snap) => {
      setAnalyticsPinEnabled(snap.data()?.analyticsPinEnabled === true);
    });
    return () => unsub();
  }, [negocioId]);

  const sessionValida = financeSession && financeSession.expiresAt > Date.now();
  const isUnlocked = analyticsPinEnabled === false || sessionValida;

  const { startDate, endDate } = useMemo(() => getRangeBounds(selectedDate, agendaView), [selectedDate, agendaView]);

  const citasEnRango = useMemo(() => {
    return (reservations || []).filter((r) => {
      if (!isDateInSelectedRange(r?.date, selectedDate, agendaView)) return false;
      if (selectedBranch && r.branch !== selectedBranch) return false;
      return true;
    });
  }, [reservations, selectedDate, agendaView, selectedBranch]);

  const completadas = useMemo(() => citasEnRango.filter((r) => r.status === 'completed'), [citasEnRango]);

  const performance = useMemo(() => {
    const ingresosGenerados = completadas.reduce((sum, r) => sum + ingresoDeCita(r), 0);
    const clientesUnicos = new Set(completadas.map((r) => r.clientId || r.clientPhone).filter(Boolean));

    let nuevos = 0, recurrentes = 0;
    clientesUnicos.forEach((key) => {
      const tuvoAntes = (reservations || []).some(
        (r) => r.status === 'completed' && (r.clientId === key || r.clientPhone === key) && r.date < startDate
      );
      if (tuvoAntes) recurrentes += 1; else nuevos += 1;
    });

    return {
      reservas: citasEnRango.length,
      completadas: completadas.length,
      clientesAtendidos: clientesUnicos.size,
      clientesNuevos: nuevos,
      clientesRecurrentes: recurrentes,
      ingresosGenerados,
    };
  }, [citasEnRango, completadas, reservations, startDate]);

  const serviciosStats = useMemo(() => {
    const stats = {};
    completadas.forEach((cita) => {
      getServicesFromCita(cita).forEach((s) => {
        const key = s.serviceId || s.serviceName;
        if (!stats[key]) stats[key] = { serviceName: s.serviceName, reservas: 0, ingreso: 0, duracionTotal: 0 };
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

    const hace30dias = formatISODate(new Date(Date.now() - 30 * DIA_MS));
    const ultimaVisitaPorCliente = new Map();
    todosCompletados.forEach((r) => {
      const key = r.clientId || r.clientPhone;
      if (!key) return;
      if (!ultimaVisitaPorCliente.has(key) || r.date > ultimaVisitaPorCliente.get(key)) {
        ultimaVisitaPorCliente.set(key, r.date);
      }
    });

    let activos30d = 0, sinVolver30d = 0;
    ultimaVisitaPorCliente.forEach((ultimaFecha) => {
      if (ultimaFecha >= hace30dias) activos30d += 1; else sinVolver30d += 1;
    });

    return {
      totalHistorico: clientesHistoricos.size,
      activos30d,
      sinVolver30d,
    };
  }, [reservations]);

  const profesionalesStats = useMemo(() => {
    return (barbers || []).map((barber) => {
      const citasDelBarbero = completadas.filter((r) => r.professionalId === barber.id || r.barberId === barber.id);
      const serviciosRealizados = citasDelBarbero.reduce((sum, r) => sum + getServicesFromCita(r).length, 0);
      const clientesUnicos = new Set(citasDelBarbero.map((r) => r.clientId || r.clientPhone).filter(Boolean));
      return {
        id: barber.id,
        name: barber.name,
        reservasAtendidas: citasDelBarbero.length,
        serviciosRealizados,
        clientesAtendidos: clientesUnicos.size,
      };
    });
  }, [barbers, completadas]);

  const profesionalesConFinanzas = useMemo(() => {
    return profesionalesStats.map((p) => {
      const finanzas = (financeCommissions || []).find((c) => c.barberId === p.id);
      return { ...p, finanzas: finanzas || null };
    });
  }, [profesionalesStats, financeCommissions]);

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
    const [summaryRes, commissionsRes] = await Promise.all([
      getFinanceSummary(financeSession?.token, { startDate, endDate, branch: selectedBranch }),
      getFinanceCommissions(financeSession?.token, { startDate, endDate, branch: selectedBranch }),
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
    const result = await getFinanceCommissionDetail(financeSession?.token, barberId, { startDate, endDate });
    setCommissionDetail(result.data);
  }

  async function handlePagarComision(barberId) {
    await payFinanceCommission(financeSession?.token, barberId, { startDate, endDate });
    loadFinanceData();
    setExpandedBarberId(null);
  }

  useEffect(() => {
    if (isUnlocked) loadFinanceData();
  }, [isUnlocked, startDate, endDate, selectedBranch]);

  if (analyticsPinEnabled === null) {
    return <div className="p-6"><p className="text-sm text-nexus-text-secondary">Cargando…</p></div>;
  }

  if (!isUnlocked) {
    return (
      <div className="p-4 md:p-6 flex justify-center">
        <div className="max-w-xs w-full bg-nexus-surface border border-nexus-border rounded-lg p-6 text-center mt-10">
          <Lock className="w-8 h-8 text-nexus-primary mx-auto mb-3" />
          <p className="font-bold text-sm text-nexus-text mb-3">
            {needsPinSetup ? 'Crea tu PIN de Analítica' : 'Analítica protegida'}
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
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {financeSummary && (
        <section>
          <h3 className="text-xs font-bold text-nexus-primary uppercase tracking-wider font-mono mb-2">Rendimiento general</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <BigMetric label="Ingresos Brutos" value={`Bs ${financeSummary.ingresosBrutos.toFixed(0)}`} />
            <BigMetric label="Comisiones generadas" value={`Bs ${financeSummary.comisionGenerada.toFixed(0)}`} />
            <BigMetric label="Comisión pendiente" value={`Bs ${financeSummary.comisionPendiente.toFixed(0)}`} />
            <BigMetric label="Resultado del negocio" value={`Bs ${financeSummary.resultadoBarberia.toFixed(0)}`} />
          </div>
        </section>
      )}

      <section>
        <h3 className="text-xs font-bold text-nexus-primary uppercase tracking-wider font-mono mb-2">Reservas y clientes</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-nexus-surface border border-nexus-border rounded-lg p-4">
            <p className="text-xs text-nexus-text-secondary uppercase font-mono">Canales de reservas</p>
            <div className="space-y-1.5">
              {canalesStats.map((c) => (
                <DashedRow key={c.canal} label={c.label} value={`${c.porcentaje.toFixed(0)}%`} />
              ))}
              {canalesStats.length === 0 && <p className="text-xs text-nexus-text-secondary">Sin datos.</p>}
            </div>
          </div>

          <div className="bg-nexus-surface border border-nexus-border rounded-lg p-4 flex flex-col justify-center gap-3">
            <div>
              <p className="text-xs text-nexus-text-secondary uppercase font-mono">Reservas</p>
              <p className="text-2xl font-black text-nexus-text">{performance.reservas}</p>
            </div>
            <div>
              <p className="text-xs text-nexus-text-secondary uppercase font-mono">Completadas</p>
              <p className="text-2xl font-black text-nexus-text">{performance.completadas}</p>
            </div>
          </div>

          <div className="bg-nexus-surface border border-nexus-border rounded-lg p-4 text-center">
            <p className="text-3xl font-black text-nexus-text">{performance.clientesAtendidos}</p>
            <p className="text-xs text-nexus-text-secondary uppercase font-mono mb-2">Clientes atendidos</p>
            <div className="flex justify-center gap-6 text-sm">
              <span className="flex flex-col items-center"><b className="text-nexus-text text-lg">{performance.clientesRecurrentes}</b><span className="text-nexus-text-secondary">Recurrentes</span></span>
              <span className="flex flex-col items-center"><b className="text-nexus-text text-lg">{performance.clientesNuevos}</b><span className="text-nexus-text-secondary">Nuevos</span></span>
            </div>
          </div>

          <div className="bg-nexus-surface border border-nexus-border rounded-lg p-4 text-center">
            <p className="text-3xl font-black text-nexus-text">{clientesStats.totalHistorico}</p>
            <p className="text-xs text-nexus-text-secondary uppercase font-mono mb-2">Clientes totales</p>
            <div className="flex justify-center gap-6 text-sm">
              <span className="flex flex-col items-center"><b className="text-nexus-text text-lg">{clientesStats.activos30d}</b><span className="text-nexus-text-secondary">activos</span></span>
              <span className="flex flex-col items-center"><b className="text-nexus-text text-lg">{clientesStats.sinVolver30d}</b><span className="text-nexus-text-secondary">sin volver</span></span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold text-nexus-primary uppercase tracking-wider font-mono mb-2">Servicios</h3>
        <div className="bg-nexus-surface border border-nexus-border rounded-lg p-4">
          <p className="font-bold text-sm text-nexus-text">Gráfico de servicios</p>
          <p className="text-xs text-nexus-text-secondary mb-3">Ordenado por ingreso generado</p>
          {serviciosStats.length === 0 && <p className="text-sm text-nexus-text-secondary">Sin datos en este período.</p>}
          {serviciosStats.length > 0 && (
            <div className="flex flex-col md:flex-row gap-4">
              <div className="md:w-1/2">
                <ResponsiveContainer width="100%" height={260}>
                <BarChart data={serviciosStats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--nexus-border, #333)" strokeOpacity={0.25} />
                    <XAxis dataKey="serviceName" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={55} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => `Bs ${Number(v).toFixed(2)}`} />
                    <Bar dataKey="ingreso" fill="var(--nx-primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="md:w-1/2 space-y-2 pr-2" style={{ height: '260px', overflowY: 'auto' }}>
                {serviciosStats.map((s) => (
                  <div key={s.serviceName}>
                    <DashedRow label={s.serviceName} value={`${s.participacion.toFixed(1)}%`} />
                    <p className="text-[11px] text-nexus-text-secondary pl-1">{s.reservas} reservas · Bs {s.precioPromedio.toFixed(2)} prom. · {s.duracionPromedio.toFixed(0)} min prom.</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold text-nexus-primary uppercase tracking-wider font-mono mb-2">Profesionales</h3>
        <div className="space-y-2">
          {profesionalesConFinanzas.length === 0 && <p className="text-sm text-nexus-text-secondary">Sin profesionales.</p>}
          {profesionalesConFinanzas.map((p) => (
            <div key={p.id} className="bg-nexus-surface border border-nexus-border rounded-lg p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 cursor-pointer" onClick={() => p.finanzas && handleExpandBarber(p.id)}>
                <div>
                  <p className="font-bold text-base text-nexus-text mb-1">{p.name}</p>
                  <div className="flex gap-4 text-sm text-nexus-text-secondary">
                    <span>{p.reservasAtendidas} reservas</span>
                    <span>{p.serviciosRealizados} servicios</span>
                    <span>{p.clientesAtendidos} clientes</span>
                  </div>
                </div>
                {p.finanzas && (
                  <div className="text-sm text-right">
                    <p className="text-nexus-text-secondary">Ingresos: <b className="text-nexus-text">Bs {p.finanzas.ingresosGenerados.toFixed(2)}</b></p>
                    <p className="text-nexus-text-secondary">Comisiones: <b className="text-nexus-text">Bs {p.finanzas.comisionGenerada.toFixed(2)}</b></p>
                    <p className="text-red-500 font-bold">Pendientes: Bs {p.finanzas.comisionPendiente.toFixed(2)}</p>
                  </div>
                )}
              </div>

              {expandedBarberId === p.id && p.finanzas && (
                <div className="mt-3 pt-3 border-t border-nexus-border space-y-1">
                  {(commissionDetail || []).map((d) => (
                    <div key={d.citaId} className="text-xs flex justify-between text-nexus-text-secondary">
                      <span>{d.date} · {d.services.map((s) => s.serviceName).join(' + ')}</span>
                      <span>Bs {d.totalComision.toFixed(2)} {d.commissionPaid ? '✅' : ''}</span>
                    </div>
                  ))}
                  {p.finanzas.comisionPendiente > 0 && (
                    <button onClick={(e) => { e.stopPropagation(); handlePagarComision(p.id); }} className="mt-2 w-full bg-nexus-primary text-white rounded-lg py-1.5 text-xs font-bold">
                      Registrar pago de Bs {p.finanzas.comisionPendiente.toFixed(2)}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function BigMetric({ label, value }) {
  return (
    <div className="bg-nexus-surface border border-nexus-border rounded-lg p-4 text-center">
      <p className="text-xs text-nexus-text-secondary uppercase tracking-wider font-mono mb-1">{label}</p>
      <p className="text-2xl font-black text-nexus-text">{value}</p>
    </div>
  );
}

function DashedRow({ label, value }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="font-bold text-nexus-text whitespace-nowrap">{label}</span>
      <span className="flex-1 border-b border-dashed border-nexus-border translate-y-[-4px]" />
      <span className="font-bold text-nexus-text whitespace-nowrap">{value}</span>
    </div>
  );
}