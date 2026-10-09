import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const SIZES = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };

/**
 * Ventana modal de Nexus.
 * - Celular: hoja desde abajo, a lo ancho, con alto máximo de la pantalla.
 * - Escritorio: centrada. Escape y clic afuera cierran (si hay onClose).
 * - Cuerpo con scroll propio; encabezado y pie siempre visibles.
 * `showClose={false}` oculta la X (Escape y clic afuera siguen cerrando).
 * `z` permite apilar (ej. confirmación sobre otra ventana).
 */
export default function Modal({
  open = true,
  onClose,
  title,
  description,
  size = 'md',
  footer = null,
  closeOnOverlay = true,
  showClose = true,
  z = 60,
  className = '',
  bodyClassName = '',
  flush = false, // cuerpo sin relleno (el contenido maneja sus márgenes)
  children,
}) {
    const panelRef = useRef(null);
  // onClose suele ser una función nueva en cada render del padre: se guarda en
  // una ref para que el efecto de apertura corra UNA sola vez. Si dependiera de
  // onClose, cada tecla escrita en un campo movería el foco fuera del campo.
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return undefined;
    const prevFocus = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' && onCloseRef.current) { e.stopPropagation(); onCloseRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4" style={{ zIndex: z }}>
      <div
        className="absolute inset-0 bg-nexus-navy/60"
        aria-hidden="true"
        onClick={closeOnOverlay && onClose ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-nexus-surface shadow-[var(--nx-shadow-lg)] outline-none sm:rounded-2xl ${SIZES[size] || SIZES.md} ${className}`}
      >
        {(title || (onClose && showClose)) && (
          <div className="flex items-start justify-between gap-3 border-b border-nexus-border px-5 py-4">
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold text-nexus-text">{title}</h2>}
              {description && <p className="mt-0.5 text-sm text-nexus-text-secondary">{description}</p>}
            </div>
            {onClose && showClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="-mr-2 -mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-nexus-text-muted hover:bg-nexus-surface-hover hover:text-nexus-text cursor-pointer"
              >
                <X size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        <div className={`flex-1 overflow-y-auto ${flush ? '' : 'px-5 py-4'} ${bodyClassName}`}>{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-nexus-border px-5 py-3 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
