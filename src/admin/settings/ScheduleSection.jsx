import React from 'react';
import { CalendarClock } from 'lucide-react';

export default function ScheduleSection() {
  return (
    <div className="bg-[#0C0E17] border border-[#1E2442] rounded-2xl p-5">
      <div className="flex items-center gap-2.5 mb-1">
        <CalendarClock className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-bold text-white">Horarios Laborales</h3>
      </div>
      <p className="text-[11px] text-slate-500 mb-4">
        Configuración general de horarios de atención por sucursal.
      </p>
      <div className="border border-dashed border-[#232B4C] rounded-xl p-6 text-center">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Próximamente</p>
      </div>
    </div>
  );
}