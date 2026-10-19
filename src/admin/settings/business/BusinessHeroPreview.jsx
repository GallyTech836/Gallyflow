import React from 'react';
import { Eye, Sparkles } from 'lucide-react';
import HeroDisplay from '../../../shared/heroConfig/HeroDisplay';

// Vista previa en vivo del Link Público (solo Admin). Usa el mismo
// HeroDisplay que ClienteApp, así que se ve igual que la pantalla real.
// Abajo muestra cómo queda la portada en «Más información».
export default function BusinessHeroPreview({ config }) {
  return (
    <div className="bg-nexus-surface border border-nexus-border rounded-xl overflow-hidden shadow-[var(--nx-shadow-sm)]">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-nexus-border">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <Eye className="w-5 h-5 text-nexus-primary shrink-0" aria-hidden="true" />
            <h3 className="text-base font-semibold text-nexus-text">Vista previa</h3>
          </div>
          <p className="text-sm text-nexus-text-secondary mt-0.5">Así lo ven tus clientes.</p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-nexus-primary-soft border border-nexus-primary/20 rounded-full shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-nexus-primary animate-pulse" />
          <span className="text-xs text-nexus-primary font-semibold">En vivo</span>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4 bg-nexus-background">
        {/* Pantalla de inicio, en un marco de celular */}
        <div className="mx-auto w-full max-w-[300px] rounded-[2rem] border-[6px] border-nexus-navy/85 bg-nexus-background shadow-lg overflow-hidden">
          <div className="relative min-h-[360px] flex items-center justify-center px-5 py-8 overflow-hidden">
            <div className="absolute top-[-30%] left-[-20%] w-[70%] h-[70%] bg-nexus-primary/5 blur-[80px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-20%] right-[-15%] w-[50%] h-[50%] bg-nexus-primary/5 blur-[80px] rounded-full pointer-events-none" />
            <div className="relative z-10 w-full">
              <HeroDisplay config={config} compact />
            </div>
          </div>
        </div>

        {/* Portada en «Más información» */}
        <div>
          <p className="text-xs font-medium text-nexus-text-secondary mb-1.5">Portada en «Más información»</p>
          <div className="rounded-xl border border-nexus-border bg-nexus-surface overflow-hidden">
            <div className="h-20 bg-gradient-to-br from-nexus-primary-soft via-nexus-primary/15 to-nexus-primary/30">
              {config.cover && <img src={config.cover} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="px-3 pb-3">
              <div className="-mt-7 w-14 h-14 rounded-full border-[3px] border-nexus-surface bg-nexus-surface overflow-hidden flex items-center justify-center shadow">
                {config.logo
                  ? <img src={config.logo} alt="" className="w-full h-full object-cover" />
                  : <Sparkles className="w-5 h-5 text-nexus-primary" aria-hidden="true" />}
              </div>
              <p className="mt-1.5 min-w-0 truncate text-sm font-bold text-nexus-text">{config.businessName}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
