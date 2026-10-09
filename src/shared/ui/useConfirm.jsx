import { useCallback, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

/**
 * const [confirm, confirmDialog] = useConfirm();
 * if (!(await confirm({ title, subject, message }))) return;
 * ...y renderizar {confirmDialog} en el componente.
 * Resuelve una sola vez (true/false): no puede disparar la acción dos veces.
 */
export function useConfirm() {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((options = {}) => new Promise((resolve) => {
    resolverRef.current?.(false); // si había otra abierta, se cancela
    resolverRef.current = resolve;
    setState(options);
  }), []);

  const close = (value) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setState(null);
    resolve?.(value);
  };

  const dialog = state ? (
    <ConfirmDialog
      {...state}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  ) : null;

  return [confirm, dialog];
}
