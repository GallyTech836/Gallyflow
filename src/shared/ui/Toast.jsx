import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle, Info } from 'lucide-react';

const DURATION_MS = 4000;
const MAX_VISIBLE = 3;

const STYLES = {
  success: { box: 'bg-nexus-success-bg border-nexus-success/25 text-nexus-success-text', Icon: CheckCircle2, icon: 'text-nexus-success' },
  error: { box: 'bg-nexus-error-bg border-nexus-error/25 text-nexus-error-text', Icon: XCircle, icon: 'text-nexus-error' },
  info: { box: 'bg-nexus-info-bg border-nexus-info/25 text-nexus-info-text', Icon: Info, icon: 'text-nexus-info' },
};

/**
 * Avisos cortos de Nexus (los mismos en Admin, Barber y el link público).
 *
 * const [triggerToast, toastNode] = useToasts();
 * triggerToast('Cita guardada');            // success
 * triggerToast('No se pudo guardar', 'error');
 * triggerToast('Día seleccionado', 'info');
 * ...y renderizar {toastNode} una vez en la app.
 *
 * - Celular: arriba al centro (no tapa la barra de abajo ni el botón fijo).
 *   Escritorio: abajo a la derecha.
 * - Se van solos a los 4 s; tocar uno lo cierra.
 * - El mismo mensaje repetido no se apila: reinicia su tiempo.
 * - Máximo 3 a la vez (el más viejo sale primero).
 * - `triggerToast` es estable: se puede pasar como `onToast` sin re-renders.
 */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());
  const seqRef = useRef(0);
  // Copia de la lista para decidir fuera del setState (sin efectos dentro del updater).
  const toastsRef = useRef([]);

  const dismiss = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    toastsRef.current = toastsRef.current.filter((t) => t.id !== id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const schedule = useCallback((id) => {
    const prevTimer = timersRef.current.get(id);
    if (prevTimer) clearTimeout(prevTimer);
    timersRef.current.set(id, setTimeout(() => dismiss(id), DURATION_MS));
  }, [dismiss]);

  const triggerToast = useCallback((message, type = 'success') => {
    if (!message) return;
    const kind = STYLES[type] ? type : 'success';
    const same = toastsRef.current.find((t) => t.message === message && t.type === kind);
    if (same) { schedule(same.id); return; }

    seqRef.current += 1;
    const id = seqRef.current;
    let next = [...toastsRef.current, { id, message, type: kind }];
    // Si pasa del máximo, sale el más viejo (y se limpia su temporizador).
    while (next.length > MAX_VISIBLE) {
      const old = next[0];
      next = next.slice(1);
      const t = timersRef.current.get(old.id);
      if (t) clearTimeout(t);
      timersRef.current.delete(old.id);
    }
    toastsRef.current = next;
    setToasts(next);
    schedule(id);
  }, [schedule]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const toastNode = toasts.length > 0 ? createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[9999] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:top-auto sm:bottom-5 sm:right-5 sm:items-end sm:px-0"
    >
      {toasts.map((t) => {
        const s = STYLES[t.type];
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            role={t.type === 'error' ? 'alert' : 'status'}
            aria-live={t.type === 'error' ? 'assertive' : 'polite'}
            className={`nx-toast-in pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left shadow-[var(--nx-shadow)] cursor-pointer sm:w-auto sm:max-w-xs ${s.box}`}
          >
            <s.Icon className={`h-4 w-4 shrink-0 ${s.icon}`} aria-hidden="true" />
            <span className="text-sm font-semibold leading-snug">{t.message}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  ) : null;

  return [triggerToast, toastNode];
}
