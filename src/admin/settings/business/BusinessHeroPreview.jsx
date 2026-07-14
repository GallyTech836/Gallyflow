import React from 'react';
import { Eye } from 'lucide-react';
import HeroDisplay from '../../../shared/heroConfig/HeroDisplay';

export default function BusinessHeroPreview({ config }) {
  return (
    <div className="bg-[#0C0E17] border border-[#1E2442] rounded-2xl overflow-hidden">
      {/* Header de la tarjeta */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E2442]">
        <div>
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-indigo-400 shrink-0" />
            <h3 className="text-sm font-bold text-white">Vista Previa</h3>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 ml-6">
            Así se verá para tus clientes, antes de "Reservar Cita Ahora".
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider font-mono">En vivo</span>
        </div>
      </div>

      {/* Área de preview con fondo real del cliente */}
      <div className="bg-[#070714] relative overflow-hidden min-h-[380px] flex items-center justify-center p-8">
        {/* Glows decorativos idénticos a ClienteApp */}
        <div className="absolute top-[-30%] left-[-20%] w-[70%] h-[70%] bg-[#6366f1]/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-15%] w-[50%] h-[50%] bg-[#4f46e5]/10 blur-[110px] rounded-full pointer-events-none" />

        <div className="relative z-10 w-full max-w-xs mx-auto">
          <HeroDisplay config={config} compact />
        </div>
      </div>
    </div>
  );
}
