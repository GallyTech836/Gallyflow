import React from 'react';
import { Building2, LayoutTemplate, Bot } from 'lucide-react';

export const SETTINGS_SECTIONS = [
  { id: 'business', label: 'Negocio', icon: Building2 },
  { id: 'hero', label: 'Link Público', icon: LayoutTemplate },
  { id: 'automation', label: 'Automatización', icon: Bot },
];

export default function SettingsSidebar({ activeSection, onChangeSection }) {
  return (
    <nav className="w-full md:w-56 shrink-0 space-y-1">
      {SETTINGS_SECTIONS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChangeSection(id)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
            activeSection === id
              ? 'bg-gradient-to-r from-[#1E243A] to-[#121626] text-indigo-400 border-l-2 border-indigo-400 shadow-md shadow-indigo-950/25'
              : 'text-slate-400 hover:text-white hover:bg-[#131728]'
          }`}
        >
          <Icon className="w-4 h-4 text-indigo-500 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      ))}
    </nav>
  );
}
