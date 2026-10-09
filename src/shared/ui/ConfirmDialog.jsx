import { TriangleAlert } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

/**
 * Confirmación para acciones destructivas.
 * - `subject`: qué se elimina, en negrita (ej. "Carlos Méndez").
 * - `irreversible`: agrega "Esta acción no se puede deshacer."
 * Se dibuja por encima de otras ventanas (z 80).
 */
export default function ConfirmDialog({
  open = true,
  title = '¿Eliminar?',
  message,
  subject,
  irreversible = true,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      z={80}
      showClose={false}
      footer={(
        <>
          <Button variant="secondary" onClick={onCancel} fullWidth className="sm:w-auto">{cancelLabel}</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} fullWidth className="sm:w-auto">
            {confirmLabel}
          </Button>
        </>
      )}
    >
      <div className="flex gap-3">
        {tone === 'danger' && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-nexus-error-bg text-nexus-error-text">
            <TriangleAlert size={20} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 space-y-1.5">
          <h2 className="text-base font-semibold text-nexus-text">{title}</h2>
          {subject && <p className="break-words text-sm font-semibold text-nexus-text">{subject}</p>}
          {message && <p className="text-sm text-nexus-text-secondary">{message}</p>}
          {irreversible && <p className="text-sm text-nexus-error-text">Esta acción no se puede deshacer.</p>}
        </div>
      </div>
    </Modal>
  );
}
