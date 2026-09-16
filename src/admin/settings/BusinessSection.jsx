import React from 'react';
import { Building2 } from 'lucide-react';

export default function BusinessSection({
  negocioId,
  businessName,
  setBusinessName,
  isEditingBusinessName,
  setIsEditingBusinessName,
  saveBusinessName,
}) {
  return (
    <div className="space-y-4">
      <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <Building2 className="w-4 h-4 text-nexus-primary" />
          <h3 className="text-sm font-bold text-nexus-text">Marca Activa</h3>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-nexus-primary-soft border border-nexus-primary/20 flex items-center justify-center font-bold text-nexus-primary text-xs shrink-0">
            GF
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-nexus-text-muted uppercase tracking-widest font-mono">MARCA ACTIVA</p>
              <button
                type="button"
                onClick={() => setIsEditingBusinessName(!isEditingBusinessName)}
                className="text-[9px] text-nexus-primary hover:underline font-bold"
              >
                Editar
              </button>
            </div>
            {isEditingBusinessName ? (
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                onBlur={() => { setIsEditingBusinessName(false); saveBusinessName(businessName); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { setIsEditingBusinessName(false); saveBusinessName(businessName); } }}
                className="w-full bg-nexus-background border border-nexus-primary/40 text-nexus-text rounded text-xs px-1 py-0.5 outline-none font-sans"
                autoFocus
              />
            ) : (
              <p className="text-xs font-semibold text-nexus-text truncate">{businessName}</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5">
        <h3 className="text-sm font-bold text-nexus-text mb-1">Datos del Negocio</h3>
        <p className="text-[11px] text-nexus-text-muted mb-4">
          Logo, sucursales y datos fiscales del negocio.
        </p>
        <div className="border border-dashed border-nexus-border rounded-xl p-6 text-center">
          <p className="text-xs font-bold text-nexus-text-secondary uppercase tracking-widest font-mono">Próximamente</p>
          {negocioId && (
            <p className="text-[11px] text-nexus-text-muted mt-1 font-mono">ID de negocio: {negocioId}</p>
          )}
        </div>
      </div>
    </div>
  );
}