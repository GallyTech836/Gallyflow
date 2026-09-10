import { Ban, Clock3 } from 'lucide-react';

export default function SuspendedScreen({ status, onLogout }) {
  const isExpired = status === 'expired';

  return (
    <div className="min-h-screen bg-nexus-background flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-nexus-error-bg border border-nexus-error/25 flex items-center justify-center">
          {isExpired ? (
            <Clock3 className="w-8 h-8 text-nexus-error" />
          ) : (
            <Ban className="w-8 h-8 text-nexus-error" />
          )}
        </div>
        <h1 className="text-lg font-bold text-nexus-text">
          {isExpired ? 'Suscripción vencida' : 'Cuenta suspendida'}
        </h1>
        <p className="text-sm text-nexus-text-secondary leading-relaxed">
          {isExpired
            ? 'Tu periodo de suscripción venció. Contacta a soporte para renovar y seguir usando la plataforma.'
            : 'Esta cuenta fue suspendida temporalmente. Contacta a soporte para más información.'}
        </p>
        {onLogout && (
          <button
            onClick={onLogout}
            className="mt-2 text-xs text-nexus-text-muted hover:text-nexus-text-secondary underline"
          >
            Cerrar sesión
          </button>
        )}
      </div>
    </div>
  );
}