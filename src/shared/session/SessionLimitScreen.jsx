import React, { useState } from 'react';
import { formatSessionDate } from './sessionStore';

// Pantalla que aparece al iniciar sesión cuando ya hay 2 sesiones abiertas.
export default function SessionLimitScreen({ sessions = [], onChoose, onCancel }) {
  const [cerrando, setCerrando] = useState(null);

  async function elegir(id) {
    setCerrando(id);
    try {
      await onChoose(id);
    } finally {
      setCerrando(null);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-nexus-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-nexus-surface border border-nexus-border rounded-2xl p-5 shadow-[var(--nx-shadow-lg)]">
        <h1 className="text-lg font-bold text-nexus-text">Ya tienes 2 sesiones abiertas</h1>
        <p className="text-sm text-nexus-text-secondary mt-1">Para entrar en este dispositivo, cierra una de ellas.</p>

        <div className="mt-4 space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 border border-nexus-border rounded-xl p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-nexus-text truncate">{s.device?.label || 'Dispositivo'}</p>
                <p className="text-xs text-nexus-text-muted">Último uso: {formatSessionDate(s.lastActiveAt)}</p>
              </div>
              <button
                type="button"
                disabled={!!cerrando}
                onClick={() => elegir(s.id)}
                className="shrink-0 h-9 px-3 rounded-lg text-xs font-bold bg-nexus-error-bg text-nexus-error-text border border-nexus-error/20 disabled:opacity-50 cursor-pointer"
              >
                {cerrando === s.id ? 'Cerrando…' : 'Cerrar y entrar'}
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={!!cerrando}
          className="mt-4 w-full h-10 rounded-lg text-sm font-semibold text-nexus-text-secondary hover:bg-nexus-surface-hover cursor-pointer"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
