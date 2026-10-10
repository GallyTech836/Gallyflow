import React, { useState, useEffect, useRef } from 'react';
import { Building2, LogOut, Clock, Copy, Save, Loader as Loader2, CreditCard, Wallet, Plus, X, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { useBusinessSettings } from '../../shared/businessSettings/useBusinessSettings';
import { saveBusinessSettings } from '../../shared/businessSettings/businessSettingsService';
import { useNegocioPlan } from '../../shared/negocioPlan/useNegocioPlan';
import { useNegocioStatus } from '../../shared/negocioStatus/useNegocioStatus';
import { CAPABILITIES } from '../../shared/capabilities/capabilityModel';

function Card({ children, className = '' }) {
  return (
    <div className={`bg-nexus-surface border border-nexus-border rounded-xl p-4 sm:p-5 ${className}`}>
      {children}
    </div>
  );
}

const STATUS_BADGE = {
  active: { label: 'Activa', className: 'bg-nexus-success-bg text-nexus-success-text', Icon: ShieldCheck },
  trial: { label: 'Prueba', className: 'bg-nexus-warning-bg text-nexus-warning-text', Icon: ShieldCheck },
  suspended: { label: 'Suspendida', className: 'bg-nexus-error-bg text-nexus-error-text', Icon: ShieldX },
  expired: { label: 'Vencida', className: 'bg-nexus-error-bg text-nexus-error-text', Icon: ShieldAlert },
};

export default function BusinessSection({ negocioId, businessName, user, onLogout }) {
  const { businessSettings, loading: settingsLoading } = useBusinessSettings(negocioId);
  const { planName, capabilities, loading: planLoading } = useNegocioPlan(negocioId);
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
  // Lo que el negocio tiene EFECTIVAMENTE (plan + excepciones), con nombres
  // legibles del catálogo. Las "Próximamente" no se listan.
  const featureEntries = CAPABILITIES
    .filter((cap) => cap.status !== 'soon' && !cap.core)
    .map((cap) => [cap, capabilities?.[cap.key]]);

  return (
    <div className="space-y-4">

      {/* ── Marca activa ─────────────────────────────────────────── */}
      <Card>
        <div className="flex items-center gap-2.5 mb-3">
          <Building2 className="w-5 h-5 text-nexus-primary" aria-hidden="true" />
          <h3 className="text-base font-semibold text-nexus-text">Marca activa</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-nexus-primary-soft border border-nexus-primary/20 flex items-center justify-center font-bold text-nexus-primary text-sm shrink-0">
            {(businessName || 'N').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-nexus-text truncate">{businessName}</p>
            <p className="text-sm text-nexus-text-secondary mt-0.5">Para cambiar el nombre, contacta a soporte.</p>
          </div>
        </div>
      </Card>

      {/* ── Cuenta / Sesión ──────────────────────────────────────── */}
      <Card>
        <h3 className="text-base font-semibold text-nexus-text mb-1">Cuenta</h3>
        <p className="text-sm text-nexus-text-secondary mb-3 break-words">
          {user?.email ? `Sesión activa: ${user.email}` : 'Sesión activa.'}
        </p>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex h-10 items-center gap-2 px-4 rounded-lg text-nexus-error-text hover:bg-nexus-error-bg border border-nexus-error/25 transition-colors text-sm font-semibold cursor-pointer"
        >
          <LogOut size={16} aria-hidden="true" />
          Cerrar sesión
        </button>
      </Card>

      {/* ── Suscripción (solo lectura) ───────────────────────────── */}
      <Card>
        <div className="flex items-center gap-2.5 mb-3">
          <CreditCard className="w-5 h-5 text-nexus-primary" aria-hidden="true" />
          <h3 className="text-base font-semibold text-nexus-text">Suscripción</h3>
        </div>
        {planLoading ? (
          <p className="text-sm text-nexus-text-muted">Cargando...</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-xs text-nexus-text-secondary">Plan actual</p>
                <p className="text-base font-semibold text-nexus-text">{planName || 'Sin plan asignado'}</p>
              </div>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${statusInfo.className}`}>
                <statusInfo.Icon className="w-3.5 h-3.5" aria-hidden="true" />
                {statusInfo.label}
              </span>
            </div>
            {featureEntries.length > 0 ? (
              <ul className="divide-y divide-nexus-border/70">
                {featureEntries.map(([cap, val]) => {
                  const enabled = !!val?.enabled;
                  const limit = typeof val?.limit === 'number' ? val.limit : null;
                  const limitText = cap.limit ? (limit === null ? 'Ilimitado' : `Hasta ${limit}${cap.limit.period === 'month' ? '/mes' : ''}`) : 'Incluido';
                  return (
                    <li key={cap.key} className="flex items-center justify-between gap-3 text-sm py-2">
                      <span className="text-nexus-text-secondary min-w-0">{cap.label}</span>
                      <span className={`font-semibold shrink-0 nx-num ${enabled ? 'text-nexus-success-text' : 'text-nexus-text-muted'}`}>
                        {enabled ? limitText : 'No incluido'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-nexus-text-muted">Este plan no tiene funciones configuradas.</p>
            )}
            <p className="text-sm text-nexus-text-muted mt-3">Para cambiar de plan, contacta a soporte.</p>
          </>
        )}
      </Card>

      {/* ── Horario del negocio ──────────────────────────────────── */}
      <Card>
        <div className="flex items-center gap-2.5 mb-1">
          <Clock className="w-5 h-5 text-nexus-primary" aria-hidden="true" />
          <h3 className="text-base font-semibold text-nexus-text">Horario del negocio</h3>
        </div>
        <p className="text-sm text-nexus-text-secondary mb-4">
          Días y horas en que el negocio atiende. Un día cerrado aquí bloquea las reservas
          públicas ese día, sin importar el horario de cada profesional.
        </p>
        {/* Fase 4: filas tipo tabla en escritorio; en celular cada día en su bloque. */}
        <div className="rounded-lg border border-nexus-border divide-y divide-nexus-border">
          <div className="hidden md:grid grid-cols-[1fr_8rem_8rem_8rem_8rem] items-center gap-3 px-3 py-2 bg-nexus-background rounded-t-lg text-xs font-semibold text-nexus-text-secondary">
            <span>Día</span>
            <span className="text-center">Estado</span>
            <span className="text-center">Desde</span>
            <span className="text-center">Hasta</span>
            <span className="text-right">Copiar a todos</span>
          </div>
          {form.schedule.map((d, idx) => {
            const isClosed = d.status === 'Cerrado';
            const timeCls = `h-10 w-full bg-nexus-background border border-nexus-border rounded-lg px-2 text-base sm:text-sm outline-none text-nexus-text nx-num text-center focus:border-nexus-primary transition-opacity ${isClosed ? 'opacity-40 pointer-events-none' : ''}`;
            return (
              <div key={d.day} className="grid grid-cols-2 md:grid-cols-[1fr_8rem_8rem_8rem_8rem] items-center gap-x-3 gap-y-2 px-3 py-3 md:py-2">
                <span className="text-sm font-semibold text-nexus-text">{d.day}</span>
                <div className="justify-self-end md:justify-self-center">
                  <button
                    type="button"
                    aria-pressed={!isClosed}
                    onClick={() => updateDay(idx, { status: isClosed ? 'Disponible' : 'Cerrado' })}
                    className={`h-9 px-3 rounded-md text-sm font-semibold transition-colors border cursor-pointer whitespace-nowrap ${
                      isClosed
                        ? 'bg-nexus-error-bg text-nexus-error-text border-nexus-error/25 hover:opacity-80'
                        : 'bg-nexus-primary-soft text-nexus-primary border-nexus-primary/25 hover:opacity-80'
                    }`}
                  >
                    {d.status}
                  </button>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-nexus-text-muted md:sr-only">Desde</span>
                  <input
                    type="time"
                    disabled={isClosed}
                    value={d.start}
                    onChange={(e) => updateDay(idx, { start: e.target.value })}
                    className={timeCls}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-nexus-text-muted md:sr-only">Hasta</span>
                  <input
                    type="time"
                    disabled={isClosed}
                    value={d.end}
                    onChange={(e) => updateDay(idx, { end: e.target.value })}
                    className={timeCls}
                  />
                </label>
                <div className="col-span-2 md:col-span-1 md:justify-self-end">
                  <button
                    type="button"
                    onClick={() => handleCopyToAll(idx)}
                    aria-label={`Copiar el horario del ${d.day} a todos los días`}
                    className="h-9 w-full md:w-auto px-3 bg-nexus-background border border-nexus-border hover:border-nexus-primary rounded-md text-sm font-medium text-nexus-text-secondary transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-4 h-4 text-nexus-primary" aria-hidden="true" /> Copiar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── Anticipación para reservar ───────────────────────────── */}
        <Card>
          <h3 className="text-base font-semibold text-nexus-text mb-1">
            Anticipación para reservar
          </h3>
          <p className="text-sm text-nexus-text-secondary mb-3">
            Tiempo mínimo antes de una cita para que un cliente pueda reservarla desde el link
            público. 0 = sin restricción (puede reservar para dentro de un momento).
          </p>
          <label className="flex items-center gap-3">
            <input
              type="number"
              min="0"
              step="15"
              inputMode="numeric"
              value={form.minAdvanceMinutes}
              onChange={(e) => {
                const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                setForm((prev) => ({ ...prev, minAdvanceMinutes: val }));
                setSaved(false);
              }}
              className="h-10 w-28 bg-nexus-background border border-nexus-border rounded-lg px-3 text-base sm:text-sm nx-num text-nexus-text outline-none focus:border-nexus-primary"
            />
            <span className="text-sm text-nexus-text-secondary">
              minutos de anticipación mínima
            </span>
          </label>
        </Card>

        {/* ── Métodos de pago ───────────────────────────────────────── */}
        <Card>
          <div className="flex items-center gap-2.5 mb-1">
            <Wallet className="w-5 h-5 text-nexus-primary" aria-hidden="true" />
            <h3 className="text-base font-semibold text-nexus-text">
              Métodos de pago
            </h3>
          </div>
          <p className="text-sm text-nexus-text-secondary mb-3">
            Opciones que aparecen al marcar una cita como "Completada" en Admin y Barber,
            para registrar cómo pagó el cliente.
          </p>

          <div className="flex flex-wrap gap-2 mb-3">
            {form.paymentMethods.map((method, idx) => (
              <span
                key={method}
                className="inline-flex items-center gap-1 pl-3 pr-1 h-9 rounded-full bg-nexus-background border border-nexus-border text-sm font-medium text-nexus-text"
              >
                {method}
                <button
                  type="button"
                  aria-label={`Quitar ${method}`}
                  title={`Quitar ${method}`}
                  onClick={() => {
                    if (form.paymentMethods.length <= 1) return;
                    setForm((prev) => ({
                      ...prev,
                      paymentMethods: prev.paymentMethods.filter((_, i) => i !== idx)
                    }));
                    setSaved(false);
                  }}
                  disabled={form.paymentMethods.length <= 1}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-nexus-error-bg hover:text-nexus-error-text disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <X className="w-4 h-4" />
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
              aria-label="Nuevo método de pago"
              className="h-10 flex-1 min-w-0 bg-nexus-background border border-nexus-border rounded-lg px-3 text-base sm:text-sm text-nexus-text outline-none focus:border-nexus-primary"
            />
            <button
              type="submit"
              aria-label="Agregar método de pago"
              title="Agregar método de pago"
              className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-nexus-primary-soft text-nexus-primary border border-nexus-primary/25 hover:opacity-80 cursor-pointer"
            >
              <Plus className="w-5 h-5" />
            </button>
          </form>
        </Card>

      </div>

      {/* ── Guardar (horario + anticipación + métodos de pago) ─────────
          Fase 4: barra fija con fondo propio, así el contenido no se ve
          por detrás ni queda tapado. */}
      <div className="sticky bottom-0 z-10 -mx-3 sm:-mx-5 -mb-3 sm:-mb-5 px-3 sm:px-5 py-3 bg-nexus-background/95 backdrop-blur border-t border-nexus-border">
        <div className="flex items-center justify-end gap-3">
          {saved && !saving && <span className="text-sm text-nexus-success-text" role="status">Cambios guardados</span>}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !negocioId}
            className="w-full sm:w-auto inline-flex h-11 items-center justify-center gap-2 px-6 rounded-lg bg-nexus-primary hover:bg-nexus-primary-hover disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-sm cursor-pointer"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
            {saving ? 'Guardando...' : saved ? 'Guardado ✓' : 'Guardar cambios'}
          </button>
        </div>
      </div>

    </div>
  );
}
