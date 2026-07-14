import React from 'react';
import { User, LogOut } from 'lucide-react';

export default function ProfileSection({ user, onLogout }) {
  return (
    <div className="space-y-4">
      <div className="bg-[#0C0E17] border border-[#1E2442] rounded-2xl p-5">
        <div className="flex items-center gap-2.5 mb-1">
          <User className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-bold text-white">Perfil</h3>
        </div>
        <p className="text-[11px] text-slate-500 mb-4">
          Datos de la cuenta del administrador: nombre, correo, contraseña y foto de perfil.
        </p>

        <div className="border border-dashed border-[#232B4C] rounded-xl p-6 text-center">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Próximamente</p>
          <p className="text-[11px] text-slate-500 mt-1">
            {user?.email ? `Sesión activa: ${user.email}` : 'La edición de perfil estará disponible aquí.'}
          </p>
        </div>
      </div>

      <div className="bg-[#0C0E17] border border-[#1E2442] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-white mb-1">Sesión</h3>
        <p className="text-[11px] text-slate-500 mb-4">
          Cierra tu sesión en este dispositivo.
        </p>
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-colors text-xs font-bold uppercase tracking-widest cursor-pointer"
        >
          <LogOut size={14} />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}