// PinGate.jsx
//
// Pantalla de PIN para un módulo bloqueado. Si el negocio todavía no tiene
// PIN, deja crearlo y desbloquea en el mismo paso.

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { verifyFinancePin, setFinancePin } from '../analytics/financeApi';

export default function PinGate({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);

  async function verify(value) {
    const r = await verifyFinancePin(value);
    if (r.status === 409) {
      setSetup(true);
      setError('Todavía no hay un PIN. Crea uno ahora.');
      return;
    }
    if (!r.ok) {
      setError(r.error || 'PIN incorrecto.');
      return;
    }
    setPin('');
    onUnlock(r.sessionToken, r.expiresInMinutes);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (pin.length < 4) { setError('Mínimo 4 dígitos.'); return; }
    setBusy(true);
    try {
      if (setup) {
        const r = await setFinancePin(pin);
        if (!r?.ok) {
          if (r?.code === 'PIN_EXISTS') setSetup(false);
          setError(r?.error || 'No se pudo guardar el PIN.');
          return;
        }
      }
      await verify(pin);
    } catch {
      setError('No se pudo verificar el PIN. Revisa tu conexión.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 md:p-6 flex justify-center">
      <form onSubmit={handleSubmit} className="max-w-xs w-full bg-nexus-surface border border-nexus-border rounded-lg p-6 text-center mt-10">
        <Lock className="w-8 h-8 text-nexus-primary mx-auto mb-3" />
        <p className="font-bold text-sm text-nexus-text mb-1">
          {setup ? 'Crea tu PIN' : 'Sección protegida'}
        </p>
        <p className="text-xs text-nexus-text-secondary mb-3">
          {setup ? 'Lo pedirá cada sección bloqueada.' : 'Ingresa el PIN para continuar.'}
        </p>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          className="w-full bg-nexus-bg border border-nexus-border rounded-lg px-3 py-2 text-center text-lg tracking-widest mb-2"
          placeholder="••••"
          aria-label="PIN"
        />
        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
        <button type="submit" disabled={busy} className="w-full bg-nexus-primary text-white rounded-lg py-2 text-sm font-bold disabled:opacity-60">
          {busy ? 'Verificando…' : setup ? 'Guardar PIN' : 'Desbloquear'}
        </button>
      </form>
    </div>
  );
}
