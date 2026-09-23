// AnalyticsSection.jsx
//
// Reutiliza el selector de período/sucursal que ya existe en AdminApp
// (agendaView/selectedDate/selectedBranch) — no tiene su propio filtro.
// Todas las secciones se muestran apiladas en una sola vista, sin pestañas.

import { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { Scissors, Smartphone, Users, UserRound, Lock, TrendingUp } from 'lucide-react';
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

function SectionHeader({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-nexus-primary" />
      <h3 className="text-xs font-bold text-nexus-text uppercase tracking-wider font-mono">{label}</h3>
    </div>
  );
}

export default function AnalyticsSection({ reservations, barbers, agendaView, selectedDate, selectedBranch }) {
  const [financeSession, setFinanceSession] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [needsPinSetup, setNeedsPinSetup] = useState(false);
  const [financeSummary, setFinanceSummary] = useState(null);
  const [financeCommissions, setFinanceCommissions] = useState([]);
  const [expandedBarberId, setExpandedBarberId] = useState(null);
  const [commissionDetail, setCommissionDetail] = useState(null);

  const isFinanceUnlocked = financeSession && financeSession.expiresAt > Date.now();
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
        label: CHANNEL_LABELS[canal] || 'Desconocido (citas antiguas sin canal registrado)',
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
      nuevosEnPeriodo: performance.clientesNuevos,
      recurrentesEnPeriodo: performance.clientesRecurrentes,
      activos30d,
      sinVolver30d,
    };
  }, [reservations, performance]);

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
      getFinanceSummary(financeSession.token, { startDate, endDate, branch: selectedBranch }),
      getFinanceCommissions(financeSession.token, { startDate, endDate, branch: selectedBranch }),
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
    if (isFinanceUnlocked) loadFinanceData();
  }, [isFinanceUnlocked, startDate, endDate, selectedBranch]);

  return (
    <div className="p-4 md:p-6 space-y-8">
      {/* Rendimiento general */}
      <section>
        <SectionHeader icon={TrendingUp} label="Rendimiento general" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Reservas" value={performance.reservas} />
          <MetricCard label="Completadas" value={performance.completadas} />
          <MetricCard label="Clientes atendidos" value={performance.clientesAtendidos} />
          <MetricCard label="Clientes nuevos" value={performance.clientesNuevos} />
          <MetricCard label="Clientes recurrentes" value={performance.clientesRecurrentes} />
          <MetricCard label="Ingresos generados" value={`Bs ${performance.ingresosGenerados.toFixed(2)}`} />
        </div>
      </section>

      {/* Servicios */}
      <section>
        <SectionHeader icon={Scissors} label="Servicios" />
        <p className="text-xs text-nexus-text-secondary mb-3">
          Ordenado por ingreso generado — no es una medida de rentabilidad real (no considera costos de insumo ni tiempo de silla).
        </p>
        {serviciosStats.length === 0 && <p className="text-sm text-nexus-text-secondary">Sin datos en este período.</p>}
        {serviciosStats.length > 0 && (
          <div className="bg-nexus-surface border border-nexus-border rounded-lg p-3 mb-3">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={serviciosStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--nexus-border, #333)" />
                <XAxis dataKey="serviceName" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => `Bs ${Number(v).toFixed(2)}`} />
                <Bar dataKey="ingreso" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="space-y-2">
          {serviciosStats.map((s) => (
            <div key={s.serviceName} className="bg-nexus-surface border border-nexus-border rounded-lg p-3 flex justify-between items-center">
              <div>
                <p className="font-bold text-sm text-nexus-text">{s.serviceName}</p>
                <p className="text-xs text-nexus-text-secondary">{s.reservas} reservas · Bs {s.precioPromedio.toFixed(2)} prom. · {s.duracionPromedio.toFixed(0)} min prom.</p>
              </div>
              <p className="text-xs text-nexus-primary font-bold">{s.participacion.toFixed(1)}%</p>
            </div>
          ))}
        </div>
      </section>

      {/* Canales de reserva */}
      <section>
        <SectionHeader icon={Smartphone} label="Canales de reserva" />
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
      </section>

      {/* Clientes */}
      <section>
        <SectionHeader icon={Users} label="Clientes" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Clientes totales (histórico)" value={clientesStats.totalHistorico} />
          <MetricCard label="Nuevos en el período" value={clientesStats.nuevosEnPeriodo} />
          <MetricCard label="Recurrentes en el período" value={clientesStats.recurrentesEnPeriodo} />
          <MetricCard label="Activos (últimos 30 días)" value={clientesStats.activos30d} />
          <MetricCard label="Sin volver (30+ días)" value={clientesStats.sinVolver30d} />
        </div>
      </section>

      {/* Profesionales */}
      <section>
        <SectionHeader icon={UserRound} label="Profesionales" />
        <div className="space-y-2">
          {profesionalesStats.length === 0 && <p className="text-sm text-nexus-text-secondary">Sin profesionales.</p>}
          {profesionalesStats.map((p) => (
            <div key={p.id} className="bg-nexus-surface border border-nexus-border rounded-lg p-3">
              <p className="font-bold text-sm text-nexus-text mb-1">{p.name}</p>
              <div className="grid grid-cols-3 gap-2 text-xs text-nexus-text-secondary">
                <span>{p.reservasAtendidas} reservas</span>
                <span>{p.serviciosRealizados} servicios</span>
                <span>{p.clientesAtendidos} clientes</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Finanzas */}
      <section>
        <SectionHeader icon={Lock} label="Finanzas" />

        {!isFinanceUnlocked && (
          <div className="max-w-xs bg-nexus-surface border border-nexus-border rounded-lg p-6 text-center">
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

        {isFinanceUnlocked && (
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
      </section>
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