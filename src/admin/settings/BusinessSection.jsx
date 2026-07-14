import React from 'react';
import { Building2 } from 'lucide-react';

export default function BusinessSection({
  negocioId,
  businessName,
  setBusinessName,
  isEditingBusinessName,
  setIsEditingBusinessName,
}) {
  return (
    <div className="space-y-4">
      <div className="bg-[#0C0E17] border border-[#1E2442] rounded-2xl p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <Building2 className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-bold text-white">Marca Activa</h3>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-bold text-indigo-400 text-xs shrink-0">
            GF
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">MARCA ACTIVA</p>
              <button
                type="button"
                onClick={() => setIsEditingBusinessName(!isEditingBusinessName)}
                className="text-[9px] text-indigo-400 hover:underline font-bold"
              >
                Editar
              </button>
            </div>
            {isEditingBusinessName ? (
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                onBlur={() => setIsEditingBusinessName(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingBusinessName(false); }}
                className="w-full bg-[#131728] border border-indigo-500/40 text-white rounded text-xs px-1 py-0.5 outline-none font-sans"
                autoFocus
              />
            ) : (
              <p className="text-xs font-semibold text-slate-200 truncate">{businessName}</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-[#0C0E17] border border-[#1E2442] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-white mb-1">Datos del Negocio</h3>
        <p className="text-[11px] text-slate-500 mb-4">
          Logo, sucursales y datos fiscales del negocio.
        </p>
        <div className="border border-dashed border-[#232B4C] rounded-xl p-6 text-center">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Próximamente</p>
          {negocioId && (
            <p className="text-[11px] text-slate-500 mt-1 font-mono">ID de negocio: {negocioId}</p>
          )}
        </div>
      </div>
    </div>
  );
}