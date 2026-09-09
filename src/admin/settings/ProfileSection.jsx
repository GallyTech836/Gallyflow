import React from 'react';
import { User, LogOut } from 'lucide-react';

export default function ProfileSection({ user, onLogout }) {
  return (
    <div className="space-y-4">
      <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5">
        <div className="flex items-center gap-2.5 mb-1">
          <User className="w-4 h-4 text-nexus-primary" />
          <h3 className="text-sm font-bold text-nexus-text">Perfil</h3>
        </div>
        <p className="text-[11px] text-nexus-text-muted mb-4">
          Datos de la cuenta del administrador: nombre, correo, contraseña y foto de perfil.
        </p>

        <div className="border border-dashed border-nexus-border rounded-xl p-6 text-center">
          <p className="text-xs font-bold text-nexus-text-secondary uppercase tracking-widest font-mono">Próximamente</p>
          <p className="text-[11px] text-nexus-text-muted mt-1">
            {user?.email ? `Sesión activa: ${user.email}` : 'La edición de perfil estará disponible aquí.'}
          </p>
        </div>
      </div>

      <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5">
        <h3 className="text-sm font-bold text-nexus-text mb-1">Sesión</h3>
        <p className="text-[11px] text-nexus-text-muted mb-4">
          Cierra tu sesión en este dispositivo.
        </p>
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-nexus-error-text hover:bg-nexus-error-bg border border-nexus-error/20 transition-colors text-xs font-bold uppercase tracking-widest cursor-pointer"
        >
          <LogOut size={14} />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}