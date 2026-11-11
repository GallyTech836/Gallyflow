// Botón "Activar notificaciones" para iPhone/iPad (ver useNotifications.js).
export default function NotificationPrompt({ needsPermission, requestPermission, dismiss }) {
  if (!needsPermission) return null;
  return (
    <div className="fixed left-3 right-3 bottom-24 md:bottom-6 md:left-auto md:right-6 md:w-96 z-[60] bg-nexus-surface border border-nexus-border rounded-2xl shadow-lg p-4 flex items-center gap-3">
      <p className="flex-1 text-sm text-nexus-text">Activa las notificaciones para enterarte de las nuevas citas.</p>
      <button
        type="button"
        onClick={dismiss}
        className="text-sm text-nexus-text-secondary px-2 py-2"
      >
        Ahora no
      </button>
      <button
        type="button"
        onClick={requestPermission}
        className="text-sm font-semibold bg-nexus-primary text-white rounded-xl px-3 py-2"
      >
        Activar
      </button>
    </div>
  );
}
