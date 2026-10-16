import React, { useCallback, useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Smartphone, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { db } from '../../firebase/config';
import { useBusinessTerms } from '../../shared/businessProfiles/useBusinessProfile';
import {
  listWhatsAppNumbers, connectWhatsAppNumber, setWhatsAppNumberBranch, removeWhatsAppNumber,
} from '../../shared/whatsapp/whatsappConnectionApi';

// Número(s) de WhatsApp del negocio (coexistencia por YCloud).
// 1) Soporte de Nexus habilita el número en YCloud (el dueño sigue usando su
//    app de WhatsApp Business). 2) El admin lo conecta aquí: el backend
//    verifica que esté habilitado y lo vincula a ESTE negocio.

function haceDias(dias) {
  if (dias === null || dias === undefined) return '';
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

function AvisoCoexistencia({ coex }) {
  if (!coex) return null;
  if (coex.estado === 'vencido') {
    return (
      <div className="mt-2 p-3 rounded-lg bg-nexus-error-bg border border-nexus-error/25 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-nexus-error-text shrink-0 mt-0.5" />
        <p className="text-xs text-nexus-error-text">
          Pasaron 14 días o más sin usar la app de WhatsApp Business ({haceDias(coex.dias)}). Ábrela y envía un mensaje ahora. Si el asistente dejó de responder, escribe a soporte de Nexus.
        </p>
      </div>
    );
  }
  if (coex.estado === 'aviso') {
    return (
      <div className="mt-2 p-3 rounded-lg bg-nexus-warning-bg border border-nexus-warning/30 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-nexus-warning-text shrink-0 mt-0.5" />
        <p className="text-xs text-nexus-warning-text">
          Abre la app de WhatsApp Business en los próximos {coex.quedan} {coex.quedan === 1 ? 'día' : 'días'} para que el asistente siga funcionando (último uso: {haceDias(coex.dias)}).
        </p>
      </div>
    );
  }
  if (coex.estado === 'ok') {
    return <p className="text-xs text-nexus-text-muted">App de WhatsApp Business usada {haceDias(coex.dias)}.</p>;
  }
  return null;
}

export default function WhatsAppNumbersPanel({ negocioId, onNumbersChange }) {
  const { tl } = useBusinessTerms();
  const [numbers, setNumbers] = useState(null); // null = cargando
  const [branches, setBranches] = useState([]);
  const [phone, setPhone] = useState('');
  const [branch, setBranch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [confirmarQuitar, setConfirmarQuitar] = useState(null);

  const aplicar = useCallback((lista) => {
    setNumbers(lista);
    if (onNumbersChange) onNumbersChange(lista);
  }, [onNumbersChange]);

  const cargar = useCallback(async () => {
    const r = await listWhatsAppNumbers();
    if (r.ok) aplicar(r.data.numbers || []);
    else {
      aplicar([]);
      setError(r.data?.error || 'No se pudieron cargar los números.');
    }
  }, [aplicar]);

  useEffect(() => { if (negocioId) cargar(); }, [negocioId, cargar]);

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

  const conectar = async () => {
    if (busy || !phone.trim()) return;
    setBusy(true);
    setError('');
    setMensaje('');
    const r = await connectWhatsAppNumber(phone.trim(), variasSucursales ? branch : '');
    setBusy(false);
    if (!r.ok) {
      setError(r.data?.error || 'No se pudo conectar el número.');
      return;
    }
    aplicar(r.data.numbers || []);
    setPhone('');
    setBranch('');
    setMensaje('Número conectado. Escríbele "hola" desde otro teléfono para probar el asistente.');
  };

  const cambiarSucursal = async (id, valor) => {
    setBusy(true);
    setError('');
    setMensaje('');
    const r = await setWhatsAppNumberBranch(id, valor);
    setBusy(false);
    if (!r.ok) setError(r.data?.error || 'No se pudo guardar el cambio.');
    else aplicar(r.data.numbers || []);
  };

  const quitar = async (id) => {
    setBusy(true);
    setError('');
    setMensaje('');
    const r = await removeWhatsAppNumber(id);
    setBusy(false);
    setConfirmarQuitar(null);
    if (!r.ok) setError(r.data?.error || 'No se pudo quitar el número.');
    else {
      aplicar(r.data.numbers || []);
      setMensaje('Número quitado. El asistente ya no responde en ese número.');
    }
  };

  return (
    <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5">
      <div className="flex items-center gap-2.5 mb-1">
        <Smartphone className="w-4 h-4 text-nexus-primary" />
        <h3 className="text-sm font-bold text-nexus-text">Número de WhatsApp</h3>
      </div>
      <p className="text-xs text-nexus-text-muted mb-4">
        El asistente responde en tu mismo número y tú sigues usando tu app de WhatsApp Business como siempre.
      </p>

      {numbers === null ? (
        <p className="text-xs text-nexus-text-muted">Cargando…</p>
      ) : (
        <div className="space-y-3">
          {numbers.length === 0 && (
            <div className="p-4 bg-nexus-background border border-nexus-border rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-nexus-text-muted shrink-0 mt-0.5" />
              <div className="text-xs space-y-1 min-w-0">
                <p className="font-bold text-nexus-text">Sin número conectado</p>
                <p className="text-nexus-text-muted">Sigue los pasos de abajo para conectar el WhatsApp de tu negocio.</p>
              </div>
            </div>
          )}

          {numbers.map((n) => (
            <div key={n.id} className="p-4 bg-nexus-background border border-nexus-border rounded-xl">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-nexus-success shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-bold text-nexus-text nx-num break-words">{n.phone || 'Número conectado'}</p>
                  {n.verifiedName && <p className="text-xs text-nexus-text-secondary">{n.verifiedName}</p>}
                  {!n.removable && <p className="text-xs text-nexus-text-muted">Configurado por soporte de Nexus.</p>}
                  <AvisoCoexistencia coex={n.coexistencia} />
                </div>
              </div>

              {n.removable && (variasSucursales || n.branch) && (
                <div className="mt-3">
                  <label htmlFor={`wa-branch-${n.id}`} className="text-xs font-bold text-nexus-text">Sucursal</label>
                  <p className="text-xs text-nexus-text-muted mb-2">El asistente solo ofrece {tl('professionals')} de esa sucursal.</p>
                  <select
                    id={`wa-branch-${n.id}`}
                    value={n.branch || ''}
                    disabled={busy}
                    onChange={(e) => cambiarSucursal(n.id, e.target.value)}
                    className="w-full bg-nexus-surface border border-nexus-border rounded-lg px-3 py-2 text-xs text-nexus-text disabled:cursor-not-allowed"
                  >
                    <option value="">Todas las sucursales</option>
                    {branches.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
                  </select>
                </div>
              )}

              {n.removable && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {confirmarQuitar === n.id ? (
                    <>
                      <span className="text-xs text-nexus-text-secondary">¿Quitar este número? El asistente dejará de responder en él.</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => quitar(n.id)}
                        className="text-xs font-bold text-nexus-error-text hover:underline cursor-pointer disabled:opacity-50"
                      >
                        Sí, quitar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmarQuitar(null)}
                        className="text-xs font-bold text-nexus-text-secondary hover:underline cursor-pointer"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmarQuitar(n.id)}
                      className="text-xs font-bold text-nexus-text-secondary hover:underline cursor-pointer disabled:opacity-50"
                    >
                      Quitar número
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Conectar un número */}
          <div className="p-4 bg-nexus-background border border-nexus-border rounded-xl">
            <p className="text-xs font-bold text-nexus-text mb-2">{numbers.length ? 'Conectar otro número' : 'Conectar tu número'}</p>
            <div className="space-y-1 text-xs text-nexus-text-secondary mb-3">
              <p><b>1.</b> Escribe a soporte de Nexus para habilitar tu número. Lo conectamos contigo y sigues usando tu app de WhatsApp Business.</p>
              <p><b>2.</b> Cuando te avisemos, escribe el número aquí y toca <b>Conectar</b>.</p>
            </div>
            <label htmlFor="wa-phone" className="text-xs font-bold text-nexus-text">Número</label>
            <input
              id="wa-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setError(''); }}
              placeholder="+591 71234567"
              maxLength={25}
              className="mt-1 w-full bg-nexus-surface border border-nexus-border rounded-lg px-3 py-2 text-xs text-nexus-text"
            />
            {variasSucursales && (
              <div className="mt-3">
                <label htmlFor="wa-new-branch" className="text-xs font-bold text-nexus-text">Sucursal</label>
                <select
                  id="wa-new-branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="mt-1 w-full bg-nexus-surface border border-nexus-border rounded-lg px-3 py-2 text-xs text-nexus-text"
                >
                  <option value="">Todas las sucursales</option>
                  {branches.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
                </select>
              </div>
            )}
            <button
              type="button"
              onClick={conectar}
              disabled={busy || !phone.trim()}
              className="mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-nexus-primary px-4 text-sm font-semibold text-white hover:bg-nexus-primary-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {busy ? 'Verificando…' : 'Conectar'}
            </button>
          </div>

          {/* Aviso fijo de coexistencia */}
          <div className="p-3 rounded-xl bg-nexus-info-bg border border-nexus-info/25 flex items-start gap-2">
            <Info className="w-4 h-4 text-nexus-info-text shrink-0 mt-0.5" />
            <p className="text-xs text-nexus-info-text">
              <b>Importante:</b> abre la app de WhatsApp Business en tu teléfono al menos <b>una vez cada 14 días</b>. Si pasan más de 14 días sin abrirla, WhatsApp puede desconectar el asistente de tu número.
            </p>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-nexus-error-text">{error}</p>}
      {mensaje && <p className="mt-3 text-xs text-nexus-success-text">{mensaje}</p>}
    </div>
  );
}
