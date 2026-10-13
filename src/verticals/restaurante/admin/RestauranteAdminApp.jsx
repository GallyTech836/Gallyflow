import { Suspense, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Menu, X, Settings, Building2, Bot, LogOut } from 'lucide-react';
import { db } from '../../../firebase/config';
import { useAuth } from '../../../auth/useAuth';
import { useNegocioStatus } from '../../../shared/negocioStatus/useNegocioStatus';
import { useNegocioPlan } from '../../../shared/negocioPlan/useNegocioPlan';
import { BusinessProfileContext, useBusinessProfile } from '../../../shared/businessProfiles/useBusinessProfile';
import { useNotifications } from '../../../shared/notifications';
import SuspendedScreen from '../../../shared/negocioStatus/SuspendedScreen';
import { LoadingState } from '../../../shared/ui';
import BusinessSection from '../../../admin/settings/BusinessSection';
import AssistantSection from '../../../admin/settings/AssistantSection';
import { RESTAURANTE_NAV } from '../profile';
import SidebarItem, { SidebarSection } from './RestauranteSidebarItem';

const SETTINGS = [
  { id: 'business', label: 'Negocio', icon: Building2 },
  { id: 'assistant', label: 'Asistente WhatsApp', icon: Bot, capability: 'asistenteWhatsapp' },
];

/**
 * Panel del admin para negocios del vertical 'restaurante'.
 * Lo abre AdminEntry; nunca carga AdminApp (agenda).
 */
export default function RestauranteAdminApp({ user, negocioId }) {
  const { logout } = useAuth();
  const businessProfile = useBusinessProfile(negocioId);
  const { hasModule } = businessProfile;
  const { isBlocked, status: negocioStatus } = useNegocioStatus(negocioId);
  const { can, loading: planLoading } = useNegocioPlan(negocioId);
  useNotifications({ uid: user?.uid, rol: 'admin', negocioId });

  const [businessName, setBusinessName] = useState('');
  useEffect(() => {
    if (!negocioId) return undefined;
    const unsub = onSnapshot(doc(db, 'negocios', negocioId), (snap) => {
      setBusinessName(snap.data()?.heroConfig?.businessName || '');
    });
    return () => unsub();
  }, [negocioId]);

  // Menú lateral = módulos del perfil que el plan permite.
  const nav = useMemo(
    () => RESTAURANTE_NAV
      .map((s) => ({ ...s, items: s.items.filter((i) => hasModule(i.key) && can(i.capability)) }))
      .filter((s) => s.items.length),
    [hasModule, can],
  );
  const flatNav = nav.flatMap((s) => s.items);
  const settings = SETTINGS.filter((s) => !s.capability || can(s.capability));

  const [active, setActive] = useState('orders');
  const [settingsSection, setSettingsSection] = useState('business');
  const [mobileOpen, setMobileOpen] = useState(false);

  // Si el Super Admin apaga el módulo abierto, se pasa al primero disponible.
  const current = active === 'settings' ? null : (flatNav.find((i) => i.key === active) || flatNav[0] || null);
  const activeKey = active === 'settings' || !current ? 'settings' : current.key;
  const activeSettings = settings.find((s) => s.id === settingsSection) ? settingsSection : 'business';

  const go = (key) => { setActive(key); setMobileOpen(false); };

  if (isBlocked) return <SuspendedScreen status={negocioStatus} onLogout={logout} />;

  const title = activeKey === 'settings'
    ? `Configuración · ${settings.find((s) => s.id === activeSettings)?.label || ''}`
    : current.title;
  const Page = current?.Component;

  return (
    <BusinessProfileContext.Provider value={businessProfile}>
      <div className="h-screen bg-nexus-background text-nexus-text font-sans antialiased flex flex-col md:flex-row overflow-hidden relative">
        {mobileOpen && (
          <div className="fixed inset-0 bg-nexus-navy/60 backdrop-blur-xs z-40 md:hidden" onClick={() => setMobileOpen(false)} />
        )}

        <aside
          className={`fixed md:relative inset-y-0 left-0 bg-nexus-navy border-r border-nexus-navy-border flex flex-col shrink-0 z-50 transition-transform duration-300 w-72 max-w-[85vw] md:w-60 ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          <div className="h-16 px-4 border-b border-nexus-navy-border flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <img src="/favicon.svg" alt="" className="w-9 h-9 rounded-lg shadow-md shrink-0 object-contain" />
              <div className="min-w-0">
                <h1 className="text-sm font-bold tracking-wide text-white truncate">Nexus Restaurant</h1>
                <p className="text-xs text-white/50 truncate">{businessName || 'Panel del negocio'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="md:hidden inline-flex h-10 w-10 items-center justify-center hover:bg-nexus-navy-soft text-white/70 hover:text-white rounded-lg cursor-pointer shrink-0"
              aria-label="Cerrar menú"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Menú principal">
            {nav.map((section, i) => (
              <div key={section.section} className="space-y-1">
                <SidebarSection label={section.section} first={i === 0} />
                {section.items.map((item) => (
                  <SidebarItem
                    key={item.key}
                    icon={item.icon}
                    label={item.label}
                    active={activeKey === item.key}
                    onClick={() => go(item.key)}
                  />
                ))}
              </div>
            ))}

            <SidebarSection label="Sistema" />
            <SidebarItem icon={Settings} label="Configuración" active={activeKey === 'settings'} onClick={() => go('settings')} />
            {activeKey === 'settings' && (
              <div className="ml-4 border-l border-nexus-navy-border pl-2 space-y-1">
                {settings.map((s) => (
                  <SidebarItem
                    key={s.id}
                    icon={s.icon}
                    label={s.label}
                    active={activeSettings === s.id}
                    onClick={() => { setSettingsSection(s.id); setMobileOpen(false); }}
                  />
                ))}
              </div>
            )}
          </nav>

          <div className="p-3 border-t border-nexus-navy-border">
            <SidebarItem icon={LogOut} label="Cerrar sesión" onClick={logout} />
          </div>
        </aside>

        <main className="relative flex-1 flex flex-col min-w-0 overflow-y-auto">
          <header className="sticky top-0 bg-nexus-background/95 backdrop-blur-md border-b border-nexus-border px-3 py-3 sm:px-4 md:px-6 flex items-center gap-3 z-25">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="md:hidden inline-flex h-10 w-10 items-center justify-center hover:bg-nexus-surface-hover text-nexus-text-secondary hover:text-nexus-text rounded-lg shrink-0 border border-nexus-border bg-nexus-surface cursor-pointer"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-xs text-nexus-text-secondary truncate">{businessName}</p>
              <h2 className="text-base sm:text-lg font-bold text-nexus-text tracking-tight truncate">{title}</h2>
            </div>
          </header>

          <div className="flex-1 p-3 sm:p-4 md:p-6">
            {planLoading ? (
              <LoadingState />
            ) : activeKey === 'settings' ? (
              activeSettings === 'assistant'
                ? <AssistantSection negocioId={negocioId} />
                : <BusinessSection negocioId={negocioId} businessName={businessName} user={user} onLogout={logout} />
            ) : (
              <Suspense fallback={<LoadingState />}>
                <Page negocioId={negocioId} user={user} />
              </Suspense>
            )}
          </div>
        </main>
      </div>
    </BusinessProfileContext.Provider>
  );
}
