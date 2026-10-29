import React, { useEffect, useState } from 'react';
import { listSessions, revokeSession } from './sessionApi';
import { formatSessionDate } from './sessionStore';

// Lista de sesiones activas del usuario, con opción de cerrar las otras.
export default function ActiveSessions() {
  const [data, setData] = useState(null);
  const [aviso, setAviso] = useState('');
  const [cerrando, setCerrando] = useState(null);

  async function cargar() {
    try {
      const r = await listSessions();
      if (r.ok) {
        setData(r.data);
        setAviso('');
      } else {
        setAviso('No se pudieron cargar las sesiones.');
      }
    } catch (_) {
      setAviso('Sin conexión con el servidor.');
    }
  }

  useEffect(() => { cargar(); }, []);

  async function cerrar(id) {
    setCerrando(id);
    try {
      const r = await revokeSession(id);
      setAviso(r.ok ? 'Sesión cerrada.' : 'No se pudo cerrar la sesión.');
      if (r.ok) await cargar();
    } catch (_) {
      setAviso('Sin conexión con el servidor.');
    }
    setCerrando(null);
  }

  const sesiones = data?.sessions || [];

  return (
    <div className="bg-nexus-surface border border-nexus-border rounded-xl p-4 sm:p-5 text-left shadow-[var(--nx-shadow-sm)]">
      <h3 className="text-base font-semibold text-nexus-text mb-3">Sesiones activas</h3>

      {!data && !aviso && <p className="text-xs text-nexus-text-muted">Cargando…</p>}

      <div className="space-y-2">
        {sesiones.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 border border-nexus-border rounded-xl p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-nexus-text truncate">
                {s.device?.label || 'Dispositivo'}
                {s.current && <span className="ml-2 text-[11px] font-bold text-nexus-primary">Este dispositivo</span>}
              </p>
              <p className="text-xs text-nexus-text-muted">
                {s.current ? 'En uso ahora' : `Último uso: ${formatSessionDate(s.lastActiveAt)}`}
              </p>
            </div>
            {!s.current && (
              <button
                type="button"
                disabled={!!cerrando}
                onClick={() => cerrar(s.id)}
                className="shrink-0 h-9 px-3 rounded-lg text-xs font-bold bg-nexus-error-bg text-nexus-error-text border border-nexus-error/20 disabled:opacity-50 cursor-pointer"
              >
                {cerrando === s.id ? 'Cerrando…' : 'Cerrar'}
              </button>
            )}
          </div>
        ))}
      </div>

      {aviso && <p className="text-xs text-nexus-text-secondary mt-3">{aviso}</p>}
    </div>
  );
}
