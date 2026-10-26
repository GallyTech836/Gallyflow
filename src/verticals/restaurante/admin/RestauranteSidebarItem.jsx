// Mismo estilo que SidebarItem / SidebarSection de AdminApp (Fase 4: ítems de
// 40px, texto de 14px). Copia local para no descargar AdminApp en restaurantes.

export default function SidebarItem({ icon: Icon, label, active = false, badge = 0, onClick }) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`w-full flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150 cursor-pointer ${
          active ? 'bg-nexus-surface text-nexus-text shadow-sm' : 'text-white/75 hover:text-white hover:bg-nexus-navy-soft'
        }`}
      >
        <Icon className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-nexus-text' : 'text-white/60'}`} aria-hidden="true" />
        <span className="flex-1 truncate text-left">{label}</span>
        {badge > 0 && (
          <span className={`min-w-6 h-6 px-1.5 inline-flex items-center justify-center rounded-full text-xs font-bold nx-num ${active ? 'bg-nexus-primary text-white' : 'bg-white text-nexus-text'}`}>
            {badge}
          </span>
        )}
      </button>
    );
  }
  
  export function SidebarSection({ label, first = false }) {
    return <p className={`px-3 pb-1 ${first ? 'pt-0' : 'pt-4'} text-xs font-semibold tracking-wider text-white/45 uppercase`}>{label}</p>;
  }
  