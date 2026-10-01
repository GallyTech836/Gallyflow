import React, { useState, useEffect, useRef } from 'react';
import { Building2, LogOut, Clock, Copy, Save, Loader as Loader2, CreditCard, Wallet, Plus, X, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { useBusinessSettings } from '../../shared/businessSettings/useBusinessSettings';
import { saveBusinessSettings } from '../../shared/businessSettings/businessSettingsService';
import { useNegocioPlan } from '../../shared/negocioPlan/useNegocioPlan';
import { useNegocioStatus } from '../../shared/negocioStatus/useNegocioStatus';

function Card({ children, className = '' }) {
  return (
    <div className={`bg-nexus-surface border border-nexus-border rounded-2xl p-5 ${className}`}>
      {children}
    </div>
  );
}

const STATUS_BADGE = {
  active: { label: 'Activa', className: 'bg-nexus-success-bg text-nexus-success-text', Icon: ShieldCheck },
  suspended: { label: 'Suspendida', className: 'bg-nexus-error-bg text-nexus-error-text', Icon: ShieldX },
  expired: { label: 'Vencida', className: 'bg-nexus-error-bg text-nexus-error-text', Icon: ShieldAlert },
};

export default function BusinessSection({ negocioId, businessName, user, onLogout }) {
  const { businessSettings, loading: settingsLoading } = useBusinessSettings(negocioId);
  const { planName, features, loading: planLoading } = useNegocioPlan(negocioId);
  const { status } = useNegocioStatus(negocioId);

  const [form, setForm] = useState(businessSettings);
  const [newMethod, setNewMethod] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const seededRef = useRef(false);
  useEffect(() => {
    if (!settingsLoading && !seededRef.current) {
      setForm(businessSettings);
      seededRef.current = true;
    }
  }, [settingsLoading, businessSettings]);

  const updateDay = (idx, patch) => {
    setForm((prev) => ({
      ...prev,
      schedule: prev.schedule.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    }));
    setSaved(false);
  };

  const handleCopyToAll = (idx) => {
    const template = form.schedule[idx];
    if (!template) return;
    setForm((prev) => ({
      ...prev,
      schedule: prev.schedule.map((d) => ({ ...d, status: template.status, start: template.start, end: template.end })),
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!negocioId || saving) return;
    setSaving(true);
    try {
      const clean = await saveBusinessSettings(negocioId, form);
      setForm(clean);
      setSaved(true);
    } catch (err) {
      console.error('Error al guardar la configuración del negocio:', err);
    } finally {
      setSaving(false);
    }
  };

  const statusInfo = STATUS_BADGE[status] || STATUS_BADGE.active;
  const featureEntries = Object.entries(features || {});

  return (
    <div className="space-y-4">

      {/* ── Marca activa ─────────────────────────────────────────── */}
      <Card>
        <div className="flex items-center gap-2.5 mb-3">
          <Building2 className="w-4 h-4 text-nexus-primary" />
          <h3 className="text-sm font-bold text-nexus-text">Marca Activa</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-nexus-primary-soft border border-nexus-primary/20 flex items-center justify-center font-bold text-nexus-primary text-xs shrink-0">
            GF
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-nexus-text-muted uppercase tracking-widest font-mono">MARCA ACTIVA</p>
            <p className="text-xs font-semibold text-nexus-text truncate">{businessName}</p>
            <p className="text-[10px] text-nexus-text-muted mt-1">Para cambiar el nombre, contacta a soporte.</p>
          </div>
        </div>
      </Card>

      {/* ── Cuenta / Sesión ──────────────────────────────────────── */}
      <Card>
        <h3 className="text-sm font-bold text-nexus-text mb-1">Cuenta</h3>
        <p className="text-[11px] text-nexus-text-muted mb-3">
          {user?.email ? `Sesión activa: ${user.email}` : 'Sesión activa.'}
        </p>
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-nexus-error-text hover:bg-nexus-error-bg border border-nexus-error/20 transition-colors text-xs font-bold uppercase tracking-widest cursor-pointer"
        >
          <LogOut size={14} />
          Cerrar sesión
        </button>
      </Card>

      {/* ── Suscripción (solo lectura) ───────────────────────────── */}
      <Card>
        <div className="flex items-center gap-2.5 mb-3">
          <CreditCard className="w-4 h-4 text-nexus-primary" />
          <h3 className="text-sm font-bold text-nexus-text">Suscripción</h3>
        </div>
        {planLoading ? (
          <p className="text-[11px] text-nexus-text-muted">Cargando...</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] text-nexus-text-muted uppercase tracking-widest font-mono">Plan actual</p>
                <p className="text-sm font-bold text-nexus-text">{planName || 'Sin plan asignado'}</p>
              </div>
              <span className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-black uppercase font-mono ${statusInfo.className}`}>
                <statusInfo.Icon className="w-3 h-3" />
                {statusInfo.label}
              </span>
            </div>
            {featureEntries.length > 0 ? (
              <ul className="space-y-1.5">
                {featureEntries.map(([key, val]) => {
                  const enabled = val && typeof val === 'object' ? !!val.enabled : !!val;
                  const limit = val && typeof val === 'object' ? val.limit : null;
                  return (
                    <li key={key} className="flex items-center justify-between text-[11px] border-b border-nexus-border/60 pb-1.5 last:border-0">
                      <span className="text-nexus-text-secondary">{key}</span>
                      <span className={`font-mono font-bold ${enabled ? 'text-nexus-success-text' : 'text-nexus-text-muted'}`}>
                        {enabled ? (typeof limit === 'number' ? `Hasta ${limit}` : 'Incluido') : 'No incluido'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[11px] text-nexus-text-muted">Este plan no tiene funciones configuradas.</p>
            )}
            <p className="text-[10px] text-nexus-text-muted mt-3">Para cambiar de plan, contacta a soporte.</p>
          </>
        )}
      </Card>

      {/* ── Horario del negocio ──────────────────────────────────── */}
      <Card>
        <div className="flex items-center gap-2.5 mb-1">
          <Clock className="w-4 h-4 text-nexus-primary" />
          <h3 className="text-sm font-bold text-nexus-text">Horario del negocio</h3>
        </div>
        <p className="text-[11px] text-nexus-text-muted mb-4">
          Días y horas en que el negocio atiende. Un día cerrado aquí bloquea las reservas
          públicas ese día, sin importar el horario de cada profesional.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[9px] text-nexus-text-muted uppercase tracking-wider font-mono border-b border-nexus-border">
                <th className="py-2 px-2">Día</th>
                <th className="py-2 px-2 text-center">Estado</th>
                <th className="py-2 px-2 text-center">Desde</th>
                <th className="py-2 px-2 text-center">Hasta</th>
                <th className="py-2 px-2 text-right">Copiar a todos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-nexus-border">
              {form.schedule.map((d, idx) => {
                const isClosed = d.status === 'Cerrado';
                return (
                  <tr key={d.day}>
                    <td className="py-2 px-2 font-bold text-nexus-text">{d.day}</td>
                    <td className="py-2 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => updateDay(idx, { status: isClosed ? 'Disponible' : 'Cerrado' })}
                        className={`px-2 py-0.5 rounded text-[9px] font-extrabold font-mono tracking-wider transition-colors border cursor-pointer ${
                          isClosed
                            ? 'bg-nexus-error-bg text-nexus-error-text border-nexus-error/25 hover:opacity-80'
                            : 'bg-nexus-primary-soft text-nexus-primary border-nexus-primary/25 hover:opacity-80'
                        }`}
                      >
                        {d.status.toUpperCase()}
                      </button>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <input
                        type="time"
                        disabled={isClosed}
                        value={d.start}
                        onChange={(e) => updateDay(idx, { start: e.target.value })}
                        className={`bg-nexus-background border border-nexus-border rounded px-2 py-1 text-[11px] outline-none text-nexus-text font-mono text-center transition-opacity ${isClosed ? 'opacity-40 pointer-events-none' : ''}`}
                      />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <input
                        type="time"
                        disabled={isClosed}
                        value={d.end}
                        onChange={(e) => updateDay(idx, { end: e.target.value })}
                        className={`bg-nexus-background border border-nexus-border rounded px-2 py-1 text-[11px] outline-none text-nexus-text font-mono text-center transition-opacity ${isClosed ? 'opacity-40 pointer-events-none' : ''}`}
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleCopyToAll(idx)}
                        className="px-2 py-1 bg-nexus-background border border-nexus-border hover:border-nexus-primary rounded text-[9px] font-bold text-nexus-text-secondary transition-colors inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3 text-nexus-primary" /> Copiar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

  {/* ── Anticipación para reservar ───────────────────────────── */}
  <Card>
    <h3 className="text-sm font-bold text-nexus-text mb-1">
      Anticipación para reservar
    </h3>

    <p className="text-[11px] text-nexus-text-muted mb-3">
      Tiempo mínimo antes de una cita para que un cliente pueda reservarla desde el link
      público. 0 = sin restricción (puede reservar para dentro de un momento).
    </p>

    <div className="flex items-center gap-3">
      <input
        type="number"
        min="0"
        step="15"
        value={form.minAdvanceMinutes}
        onChange={(e) => {
          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
          setForm((prev) => ({ ...prev, minAdvanceMinutes: val }));
          setSaved(false);
        }}
        className="w-28 bg-nexus-background border border-nexus-border rounded-lg px-3 py-2 text-xs font-mono text-nexus-text outline-none focus:border-nexus-primary/70"
      />

      <span className="text-[11px] text-nexus-text-muted">
        minutos de anticipación mínima
      </span>
    </div>
  </Card>

  {/* ── Métodos de pago ───────────────────────────────────────── */}
  <Card>
    <div className="flex items-center gap-2.5 mb-1">
      <Wallet className="w-4 h-4 text-nexus-primary" />

      <h3 className="text-sm font-bold text-nexus-text">
        Métodos de pago
      </h3>
    </div>

    <p className="text-[11px] text-nexus-text-muted mb-3">
      Opciones que aparecen al marcar una cita como "Completada" en Admin y Barber,
      para registrar cómo pagó el cliente.
    </p>

    <div className="flex flex-wrap gap-2 mb-3">
      {form.paymentMethods.map((method, idx) => (
        <span
          key={method}
          className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-nexus-background border border-nexus-border text-[11px] font-semibold text-nexus-text"
        >
          {method}

          <button
            type="button"
            onClick={() => {
              if (form.paymentMethods.length <= 1) return;

              setForm((prev) => ({
                ...prev,
                paymentMethods: prev.paymentMethods.filter((_, i) => i !== idx)
              }));

              setSaved(false);
            }}
            disabled={form.paymentMethods.length <= 1}
            className="p-0.5 rounded-full hover:bg-nexus-error-bg hover:text-nexus-error-text disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>

    <form
      onSubmit={(e) => {
        e.preventDefault();

        const value = newMethod.trim();

        if (
          !value ||
          form.paymentMethods.some(
            (m) => m.toLowerCase() === value.toLowerCase()
          )
        ) return;

        setForm((prev) => ({
          ...prev,
          paymentMethods: [...prev.paymentMethods, value]
        }));

        setNewMethod('');
        setSaved(false);
      }}
      className="flex items-center gap-2"
    >
      <input
        type="text"
        value={newMethod}
        onChange={(e) => setNewMethod(e.target.value)}
        placeholder="Ej: QR, Pago móvil..."
        className="flex-1 bg-nexus-background border border-nexus-border rounded-lg px-3 py-2 text-xs text-nexus-text outline-none focus:border-nexus-primary/70"
      />

      <button
        type="submit"
        className="shrink-0 p-2 rounded-lg bg-nexus-primary-soft text-nexus-primary border border-nexus-primary/25 hover:opacity-80 cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </form>
  </Card>

</div>

      {/* ── Guardar (horario + anticipación) ─────────────────────── */}
      <div className="sticky bottom-0 pb-1 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !negocioId}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-nexus-primary hover:bg-nexus-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-extrabold uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(15,111,255,0.35)] hover:shadow-[0_0_30px_rgba(15,111,255,0.5)]"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? 'Guardando...' : saved ? 'Guardado ✓' : 'Guardar cambios'}
        </button>
      </div>

    </div>
  );
}
