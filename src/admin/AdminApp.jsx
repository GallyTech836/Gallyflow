import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Menu, X, LayoutDashboard, Calendar as CalendarIcon, Users, UserCheck, DollarSign, ChartBar as BarChart3, Clock, Plus, Search, CircleCheck as CheckCircle, Circle as XCircle, TrendingUp, TrendingDown, FileSliders as Sliders, Trash2, Pencil as Edit3, Award, ArrowUpRight, MapPin, CalendarCheck, UserPlus, Info, CalendarDays, ChevronLeft, ChevronRight, ChevronDown, Settings, Circle as HelpCircle, CircleAlert as AlertCircle, Check, Building2, Lock, Eye, EyeOff, KeyRound, RefreshCw, Copy, ToggleLeft, ToggleRight, Upload, Globe, Package, LogOut, ImagePlus, ClipboardList, Tag, Filter } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { useAuth } from '../auth/useAuth';
import { useServicios } from '../firebase/useServicios';
import { auth, db } from '../firebase/config';
import { doc, setDoc, addDoc, collection, onSnapshot, deleteDoc, updateDoc, query, where, orderBy, limit, startAt, getDocs, getCountFromServer, getAggregateFromServer, sum } from 'firebase/firestore';
import { getPeriodRange, getPreviousPeriodRange, formatYMD } from '../shared/appointments/dateRanges';
import { paymentStampFields } from '../shared/appointments/paymentStamp';
import CashCard from './cash/CashCard';
import CommissionPayModal from './cash/CommissionPayModal';
import { payCommission } from './cash/cashApi';
import { useBusinessSettings } from '../shared/businessSettings/useBusinessSettings';
import ClosedDayBanner from '../shared/businessSettings/ClosedDayBanner';
import { getPendingCandidates, getCitaServiceIds, professionalCanDo } from '../shared/appointments/pendingModel';
import { processPendingCita, reevaluatePending } from '../shared/appointments/pendingApi';
import { describeAppointmentChanges } from '../shared/appointments/changeSummary';
import { getLabel as getStatusLabel } from '../shared/appointments/statusModel';
import { useFillHeight } from '../shared/layout/useFillHeight';
import { useNegocio } from '../firebase/useNegocio';
import { useNegocioStatus } from '../shared/negocioStatus/useNegocioStatus';
import { useNegocioPlan, hasFeature, getFeatureLimit } from '../shared/negocioPlan/useNegocioPlan';
import SuspendedScreen from '../shared/negocioStatus/SuspendedScreen';
import SubscriptionNoticeModal from '../shared/subscriptionNotice/SubscriptionNoticeModal';
import { useSupportContact } from '../shared/subscriptionNotice/useSupportContact';
import { getStatusCardClasses } from '../shared/appointments/statusModel';
import AppointmentManageModal from '../shared/appointments/AppointmentManageModal';
import { BusinessProfileContext, useBusinessProfile } from '../shared/businessProfiles/useBusinessProfile';
import { useConfirm, Button, IconButton, Input, Badge, EmptyState, Modal, ResponsiveTable, SegmentedControl, ImageUploader, LoadingState } from '../shared/ui';
import { getServiceIcon } from '../shared/businessProfiles/businessProfileIcons';
import AppointmentCreateModal from '../shared/appointments/AppointmentCreateModal';
import { calculateCommission, calculateCommissionForCita } from '../shared/commissions/commissionModel';
import { getServicesFromCita } from '../shared/appointments/serviceSelection';
import { checkWorkingHours } from '../shared/appointments/workingHours';
import { uploadImage } from '../shared/cloudinary/uploadImage';
import { formatServicePrice, formatServicePriceFor } from '../shared/servicePricing/servicePricing';
import { repriceCitaServices, normalizeCustomPrice, hasCustomPrices } from '../shared/servicePricing/professionalPricing';
import { getStaffPermissionOptions, getEditPartOptions, getEditMode, normalizeStaffPermissions } from '../shared/staffPermissions/staffPermissionsModel';
import ClientProfileModal from '../shared/clients/ClientProfileModal';
import { checkStaffUsername, setStaffPassword, revokeStaffSessions } from '../shared/staff/staffApi';
import { createProfessional, createBranch, updateBranch } from '../shared/negocioPlan/quotaApi';
import Avatar, { hasRealAvatar } from '../shared/avatar/Avatar';
import { useNotifications, notify, NotificationType } from '../shared/notifications';
import SettingsPage from './settings';
import { SETTINGS_SECTIONS } from './settings/SettingsSidebar';
import { MonthCalendar, YearCalendar } from '../shared/calendar/AgendaCalendars';
import AnalyticsSection from './analytics/AnalyticsSection';
import InventoryPage from './inventory/InventoryPage';
import SectionTabs from './SectionTabs';
import PromotionsPage from './promotions/PromotionsPage';
import { usePromotions } from '../shared/promotions/usePromotions';
import { priceWithPromotions, promoInputsChanged } from '../shared/promotions/citaPromotions';
import { useHeroConfig } from '../shared/heroConfig/useHeroConfig';
import { cloudinaryThumb } from '../shared/cloudinary/uploadImage';
import { buildPublicBookingUrl } from '../shared/booking/publicRoutes';
import RegistrarServicioModal from '../shared/registros/RegistrarServicioModal';
import RegistrosPanel from '../shared/registros/RegistrosPanel';
import RegistrarServicioBar from '../shared/registros/RegistrarServicioBar';
import { isRegistro } from '../shared/registros/registroModel';

const GEOLOCATIONS_DB = [
  { name: "Equipetrol, Santa Cruz de la Sierra", address: "Av. San Martín, Calle 5 Oeste, Santa Cruz de la Sierra, Bolivia", lat: -17.7732, lng: -63.1821 },
  { name: "Central, Av. Trompillo", address: "Av. El Trompillo #420, Santa Cruz de la Sierra, Bolivia", lat: -17.8010, lng: -63.1950 },
  { name: "Zona Norte Mall, Santa Cruz", address: "Centro Comercial Norte Mall, Av. Banzer, Santa Cruz de la Sierra, Bolivia", lat: -17.7520, lng: -63.1710 },
  { name: "La Paz Centro, El Prado", address: "Avenida 16 de Julio (El Prado), La Paz, Bolivia", lat: -16.4983, lng: -68.1322 },
  { name: "Zona Sur, Calacoto, La Paz", address: "Calle 21 de Calacoto, San Miguel, La Paz, Bolivia", lat: -16.5412, lng: -68.0815 },
  { name: "Sopocachi, La Paz", address: "Plaza Abaroa, Sopocachi, La Paz, Bolivia", lat: -16.5105, lng: -68.1283 },
  { name: "Miraflores, La Paz", address: "Av. Busch, Plaza Villarroel, La Paz, Bolivia", lat: -16.4952, lng: -68.1189 },
  { name: "Avenida Busch, Santa Cruz", address: "Av. Busch, entre 2do y 3er Anillo, Santa Cruz de la Sierra, Bolivia", lat: -17.7785, lng: -63.1755 },
  { name: "Las Américas, Santa Cruz", address: "Av. Las Américas, Edificio Torres Américas, Santa Cruz de la Sierra, Bolivia", lat: -17.7952, lng: -63.1798 },
  { name: "Cochabamba Centro", address: "Plaza 14 de Septiembre, Cochabamba, Bolivia", lat: -17.3935, lng: -66.1570 },
  { name: "El Organismo, Cochabamba", address: "Avenida América y Libertador, Cochabamba, Bolivia", lat: -17.3751, lng: -66.1592 }
];


// Fase 4: ítems del menú lateral con un solo estilo (40px de alto, texto de 14px).
// `collapsed` solo aplica en escritorio; en celular el panel muestra siempre los nombres.
function SidebarItem({ icon: Icon, label, active = false, collapsed = false, badge = 0, badgeLabel, trailing = null, expanded, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      aria-expanded={expanded}
      className={`w-full flex h-10 items-center rounded-lg px-3 text-sm font-medium transition-colors duration-150 cursor-pointer ${
        collapsed ? 'justify-center' : 'gap-3'
      } ${
        active ? 'bg-nexus-surface text-nexus-text shadow-sm' : 'text-white/75 hover:text-white hover:bg-nexus-navy-soft'
      }`}
    >
      <span className="relative inline-flex shrink-0">
        <Icon className={`w-[18px] h-[18px] ${active ? 'text-nexus-text' : 'text-white/60'}`} aria-hidden="true" />
        {collapsed && badge > 0 && (
          <span className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-nexus-warning ring-2 ring-nexus-navy" aria-label={badgeLabel} />
        )}
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-left">{label}</span>
          {badge > 0 && (
            <span
              className={`min-w-6 h-6 px-1.5 inline-flex items-center justify-center rounded-full text-xs font-bold nx-num ${active ? 'bg-nexus-primary text-white' : 'bg-white text-nexus-text'}`}
              aria-label={badgeLabel}
            >
              {badge}
            </span>
          )}
          {trailing}
        </>
      )}
    </button>
  );
}

// Fase 4: buscador estándar de las listas (40px de alto, 16px en celular).
function SearchField({ value, onChange, placeholder, className = 'sm:w-80' }) {
  return (
    <div className={`relative w-full ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-text-muted" aria-hidden="true" />
      <Input type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={onChange} className="pl-9" />
    </div>
  );
}

function SidebarSection({ label, collapsed = false, first = false }) {
  if (collapsed) return <div className={`border-t border-nexus-navy-border mx-2 ${first ? 'mb-2' : 'my-3'}`} />;
  return <p className={`px-3 pb-1 ${first ? 'pt-0' : 'pt-4'} text-xs font-semibold tracking-wider text-white/45 uppercase`}>{label}</p>;
}

export default function App({ user }) {
  function DashboardChartTooltip({ active, payload, label }) {
    if (!active || !payload || !payload.length) return null;
    const bucket = payload[0].payload || {};
    const displayLabel = bucket.fullLabel || label;
    return (
      <div className="bg-nexus-surface border border-nexus-border rounded-lg px-3 py-2 shadow-lg text-xs space-y-0.5">
        <p className="font-bold text-nexus-text">{displayLabel}</p>
        <p className="text-nexus-text-secondary">{registrosMode ? `${t('services')} registrados` : t('appointments')}: {bucket.citas || 0}</p>
      <p className="text-nexus-text-secondary">Ventas: {Number(bucket.ventas || 0).toLocaleString('es-BO')} Bs</p>
      </div>
    );
  }
const { logout } = useAuth();
  const { negocioId } = useNegocio(user);
  // Tipo de negocio -> terminología y módulos (businessProfileModel).
  const businessProfile = useBusinessProfile(negocioId);
  const { t, tl, g, hasModule } = businessProfile;
  // Confirmación antes de acciones destructivas (Fase 4). No cambia la lógica de borrado.
  const [confirmAction, confirmDialog] = useConfirm();
  const ServiceIcon = getServiceIcon(businessProfile.type);
  const { isBlocked, status: negocioStatus, statusKey } = useNegocioStatus(negocioId);
  const supportUrl = useSupportContact(isBlocked);
  useNotifications({ uid: user?.uid, rol: 'admin', negocioId });
console.log('[ADMIN] negocioId:', negocioId);
const [activeTab, setActiveTab] = useState('agenda');
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState('business');

  // Agenda, vista Día: el encabezado con los nombres de los profesionales y la
  // cuadrícula de citas son dos áreas con scroll horizontal independientes en
  // el DOM (una encima de la otra). En móvil, si el usuario desliza una no se
  // mueve la otra y quedan desalineadas. Estas dos refs las mantienen
  // sincronizadas: deslizar cualquiera de las dos mueve ambas.
  const dayHeaderScrollRef = useRef(null);
  const dayBodyScrollRef = useRef(null);
  const syncingDayScrollRef = useRef(false);
  const handleDayHeaderScroll = () => {
    if (syncingDayScrollRef.current || !dayHeaderScrollRef.current || !dayBodyScrollRef.current) return;
    syncingDayScrollRef.current = true;
    dayBodyScrollRef.current.scrollLeft = dayHeaderScrollRef.current.scrollLeft;
    syncingDayScrollRef.current = false;
  };
  const handleDayBodyScroll = () => {
    if (syncingDayScrollRef.current || !dayHeaderScrollRef.current || !dayBodyScrollRef.current) return;
    syncingDayScrollRef.current = true;
    dayHeaderScrollRef.current.scrollLeft = dayBodyScrollRef.current.scrollLeft;
    syncingDayScrollRef.current = false;
  };
  const [agendaView, setAgendaView] = useState('dia');
  const agendaBoxRef = useRef(null);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  // En celular el panel abierto siempre muestra los nombres, aunque en escritorio esté contraído.
  const navCollapsed = isSidebarCollapsed && !isMobileSidebarOpen;
  // Pantallas que muestran los controles de periodo y sucursal en la cabecera.
  const headerHasToolbar = ['agenda', 'dashboard', 'commissions', 'assistance', 'reports'].includes(activeTab);

  const [businessName, setBusinessName] = useState('Mi negocio');
  const [isEditingBusinessName, setIsEditingBusinessName] = useState(false);

  // Carga el nombre real del negocio desde Firestore (heroConfig.businessName,
  // el mismo campo que usa la Pantalla de Bienvenida) — antes se quedaba fijo
  // en un nombre fijo para todos los negocios, sin importar cuál fuera.
  useEffect(() => {
    if (!negocioId) return;
    const ref = doc(db, 'negocios', negocioId);
    const unsub = onSnapshot(ref, (snap) => {
      const name = snap.data()?.heroConfig?.businessName;
      if (name) setBusinessName(name);
    });
    return () => unsub();
  }, [negocioId]);

  

  const [branches, setBranches] = useState([]);
  useEffect(() => {
    if (!negocioId) return;
    const ref = collection(db, 'negocios', negocioId, 'sucursales');
    const unsub = onSnapshot(ref, (snap) => {
      setBranches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [negocioId]);

  const [barbers, setBarbers] = useState([]);
  useEffect(() => {
    if (!negocioId) return;
    const ref = collection(db, 'negocios', negocioId, 'profesionales');
    const unsub = onSnapshot(ref, (snap) => {
      setBarbers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [negocioId]);

  const {servicios: services, agregarServicio, editarServicio, eliminarServicio } = useServicios(negocioId);
  const [clients, setClients] = useState([]);
  useEffect(() => {
    if (!negocioId) return;
    const ref = collection(db, 'negocios', negocioId, 'clientes');
    const unsub = onSnapshot(ref, (snap) => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [negocioId]);
  // citas / horariosBloqueados se cargan según el selector y la pestaña activa (ver "CONSULTAS DE citas" más abajo)
  const [reservations, setReservations] = useState([]);
  const [blockouts, setBlockouts] = useState([]);

// Capacidades efectivas del negocio (override del Super Admin > plan >
// default del catálogo). `planFeatures` es el mapa RESUELTO, así que
// hasFeature/getFeatureLimit siguen funcionando igual que antes.
const { capabilities: planFeatures, can: canUseCapability, loading: planLoading } = useNegocioPlan(negocioId);
// Promociones del negocio (si el plan las incluye): se aplican al guardar citas.
const promosOn = hasFeature(planFeatures, 'promociones');
const { promotions: allPromotions } = usePromotions(negocioId, promosOn);
const activePromotions = promosOn ? allPromotions : [];
// Pestaña -> capacidad que la habilita. Si el Super Admin apaga una
// capacidad mientras la pestaña está abierta, se vuelve a la pestaña de inicio.
const TAB_CAPABILITY = { agenda: 'vistaAgenda', dashboard: 'dashboard', clients: 'clientes', inventory: 'inventario', promotions: 'promociones', commissions: 'comisiones', assistance: 'asistencia', reports: 'analiticas', registros: 'registroServicios' };
// Pestañas que no son un módulo propio: "Servicios registrados" es parte de Agenda
// y Promociones es parte de Servicios.
const TAB_MODULE = { registros: 'agenda', promotions: 'services' };
// Pestaña de inicio: la Agenda; si está oculta (vistaAgenda, Nexus Control),
// "Servicios registrados", luego Dashboard y, como último recurso, Servicios.
const showAgenda = canUseCapability('vistaAgenda');
const homeTab = showAgenda ? 'agenda'
  : canUseCapability('registroServicios') ? 'registros'
  : (canUseCapability('dashboard') && hasModule('dashboard')) ? 'dashboard'
  : 'services';
// La agenda no se pinta mientras carga el plan: así nunca aparece y se va.
const agendaTab = activeTab === 'agenda' && !planLoading;
// Modo registros (Nexus Control): agenda oculta + registro de servicios. El
// Dashboard y la Analítica hablan de servicios registrados en vez de citas.
const registrosMode = !showAgenda && canUseCapability('registroServicios');
useEffect(() => {
  if (planLoading) return;
  const cap = TAB_CAPABILITY[activeTab];
  if ((cap && !canUseCapability(cap)) || !hasModule(TAB_MODULE[activeTab] || activeTab)) setActiveTab(homeTab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeTab, planFeatures, planLoading, businessProfile]);
const { businessSettings } = useBusinessSettings(negocioId);
const { heroConfig } = useHeroConfig(negocioId);

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterBarberId, setFilterBarberId] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedBranch, setSelectedBranch] = useState(null);
  // Registro de servicios (Nexus Control): modal y recarga de la lista.
  const [registroModalOpen, setRegistroModalOpen] = useState(false);
  const [registrosTick, setRegistrosTick] = useState(0);

  // Selecciona la primera sucursal real del negocio en cuanto Firestore
  // las entrega — nunca asume un nombre fijo. Solo corre si el usuario
  // no ha elegido ya una sucursal (no pisa su selección manual).
  useEffect(() => {
    if (!selectedBranch && branches.length > 0) {
      setSelectedBranch(branches[0].name);
    }
  }, [branches, selectedBranch]);
  const professionals = barbers;
  const setProfessionals = setBarbers;
  const branchBarbers = useMemo(() => {
    if (!Array.isArray(barbers)) return [];
    return barbers.filter(b => b?.branch === selectedBranch);
  }, [barbers, selectedBranch]);
  // Alto de la agenda Día: ocupa el espacio visible. Se vuelve a medir si aparece
  // la fila de filtro por profesional (Fase 4).
  const agendaBoxHeight = useFillHeight(agendaBoxRef, [activeTab, agendaView, (branchBarbers || []).length > 1], { min: 480 });

  const branchReservations = useMemo(() => {
    if (!Array.isArray(reservations)) return [];
    return reservations.filter(r => r?.branch === selectedBranch);
  }, [reservations, selectedBranch]);
  // Grilla de la agenda: sin los registros de servicio (Nexus Control), que no
  // tienen horario. Dashboard, comisiones y analítica siguen usando branchReservations.
  // Las citas normales no tienen `origin`: para ellas esto no cambia nada.
  const agendaBranchReservations = useMemo(
    () => branchReservations.filter(r => !isRegistro(r)),
    [branchReservations]
  );

  const [searchClientQuery, setSearchClientQuery] = useState('');
  const [searchBarberQuery, setSearchBarberQuery] = useState('');
  // Filtro por sucursal en Gestión de profesionales ('all' = todas).
  const [barberBranchFilter, setBarberBranchFilter] = useState('all');
  const [searchBranchQuery, setSearchBranchQuery] = useState('');
  const [toasts, setToasts] = useState([]);

  const [activeModal, setActiveModal] = useState(null); 
  const [editingReservation, setEditingReservation] = useState(null);
  const [clickedSlot, setClickedSlot] = useState({ barberId: '', time: '' });

  const [showPassword, setShowPassword] = useState(false);
  const [credentialNotice, setCredentialNotice] = useState(null); // { name, username, password } — se muestra una sola vez
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const fileInputRef = useRef(null);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  const [barberStep, setBarberStep] = useState(1);
  const [editingBarberId, setEditingBarberId] = useState(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [newBarber, setNewBarber] = useState({
    firstName: '',
    lastName: '',
    branch: selectedBranch || branches[0]?.name || '',
    username: '',
    pin: '',
    password: '',
    confirmPassword: '',
    avatar: '',
    active: true,
    services: [], 
    availability: [
      { day: 'Lunes', status: 'Disponible', start: '09:00', end: '19:00' },
      { day: 'Martes', status: 'Disponible', start: '09:00', end: '19:00' },
      { day: 'Miércoles', status: 'Disponible', start: '09:00', end: '19:00' },
      { day: 'Jueves', status: 'Disponible', start: '09:00', end: '19:00' },
      { day: 'Viernes', status: 'Disponible', start: '09:00', end: '19:00' },
      { day: 'Sábado', status: 'Disponible', start: '09:00', end: '19:00' },
      { day: 'Domingo', status: 'Descanso', start: '09:00', end: '19:00' }
    ]
  });

  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceTab, setServiceTab] = useState('Todos');
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState(null);

  const [newService, setNewService] = useState({ 
    name: '', 
    price: '', 
    duration: '30', 
    category: 'Tratamiento', 
    promoPrice: '',
    availableDays: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] 
  });
  
  const [newReservation, setNewReservation] = useState({ 
    clientName: '', 
    phone: '', 
    barberId: 'pending', 
    professionalId: 'pending',
    serviceId: '', 
    time: '12:00', 
    date: '2026-05-25', 
    paymentMethod: 'Efectivo', 
    bookedBy: 'admin',
    notes: ''
  });

  const [clientSearch, setClientSearch] = useState('');
  const [showClientList, setShowClientList] = useState(false);
  const [isNewClient, setIsNewClient] = useState(false);

  const [assistPin, setAssistPin] = useState('');
  const [assistType, setAssistType] = useState('in');

  const [blockoutForm, setBlockoutForm] = useState({
    date: '2026-05-25',
    startTime: '12:00',
    endTime: '12:30',
    reason: 'Bloqueo Administrativo',
    barberId: ''
  });

  const [editingBranchId, setEditingBranchId] = useState(null);
  const [newBranch, setNewBranch] = useState({
    name: '',
    phone: '',
    address: '',
    schedule: '',
    lat: -17.7732,
    lng: -63.1821,
  });
  const [locationSearch, setLocationSearch] = useState('');
  // Subida de foto en curso (servicio o sucursal): bloquea Guardar.
  const [imageUploading, setImageUploading] = useState(false);
  const [showLocationList, setShowLocationList] = useState(false);

  useEffect(() => {
    if (activeModal === 'add-reservation') {
      setClientSearch('');
      setShowClientList(false);
      setIsNewClient(false);
    }
  }, [activeModal]);

  useEffect(() => {
    if (activeModal === 'add-barber') {
      const cleanFirst = (newBarber?.firstName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanLast = (newBarber?.lastName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const generatedUser = (cleanFirst && cleanLast) ? `${cleanFirst}.${cleanLast}` : cleanFirst;
      
      let generatedPin = newBarber?.pin;
      if (!generatedPin) {
        generatedPin = Math.floor(1000 + Math.random() * 9000).toString();
      }

      setNewBarber(prev => ({
        ...prev,
        username: generatedUser,
        pin: generatedPin
      }));
    }
  }, [newBarber?.firstName, newBarber?.lastName, activeModal]);

  useEffect(() => {
    if (activeModal === 'add-branch') {
      if (!document.getElementById('leaflet-css-cdn')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css-cdn';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      if (!document.getElementById('leaflet-js-cdn')) {
        const script = document.createElement('script');
        script.id = 'leaflet-js-cdn';
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.async = true;
        script.onload = () => initLeafletMap();
        document.body.appendChild(script);
      } else {
        setTimeout(initLeafletMap, 150);
      }
    } else {
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch(e) {
          console.warn("Could not dismantle map gracefully: ", e);
        }
        mapRef.current = null;
      }
    }
  }, [activeModal, newBranch?.lat, newBranch?.lng]);

  const initLeafletMap = () => {
    if (!window.L || !mapContainerRef.current) return;

    if (mapRef.current) {
      try {
        mapRef.current.remove();
      } catch (e) {
        console.warn("Map clean failed: ", e);
      }
      mapRef.current = null;
    }

    const currentLat = newBranch?.lat || -17.7732;
    const currentLng = newBranch?.lng || -63.1821;

    try {
      const map = window.L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
        touchZoom: true
      }).setView([currentLat, currentLng], 14);
      
      mapRef.current = map;

      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      const customPinIcon = window.L.divIcon({
        html: `
        <span class="absolute inline-flex h-10 w-10 rounded-full bg-zinc-900/30 animate-ping"></span>
        <div class="w-8 h-8 rounded-full bg-[#18181B] border-2 border-white shadow-xl flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" class="w-4 h-4">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
            </div>
        `,
        className: 'custom-leaflet-marker',
        iconSize: [40, 40],
        iconAnchor: [20, 36]
      });

      const marker = window.L.marker([currentLat, currentLng], {
        draggable: true,
        icon: customPinIcon
      }).addTo(map);

      markerRef.current = marker;

      marker.on('dragend', () => {
        const position = marker.getLatLng();
        updateCoordsAndAddress(position.lat, position.lng);
      });

      map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        marker.setLatLng([lat, lng]);
        updateCoordsAndAddress(lat, lng);
      });

    } catch (err) {
      console.error("Leaflet initiation error:", err);
    }
  };

  const updateCoordsAndAddress = (lat, lng) => {
    const matchedPreset = GEOLOCATIONS_DB.find(loc => {
      const distance = Math.sqrt(Math.pow(loc.lat - lat, 2) + Math.pow(loc.lng - lng, 2));
      return distance < 0.003;
    });

    let resolvedStr = "";
    if (matchedPreset) {
      resolvedStr = matchedPreset.address;
    } else {
      resolvedStr = `Calle Adyacente, Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}, Bolivia`;
    }

    setLocationSearch(resolvedStr);
    setNewBranch(prev => ({
      ...prev,
      address: resolvedStr,
      lat: lat,
      lng: lng
    }));
  };

  const handleRegeneratePin = () => {
    const randomPin = Math.floor(1000 + Math.random() * 9000).toString();
    setNewBarber(prev => ({ ...prev, pin: randomPin }));
  };

  const timeToMin = (t) => {
    if (!t || typeof t !== 'string') return 0;
    const parts = t.split(':');
    const h = Number(parts[0] || 0);
    const m = Number(parts[1] || 0);
    return h * 60 + m;
  };

  const minToTime = (min) => {
    const h = Math.floor(min / 60).toString().padStart(2, '0');
    const m = (min % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  /**
   * Calcula la duración de una reservación con múltiples fallbacks.
   * Prioridad: res.duration > serviceObj.duration > 30 min default
   * También resuelve el problema de IDs inconsistentes buscando por serviceName.
   */
  const getReservationDuration = (res, allServices) => {
    // 1. Si la reservación tiene duration guardada, usarla
    if (res?.duration && Number(res.duration) > 0) {
      return Number(res.duration);
    }

    // 2. Buscar el servicio por serviceId
    const serviceObj = allServices?.find(s => s?.id === res?.serviceId);

    // 3. Si encontramos el servicio por ID, usar su duración
    if (serviceObj?.duration && Number(serviceObj.duration) > 0) {
      return Number(serviceObj.duration);
    }

    // 4. Fallback: buscar por serviceName si el serviceId no coincide
    const serviceName = res?.serviceName || res?.service;
    if (serviceName && allServices?.length > 0) {
      const serviceByName = allServices.find(s => s?.name === serviceName);
      if (serviceByName?.duration && Number(serviceByName.duration) > 0) {
        return Number(serviceByName.duration);
      }
    }

    // 5. Default: 30 minutos
    return 30;
  };

  const parseDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return new Date();
    const parts = dateStr.split('-');
    const y = Number(parts[0] || 2026);
    const m = Number(parts[1] || 5);
    const d = Number(parts[2] || 25);
    return new Date(y, m - 1, d);
  };

  const formatDate = (dateObj) => {
    if (!dateObj) return '2026-05-25';
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const isTuesday = useMemo(() => {
    try {
      const d = parseDate(selectedDate);
      return d.getDay() === 2;
    } catch(e) {
      return false;
    }
  }, [selectedDate]);

  const detectPhoneCountry = (phoneNum) => {
    const phone = phoneNum ? phoneNum.toString().trim() : '';
    if (!phone) return null;

    const countries = [
      { code: '+591', country: 'Bolivia', flag: '🇧🇴' },
      { code: '+55', country: 'Brasil', flag: '🇧🇷' },
      { code: '+54', country: 'Argentina', flag: '🇦🇷' },
      { code: '+1', country: 'USA', flag: '🇺🇸' },
      { code: '+34', country: 'España', flag: '🇪🇸' },
      { code: '+56', country: 'Chile', flag: '🇨🇱' },
      { code: '+57', country: 'Colombia', flag: '🇨🇴' },
      { code: '+51', country: 'Perú', flag: '🇵🇪' },
      { code: '+52', country: 'México', flag: '🇲🇽' }
    ];

    if (phone.startsWith('+')) {
      const sorted = [...countries].sort((a, b) => b.code.length - a.code.length);
      for (const c of sorted) {
        if (phone.startsWith(c.code)) {
          return { ...c, isInternational: true };
        }
      }
    } else {
      if (/^[367]/.test(phone)) {
        return { code: '+591', country: 'Bolivia', flag: '🇧🇴', isInternational: false };
      }
    }
    return null;
  };

  const detectedCountry = useMemo(() => {
    return detectPhoneCountry(newReservation?.phone);
  }, [newReservation?.phone]);

  const detectedBranchCountry = useMemo(() => {
    return detectPhoneCountry(newBranch?.phone);
  }, [newBranch?.phone]);

  const [currentTimeMinutes, setCurrentTimeMinutes] = useState(0);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      setCurrentTimeMinutes(minutes);
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  /* ==========================================
     CONSULTAS DE citas / horariosBloqueados
     El selector Día/Semana/Mes/Año define el período. Solo se lee lo que
     la pestaña activa necesita:
       - Dashboard, Agenda, Comisiones y Analítica comparten UN listener con
         el período exacto (sin período anterior).
       - Dashboard además: suma de ventas del período anterior (agregación),
         próxima cita y actividad reciente (independientes del selector).
       - Agenda en vista Año: solo contadores por mes (count), sin descargar docs.
       - Otras pestañas: sin listener de citas (solo un contador liviano
         de pendientes para el badge del menú).
     ========================================== */
  const CITAS_TABS = ['dashboard', 'agenda', 'commissions', 'reports'];
  const isCitasTab = CITAS_TABS.includes(activeTab);
  const periodRange = useMemo(() => getPeriodRange(selectedDate, agendaView), [selectedDate, agendaView]);
  const periodStart = periodRange.start;
  const periodEnd = periodRange.end;
  const selectedYear = String(selectedDate).slice(0, 4);

  const [yearMonthCounts, setYearMonthCounts] = useState(null);
  const [yearCountsFailed, setYearCountsFailed] = useState(false);
  const [citasWriteTick, setCitasWriteTick] = useState(0);
  const bumpCitasTick = () => setCitasWriteTick(t => t + 1);

  const agendaYearCountsMode = activeTab === 'agenda' && agendaView === 'año' && !yearCountsFailed;
  const periodDocsActive = isCitasTab && !agendaYearCountsMode;

  // 1) Citas del período seleccionado (listener compartido).
  useEffect(() => {
    if (!negocioId || !selectedBranch || !periodDocsActive) return;
    const q = query(
      collection(db, 'negocios', negocioId, 'citas'),
      where('branch', '==', selectedBranch),
      where('date', '>=', periodStart),
      where('date', '<=', periodEnd)
    );
    const unsub = onSnapshot(
      q,
      (snap) => setReservations(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.error('[citas del período] error de consulta:', err)
    );
    return () => unsub();
  }, [negocioId, selectedBranch, periodDocsActive, periodStart, periodEnd]);

  // 2) Bloqueos: solo se muestran en la Agenda vista Día, y solo de ese día.
  const blockoutsActive = activeTab === 'agenda' && agendaView === 'dia';
  useEffect(() => {
    if (!negocioId || !blockoutsActive) return;
    const q = query(
      collection(db, 'negocios', negocioId, 'horariosBloqueados'),
      where('date', '==', selectedDate)
    );
    const unsub = onSnapshot(
      q,
      (snap) => setBlockouts(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.error('[horariosBloqueados] error de consulta:', err)
    );
    return () => unsub();
  }, [negocioId, blockoutsActive, selectedDate]);

  // 3) Badge de pendientes del menú: cuando NO hay listener del período, contador liviano
  //    (todas las condiciones son de igualdad: no requiere índice compuesto).
  const [pendingBadgeDocsCount, setPendingBadgeDocsCount] = useState(0);
  useEffect(() => {
    if (!negocioId || !selectedBranch || periodDocsActive) return;
    const q = query(
      collection(db, 'negocios', negocioId, 'citas'),
      where('branch', '==', selectedBranch),
      where('date', '==', selectedDate),
      where('status', '==', 'pending')
    );
    const unsub = onSnapshot(
      q,
      (snap) => setPendingBadgeDocsCount(snap.size),
      (err) => console.error('[badge pendientes] error de consulta:', err)
    );
    return () => unsub();
  }, [negocioId, selectedBranch, selectedDate, periodDocsActive]);

  // 4) Dashboard: ventas del período anterior (solo la suma, no los documentos).
  const [prevRevenue, setPrevRevenue] = useState(null);
  const prevRange = useMemo(() => getPreviousPeriodRange(selectedDate, agendaView), [selectedDate, agendaView]);
  const prevStart = prevRange.start;
  const prevEnd = prevRange.end;
  useEffect(() => {
    if (!negocioId || !selectedBranch || activeTab !== 'dashboard') return;
    let cancelled = false;
    const citasRef = collection(db, 'negocios', negocioId, 'citas');
    (async () => {
      try {
        const q = query(
          citasRef,
          where('branch', '==', selectedBranch),
          where('status', '==', 'completed'),
          where('date', '>=', prevStart),
          where('date', '<=', prevEnd)
        );
        const snap = await getAggregateFromServer(q, { total: sum('price') });
        if (!cancelled) setPrevRevenue(Number(snap.data().total) || 0);
      } catch (err) {
        // Sin el índice (branch, status, date) la agregación falla: se lee el período con el
        // índice (branch, date) para que la comparación siga funcionando.
        console.warn('[Dashboard] agregación de ventas no disponible, usando lectura de documentos:', err?.message || err);
        try {
          const snap = await getDocs(query(
            citasRef,
            where('branch', '==', selectedBranch),
            where('date', '>=', prevStart),
            where('date', '<=', prevEnd)
          ));
          const total = snap.docs
            .map(d => d.data())
            .filter(r => r?.status === 'completed')
            .reduce((acc, r) => acc + Number(r?.price || 0), 0);
          if (!cancelled) setPrevRevenue(total);
        } catch (err2) {
          console.error('[Dashboard] no se pudo calcular el período anterior:', err2);
          if (!cancelled) setPrevRevenue(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [negocioId, selectedBranch, activeTab, prevStart, prevEnd]);

  // 4b) Modo registros: cantidad de servicios registrados (sin anulados) del
  //     período anterior, para el "vs anterior" de la tarjeta. Mismo esquema que
  //     las ventas: conteo en el servidor y, si falta el índice, lectura del período.
  const [prevRegistrosCount, setPrevRegistrosCount] = useState(null);
  useEffect(() => {
    if (!negocioId || !selectedBranch || activeTab !== 'dashboard' || !registrosMode) return;
    let cancelled = false;
    const citasRef = collection(db, 'negocios', negocioId, 'citas');
    (async () => {
      try {
        const snap = await getCountFromServer(query(
          citasRef,
          where('branch', '==', selectedBranch),
          where('origin', '==', 'registro'),
          where('status', '==', 'completed'),
          where('date', '>=', prevStart),
          where('date', '<=', prevEnd)
        ));
        if (!cancelled) setPrevRegistrosCount(snap.data().count);
      } catch (err) {
        console.warn('[Dashboard] conteo de registros no disponible, usando lectura de documentos:', err?.message || err);
        try {
          const snap = await getDocs(query(
            citasRef,
            where('branch', '==', selectedBranch),
            where('date', '>=', prevStart),
            where('date', '<=', prevEnd)
          ));
          const n = snap.docs.map(d => d.data()).filter(r => isRegistro(r) && r?.status !== 'cancelled').length;
          if (!cancelled) setPrevRegistrosCount(n);
        } catch (err2) {
          console.error('[Dashboard] no se pudo contar los registros del período anterior:', err2);
          if (!cancelled) setPrevRegistrosCount(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [negocioId, selectedBranch, activeTab, prevStart, prevEnd, registrosMode]);

  // 5) Dashboard: "Próxima cita" (independiente del selector). Una sola cita: la primera
  //    activa (pendiente / confirmada / en atención) desde ahora, ordenada por fecha y hora.
  const getNowCursor = () => {
    const n = new Date();
    return { date: formatYMD(n), time: `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}` };
  };
  const [nextCursor, setNextCursor] = useState(getNowCursor);
  const [nextCita, setNextCita] = useState(null);
  useEffect(() => {
    if (!negocioId || !selectedBranch || activeTab !== 'dashboard') return;
    const q = query(
      collection(db, 'negocios', negocioId, 'citas'),
      where('branch', '==', selectedBranch),
      where('status', 'in', ['pending', 'confirmed', 'in-process']),
      orderBy('date', 'asc'),
      orderBy('time', 'asc'),
      startAt(nextCursor.date, nextCursor.time),
      limit(1)
    );
    const unsub = onSnapshot(
      q,
      (snap) => setNextCita(snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null),
      (err) => { console.error('[próxima cita] error de consulta:', err); setNextCita(null); }
    );
    return () => unsub();
  }, [negocioId, selectedBranch, activeTab, nextCursor.date, nextCursor.time]);

  // Cuando la próxima cita ya pasó, se mueve el cursor a "ahora" y la consulta trae la siguiente.
  useEffect(() => {
    if (!nextCita) return;
    const now = getNowCursor();
    const isPast = (nextCita.date || '') < now.date || ((nextCita.date || '') === now.date && (nextCita.time || '') < now.time);
    if (isPast) setNextCursor(now);
  }, [nextCita, currentTimeMinutes]);

  // 6) Dashboard: "Actividad reciente" (independiente del selector). Últimas 6 por updatedAt.
  const [recentActivityDocs, setRecentActivityDocs] = useState([]);
  useEffect(() => {
    if (!negocioId || !selectedBranch || activeTab !== 'dashboard') return;
    const q = query(
      collection(db, 'negocios', negocioId, 'citas'),
      where('branch', '==', selectedBranch),
      orderBy('updatedAt', 'desc'),
      limit(6)
    );
    const unsub = onSnapshot(
      q,
      (snap) => setRecentActivityDocs(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => { console.error('[actividad reciente] error de consulta:', err); setRecentActivityDocs([]); }
    );
    return () => unsub();
  }, [negocioId, selectedBranch, activeTab]);

  // 7) Agenda vista Año: solo el contador de reservas por mes (12 count, sin descargar documentos).
  const yearCountExcludesRegistros = canUseCapability('registroServicios');
  useEffect(() => {
    if (!negocioId || !selectedBranch || !agendaYearCountsMode) return;
    let cancelled = false;
    const citasRef = collection(db, 'negocios', negocioId, 'citas');
    const monthQuery = (mm, ...extra) => query(
      citasRef,
      where('branch', '==', selectedBranch),
      ...extra,
      where('date', '>=', `${selectedYear}-${mm}-01`),
      where('date', '<=', `${selectedYear}-${mm}-31`)
    );
    Promise.all(Array.from({ length: 12 }, async (_, i) => {
      const mm = String(i + 1).padStart(2, '0');
      const total = getCountFromServer(monthQuery(mm));
      if (!yearCountExcludesRegistros) return (await total).data().count;
      // Nexus Control: los registros de servicio no son citas de la agenda; se
      // cuentan aparte y se restan (índice citas: branch + origin + date). Si
      // falta el índice, cae al listener de abajo, que ya los filtra.
      const [t, reg] = await Promise.all([total, getCountFromServer(monthQuery(mm, where('origin', '==', 'registro')))]);
      return Math.max(0, t.data().count - reg.data().count);
    }))
      .then((counts) => { if (!cancelled) setYearMonthCounts(counts); })
      .catch((err) => {
        // Si el conteo falla (p. ej. falta el índice), la vista Año vuelve a usar el listener del período.
        console.warn('[Agenda año] conteo no disponible, usando documentos:', err?.message || err);
        if (!cancelled) setYearCountsFailed(true);
      });
    return () => { cancelled = true; };
  }, [negocioId, selectedBranch, agendaYearCountsMode, selectedYear, citasWriteTick, yearCountExcludesRegistros]);

  // Busca una cita en los conjuntos cargados.
  const findCitaById = (id) =>
    reservations.find(r => r.id === id) ||
    (nextCita && nextCita.id === id ? nextCita : null) ||
    recentActivityDocs.find(r => r.id === id);

  const handlePrevPeriod = () => {
    const date = parseDate(selectedDate);
    if (agendaView === 'dia') {
      date.setDate(date.getDate() - 1);
    } else if (agendaView === 'semana') {
      date.setDate(date.getDate() - 7);
    } else if (agendaView === 'mes') {
      date.setMonth(date.getMonth() - 1);
    } else if (agendaView === 'año') {
      date.setFullYear(date.getFullYear() - 1);
    }
    setSelectedDate(formatDate(date));
  };

  const handleNextPeriod = () => {
    const date = parseDate(selectedDate);
    if (agendaView === 'dia') {
      date.setDate(date.getDate() + 1);
    } else if (agendaView === 'semana') {
      date.setDate(date.getDate() + 7);
    } else if (agendaView === 'mes') {
      date.setMonth(date.getMonth() + 1);
    } else if (agendaView === 'año') {
      date.setFullYear(date.getFullYear() + 1);
    }
    setSelectedDate(formatDate(date));
  };

  const isDateInSelectedRange = (dateStr) => {
    if (!dateStr) return false;
    try {
      const date = parseDate(dateStr);
      const refDate = parseDate(selectedDate);

      if (agendaView === 'dia') {
        return dateStr === selectedDate;
      }
      if (agendaView === 'semana') {
        const day = refDate.getDay();
        const diff = refDate.getDate() - day + (day === 0 ? -6 : 1);
        const startOfWeek = new Date(refDate.setDate(diff));
        startOfWeek.setHours(0,0,0,0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23,59,59,999);

        const checkDate = parseDate(dateStr);
        return checkDate >= startOfWeek && checkDate <= endOfWeek;
      }
      if (agendaView === 'mes') {
        return date.getFullYear() === refDate.getFullYear() && date.getMonth() === refDate.getMonth();
      }
      if (agendaView === 'año') {
        return date.getFullYear() === refDate.getFullYear();
      }
    } catch(e) {
      return false;
    }
    return false;
  };

  const getFormattedDateLabel = (dateStr, view) => {
    if (!dateStr) return '';
    try {
      const date = parseDate(dateStr);
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const monthNamesFull = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      
      if (view === 'dia') {
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        return `${dayNames[date.getDay()]}, ${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
      }
      if (view === 'semana') {
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const startOfWeek = new Date(date.setDate(diff));
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        const startDay = startOfWeek.getDate();
        const startMonth = monthNames[startOfWeek.getMonth()];
        const endDay = endOfWeek.getDate();
        const endMonth = monthNames[endOfWeek.getMonth()];
        const year = endOfWeek.getFullYear();

        if (startOfWeek.getFullYear() !== endOfWeek.getFullYear()) {
          return `${startDay} ${startMonth} ${startOfWeek.getFullYear()} – ${endDay} ${endMonth} ${year}`;
        }
        if (startMonth !== endMonth) return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${year}`;
        return `${startDay}–${endDay} ${endMonth} ${year}`;
      }
      if (view === 'mes') {
        return `${monthNamesFull[date.getMonth()]} ${date.getFullYear()}`;
      }
      if (view === 'año') {
        return `${date.getFullYear()}`;
      }
    } catch(e) {
      return dateStr;
    }
    return '';
  };

  const getWeekDates = (dateStr) => {
    if (!dateStr) return [];
    try {
      const date = parseDate(dateStr);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(date.setDate(diff));

      const days = [];
      const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      for (let i = 0; i < 7; i++) {
        const current = new Date(monday);
        current.setDate(monday.getDate() + i);
        days.push({
          dayName: dayNames[i],
          dayNum: current.getDate(),
          dateStr: formatDate(current)
        });
      }
      return days;
    } catch(e) {
      return [];
    }
  };

  const getMonthDays = (dateStr) => {
    if (!dateStr) return [];
    try {
      const date = parseDate(dateStr);
      const year = date.getFullYear();
      const month = date.getMonth();

      const firstDayIndex = new Date(year, month, 1).getDay();
      const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

      const lastDay = new Date(year, month + 1, 0).getDate();
      const days = [];

      for (let i = 0; i < startOffset; i++) {
        days.push({ isCurrentMonth: false });
      }

      for (let i = 1; i <= lastDay; i++) {
        const dayDate = new Date(year, month, i);
        days.push({
          isCurrentMonth: true,
          dayNum: i,
          dateStr: formatDate(dayDate)
        });
      }
      return days;
    } catch(e) {
      return [];
    }
  };

  const dayReservations = useMemo(() => {
    if (!Array.isArray(agendaBranchReservations)) return [];
    return agendaBranchReservations.filter(res => res?.date === selectedDate);
  }, [agendaBranchReservations, selectedDate]);

  // Badge de pendientes del menú: del listener del período si está activo; si no, del contador liviano.
  const pendingBadgeCount = periodDocsActive
    ? (dayReservations || []).filter(r => r?.status === 'pending').length
    : pendingBadgeDocsCount;

    // Citas del período SIN las canceladas (siguen guardadas): Dashboard,
  // gráfico y comisiones no las cuentan. Las canceladas van aparte.
  const rangeAllReservations = useMemo(() => {
    if (!Array.isArray(branchReservations)) return [];
    return branchReservations.filter(res => isDateInSelectedRange(res?.date));
  }, [branchReservations, selectedDate, agendaView]);
  const rangeReservations = useMemo(
    () => rangeAllReservations.filter(res => res?.status !== 'cancelled'),
    [rangeAllReservations]
  );
  const rangeCancelledCount = rangeAllReservations.length - rangeReservations.length;

  const filteredReservations = useMemo(() => {
    if (!Array.isArray(dayReservations)) return [];
    return dayReservations.filter(res => {
      // Las canceladas no se muestran en la agenda (siguen guardadas).
      if (res?.status === 'cancelled' && filterStatus !== 'cancelled') return false;
      const matchBarber = filterBarberId === 'all' || res?.professionalId === filterBarberId || res?.barberId === filterBarberId;
      const matchStatus = filterStatus === 'all' || res?.status === filterStatus;
      return matchBarber && matchStatus;
    });
  }, [dayReservations, filterBarberId, filterStatus]);

  // Cuenta cuántas reservas del día tiene cada profesional (para mostrar
  // debajo del nombre en la cabecera de la agenda). Se basa en dayReservations
  // (no en filteredReservations) para que el contador no cambie al filtrar por status.
  const barberDayCounts = useMemo(() => {
    const counts = {};
    (dayReservations || []).forEach(res => {
      if (res?.status === 'cancelled') return;
      const key = res?.professionalId || res?.barberId || 'pending';
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [dayReservations]);

  const rangeMetrics = useMemo(() => {
    const completed = (rangeReservations || []).filter(r => r?.status === 'completed');
    const totalRevenue = completed.reduce((sum, r) => sum + Number(r?.price || 0), 0);
    const servicesCount = completed.length;
    const activeBarbersCount = (branchBarbers || []).filter(b => b?.active && b?.attendance?.in).length;

    let pendingCommissions = 0;
    completed.forEach(res => {
      const barber = (branchBarbers || []).find(b => b?.id === res?.professionalId || b?.id === res?.barberId);
      if (barber) {
        const result = calculateCommissionForCita(res, barber, services);
        pendingCommissions += result.totalAmount;
      }
    });

    return {
      totalRevenue,
      servicesCount,
      activeBarbersCount,
      pendingCommissions,
      clientsServed: new Set(completed.map(r => r?.clientId).filter(Boolean)).size
    };
  }, [rangeReservations, branchBarbers, services]);

  /* ==========================================
     HELPERS Y MÉTRICAS PARA EL DASHBOARD OPERATIVO
     (no confundir con isDateInSelectedRange, que sigue
     usando el selectedDate actual vía closure)
     ========================================== */
  const isDateInRangeFor = (dateStr, refDateStr, view) => {
    if (!dateStr || !refDateStr) return false;
    try {
      const date = parseDate(dateStr);
      const refDate = parseDate(refDateStr);

      if (view === 'dia') return dateStr === refDateStr;
      if (view === 'semana') {
        const day = refDate.getDay();
        const diff = refDate.getDate() - day + (day === 0 ? -6 : 1);
        const startOfWeek = new Date(refDate);
        startOfWeek.setDate(diff);
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);
        return date >= startOfWeek && date <= endOfWeek;
      }
      if (view === 'mes') {
        return date.getFullYear() === refDate.getFullYear() && date.getMonth() === refDate.getMonth();
      }
      if (view === 'año') {
        return date.getFullYear() === refDate.getFullYear();
      }
    } catch (e) {
      return false;
    }
    return false;
  };

  const getPreviousPeriodRefDate = (refDateStr, view) => {
    const date = parseDate(refDateStr);
    if (view === 'dia') date.setDate(date.getDate() - 1);
    else if (view === 'semana') date.setDate(date.getDate() - 7);
    else if (view === 'mes') date.setMonth(date.getMonth() - 1);
    else if (view === 'año') date.setFullYear(date.getFullYear() - 1);
    return formatDate(date);
  };

  // Comparación real "vs anterior": suma de ventas del período equivalente
  // inmediatamente anterior, tomada de branchReservations (no de rangeReservations,
  // que ya está acotado al período actual).
  const salesComparison = useMemo(() => {
    const currentRevenue = rangeMetrics?.totalRevenue || 0;

    if (!prevRevenue) {
      return { comparable: false, percent: 0 };
    }
    const percent = ((currentRevenue - prevRevenue) / prevRevenue) * 100;
    return { comparable: true, percent };
  }, [prevRevenue, rangeMetrics]);

  // Modo registros: servicios registrados del período (sin anulados) y su "vs anterior".
  const rangeRegistrosCount = useMemo(
    () => (rangeReservations || []).filter(isRegistro).length,
    [rangeReservations]
  );
  const registrosComparison = useMemo(() => {
    if (!prevRegistrosCount) return { comparable: false, percent: 0 };
    return { comparable: true, percent: ((rangeRegistrosCount - prevRegistrosCount) / prevRegistrosCount) * 100 };
  }, [prevRegistrosCount, rangeRegistrosCount]);

  // Horario real de atención para una fecha dada: se deriva de la disponibilidad
  // ('Disponible') que cada barbero de la sucursal ya tiene configurada por día
  // en su ficha (barber.availability). No existe todavía un horario general de
  // negocio/sucursal en Configuración (esa sección está marcada "Próximamente"),
  // así que esta es la única fuente real disponible para saber cuándo atiende el negocio.
  const DASH_DAY_NAMES_MON_FIRST = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  const getOpenHoursForDate = (dateStr) => {
    const date = parseDate(dateStr);
    const dayName = DASH_DAY_NAMES_MON_FIRST[(date.getDay() + 6) % 7];
    const slots = (branchBarbers || [])
      .flatMap(b => (b?.availability || []).filter(a => a?.day === dayName && a?.status === 'Disponible'));
    if (slots.length === 0) return null;
    const startMin = Math.min(...slots.map(a => timeToMin(a?.start || '00:00')));
    const endMin = Math.max(...slots.map(a => timeToMin(a?.end || '00:00')));
    return { startMin, endMin };
  };

  const isBranchOpenOnDayName = (dayName) => {
    return (branchBarbers || []).some(b => (b?.availability || []).some(a => a?.day === dayName && a?.status === 'Disponible'));
  };

  // Datos reales para "Estimación Gráfica de Productividad". El eje X cambia
  // según agendaView; ventas = suma de price de citas 'completed', citas = total
  // de citas en ese bucket (mismo criterio que las tarjetas superiores).
  const dashboardChartData = useMemo(() => {
    const MONTH_NAMES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const MONTH_NAMES_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const DAY_NAMES_SHORT = { Lunes: 'Lun', Martes: 'Mar', Miércoles: 'Mié', Jueves: 'Jue', Viernes: 'Vie', Sábado: 'Sáb', Domingo: 'Dom' };

    const bucketFrom = (list) => {
      const completed = list.filter(r => r?.status === 'completed');
      return {
        ventas: completed.reduce((sum, r) => sum + Number(r?.price || 0), 0),
        citas: list.length
      };
    };

    if (agendaView === 'dia') {
      const openHours = getOpenHoursForDate(selectedDate);
      if (!openHours) return [];
      const startH = Math.floor(openHours.startMin / 60);
      const endH = Math.ceil(openHours.endMin / 60);
      const hours = [];
      for (let h = startH; h <= endH; h++) hours.push(h);
      return hours.map(h => {
        const inHour = (rangeReservations || []).filter(r => Math.floor(timeToMin(r?.time || '00:00') / 60) === h);
        return { label: `${String(h).padStart(2, '0')}:00`, ...bucketFrom(inHour) };
      });
    }

    if (agendaView === 'semana') {
      const weekDates = getWeekDates(selectedDate);
      let openDates = weekDates.filter(d => isBranchOpenOnDayName(d.dayName));
      if (openDates.length === 0) openDates = weekDates; // sin datos de disponibilidad: no filtrar
      return openDates.map(d => {
        const dayRes = (rangeReservations || []).filter(r => r?.date === d.dateStr);
        return { label: DAY_NAMES_SHORT[d.dayName] || d.dayName, fullLabel: d.dayName, ...bucketFrom(dayRes) };
      });
    }

    if (agendaView === 'mes') {
      const monthDays = getMonthDays(selectedDate).filter(d => d.isCurrentMonth);
      return monthDays.map(d => {
        const dayRes = (rangeReservations || []).filter(r => r?.date === d.dateStr);
        return { label: String(d.dayNum), ...bucketFrom(dayRes) };
      });
    }

    // año
    const year = parseDate(selectedDate).getFullYear();
    return MONTH_NAMES_SHORT.map((name, idx) => {
      const monthRes = (rangeReservations || []).filter(r => {
        const d = parseDate(r?.date);
        return d.getFullYear() === year && d.getMonth() === idx;
      });
      return { label: name, fullLabel: MONTH_NAMES_FULL[idx], ...bucketFrom(monthRes) };
    });
  }, [agendaView, selectedDate, rangeReservations, branchBarbers]);

  // Eje Y del gráfico en pasos redondos (2 en 2 hasta 10, luego 5 en 5),
  // basado en el máximo real de citas del período mostrado.
  const chartYAxisConfig = useMemo(() => {
    const maxCitas = Math.max(0, ...dashboardChartData.map(d => d.citas || 0));
    let step = 2;
    let niceMax = Math.ceil(maxCitas / 2) * 2;
    if (maxCitas > 10) {
      step = 5;
      niceMax = Math.ceil(maxCitas / 5) * 5;
    }
    if (niceMax === 0) niceMax = step;
    const ticks = [];
    for (let t = 0; t <= niceMax; t += step) ticks.push(t);
    return { max: niceMax, ticks };
  }, [dashboardChartData]);

  // "Próxima cita": operativa y en tiempo real, independiente del selector de período.
  // Se recalcula cada minuto vía currentTimeMinutes (ya existente para otros usos).
  const nextAppointment = nextCita;

  // "Pagos del período": sí respeta el selector Día/Semana/Mes/Año.
  // Se agrupa por paymentMethod tal cual existe en las citas reales (Efectivo/Tarjeta/Transferencia).
  const paymentBreakdown = useMemo(() => {
    const completed = (rangeReservations || []).filter(r => r?.status === 'completed');
    const totals = {};
    completed.forEach(r => {
      const method = r?.paymentMethod || 'Sin especificar';
      totals[method] = (totals[method] || 0) + Number(r?.price || 0);
    });
    const total = Object.values(totals).reduce((sum, v) => sum + v, 0);
    return { totals, total };
  }, [rangeReservations]);

  const paymentsLabel = {
    dia: 'Pagos de Hoy',
    semana: 'Pagos de la Semana',
    mes: 'Pagos del Mes',
    año: 'Pagos del Año'
  }[agendaView] || 'Pagos del Período';

  // "Actividad reciente": operativa, independiente del selector. No existe una
  // colección de eventos/actividad en Firestore, así que se construye a partir
  // de createdAt/updatedAt + status de las citas reales (sin inventar eventos).
  const recentActivity = useMemo(() => {
    const cita = tl('appointment');
    const STATUS_ACTIVITY_LABELS = {
      completed: `${cita} ${g('appointment', 'completado', 'completada')}`,
      cancelled: `${cita} ${g('appointment', 'cancelado', 'cancelada')}`,
      'in-process': `${cita} en atención`,
      confirmed: `${cita} ${g('appointment', 'confirmado', 'confirmada')}`,
      pending: 'nueva reserva'
    };
    return (recentActivityDocs || [])
      .filter(r => r?.branch === selectedBranch)
      .map(r => {
        const isNew = !!r?.createdAt && r.createdAt === r.updatedAt;
        // Registros de servicio (Nexus Control): no son reservas.
        const label = isRegistro(r)
          ? (r?.status === 'cancelled' ? 'Registro anulado' : `${t('service')} registrado`)
          : isNew ? 'nueva reserva' : (STATUS_ACTIVITY_LABELS[r?.status] || `${cita} ${g('appointment', 'actualizado', 'actualizada')}`);
        return { id: r?.id, clientName: r?.clientName || t('client'), label, ts: r?.updatedAt || r?.createdAt };
      })
      .filter(ev => !!ev.ts)
      .sort((a, b) => new Date(b.ts) - new Date(a.ts))
      .slice(0, 6);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentActivityDocs, selectedBranch, businessProfile]);

  const formatActivityTime = (ts) => {
    try {
      return new Date(ts).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (e) {
      return '--:--';
    }
  };

  const barberCommissionsList = useMemo(() => {
    if (!Array.isArray(branchBarbers)) return [];
    return branchBarbers.map(barb => {
      const barberRangeCompleted = (rangeReservations || []).filter(r => (r?.professionalId === barb?.id || r?.barberId === barb?.id) && r?.status === 'completed');

      let comisionTotal = 0;
      let comisionPagada = 0;

      const detalle = barberRangeCompleted.map(res => {
        const result = calculateCommissionForCita(res, barb, services);
        comisionTotal += result.totalAmount;
        if (res?.commissionPaid) comisionPagada += result.totalAmount;
        return {
          id: res?.id,
          serviceName: res?.serviceName || res?.service || t('service'),
          date: res?.date,
          amount: result.totalAmount,
          isConfigured: result.allConfigured,
          paid: !!res?.commissionPaid,
        };
      });

      return {
        ...barb,
        serviciosCount: barberRangeCompleted.length,
        comisionTotal,
        comisionPagada,
        comisionPendiente: comisionTotal - comisionPagada,
        detalle,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchBarbers, rangeReservations, services, businessProfile]);

  // Pago de comisiones: lo registra el backend (método de pago, salida de caja
  // si es efectivo, sin pagos dobles). Antes se marcaba commissionPaid desde aquí.
  const [payingBarber, setPayingBarber] = useState(null);
  const handleLiquidarComisiones = (barb) => {
    if (!(barb?.comisionPendiente > 0)) {
      triggerToast('No hay comisiones pendientes', 'error');
      return;
    }
    setPayingBarber(barb);
  };

  const [commissionDetailBarberId, setCommissionDetailBarberId] = useState(null);

  const attendanceSummaryList = useMemo(() => {
    if (!Array.isArray(branchBarbers)) return [];
    return branchBarbers.map(barb => {
      const totalDays = agendaView === 'dia' ? 1 : agendaView === 'semana' ? 6 : agendaView === 'mes' ? 22 : 240;
      const factor = barb?.id === 'b1' ? 0.92 : barb?.id === 'b2' ? 0.95 : barb?.id === 'b3' ? 0.85 : 0.70;
      const attended = Math.round(totalDays * factor * (barb?.active ? 1 : 0.4));
      const delayed = Math.round(attended * 0.12);
      const ontime = attended - delayed;
      
      return {
        ...barb,
        attended,
        delayed,
        ontime,
        absent: totalDays - attended
      };
    });
  }, [branchBarbers, selectedDate, agendaView]);

  

  const formatHourLabel = (h) => {
    const hh = Math.floor(h);
    const mm = h % 1 === 0 ? '00' : '30';
    return `${hh.toString().padStart(2, '0')}:${mm}`;
  };

  const DAY_NAMES_MON_FIRST = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  const getBarberDayAvailability = (barber, dateStr) => {
    if (!dateStr) return null;
    const date = parseDate(dateStr);
    const dayName = DAY_NAMES_MON_FIRST[(date.getDay() + 6) % 7];
    return (barber?.availability || []).find(a => a?.day === dayName) || null;
  };

  const isHourWithinAvailability = (dayAvailability, hour) => {
    if (!dayAvailability || dayAvailability.status !== 'Disponible') return false;
    const [startH] = (dayAvailability.start || '00:00').split(':').map(Number);
    const [endH] = (dayAvailability.end || '00:00').split(':').map(Number);
    return hour >= startH && hour < endH;
  };

  const formatBs = (val) => {
    return `${Number(val || 0).toLocaleString('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Bs`;
  };

  const checkConflicts = async (ignoreId, barberId, date, startTime, endTime, isBlockout = false, isClientRole = false) => {
    if (!barberId || barberId === 'pending') return { isValid: true };

    const startVal = timeToMin(startTime);
    const endVal = timeToMin(endTime);

    if (endVal <= startVal) {
      return { isValid: false, message: 'La hora de fin debe ser posterior a la hora de inicio.' };
    }

    if (isClientRole) {
      const todayStr = formatDate(new Date());
      if (date < todayStr) {
        return { isValid: false, message: `No se permiten ${tl('appointments')} en fechas pasadas para ${tl('clients')}.` };
      }
      if (date === todayStr) {
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
        if (startVal < nowMin + 30) {
          return { isValid: false, message: `${g('appointment', 'Los', 'Las')} ${tl('appointments')} en línea deben agendarse con al menos 30 minutos de anticipación.` };
        }
      }
    }

    // Se consulta solo esa fecha (todas las sucursales, para no perder choques de un
    // profesional con citas etiquetadas en otra sucursal).
    let citasDeLaFecha = [];
    let bloqueosDeLaFecha = [];
    try {
      const [snapC, snapB] = await Promise.all([
        getDocs(query(collection(db, 'negocios', negocioId, 'citas'), where('date', '==', date))),
        getDocs(query(collection(db, 'negocios', negocioId, 'horariosBloqueados'), where('date', '==', date)))
      ]);
      citasDeLaFecha = snapC.docs.map(d => ({ id: d.id, ...d.data() }));
      bloqueosDeLaFecha = snapB.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      return { isValid: false, message: 'No se pudo verificar la disponibilidad: ' + err.message };
    }

    const activeRes = citasDeLaFecha.filter(r => 
      r?.id !== ignoreId && 
      r?.date === date && 
      (r?.professionalId === barberId || r?.barberId === barberId) && 
      r?.status !== 'cancelled' &&
      !isRegistro(r) // registros de servicio: sin horario, no chocan
    );

    for (const res of activeRes) {
      const resDuration = getReservationDuration(res, services);
      const resStart = timeToMin(res?.time);
      const resEnd = resStart + resDuration;

      if (startVal < resEnd && endVal > resStart) {
        return { isValid: false, message: `El horario interfiere con una reserva existente de ${res?.clientName} (${res?.time} - ${minToTime(resEnd)})` };
      }
    }

    const activeBl = bloqueosDeLaFecha.filter(b => 
      b?.id !== ignoreId && 
      b?.date === date && 
      b?.barberId === barberId
    );

    for (const bl of activeBl) {
      const blStart = timeToMin(bl?.startTime);
      const blEnd = timeToMin(bl?.endTime);

      if (startVal < blEnd && endVal > blStart) {
        return { isValid: false, message: `El horario coincide con un bloqueo administrativo (${bl?.startTime} - ${bl?.endTime})` };
      }
    }

    return { isValid: true };
  };

  // Fase 4/5: fuera del horario del negocio o del profesional se pide confirmar
  // "Agendar en sobrehorario". Devuelve true si está en horario o si se confirmó.
  const confirmOutsideHours = async ({ date, time, duration, professionalId }) => {
    const professional = professionalId && professionalId !== 'pending' ? barbers.find(b => b?.id === professionalId) : null;
    const res = checkWorkingHours({ date, time, duration, businessSchedule: businessSettings?.schedule, closedDays: businessSettings?.closedDays, branch: professional?.branch || selectedBranch || null, professional, terms: businessProfile });
    if (res.ok) return true;
    return confirmAction({
      title: res.closed ? 'Día cerrado' : 'Está fuera del horario',
      subject: res.message,
      message: `¿Quieres agendar ${g('appointment', 'este', 'esta')} ${tl('appointment')} igual, en sobrehorario?`,
      irreversible: false,
      tone: 'primary',
      confirmLabel: 'Agendar en sobrehorario',
      cancelLabel: 'Volver',
    });
  };

  const handleCreateReservation = async (e) => {
    if (e) e.preventDefault();
    const serviceObj = services.find(s => s.id === newReservation.serviceId);
    const duration = serviceObj ? serviceObj.duration : 30;
    const targetProfessionalId = newReservation.professionalId || newReservation.barberId || 'pending';
    const endTimeStr = minToTime(timeToMin(newReservation.time) + duration);

    const isClientRole = false;
    const check = await checkConflicts(null, targetProfessionalId, newReservation.date, newReservation.time, endTimeStr, false, isClientRole);
    
    if (!check.isValid) {
      triggerToast(check.message, 'error');
      return;
    }
    if (!(await confirmOutsideHours({ date: newReservation.date, time: newReservation.time, duration, professionalId: targetProfessionalId }))) return;

    const phoneId = (newReservation.phone || 'sin-telefono').replace(/[^0-9]/g, '') || 'sin-telefono';
    let clientObj = clients.find(c => c.name.toLowerCase() === newReservation.clientName.toLowerCase());
    if (!clientObj) {
      clientObj = {
        id: phoneId,
        name: newReservation.clientName,
        phone: newReservation.phone || 'N/A',
        visits: 1,
        totalSpent: 0,
        lastVisit: selectedDate,
        favoriteService: serviceObj?.name || 'N/A'
      };
    } else {
      clientObj = { ...clientObj, visits: (clientObj.visits || 0) + 1, lastVisit: selectedDate };
    }
    try {
      await setDoc(doc(db, 'negocios', negocioId, 'clientes', clientObj.id), clientObj, { merge: true });
    } catch (err) {
      triggerToast(`Error al guardar ${g('client', 'el', 'la')} ${tl('client')}: ` + err.message, 'error');
    }

    const finalPrice = (isTuesday && serviceObj?.promoPrice) ? serviceObj.promoPrice : (serviceObj?.price || 120);
    const currentBranchObj = branches.find(b => b.name === selectedBranch) || branches[0];

    /* MODELADO COMPLETO DEL DOCUMENTO DE RESERVA PARA FIRESTORE */
    const nowIso = new Date().toISOString();
    const reservationObj = {
      clientId: clientObj.id,
      clientName: clientObj.name,
      professionalId: targetProfessionalId,
      barberId: targetProfessionalId, // alias de compatibilidad
      serviceId: newReservation.serviceId,
      serviceName: serviceObj?.name || 'Servicio',
      price: finalPrice,
      time: newReservation.time,
      startTime: newReservation.time,
      endTime: endTimeStr,
      duration: Number(duration),
      date: newReservation.date,
      reservationDate: newReservation.date,
      status: 'confirmed',
      paymentMethod: newReservation.paymentMethod,
      bookedBy: newReservation.bookedBy,
      branch: targetProfessionalId !== 'pending' ? (barbers.find(b => b.id === targetProfessionalId)?.branch || selectedBranch) : selectedBranch,
      branchId: currentBranchObj?.id || 'br1',
      clientPhone: newReservation.phone || clientObj.phone || '',
      countryCode: detectedCountry ? detectedCountry.code : '+591',
      notes: newReservation.notes || '',
      createdAt: nowIso,
      updatedAt: nowIso
    };

    try {
      const docRef = await addDoc(collection(db, 'negocios', negocioId, 'citas'), reservationObj);
      bumpCitasTick();
      triggerToast(`¡${t('appointment')} ${g('appointment', 'agendado', 'agendada')} con éxito!`);
      notify(NotificationType.RESERVA_CREADA_ADMIN, negocioId, { citaId: docRef.id, clientName: reservationObj.clientName, time: reservationObj.time }, user?.uid, targetProfessionalId);
    } catch (err) {
      triggerToast(`Error al guardar ${g('appointment', 'el', 'la')} ${tl('appointment')}: ` + err.message, 'error');
      return;
    }

    setActiveModal(null);
    setNewReservation({ clientName: '', phone: '', barberId: 'pending', professionalId: 'pending', serviceId: '', time: '12:00', date: selectedDate, paymentMethod: 'Efectivo', bookedBy: 'admin', notes: '' });
  };
  
  const handleCreateReservationFromDraft = async (draft) => {
    // draft.services ya viene armado por el modal compartido (multi-servicio).
    // Fallback por si algún llamador viejo solo manda draft.serviceId.
    const draftServices = draft.services && draft.services.length > 0
      ? draft.services
      : (() => {
          const single = services.find(s => s.id === draft.serviceId);
          return single
            ? [{ serviceId: single.id, serviceName: single.name, price: single.price || 0, duration: single.duration || 30 }]
            : [];
        })();

        // Aplica la promo de martes a cada servicio individualmente, pero solo si
    // usa el precio base: el precio propio de un profesional tiene prioridad.
    const pricedServices = draftServices.map(s => {
      const fullService = services.find(sv => sv.id === s.serviceId);
      const usesBase = !s.priceSource || s.priceSource === 'base';
      if (!(isTuesday && usesBase && Number(fullService?.promoPrice) > 0)) return s;
      const promo = Number(fullService.promoPrice);
      return { ...s, price: promo, ...(s.priceSource ? { listPrice: promo, priceSource: 'promo' } : {}) };
    });

    const targetProfessionalId = draft.professionalId || 'pending';
    const branchForCita = targetProfessionalId !== 'pending'
      ? (barbers.find(b => b.id === targetProfessionalId)?.branch || selectedBranch)
      : selectedBranch;
    // Promociones (descuentos y combos) del día y la sucursal, sobre el precio del profesional.
    const conPromo = priceWithPromotions(pricedServices, activePromotions, { date: draft.date, branch: branchForCita, branches });
    const totalPrice = conPromo.price;
    const totalDuration = pricedServices.reduce((sum, s) => sum + Number(s.duration || 30), 0);

    const endTimeStr = minToTime(timeToMin(draft.time) + totalDuration);
    const check = await checkConflicts(null, targetProfessionalId, draft.date, draft.time, endTimeStr, false, false);
    if (!check.isValid) { triggerToast(check.message, 'error'); return; }
    if (!(await confirmOutsideHours({ date: draft.date, time: draft.time, duration: totalDuration, professionalId: targetProfessionalId }))) return;

    const phoneId = (draft.phone || 'sin-telefono').replace(/[^0-9]/g, '') || 'sin-telefono';
    let clientObj = clients.find(c => c.name.toLowerCase() === draft.clientName.toLowerCase());
    if (clientObj) {
      clientObj = { ...clientObj, visits: (clientObj.visits || 0) + 1, lastVisit: draft.date };
    } else {
      clientObj = {
        id: phoneId, name: draft.clientName, phone: draft.phone || 'N/A',
        visits: 1, totalSpent: 0, lastVisit: draft.date, favoriteService: pricedServices[0]?.serviceName || 'N/A'
      };
    }
    try { await setDoc(doc(db, 'negocios', negocioId, 'clientes', clientObj.id), clientObj, { merge: true }); }
    catch (err) { triggerToast(`Error al guardar ${g('client', 'el', 'la')} ${tl('client')}: ` + err.message, 'error'); }

    const currentBranchObj = branches.find(b => b.name === selectedBranch) || branches[0];

    const nowIso = new Date().toISOString();
    const reservationObj = {
      clientId: clientObj.id, clientName: clientObj.name,
      professionalId: targetProfessionalId, barberId: targetProfessionalId,
      services: conPromo.services,
      serviceId: pricedServices[0]?.serviceId || '',
      serviceName: pricedServices.map(s => s.serviceName).join(' + '),
      price: totalPrice, time: draft.time, startTime: draft.time,
      ...(conPromo.promo ? { promo: conPromo.promo } : {}),
      ...(targetProfessionalId === 'pending' ? { priceProvisional: true } : {}),
      endTime: endTimeStr, duration: Number(totalDuration),
      date: draft.date, reservationDate: draft.date, status: 'confirmed',
      paymentMethod: draft.paymentMethod, bookedBy: 'admin',
      branch: branchForCita,
      branchId: currentBranchObj?.id || 'br1',
      clientPhone: draft.phone || clientObj.phone || '',
      countryCode: detectPhoneCountry(draft.phone)?.code || '+591',
      notes: draft.notes || '', createdAt: nowIso, updatedAt: nowIso
    };

    try {
      const citaRef = await addDoc(collection(db, 'negocios', negocioId, 'citas'), reservationObj);
      bumpCitasTick();
      if (targetProfessionalId === 'pending') {
        // El backend asigna si hay UN solo candidato, o avisa solo a los candidatos.
        processPendingCita(negocioId, citaRef.id).then((r) => {
          if (!r) notify(NotificationType.RESERVA_CREADA_ADMIN, negocioId, { negocioId, clientName: reservationObj.clientName, time: reservationObj.time }, user?.uid, undefined, []);
        });
      } else {
        notify(NotificationType.RESERVA_CREADA_ADMIN, negocioId, { negocioId, clientName: reservationObj.clientName, time: reservationObj.time }, user?.uid, targetProfessionalId);
        // Ese profesional se ocupó: puede que una Pendiente ya tenga un único candidato.
        reevaluatePending(negocioId, reservationObj.date);
      }
    } catch (err) { triggerToast('Error al guardar: ' + err.message, 'error'); return; }

    setActiveModal(null);
  };

  // Candidatos para asignar manualmente una Pendiente: activos + hacen el servicio
  // + libres a esa hora (mismo cálculo que usa el backend). null si no es Pendiente.
  const pendingEditCandidates = useMemo(() => {
    if (!editingReservation || editingReservation._originalProfessionalId !== 'pending') return null;
    return getPendingCandidates({
      professionals: barbers.filter(b => b?.active),
      serviceIds: getCitaServiceIds(editingReservation),
      fecha: editingReservation.date,
      time: editingReservation.time,
      duration: Number(editingReservation.duration) > 0 ? Number(editingReservation.duration) : 30,
      citas: reservations,
      bloqueos: blockouts,
      businessSchedule: businessSettings?.schedule || [],
      closedDays: businessSettings?.closedDays || [],
      ignoreCitaId: editingReservation.id,
    });
  }, [editingReservation, barbers, reservations, blockouts, businessSettings]);

    // Cambiar de profesional (o asignar una Pendiente) recalcula el precio con el
  // del nuevo profesional. Citas finalizadas/canceladas no se tocan: su precio
  // es histórico (comisiones y finanzas ya lo usan).
  const repriceForProfessional = (cita, professionalId) => {
    if (!cita || cita.status === 'completed' || cita.status === 'cancelled') return {};
    const current = cita.services && cita.services.length > 0 ? cita.services : getServicesFromCita(cita);
    if (current.length === 0) return {};
    const pro = professionalId && professionalId !== 'pending' ? barbers.find(b => b.id === professionalId) : null;
    const candidates = pro ? [] : barbers.filter(b => b?.active !== false && professionalCanDo(b, current.map(s => s.serviceId)));
    const r = repriceCitaServices(current, services, pro, { candidates });
    return { services: r.services, price: r.totalPrice, priceProvisional: r.priceProvisional };
  };

  const handleOpenEditReservation = (res) => {
    const services = res.services && res.services.length > 0 ? res.services : getServicesFromCita(res);
    setEditingReservation({
      ...res,
      services,
      _originalProfessionalId: res.professionalId || res.barberId || 'pending',
      // Para saber si cambió el horario al guardar (solo entonces se revisa el horario laboral).
      _originalSlot: { date: res.date, time: res.time, duration: getReservationDuration(res, services), professionalId: res.professionalId || res.barberId || 'pending' },
    });
    setActiveModal('edit-reservation');
  };

  const handleUpdateReservation = async (e) => {
    if (e) e.preventDefault();
    const targetProfessionalId = editingReservation.professionalId || editingReservation.barberId || 'pending';
    const duration = Number(editingReservation.duration) > 0 ? Number(editingReservation.duration) : 30;
    const endTimeStr = minToTime(timeToMin(editingReservation.time) + duration);
  
    const isClientRole = false;
    const check = await checkConflicts(editingReservation.id, targetProfessionalId, editingReservation.date, editingReservation.time, endTimeStr, false, isClientRole);
  
    if (!check.isValid) {
      triggerToast(check.message, 'error');
      return;
    }
    // Horario laboral: solo si cambió la fecha, la hora, la duración o el profesional
    // (así una cita que ya estaba en sobrehorario se puede editar sin avisos).
    const orig = editingReservation._originalSlot;
    const slotChanged = !orig || orig.date !== editingReservation.date || orig.time !== editingReservation.time
      || Number(orig.duration) !== duration || orig.professionalId !== targetProfessionalId;
    if (slotChanged && !(await confirmOutsideHours({ date: editingReservation.date, time: editingReservation.time, duration, professionalId: targetProfessionalId }))) return;
  
    const assignedBarber = barbers.find(b => b.id === targetProfessionalId);
    const currentServices = editingReservation.services && editingReservation.services.length > 0
      ? editingReservation.services
      : getServicesFromCita(editingReservation);
  
    const updatedRecord = {
      clientName: editingReservation.clientName,
      clientId: editingReservation.clientId || '',
      clientPhone: editingReservation.clientPhone || '',
      professionalId: targetProfessionalId,
      barberId: targetProfessionalId, // alias
      services: currentServices,
      serviceId: currentServices[0]?.serviceId || '',
      serviceName: currentServices.map(s => s.serviceName).join(' + '),
      price: editingReservation.price,
      // Pendiente = precio provisional (rango); con profesional asignado ya es definitivo.
      priceProvisional: targetProfessionalId === 'pending' ? !!editingReservation.priceProvisional : false,
      time: editingReservation.time,
      startTime: editingReservation.time,
      endTime: endTimeStr,
      duration: Number(duration),
      date: editingReservation.date,
      reservationDate: editingReservation.date,
      paymentMethod: editingReservation.paymentMethod,
      status: editingReservation.status,
      bookedBy: editingReservation.bookedBy || 'admin',
      notes: editingReservation.notes || '',
      branch: targetProfessionalId !== 'pending' ? (assignedBarber?.branch || editingReservation.branch || selectedBranch) : (editingReservation.branch || selectedBranch),
      updatedAt: new Date().toISOString()
    };

    // Asignación manual de una Pendiente: deja de ser pendiente y se avisa al profesional.
    const esAsignacionManual =
      editingReservation._originalProfessionalId === 'pending' &&
      targetProfessionalId !== 'pending' &&
      editingReservation.status !== 'cancelled';
    if (esAsignacionManual) {
      updatedRecord.assignedFromPending = true;
      updatedRecord.assignmentMode = 'manual';
      updatedRecord.pendingAssignedAt = updatedRecord.updatedAt;
    }
  
    // Foto de la cita ANTES de guardar, para decir qué cambió en la notificación.
    const before = findCitaById(editingReservation.id);
    // Promociones: se recalculan solo si cambió algo que las decide (servicios,
    // fecha, profesional o sucursal). Cambiar solo el estado o el pago conserva
    // el precio con el que se agendó.
    if (updatedRecord.status !== 'cancelled' && promoInputsChanged(before, updatedRecord)) {
      const conPromo = priceWithPromotions(updatedRecord.services, activePromotions, { date: updatedRecord.date, branch: updatedRecord.branch, branches });
      updatedRecord.services = conPromo.services;
      updatedRecord.price = conPromo.price;
      updatedRecord.promo = conPromo.promo || null;
    }
    Object.assign(updatedRecord, paymentStampFields(before, updatedRecord.status, updatedRecord.updatedAt));

    try {
      await updateDoc(doc(db, 'negocios', negocioId, 'citas', editingReservation.id), updatedRecord);
      bumpCitasTick();
      if (esAsignacionManual) {
        notify(
          NotificationType.RESERVA_PENDIENTE_ASIGNADA,
          negocioId,
          { citaId: editingReservation.id, clientName: editingReservation.clientName, time: editingReservation.time, serviceName: updatedRecord.serviceName },
          user?.uid,
          targetProfessionalId
        );
      } else {
        const cancelada = editingReservation.status === 'cancelled';
        const changes = describeAppointmentChanges(before, updatedRecord, { professionals: barbers, terms: businessProfile });
        // Si no cambió nada relevante (se abrió y se guardó igual), no se molesta a nadie.
        if (cancelada || changes.length > 0) {
          notify(
            cancelada ? NotificationType.RESERVA_CANCELADA : NotificationType.RESERVA_MODIFICADA,
            negocioId,
            { citaId: editingReservation.id, clientName: editingReservation.clientName, time: editingReservation.time, changes },
            user?.uid,
            targetProfessionalId === 'pending' ? undefined : targetProfessionalId,
            targetProfessionalId === 'pending' ? [] : undefined
          );
        }
      }
      // El horario/estado cambió: reevalúa las Pendientes de esa fecha.
      reevaluatePending(negocioId, editingReservation.date);
    } catch (err) {
      triggerToast(`Error al modificar ${g('appointment', 'el', 'la')} ${tl('appointment')}: ` + err.message, 'error');
      return;
    }


    triggerToast(`¡${t('appointment')} ${g('appointment', 'modificado', 'modificada')} con éxito!`);
    setActiveModal(null);
    setEditingReservation(null);
  };

  const startResFromSlot = () => {
    setNewReservation(prev => ({
      ...prev,
      barberId: clickedSlot.barberId,
      professionalId: clickedSlot.barberId,
      time: clickedSlot.time,
      date: selectedDate
    }));
    setActiveModal('add-reservation');
  };

  const startBlockoutFromSlot = () => {
    setBlockoutForm(prev => ({
      ...prev,
      barberId: clickedSlot.barberId,
      startTime: clickedSlot.time,
      endTime: minToTime(timeToMin(clickedSlot.time) + 30),
      date: selectedDate
    }));
    setActiveModal('add-blockout');
  };

  const handleCreateBlockout = async (e) => {
    if (e) e.preventDefault();
    const check = await checkConflicts(null, blockoutForm.barberId, blockoutForm.date, blockoutForm.startTime, blockoutForm.endTime, true, false);
    if (!check.isValid) {
      triggerToast(check.message, 'error');
      return;
    }

    const newBl = {
      barberId: blockoutForm.barberId,
      barber: blockoutForm.barberId, // alias para que BarberApp lo reconozca
      date: blockoutForm.date,
      startTime: blockoutForm.startTime,
      endTime: blockoutForm.endTime,
      reason: blockoutForm.reason || 'Bloqueo Administrativo'
    };

    try {
      await addDoc(collection(db, 'negocios', negocioId, 'horariosBloqueados'), newBl);
      reevaluatePending(negocioId, newBl.date);
      triggerToast('¡Horario bloqueado con éxito!');
      setActiveModal(null);
    } catch (err) {
      triggerToast('Error al bloquear el horario: ' + err.message, 'error');
    }
  };

  const handleDeleteBlockout = async (id) => {
    const bl = (blockouts || []).find(b => b?.id === id);
    const ok = await confirmAction({
      title: '¿Eliminar este bloqueo de horario?',
      subject: bl ? [bl.date, bl.startTime && bl.endTime ? `${bl.startTime} - ${bl.endTime}` : null].filter(Boolean).join(' · ') : null,
      message: bl?.reason || null,
    });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'negocios', negocioId, 'horariosBloqueados', id));
      triggerToast('¡Bloqueo eliminado!');
    } catch (err) {
      triggerToast('Error al eliminar el bloqueo: ' + err.message, 'error');
    }
  };

  const handleUpdateStatus = async (id, status, paymentMethod) => {
    try {
      const targetReservation = findCitaById(id); // antes de guardar: estado anterior
      const payload = { status, updatedAt: new Date().toISOString(), ...paymentStampFields(targetReservation, status) };
      if (paymentMethod) payload.paymentMethod = paymentMethod;
      await updateDoc(doc(db, 'negocios', negocioId, 'citas', id), payload);
      bumpCitasTick();
      const changes = targetReservation
        ? describeAppointmentChanges(targetReservation, { ...targetReservation, ...payload }, { professionals: barbers, terms: businessProfile })
        : [`Estado: ${getStatusLabel(status, businessProfile)}`];
      notify(
        status === 'cancelled' ? NotificationType.RESERVA_CANCELADA : NotificationType.RESERVA_MODIFICADA,
        negocioId,
        { citaId: id, status, clientName: targetReservation?.clientName, time: targetReservation?.time, changes },
        user?.uid,
        targetReservation?.professionalId || targetReservation?.barberId
      );
    } catch (err) {
      triggerToast('Error al actualizar el estado: ' + err.message, 'error');
      return;
    }


    triggerToast(`Estado actualizado a ${getStatusLabel(status, businessProfile)}`);
  };

  const handleDeleteReservation = async (id) => {
    const targetReservation = findCitaById(id);
    try {
      await deleteDoc(doc(db, 'negocios', negocioId, 'citas', id));
      bumpCitasTick();
      // Descuenta la visita del cliente (se había sumado al crear la cita).
      if (targetReservation?.clientId) {
        const clientDoc = clients.find(c => c.id === targetReservation.clientId);
        if (clientDoc) {
          const newVisits = Math.max(0, (clientDoc.visits || 0) - 1);
          setDoc(doc(db, 'negocios', negocioId, 'clientes', clientDoc.id), { visits: newVisits }, { merge: true }).catch(() => {});
        }
      }
      triggerToast('Reserva eliminada con éxito.');
      notify(NotificationType.RESERVA_CANCELADA, negocioId, { citaId: id, clientName: targetReservation?.clientName, time: targetReservation?.time }, user?.uid, targetReservation?.professionalId || targetReservation?.barberId);
    } catch (err) {
      triggerToast('Error al eliminar la reserva: ' + err.message, 'error');
    }
  };

  const handleEmptySlotClick = (barberId, time) => {
    setClickedSlot({ barberId: barberId || 'pending', time: time || '12:00' });
    setActiveModal('slot-actions');
  };

  const handleCreateBranch = async (e) => {
    if (e) e.preventDefault();
    if (imageUploading) return;
    if (!newBranch?.name?.trim() || !newBranch?.address?.trim()) {
      triggerToast('Completa los campos obligatorios.', 'error');
      return;
    }

    try {
      if (editingBranchId) {
        // Por backend: si cambia el nombre, actualiza profesionales, citas y
        // WhatsApp que usaban el nombre anterior (la agenda filtra por nombre).
        const oldName = (branches || []).find(x => x?.id === editingBranchId)?.name;
        const r = await updateBranch(editingBranchId, {
          name: newBranch.name,
          phone: newBranch.phone || '',
          address: newBranch.address,
          schedule: newBranch.schedule || '',
          lat: newBranch.lat,
          lng: newBranch.lng,
          mapsUrl: (newBranch.mapsUrl || '').trim(),
          image: (newBranch.image || '').trim()
        });
        if (!r.ok) throw new Error(r.error || 'No se pudo actualizar la sucursal.');
        if (r.renamed && selectedBranch === oldName) setSelectedBranch(newBranch.name);
        triggerToast(r.renamed
          ? `Sucursal actualizada. Se movieron ${r.actualizados?.profesionales || 0} ${tl('professionals')} y ${r.actualizados?.citas || 0} citas al nuevo nombre.`
          : 'Sucursal actualizada con éxito.');
        setEditingBranchId(null);
      } else {
        // Alta por backend: valida el límite de sucursales del plan.
        const r = await createBranch({
          name: newBranch.name,
          phone: newBranch.phone || '',
          address: newBranch.address,
          schedule: newBranch.schedule || '',
          lat: newBranch.lat,
          lng: newBranch.lng,
          mapsUrl: (newBranch.mapsUrl || '').trim(),
          image: (newBranch.image || '').trim()
        });
        if (!r.ok) throw new Error(r.error || 'No se pudo crear la sucursal.');
        triggerToast('Sucursal creada con éxito.');
      }
    } catch (err) {
      triggerToast('Error al guardar la sucursal: ' + err.message, 'error');
    }

    setNewBranch({ name: '', phone: '', address: '', schedule: '', lat: -17.7732, lng: -63.1821 });
    setLocationSearch('');
    setActiveModal(null);
  };

  const handleDeleteBranch = async (id) => {
    const branch = (branches || []).find(b => b?.id === id);
    const ok = await confirmAction({ title: '¿Eliminar esta sucursal?', subject: branch?.name || null, message: branch?.address || null });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'negocios', negocioId, 'sucursales', id));
      triggerToast('Sucursal eliminada.');
    } catch (err) {
      triggerToast('Error al eliminar la sucursal: ' + err.message, 'error');
    }
  };

  const handleEditBranch = (branch) => {
    setEditingBranchId(branch.id);
    setNewBranch(branch);
    setLocationSearch(branch.address);
    setActiveModal('add-branch');
  };

  const handleCreateService = async (e) => {
    if (e) e.preventDefault();
    if (imageUploading) return;
    if (!newService.name.trim() || !newService.price) {
      triggerToast(`Por favor completa todos los campos ${g('service', 'del', 'de la')} ${tl('service')}.`, 'error');
      return;
    }

    const durationMin = Number(newService.duration || 30);
    if (editingServiceId) {
      await editarServicio(editingServiceId, {
        name: newService.name,
        price: Number(newService.price),
        priceVariable: !!newService.priceVariable,
        featured: !!newService.featured,
        duration: durationMin,
        availableDays: newService.availableDays || [],
        image: (newService.image || '').trim()
      });
      triggerToast(`${t('service')} ${g('service', 'actualizado', 'actualizada')}.`);
    } else {
      await agregarServicio({
        name: newService.name,
        price: Number(newService.price),
        priceVariable: !!newService.priceVariable,
        featured: !!newService.featured,
        promoPrice: null,
        duration: durationMin,
        category: 'Tratamiento',
        availableDays: newService.availableDays || [],
        image: (newService.image || '').trim()
      });
      triggerToast(`${t('service')} ${g('service', 'creado', 'creada')} con éxito.`);
    }
    setActiveModal(null);
    setEditingServiceId(null);
    setNewService({ name: '', price: '', duration: '30', category: 'Tratamiento', promoPrice: '', priceVariable: false, featured: false, image: '', availableDays: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] });
  };

  // Interruptor global: mostrar u ocultar las fotos de servicios en el link público.
  const handleToggleServiceImages = async () => {
    const next = heroConfig.showServiceImages === false;
    try {
      await setDoc(doc(db, 'negocios', negocioId), { heroConfig: { showServiceImages: next } }, { merge: true });
      triggerToast(next ? 'Fotos visibles en el link público.' : 'Fotos ocultas en el link público.');
    } catch (err) {
      triggerToast('No se pudo guardar: ' + err.message, 'error');
    }
  };

  const openNewServiceModal = () => {
    setEditingServiceId(null);
    setNewService({ name: '', price: '', duration: '30', category: 'Tratamiento', promoPrice: '', priceVariable: false, featured: false, image: '', availableDays: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] });
    setActiveModal('add-service');
  };

  const handleEditService = (s) => {
    setEditingServiceId(s.id);
    setNewService({
      name: s.name || '',
      price: String(s.price ?? ''),
      duration: String(s.duration || 30),
      category: s.category || 'Tratamiento',
      promoPrice: s.promoPrice || '',
      priceVariable: s.priceVariable === true,
      featured: s.featured === true,
      image: s.image || '',
      availableDays: Array.isArray(s.availableDays) && s.availableDays.length > 0
        ? s.availableDays
        : ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
    });
    setActiveModal('add-service');
  };

  const handleDeleteService = async (id) => {
    const svc = (services || []).find(s => s?.id === id);
    const ok = await confirmAction({ title: `¿Eliminar ${g('service', 'este', 'esta')} ${tl('service')}?`, subject: svc?.name || null });
    if (!ok) return;
    await eliminarServicio(id);
    triggerToast(`${t('service')} ${g('service', 'eliminado', 'eliminada')}.`);
  };

  const handleAvatarFile = async (file) => {
    if (!file) return;

    // Vista previa inmediata mientras se sube (sin Base64: solo una URL local temporal).
    const localPreviewUrl = URL.createObjectURL(file);
    setNewBarber(prev => ({ ...prev, avatar: localPreviewUrl }));

    setIsUploadingAvatar(true);
    try {
      const cloudinaryUrl = await uploadImage(file);
      setNewBarber(prev => ({ ...prev, avatar: cloudinaryUrl }));
    } catch (err) {
      triggerToast('Error al subir la imagen: ' + err.message, 'error');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    handleAvatarFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    handleAvatarFile(file);
  };

  const validateStep1 = async () => {
    if (isUploadingAvatar) {
      triggerToast('Espera a que termine de subirse la foto.', 'error');
      return false;
    }
    if (!newBarber.firstName.trim() || !newBarber.lastName.trim()) {
      triggerToast('Por favor completa el nombre y apellido.', 'error');
      return false;
    }
        // Al editar, la contraseña vacía significa "no cambiarla".
        if (!editingBarberId && !newBarber.password) {
          triggerToast('La contraseña es obligatoria.', 'error');
          return false;
        }
        if (newBarber.password && newBarber.password !== newBarber.confirmPassword) {
          triggerToast('Las contraseñas no coinciden.', 'error');
          return false;
        }
        if (newBarber.password && newBarber.password.length < 4) {
          triggerToast('La contraseña debe tener al menos 4 caracteres.', 'error');
          return false;
        }
        // Usuario único en todos los negocios (lo verifica el backend).
        const original = barbers.find(b => b.id === editingBarberId);
        if (!original || original.username !== newBarber.username) {
          const check = await checkStaffUsername(newBarber.username, editingBarberId);
          if (!check) {
            triggerToast('No se pudo verificar el usuario. Revisa tu conexión.', 'error');
            return false;
          }
          if (!check.available) {
            setNewBarber(prev => ({ ...prev, username: check.suggestion }));
            triggerToast('Ese usuario ya existe. Te propusimos @' + check.suggestion + '. Toca Siguiente para continuar.', 'error');
            return false;
          }
        }
    const pinExists = barbers.some(b => b.id !== editingBarberId && b.pin === newBarber.pin);
    if (pinExists) {
      triggerToast(`Ese PIN ya lo usa ${g('professional', 'otro', 'otra')} ${tl('professional')}.`, 'error');
      return false;
    }
    return true;
  };

  // Modo registros (sin agenda): el profesional no tiene paso "Disponibilidad".
  // Se guarda con el horario por defecto (nuevo) o el que ya tenía (al editar).
  const lastBarberStep = registrosMode ? 2 : 3;
  const handleNextStep = async () => {
    if (barberStep === 1) {
      if (await validateStep1()) {
        setBarberStep(2);
      }
    } else if (barberStep === 2 && lastBarberStep === 3) {
      setBarberStep(3);
    }
  };

  const resetBarberForm = () => {
    setBarberStep(1);
    setNewBarber({
      firstName: '',
      lastName: '',
      branch: selectedBranch || branches[0]?.name || '',
      username: '',
      pin: '',
      password: '',
      confirmPassword: '',
      avatar: '',
      active: true,
      services: [],
      availability: [
        { day: 'Lunes', status: 'Disponible', start: '09:00', end: '19:00' },
        { day: 'Martes', status: 'Disponible', start: '09:00', end: '19:00' },
        { day: 'Miércoles', status: 'Disponible', start: '09:00', end: '19:00' },
        { day: 'Jueves', status: 'Disponible', start: '09:00', end: '19:00' },
        { day: 'Viernes', status: 'Disponible', start: '09:00', end: '19:00' },
        { day: 'Sábado', status: 'Disponible', start: '09:00', end: '19:00' },
        { day: 'Domingo', status: 'Descanso', start: '09:00', end: '19:00' }
      ]
    });
  };

  const handleCopyAvailabilityToAll = (idx) => {
    const template = newBarber.availability[idx];
    if (!template) return;
    setNewBarber(prev => ({
      ...prev,
      availability: prev.availability.map(item => ({
        ...item,
        status: template.status,
        start: template.start,
        end: template.end
      }))
    }));
    triggerToast('Horarios de disponibilidad copiados a toda la semana.');
  };

    // Contraseña fácil de dictar: palabra + 4 números (ej. luna4821).
    const handleGeneratePassword = () => {
      const palabras = ['luna', 'sol', 'mar', 'rio', 'pino', 'nube', 'roca', 'lago', 'faro', 'puma', 'oso', 'lince'];
      const n = new Uint32Array(2);
      window.crypto.getRandomValues(n);
      const pw = palabras[n[0] % palabras.length] + String(1000 + (n[1] % 9000));
      setNewBarber(prev => ({ ...prev, password: pw, confirmPassword: pw }));
      setShowPassword(true);
    };
  
    const handleCopyCredentials = async () => {
      if (!credentialNotice) return;
      const texto = 'Usuario: ' + credentialNotice.username + '\nContraseña: ' + credentialNotice.password;
      try {
        await navigator.clipboard.writeText(texto);
        triggerToast('Datos copiados.');
      } catch (_) {
        triggerToast('No se pudo copiar. Cópialos a mano.', 'error');
      }
    };
  
    const handleSaveBarber = async () => {
            // Precio por profesional: se guarda como número; si está vacío se quita
      // el campo y se usa el precio base del servicio.
      const savedServices = (newBarber.services || []).map(a => {
        if (!a || typeof a !== 'object') return a;
        const rest = { ...a };
        delete rest.customPrice;
        const customPrice = normalizeCustomPrice(a.customPrice);
        return customPrice === null ? rest : { ...rest, customPrice };
      });
      const credencial = newBarber.password
        ? { name: newBarber.firstName + ' ' + newBarber.lastName, username: newBarber.username, password: newBarber.password }
        : null;
    if (editingBarberId) {
      const updatedData = {
        firstName: newBarber.firstName,
        lastName: newBarber.lastName,
        name: `${newBarber.firstName} ${newBarber.lastName}`,
        branch: newBarber.branch,
        username: newBarber.username,
        pin: newBarber.pin,
        avatar: newBarber.avatar,
        active: newBarber.active,
        services: savedServices,
        permissions: normalizeStaffPermissions(newBarber.permissions),
        availability: newBarber.availability
      };
      try {
        await updateDoc(doc(db, 'negocios', negocioId, 'profesionales', editingBarberId), updatedData);
        await updateDoc(doc(db, 'usuarios', editingBarberId), {
          username: newBarber.username,
        });
        if (newBarber.password) {
          const r = await setStaffPassword(editingBarberId, newBarber.password);
          if (!r.ok) throw new Error(r.error || 'No se pudo guardar la contraseña.');
          setCredentialNotice(credencial);
        }
        triggerToast(`¡Perfil ${g('professional', 'del', 'de la')} ${tl('professional')} actualizado!`);
        reevaluatePending(negocioId); // activo/horario/servicios pueden cambiar los candidatos
      } catch (err) {
        triggerToast(`Error al actualizar ${g('professional', 'el', 'la')} ${tl('professional')}: ` + err.message, 'error');
      }
    } else {
      try {
        // Alta por backend: valida el límite de profesionales del plan y crea
        // el perfil + usuarios/{id} en una sola transacción.
        const created = await createProfessional({
          firstName: newBarber.firstName,
          lastName: newBarber.lastName,
          username: newBarber.username,
          branch: newBarber.branch,
          pin: newBarber.pin,
          active: newBarber.active,
          avatar: newBarber.avatar,
          services: savedServices,
          permissions: normalizeStaffPermissions(newBarber.permissions),
          availability: newBarber.availability
        });
        if (!created.ok) throw new Error(created.error || 'No se pudo crear el perfil.');
        const uid = created.id;

        const r = await setStaffPassword(uid, newBarber.password);
        if (!r.ok) {
          triggerToast('Se creó el perfil, pero no se guardó la contraseña. Edítalo y asígnala de nuevo.', 'error');
          resetBarberForm();
          setEditingBarberId(null);
          setActiveModal(null);
          return;
        }
        setCredentialNotice(credencial);

        triggerToast(`¡${t('professional')} ${g('professional', 'creado', 'creada')} con éxito!`);
      } catch (err) {
        triggerToast(`Error al crear ${g('professional', 'el', 'la')} ${tl('professional')}: ` + err.message, 'error');
      }
    }

    resetBarberForm();
    setEditingBarberId(null);
    setActiveModal(null);
  };

  const handleEditBarber = (barber) => {
    setEditingBarberId(barber.id);
    setNewBarber({
      firstName: barber.firstName || '',
      lastName: barber.lastName || '',
      branch: barber.branch || selectedBranch || branches[0]?.name || '',
      username: barber.username || '',
      pin: barber.pin || '',
      password: '',
      confirmPassword: '',
      avatar: hasRealAvatar(barber.avatar) ? barber.avatar : '',
      active: barber.active !== undefined ? barber.active : true,
      services: barber.services || [],
      permissions: normalizeStaffPermissions(barber.permissions),
      availability: barber.availability || [
        { day: 'Lunes', status: 'Disponible', start: '09:00', end: '19:00' },
        { day: 'Martes', status: 'Disponible', start: '09:00', end: '19:00' },
        { day: 'Miércoles', status: 'Disponible', start: '09:00', end: '19:00' },
        { day: 'Jueves', status: 'Disponible', start: '09:00', end: '19:00' },
        { day: 'Viernes', status: 'Disponible', start: '09:00', end: '19:00' },
        { day: 'Sábado', status: 'Disponible', start: '09:00', end: '19:00' },
        { day: 'Domingo', status: 'Descanso', start: '09:00', end: '19:00' }
      ]
    });
    setBarberStep(1);
    setActiveModal('add-barber');
  };

  const handleDeleteBarber = async (id) => {
    const pro = (barbers || []).find(b => b?.id === id);
    const ok = await confirmAction({
      title: `¿Eliminar ${g('professional', 'este', 'esta')} ${tl('professional')}?`,
      subject: pro?.name || null,
      message: `Se eliminará su perfil y su acceso al panel ${g('professional', 'del', 'de la')} ${tl('professional')}.`,
    });
    if (!ok) return;
    try {
      await revokeStaffSessions(id); // cierra su BarberApp en todos sus dispositivos
      await deleteDoc(doc(db, 'negocios', negocioId, 'profesionales', id));
      await deleteDoc(doc(db, 'usuarios', id));
      triggerToast(`Perfil ${g('professional', 'del', 'de la')} ${tl('professional')} eliminado con éxito.`);
      reevaluatePending(negocioId);
    } catch (err) {
      triggerToast(`Error al eliminar ${g('professional', 'el', 'la')} ${tl('professional')}: ` + err.message, 'error');
    }
  };

  const handleRegisterAttendance = (e) => {
    if (e) e.preventDefault();
    const barber = barbers.find(b => b.pin === assistPin);
    if (!barber) {
      triggerToast('PIN incorrecto. Intenta de nuevo.', 'error');
      return;
    }

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    setBarbers(prev => prev.map(b => {
      if (b.id === barber.id) {
        const updatedAttendance = { ...b.attendance };
        if (assistType === 'in') {
          updatedAttendance.in = timeStr;
          updatedAttendance.status = now.getHours() >= 9 && now.getMinutes() > 15 ? 'delayed' : 'ontime';
        } else {
          updatedAttendance.out = timeStr;
        }
        return { ...b, attendance: updatedAttendance };
      }
      return b;
    }));

    triggerToast(`Marcaje de ${assistType === 'in' ? 'Entrada' : 'Salida'} registrado para ${barber.name} a las ${timeStr}`);
    setActiveModal(null);
    setAssistPin('');
  };

  const triggerToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const filteredModalClients = useMemo(() => {
    if (!Array.isArray(clients)) return [];
    if (!clientSearch) return clients;
    return clients.filter(c => 
      c?.name?.toLowerCase().includes(clientSearch.toLowerCase()) || 
      c?.phone?.includes(clientSearch)
    );
  }, [clientSearch, clients]);

  // Orden en vivo mientras se arrastra un servicio (null = usar el orden guardado)
  const [serviceDragOrder, setServiceDragOrder] = useState(null);
  const [draggingServiceId, setDraggingServiceId] = useState(null);

  const orderedServices = useMemo(() => {
    if (!Array.isArray(services)) return [];
    if (!serviceDragOrder) return services;
    const byId = new Map(services.map(s => [s.id, s]));
    const ordered = serviceDragOrder.map(id => byId.get(id)).filter(Boolean);
    const rest = services.filter(s => !serviceDragOrder.includes(s.id));
    return [...ordered, ...rest];
  }, [services, serviceDragOrder]);

  const startServiceDrag = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    const initialIds = orderedServices.map(s => s.id);
    let current = initialIds;
    setDraggingServiceId(id);
    setServiceDragOrder(initialIds);

    const onMove = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-service-row]');
      const overId = el?.getAttribute('data-service-row');
      if (!overId || overId === id) return;
      const from = current.indexOf(id);
      const to = current.indexOf(overId);
      if (from < 0 || to < 0) return;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, id);
      current = next;
      setServiceDragOrder(next);
    };

    const onUp = async () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setDraggingServiceId(null);
      try {
        // Guarda el nuevo orden (solo los que cambiaron) en negocios/{id}/servicios/{sid}.order
        await Promise.all(
          current.map((sid, i) => {
            const original = services.find(x => x.id === sid);
            return original?.order === i ? null : editarServicio(sid, { order: i });
          })
        );
      } catch (err) {
        console.error('Error guardando el orden de servicios:', err);
      } finally {
        setServiceDragOrder(null);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const filteredWizardServices = useMemo(() => {
    if (!Array.isArray(orderedServices)) return [];
    return orderedServices.filter(s => {
      const matchSearch = s?.name?.toLowerCase().includes(serviceSearch.toLowerCase());
      if (serviceTab === 'Todos') return matchSearch;
      if (serviceTab === 'Públicos') return matchSearch && s?.category !== 'Estilo';
      if (serviceTab === 'Internos') return matchSearch && s?.category === 'Estilo';
      return matchSearch;
    });
  }, [orderedServices, serviceSearch, serviceTab]);

  const filteredBranchesList = useMemo(() => {
    if (!Array.isArray(branches)) return [];
    if (!searchBranchQuery) return branches;
    return branches.filter(b => 
      b?.name?.toLowerCase().includes(searchBranchQuery.toLowerCase()) ||
      b?.address?.toLowerCase().includes(searchBranchQuery.toLowerCase())
    );
  }, [branches, searchBranchQuery]);

  const filteredSimulatedLocations = useMemo(() => {
    if (!locationSearch) return GEOLOCATIONS_DB;
    return GEOLOCATIONS_DB.filter(l => 
      l?.name?.toLowerCase().includes(locationSearch.toLowerCase()) ||
      l?.address?.toLowerCase().includes(locationSearch.toLowerCase())
    );
  }, [locationSearch]);

  const filteredBarbersList = useMemo(() => {
    if (!Array.isArray(barbers)) return [];
    const porSucursal = barberBranchFilter === 'all' ? barbers : barbers.filter(b => (b?.branch || '') === barberBranchFilter);
    if (!searchBarberQuery) return porSucursal;
    return porSucursal.filter(b => 
      b?.name?.toLowerCase().includes(searchBarberQuery.toLowerCase()) ||
      b?.branch?.toLowerCase().includes(searchBarberQuery.toLowerCase())
    );
  }, [barbers, searchBarberQuery, barberBranchFilter]);
  // Sucursales con profesionales (para el filtro; solo si hay más de una).
  const barberBranchOptions = useMemo(
    () => [...new Set((barbers || []).map(b => b?.branch).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [barbers],
  );

  const filteredClientsList = useMemo(() => {
    if (!Array.isArray(clients)) return [];
    const base = !searchClientQuery
      ? clients
      : clients.filter(c =>
          c?.name?.toLowerCase().includes(searchClientQuery.toLowerCase()) ||
          c?.phone?.includes(searchClientQuery)
        );
    return [...base].sort((a, b) => (a?.name || '').localeCompare(b?.name || '', 'es', { sensitivity: 'base' }));
  }, [clients, searchClientQuery]);


  if (isBlocked) {
    return (
      <SuspendedScreen
        variant="admin"
        status={negocioStatus}
        onLogout={logout}
        actions={[{ href: supportUrl }]}
      />
    );
  }

  return (
    <BusinessProfileContext.Provider value={businessProfile}>
    {confirmDialog}
    {negocioId && <SubscriptionNoticeModal refreshKey={statusKey} />}
    {/* h-dvh: alto real visible (100vh en algunos navegadores de tablet/celular
        no coincide con lo visible y dejaba una franja blanca abajo). */}
    <div className="h-dvh bg-nexus-background text-nexus-text font-sans antialiased flex flex-col md:flex-row selection:bg-nexus-primary selection:text-white overflow-hidden relative">
      
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-nexus-navy/60 backdrop-blur-xs z-40 md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* MENÚ LATERAL (Fase 4: ítems de 40px, textos de 12px o más). En celular
          es un panel que se abre con el botón de menú y muestra siempre los nombres. */}
      <aside
        className={`fixed md:relative inset-y-0 left-0 bg-nexus-navy border-r border-nexus-navy-border flex flex-col shrink-0 z-50 transition-all duration-300 ease-in-out ${
          isMobileSidebarOpen ? 'translate-x-0 w-72 max-w-[85vw]' : '-translate-x-full md:translate-x-0'
        } ${
          isSidebarCollapsed ? 'md:w-20' : 'md:w-60'
        }`}
      >
        <div className={`h-16 px-4 border-b border-nexus-navy-border flex items-center justify-between gap-2 shrink-0 ${navCollapsed ? 'md:justify-center md:px-2' : ''}`}>
          <div className={`items-center gap-2.5 overflow-hidden flex min-w-0 ${navCollapsed ? 'hidden' : ''}`}>
            <img
              src="/favicon.svg"
              alt=""
              className="w-9 h-9 rounded-lg shadow-md shrink-0 object-contain"
            />
            <div className="min-w-0">
              <h1 className="text-sm font-bold tracking-wide text-white truncate">
                Nexus
              </h1>
              <p className="text-xs text-white/50 truncate">{businessName || 'Panel del negocio'}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden md:inline-flex h-10 w-10 items-center justify-center hover:bg-nexus-navy-soft text-white/70 hover:text-white rounded-lg transition-colors cursor-pointer shrink-0"
            title={isSidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
            aria-label={isSidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
          >
            {isSidebarCollapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>

          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(false)}
            className="md:hidden inline-flex h-10 w-10 items-center justify-center hover:bg-nexus-navy-soft text-white/70 hover:text-white rounded-lg cursor-pointer shrink-0"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Menú principal">
          <SidebarSection label="Principal" collapsed={navCollapsed} first />

          {/* Lo de todos los días primero: Agenda (o Servicios registrados), Dashboard, Clientes. */}
          {showAgenda && (
            <SidebarItem
              icon={CalendarIcon}
              label="Agenda"
              collapsed={navCollapsed}
              active={activeTab === 'agenda'}
              badge={pendingBadgeCount}
              badgeLabel={`${pendingBadgeCount} pendientes`}
              onClick={() => { setActiveTab('agenda'); setIsMobileSidebarOpen(false); }}
            />
          )}

          {canUseCapability('registroServicios') && (
            <SidebarItem
              icon={ClipboardList}
              label={`${t('services')} registrados`}
              collapsed={navCollapsed}
              active={activeTab === 'registros'}
              onClick={() => { setActiveTab('registros'); setIsMobileSidebarOpen(false); }}
            />
          )}

          {hasFeature(planFeatures, 'dashboard') && hasModule('dashboard') && (
            <SidebarItem
              icon={LayoutDashboard}
              label="Dashboard"
              collapsed={navCollapsed}
              active={activeTab === 'dashboard'}
              onClick={() => { setActiveTab('dashboard'); setIsMobileSidebarOpen(false); }}
            />
          )}

          {hasFeature(planFeatures, 'clientes') && hasModule('clients') && (
            <SidebarItem
              icon={UserCheck}
              label={t('clients')}
              collapsed={navCollapsed}
              active={activeTab === 'clients'}
              onClick={() => { setActiveTab('clients'); setIsMobileSidebarOpen(false); }}
            />
          )}

          <SidebarSection label="Gestión" collapsed={navCollapsed} />

          {/* Profesionales incluye Asistencia como pestaña; Servicios incluye Promociones. */}
          {hasModule('barbers') && (
            <SidebarItem
              icon={Users}
              label={t('professionals')}
              collapsed={navCollapsed}
              active={activeTab === 'barbers' || activeTab === 'assistance'}
              onClick={() => { setActiveTab('barbers'); setIsMobileSidebarOpen(false); }}
            />
          )}

          {hasModule('services') && (
            <SidebarItem
              icon={ServiceIcon}
              label={t('services')}
              collapsed={navCollapsed}
              active={activeTab === 'services' || activeTab === 'promotions'}
              onClick={() => { setActiveTab('services'); setIsMobileSidebarOpen(false); }}
            />
          )}

          {hasFeature(planFeatures, 'inventario') && hasModule('inventory') && (
            <SidebarItem
              icon={Package}
              label="Inventario"
              collapsed={navCollapsed}
              active={activeTab === 'inventory'}
              onClick={() => { setActiveTab('inventory'); setIsMobileSidebarOpen(false); }}
            />
          )}

          {((hasFeature(planFeatures, 'comisiones') && hasModule('commissions')) || (hasFeature(planFeatures, 'analiticas') && hasModule('reports'))) && (
            <SidebarSection label="Finanzas" collapsed={navCollapsed} />
          )}

          {hasFeature(planFeatures, 'comisiones') && hasModule('commissions') && (
            <SidebarItem
              icon={DollarSign}
              label="Comisiones"
              collapsed={navCollapsed}
              active={activeTab === 'commissions'}
              onClick={() => { setActiveTab('commissions'); setIsMobileSidebarOpen(false); }}
            />
          )}

          {hasFeature(planFeatures, 'analiticas') && hasModule('reports') && (
            <SidebarItem
              icon={BarChart3}
              label="Analíticas"
              collapsed={navCollapsed}
              active={activeTab === 'reports'}
              onClick={() => { setActiveTab('reports'); setIsMobileSidebarOpen(false); }}
            />
          )}

          <SidebarSection label="Sistema" collapsed={navCollapsed} />

          <SidebarItem
            icon={Settings}
            label="Configuración"
            collapsed={navCollapsed}
            active={activeTab === 'settings' || activeTab === 'branches'}
            expanded={!navCollapsed ? isSettingsMenuOpen : undefined}
            trailing={<ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isSettingsMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />}
            onClick={() => {
              if (navCollapsed) {
                setActiveTab('settings');
                setIsMobileSidebarOpen(false);
                return;
              }
              setActiveTab('settings');
              setIsSettingsMenuOpen((prev) => !prev);
            }}
          />

          {!navCollapsed && isSettingsMenuOpen && (
            <div className="ml-4 pl-2 border-l border-nexus-navy-border space-y-0.5 py-1">
              {SETTINGS_SECTIONS
                .filter(({ id }) => id !== 'automation' || hasFeature(planFeatures, 'asistenteWhatsapp'))
                // Sucursales vive en Configuración (se crean una vez y casi no se tocan).
                .flatMap((sec) => (sec.id === 'business' && hasModule('branches') ? [sec, { id: 'branches', label: 'Sucursales', icon: Building2 }] : [sec]))
                .map(({ id, label: baseLabel, icon: Icon }) => {
                // Modo registros: sin link público, la sección queda como "Marca" (nombre y logo).
                const label = registrosMode && id === 'hero' ? 'Marca' : baseLabel;
                const isCurrent = id === 'branches' ? activeTab === 'branches' : activeTab === 'settings' && settingsSection === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-current={isCurrent ? 'page' : undefined}
                    onClick={() => {
                      if (id === 'branches') setActiveTab('branches');
                      else { setActiveTab('settings'); setSettingsSection(id); }
                      setIsMobileSidebarOpen(false);
                    }}
                    className={`w-full flex h-9 items-center gap-2.5 px-2.5 rounded-lg text-sm transition-colors duration-150 cursor-pointer ${
                      isCurrent
                        ? 'bg-nexus-navy-soft text-white font-semibold'
                        : 'text-white/60 hover:text-white hover:bg-nexus-navy-soft'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isCurrent ? 'text-white' : ''}`} aria-hidden="true" />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </nav>
      </aside>

      <main className="relative flex-1 flex flex-col min-w-0 overflow-y-auto">

        {/* CABECERA (Fase 4). En celular: menú + título + acción principal en una
            fila, y los controles de periodo/sucursal debajo, con áreas de 40px. */}
        <header className="sticky top-0 bg-nexus-background/95 backdrop-blur-md border-b border-nexus-border px-3 py-3 sm:px-4 md:px-6 flex flex-col xl:flex-row xl:items-center justify-between gap-3 z-25">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 w-full xl:w-auto">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="md:hidden inline-flex h-10 w-10 items-center justify-center hover:bg-nexus-surface-hover text-nexus-text-secondary hover:text-nexus-text rounded-lg transition-colors shrink-0 border border-nexus-border bg-nexus-surface cursor-pointer"
              aria-label="Abrir menú"
              title="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0 flex-1">
              <p className={`text-xs text-nexus-text-secondary truncate ${headerHasToolbar ? '2xl:hidden' : 'sm:hidden'}`}>{businessName}</p>
              <h2 className="text-base sm:text-lg font-bold text-nexus-text tracking-tight flex items-center gap-2 min-w-0">
                <span className={`${headerHasToolbar ? 'hidden 2xl:inline' : 'hidden sm:inline'} text-nexus-text-secondary font-normal truncate shrink`}>{businessName}</span>
                <span className={`${headerHasToolbar ? 'hidden 2xl:inline' : 'hidden sm:inline'} text-nexus-text-muted`} aria-hidden="true">/</span>
                <span className="truncate">
                  {activeTab === 'dashboard' && 'Panel General'}
                  {agendaTab && `Agenda de ${t('professionals')}`}
                  {activeTab === 'registros' && `${t('services')} registrados`}
                  {activeTab === 'barbers' && `Gestión de ${t('professionals')}`}
                  {activeTab === 'services' && `Catálogo de ${t('services')}`}
                  {activeTab === 'clients' && `Base de Datos de ${t('clients')}`}
                  {activeTab === 'branches' && 'Sucursales'}
                  {activeTab === 'inventory' && 'Inventario'}
                  {activeTab === 'promotions' && 'Promociones'}
                  {activeTab === 'commissions' && 'Liquidación de Comisiones'}
                  {activeTab === 'assistance' && 'Control de Asistencias'}
                  {activeTab === 'reports' && 'Métricas & Informes'}
                  {activeTab === 'settings' && 'Configuración'}
                </span>
              </h2>
            </div>

            {activeTab === 'barbers' && barberBranchOptions.length > 1 && (
              // Filtro por sucursal: el select nativo va encima del ícono (abre la lista del sistema).
              <span className="relative shrink-0">
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${barberBranchFilter !== 'all' ? 'border-nexus-primary bg-nexus-primary text-white' : 'border-nexus-border bg-nexus-surface text-nexus-text-secondary'}`}>
                  <Filter className="w-[18px] h-[18px]" aria-hidden="true" />
                </span>
                <select
                  aria-label="Filtrar por sucursal"
                  title="Filtrar por sucursal"
                  value={barberBranchFilter}
                  onChange={(e) => setBarberBranchFilter(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                >
                  <option value="all">Todas las sucursales</option>
                  {barberBranchOptions.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </span>
            )}

            {agendaTab && canUseCapability('registroServicios') && (
              <span className="xl:hidden shrink-0">
                <Button size="sm" variant="secondary" icon={ClipboardList} onClick={() => setRegistroModalOpen(true)} aria-label={`Registrar ${tl('service')}`}>
                  Registrar
                </Button>
              </span>
            )}
            {agendaTab && (
              <span className="xl:hidden shrink-0">
              <Button
                size="sm"
                icon={Plus}
                onClick={() => {
                  setNewReservation(prev => ({ ...prev, date: selectedDate, professionalId: 'pending', barberId: 'pending', time: '' }));
                  setActiveModal('add-reservation');
                }}
              >
                {g('appointment', 'Nuevo', 'Nueva')} {t('appointment')}
              </Button>
              </span>
            )}
          </div>

          {headerHasToolbar && (
            <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto xl:flex-nowrap">

              <SegmentedControl
                ariaLabel="Periodo"
                value={agendaView}
                onChange={setAgendaView}
                options={[
                  { value: 'dia', label: 'Día' },
                  { value: 'semana', label: 'Semana' },
                  { value: 'mes', label: 'Mes' },
                  { value: 'año', label: 'Año' },
                ]}
                className="w-full sm:w-auto shrink-0"
              />

              <div className="flex items-center bg-nexus-surface border border-nexus-border rounded-lg overflow-hidden h-10 flex-1 sm:flex-none min-w-0">
                <button
                  type="button"
                  onClick={handlePrevPeriod}
                  aria-label="Periodo anterior"
                  title="Periodo anterior"
                  className="h-full w-9 sm:w-10 inline-flex items-center justify-center hover:bg-nexus-surface-hover text-nexus-text-secondary hover:text-nexus-text transition-colors border-r border-nexus-border shrink-0 cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <div className="flex-1 min-w-0 flex items-center justify-center px-1.5 sm:px-3 text-sm text-nexus-text font-semibold nx-num select-none sm:min-w-[170px] whitespace-nowrap" aria-live="polite">
                  {getFormattedDateLabel(selectedDate, agendaView)}
                </div>

                <button
                  type="button"
                  onClick={handleNextPeriod}
                  aria-label="Periodo siguiente"
                  title="Periodo siguiente"
                  className="h-full w-9 sm:w-10 inline-flex items-center justify-center hover:bg-nexus-surface-hover text-nexus-text-secondary hover:text-nexus-text transition-colors border-l border-nexus-border shrink-0 cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              <label className={`items-center bg-nexus-surface border border-nexus-border rounded-lg h-10 pl-2.5 pr-1 text-sm text-nexus-text gap-1.5 shrink-0 ${(branches || []).length > 1 ? 'flex order-last w-full sm:order-none sm:w-auto' : 'hidden sm:flex'}`}>
                <MapPin className="w-4 h-4 text-nexus-primary shrink-0" aria-hidden="true" />
                <span className="sr-only">Sucursal</span>
                <select
                  value={selectedBranch || ''}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="h-full min-w-0 flex-1 sm:flex-none bg-transparent border-0 outline-none text-nexus-text font-semibold cursor-pointer text-base sm:text-sm truncate"
                >
                  {(branches || []).map(b => (
                    <option key={b?.id || b?.name} value={b?.name} className="bg-nexus-surface">{b?.name}</option>
                  ))}
                </select>
              </label>

              {negocioId && (
                <a
                  href={buildPublicBookingUrl(negocioId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir página pública"
                  aria-label="Abrir página pública de reservas"
                  className="inline-flex h-10 w-10 items-center justify-center bg-nexus-surface border border-nexus-border hover:border-nexus-primary/60 hover:bg-nexus-surface-hover text-nexus-text-secondary hover:text-nexus-text rounded-lg shrink-0 transition-colors cursor-pointer"
                >
                  <Globe className="w-[18px] h-[18px]" />
                </a>
              )}

              {agendaTab && canUseCapability('registroServicios') && (
                <span className="hidden xl:block">
                  <Button variant="secondary" icon={ClipboardList} onClick={() => setRegistroModalOpen(true)}>
                    Registrar {tl('service')}
                  </Button>
                </span>
              )}
              {agendaTab && (
                <span className="hidden xl:block">
                  <Button
                    icon={Plus}
                    onClick={() => {
                      setNewReservation(prev => ({ ...prev, date: selectedDate, professionalId: 'pending', barberId: 'pending', time: '' }));
                      setActiveModal('add-reservation');
                    }}
                  >
                    {g('appointment', 'Nuevo', 'Nueva')} {t('appointment')}
                  </Button>
                </span>
              )}
            </div>
          )}
        </header>

        {/* Modo registros: espacio abajo para la barra fija "Registrar servicio" (celular y tablet). */}
        <div className={`flex-1 p-3 sm:p-5 space-y-4 sm:space-y-5 ${registrosMode ? 'pb-24 sm:pb-24 lg:pb-5' : ''}`}>
          
          {/* ==========================================
              1. PESTAÑA: DASHBOARD (METRICAS FILTRADAS)
              ========================================== */}
          {activeTab === 'dashboard' && (
            <div className="space-y-4 sm:space-y-5">
              {/* Indicadores del periodo (Fase 4: textos de 12px o más, números alineados). */}
              <div className={`grid grid-cols-2 ${registrosMode ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-3 sm:gap-4`}>
                <div className="bg-nexus-surface border border-nexus-border rounded-xl p-3.5 sm:p-4 shadow-sm min-w-0">
                  <p className="text-xs font-medium text-nexus-text-secondary">Ventas del periodo</p>
                  <p className="text-xl sm:text-2xl font-bold text-nexus-text nx-num mt-1 truncate">{formatBs(rangeMetrics?.totalRevenue)}</p>
                  {salesComparison.comparable ? (
                    <p className={`flex items-center gap-1 mt-1 text-xs font-semibold ${salesComparison.percent >= 0 ? 'text-nexus-success-text' : 'text-nexus-error-text'}`}>
                      {salesComparison.percent >= 0 ? <TrendingUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> : <TrendingDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                      <span className="nx-num">{salesComparison.percent >= 0 ? '+' : ''}{salesComparison.percent.toFixed(1)}%</span>
                      <span className="font-normal text-nexus-text-muted truncate">vs anterior</span>
                    </p>
                  ) : (
                    <p className="text-xs text-nexus-text-muted mt-1">Sin datos para comparar</p>
                  )}
                </div>
                {registrosMode ? (
                <div className="bg-nexus-surface border border-nexus-border rounded-xl p-3.5 sm:p-4 shadow-sm min-w-0">
                  <p className="text-xs font-medium text-nexus-text-secondary">{t('services')} registrados</p>
                  <p className="text-xl sm:text-2xl font-bold text-nexus-text nx-num mt-1">{rangeRegistrosCount}</p>
                  {registrosComparison.comparable ? (
                    <p className={`flex items-center gap-1 mt-1 text-xs font-semibold ${registrosComparison.percent >= 0 ? 'text-nexus-success-text' : 'text-nexus-error-text'}`}>
                      {registrosComparison.percent >= 0 ? <TrendingUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> : <TrendingDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                      <span className="nx-num">{registrosComparison.percent >= 0 ? '+' : ''}{registrosComparison.percent.toFixed(1)}%</span>
                      <span className="font-normal text-nexus-text-muted truncate">vs anterior</span>
                    </p>
                  ) : (
                    <p className="text-xs text-nexus-text-muted mt-1">Sin datos para comparar</p>
                  )}
                </div>
                ) : (
                <div className="bg-nexus-surface border border-nexus-border rounded-xl p-3.5 sm:p-4 shadow-sm min-w-0">
                  <p className="text-xs font-medium text-nexus-text-secondary">{t('appointments')} {g('appointment', 'agendados', 'agendadas')}</p>
                  <p className="text-xl sm:text-2xl font-bold text-nexus-text nx-num mt-1">{(rangeReservations || []).length}</p>
                  {rangeCancelledCount > 0 ? (
                    <p className="text-xs font-semibold text-nexus-error-text mt-1 nx-num">{rangeCancelledCount} {rangeCancelledCount === 1 ? g('appointment', 'cancelado', 'cancelada') : g('appointment', 'cancelados', 'canceladas')}</p>
                  ) : (
                    <p className="text-xs text-nexus-text-muted mt-1">Sin {g('appointment', 'cancelados', 'canceladas')}</p>
                  )}
                </div>
                )}
                {!registrosMode && (
                <div className="bg-nexus-surface border border-nexus-border rounded-xl p-3.5 sm:p-4 shadow-sm min-w-0">
                  <p className="text-xs font-medium text-nexus-text-secondary">{t('clients')} {g('client', 'atendidos', 'atendidas')}</p>
                  <p className="text-xl sm:text-2xl font-bold text-nexus-primary nx-num mt-1">{rangeMetrics?.clientsServed}</p>
                  <p className="text-xs text-nexus-text-muted mt-1">En el periodo</p>
                </div>
                )}
                <div className="bg-nexus-surface border border-nexus-border rounded-xl p-3.5 sm:p-4 shadow-sm min-w-0">
                  <p className="text-xs font-medium text-nexus-text-secondary">Comisión estimada</p>
                  <p className="text-xl sm:text-2xl font-bold text-nexus-text nx-num mt-1 truncate">{formatBs(rangeMetrics?.pendingCommissions)}</p>
                  <p className="text-xs text-nexus-text-muted mt-1">A liquidar en el periodo</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
                <div className={`${showAgenda ? 'lg:col-span-2' : 'lg:col-span-3'} bg-nexus-surface border border-nexus-border rounded-xl p-4 sm:p-5 shadow-sm min-w-0`}>
                  <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
                    <h3 className="text-base font-semibold text-nexus-text">{registrosMode ? `${t('services')} registrados` : t('appointments')} del periodo</h3>
                    <span className="inline-flex items-center rounded-full border border-nexus-primary/20 bg-nexus-primary-soft px-2 py-0.5 text-xs font-medium text-nexus-primary">Tiempo real</span>
                  </div>
                  <div className="h-52 sm:h-56 w-full">
                    {dashboardChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={dashboardChartData} margin={{ top: 5, right: 8, left: -4, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--nx-border)" strokeOpacity={0.6} vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--nx-text-secondary)' }} interval={agendaView === 'mes' ? 3 : 'preserveStartEnd'} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fontSize: 12, fill: 'var(--nx-text-secondary)' }} width={34} domain={[0, chartYAxisConfig.max]} ticks={chartYAxisConfig.ticks} allowDecimals={false} tickLine={false} axisLine={false} />
                          <Tooltip content={<DashboardChartTooltip />} />
                          <Area type="monotone" dataKey="citas" stroke="var(--nx-primary)" strokeWidth={2} fill="url(#chartGrad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-center px-4 text-sm text-nexus-text-muted">
                        No hay datos suficientes para este periodo
                      </div>
                    )}
                  </div>
                </div>

                {showAgenda && (
                <div className="bg-nexus-surface border border-nexus-border rounded-xl p-4 sm:p-5 shadow-sm flex flex-col min-w-0">
                  <h3 className="text-base font-semibold text-nexus-text mb-3">{g('appointment', 'Próximo', 'Próxima')} {tl('appointment')}</h3>
                  {nextAppointment ? (
                    <div className="flex-1 flex flex-col justify-center min-w-0">
                      <span className="text-3xl font-bold text-nexus-primary nx-num">{nextAppointment.time}</span>
                      <span className="text-base font-semibold text-nexus-text mt-2 truncate">{nextAppointment.clientName}</span>
                      <span className="text-sm text-nexus-text-secondary mt-0.5 truncate">{nextAppointment.serviceName || t('service')}</span>
                      <span className="text-sm text-nexus-text-muted mt-1 truncate">
                        {(barbers.find(b => b?.id === (nextAppointment.professionalId || nextAppointment.barberId))?.name) || 'Sin asignar'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-center text-sm text-nexus-text-muted py-6">
                      No hay {g('appointment', 'próximos', 'próximas')} {tl('appointments')}
                    </div>
                  )}
                </div>
                )}
              </div>

              <CashCard
                branchId={branches.find(b => b?.name === selectedBranch)?.id || null}
                branchName={branches.length > 1 ? selectedBranch : ''}
                userEmail={user?.email}
                onToast={triggerToast}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                <div className="bg-nexus-surface border border-nexus-border rounded-xl p-4 sm:p-5 shadow-sm min-w-0">
                  <h3 className="text-base font-semibold text-nexus-text mb-3">{paymentsLabel}</h3>
                  {paymentBreakdown.total > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(paymentBreakdown.totals).map(([method, amount]) => (
                        <div key={method} className="flex justify-between items-center gap-3 text-sm">
                          <span className="text-nexus-text-secondary truncate">{method}</span>
                          <span className="font-semibold text-nexus-text nx-num shrink-0">{formatBs(amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center gap-3 text-sm pt-2 border-t border-nexus-border">
                        <span className="font-semibold text-nexus-text">Total</span>
                        <span className="font-bold text-nexus-primary nx-num shrink-0">{formatBs(paymentBreakdown.total)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-nexus-text-muted py-4 text-center">Sin pagos registrados en este periodo</div>
                  )}
                </div>

                <div className="bg-nexus-surface border border-nexus-border rounded-xl p-4 sm:p-5 shadow-sm min-w-0">
                  <h3 className="text-base font-semibold text-nexus-text mb-3">Actividad reciente</h3>
                  {recentActivity.length > 0 ? (
                    <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {recentActivity.map(ev => (
                        <li key={ev.id} className="text-sm text-nexus-text-secondary flex gap-2">
                          <span className="nx-num text-nexus-text-muted shrink-0">{formatActivityTime(ev.ts)}</span>
                          <span className="min-w-0"><span className="font-medium text-nexus-text">{ev.clientName}</span> — {ev.label}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-nexus-text-muted py-4 text-center">Sin actividad reciente</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              2. PESTAÑA: AGENDA DEL STAFF
              ========================================== */}
          {activeTab === 'agenda' && planLoading && <LoadingState />}
          {agendaTab && (
            <div className="space-y-3 sm:space-y-4">

              {agendaView === 'dia' && (() => {
                const dayColumns = (branchBarbers || []).filter(b => filterBarberId === 'all' || b?.id === filterBarberId);
                const totalCols = dayColumns.length + (filterBarberId === 'all' ? 1 : 0);
                // Escala de la cuadrícula (Fase 4): 48px por cada media hora para que
                // una cita de 30 min muestre hora, nombre y servicio sin cortarse.
                const SLOT_PX = 48;
                const PX_PER_MIN = SLOT_PX / 30;
                const dayStarts = [480], dayEnds = [1320];
                (filteredReservations || []).forEach(r => {
                  const st = timeToMin(r?.time || '12:00');
                  dayStarts.push(st); dayEnds.push(st + getReservationDuration(r, services));
                });
                (blockouts || []).filter(bl => bl?.date === selectedDate).forEach(bl => {
                  dayStarts.push(timeToMin(bl?.startTime)); dayEnds.push(timeToMin(bl?.endTime));
                });
                const GRID_START_MIN = Math.max(0, Math.floor(Math.min(...dayStarts.filter(Number.isFinite)) / 60) * 60);
                const GRID_END_MIN = Math.min(24 * 60, Math.ceil(Math.max(...dayEnds.filter(Number.isFinite)) / 60) * 60);
                const gridHours = [];
                for (let m = GRID_START_MIN; m < GRID_END_MIN; m += 30) gridHours.push(m / 60);
                const HOUR_COL_PX = 56;
                const COL_MIN_PX = 150;
                const dayMinWidth = HOUR_COL_PX + totalCols * COL_MIN_PX;
                const toTop = (min) => (min - GRID_START_MIN) * PX_PER_MIN;
                const showNowLine = selectedDate === formatDate(new Date()) && currentTimeMinutes >= GRID_START_MIN && currentTimeMinutes <= GRID_END_MIN;
                return (
                <div className="space-y-3">
                  <ClosedDayBanner closedDays={businessSettings?.closedDays} date={selectedDate} branch={selectedBranch} />
                  {/* Filtro de profesional (solo vista; usa el filtro que ya existía). En
                      celular permite ver una sola columna a pantalla completa. */}
                  {(branchBarbers || []).length > 1 && (
                    <div className="-mx-3 sm:mx-0 px-3 sm:px-0 overflow-x-auto scrollbar-none">
                      <div role="radiogroup" aria-label={`Ver ${tl('professionals')}`} className="flex items-center gap-2 w-max">
                        {[{ id: 'all', name: 'Todos' }, ...(branchBarbers || [])].map(b => {
                          const isOn = filterBarberId === b?.id;
                          return (
                            <button
                              key={b?.id}
                              type="button"
                              role="radio"
                              aria-checked={isOn}
                              onClick={() => setFilterBarberId(b?.id)}
                              className={`h-9 px-3.5 rounded-full border text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                                isOn
                                  ? 'bg-nexus-primary border-nexus-primary text-white shadow-sm'
                                  : 'bg-nexus-surface border-nexus-border text-nexus-text-secondary hover:text-nexus-text hover:border-nexus-primary/40'
                              }`}
                            >
                              {b?.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                <div className="bg-nexus-surface border border-nexus-border rounded-xl overflow-hidden shadow-sm">
                  {/* UN SOLO contenedor con scroll (horizontal y vertical).
                      Encabezado = sticky top, columna de horas = sticky left. */}
                  <div ref={agendaBoxRef} style={{ height: agendaBoxHeight ?? 560 }} className="relative overflow-auto overscroll-contain">
                    <div style={{ minWidth: `${dayMinWidth}px` }}>

                      {/* ENCABEZADO (fijo arriba) */}
                      <div className="sticky top-0 z-30 flex border-b border-nexus-border bg-nexus-background">
                        <div style={{ width: HOUR_COL_PX }} className="sticky left-0 z-40 shrink-0 border-r border-nexus-border bg-nexus-background flex items-center justify-center p-2">
                          <Clock className="w-4 h-4 text-nexus-text-muted" aria-hidden="true" />
                        </div>
                        <div className="flex flex-1 divide-x divide-nexus-border">
                          {filterBarberId === 'all' && (
                            <div style={{ minWidth: COL_MIN_PX }} className="flex-1 py-2 px-2 bg-nexus-primary-soft flex flex-col items-center justify-center gap-0.5 text-nexus-primary min-w-0">
                              <div className="flex items-center gap-1.5">
                                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                                <span className="text-sm font-semibold">Pendientes</span>
                              </div>
                              <span className="text-xs text-nexus-primary/80 nx-num">{barberDayCounts['pending'] || 0} reservas</span>
                            </div>
                          )}
                          {dayColumns.map(b => (
                            <div key={b?.id} style={{ minWidth: COL_MIN_PX }} className="flex-1 py-2 px-2 flex flex-col items-center justify-center gap-0.5 bg-nexus-background min-w-0">
                              <div className="flex items-center gap-2 min-w-0 max-w-full">
                                <Avatar src={b?.avatar} name={b?.name} className="w-7 h-7 rounded-full object-cover border border-nexus-border shrink-0" textClassName="text-xs" />
                                <h5 className="text-sm font-semibold text-nexus-text truncate">{b?.name}</h5>
                              </div>
                              <span className="text-xs text-nexus-text-muted nx-num">{barberDayCounts[b?.id] || 0} reservas</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* CUERPO */}
                      <div className="relative flex">

                        {/* Línea de la hora actual (Fase 4): solo en el día de hoy, por encima
                            de las citas; la hora se muestra en la columna de horas. */}
                        {showNowLine && (
                          <div
                            className="absolute left-0 right-0 border-t-2 border-nexus-error z-[15] pointer-events-none"
                            style={{ top: `${toTop(currentTimeMinutes)}px` }}
                            aria-hidden="true"
                          />
                        )}

                        {/* COLUMNA DE HORAS (fija a la izquierda) */}
                        <div style={{ width: HOUR_COL_PX }} className="sticky left-0 z-20 shrink-0 bg-nexus-surface border-r border-nexus-border">
                        {gridHours.map(hour => (
                            <div key={hour} style={{ height: SLOT_PX }} className="px-2 flex items-start justify-end pt-1 border-b border-nexus-border/60">
                              <span className={`nx-num text-xs ${hour % 1 === 0 ? 'text-nexus-text-secondary font-semibold' : 'text-nexus-text-muted'}`}>{formatHourLabel(hour)}</span>
                            </div>
                          ))}
                          {showNowLine && (
                            <span
                              className="absolute right-0.5 -translate-y-1/2 rounded-full bg-nexus-error px-1.5 py-0.5 text-xs font-bold text-white nx-num shadow-sm"
                              style={{ top: `${toTop(currentTimeMinutes)}px` }}
                              title="Hora actual"
                            >
                              {minToTime(currentTimeMinutes)}
                            </span>
                          )}
                        </div>

                        {/* COLUMNAS (mismo ancho que el encabezado, se mueven juntas) */}
                        <div className="flex flex-1 divide-x divide-nexus-border bg-nexus-background">

                          {filterBarberId === 'all' && (
                            <div style={{ minWidth: COL_MIN_PX }} className="flex-1 relative bg-nexus-surface-hover">
                              {gridHours.map(hour => (
                                <div
                                  key={hour}
                                  style={{ height: SLOT_PX }}
                                  onClick={() => handleEmptySlotClick('pending', formatHourLabel(hour))}
                                  className="w-full hover:bg-nexus-primary-soft/60 cursor-pointer border-b border-nexus-border/50"
                                />
                              ))}

                              {(filteredReservations || []).filter(r => r?.professionalId === 'pending' || r?.barberId === 'pending').map(res => {
                                const [h, m] = (res?.time || '12:00').split(':').map(Number);
                                const startMin = h * 60 + m;
                                const duration = getReservationDuration(res, services);
                                const topPx = toTop(startMin);
                                const heightPx = duration * PX_PER_MIN;

                                return (
                                  <button
                                    type="button"
                                    key={res?.id}
                                    onClick={(e) => { e.stopPropagation(); handleOpenEditReservation(res); }}
                                    style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                                    title={`Pendiente · ${res?.time} · ${res?.clientName} · ${res?.serviceName}`}
                                    className="absolute left-1 right-1 px-2 py-1 rounded-md border border-dashed shadow-sm bg-nexus-warning-bg border-nexus-warning/60 text-nexus-warning-text hover:opacity-90 transition-opacity cursor-pointer flex flex-col items-start overflow-hidden text-left z-[5]"
                                  >
                                    <span className="block w-full text-xs font-semibold leading-4 truncate">
                                      <span className="nx-num">{res?.time}</span> · Pendiente
                                    </span>
                                    <span className="block w-full text-xs leading-4 truncate">{res?.clientName} · {res?.serviceName}</span>
                                    {heightPx >= 64 && (
                                      <span className="block w-full text-xs leading-4 truncate opacity-80">Sin {tl('professional')} {g('professional', 'asignado', 'asignada')}</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {dayColumns.map(barber => {
                            const barberRes = (filteredReservations || []).filter(r => r?.professionalId === barber?.id || r?.barberId === barber?.id);
                            const barberBl = (blockouts || []).filter(bl => bl?.date === selectedDate && bl?.barberId === barber?.id);
                            const barberDayAvailability = getBarberDayAvailability(barber, selectedDate);

                            return (
                              <div key={barber?.id} style={{ minWidth: COL_MIN_PX }} className="flex-1 relative">

{gridHours.map(hour => (
                                  isHourWithinAvailability(barberDayAvailability, hour) ? (
                                    <div
                                      key={hour}
                                      style={{ height: SLOT_PX }}
                                      onClick={() => handleEmptySlotClick(barber?.id, formatHourLabel(hour))}
                                      className="w-full hover:bg-nexus-primary-soft/60 cursor-pointer border-b border-nexus-border/50"
                                    />
                                  ) : (
                                    <div
                                      key={hour}
                                      style={{ height: SLOT_PX }}
                                      className="w-full bg-nexus-border/30 border-b border-nexus-border/50 cursor-not-allowed"
                                    />
                                  )
                                ))}

                                {barberRes.map(res => {
                                  const [h, m] = (res?.time || '12:00').split(':').map(Number);
                                  const startMin = h * 60 + m;
                                  const duration = getReservationDuration(res, services);
                                  const topPx = toTop(startMin);
                                  const heightPx = duration * PX_PER_MIN;

                                  return (
                                    <button
                                      type="button"
                                      key={res?.id}
                                      onClick={(e) => { e.stopPropagation(); handleOpenEditReservation(res); }}
                                      style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                                      title={`${res?.time} · ${res?.clientName} · ${res?.serviceName}`}
                                      className={`absolute left-1 right-1 px-2 ${heightPx < 40 ? 'py-0.5 justify-center' : 'py-1'} rounded-md border shadow-sm flex flex-col items-start overflow-hidden cursor-pointer transition-opacity text-left z-[5] ${getStatusCardClasses(res?.status)}`}
                                    >
                                      <span className="block w-full text-xs font-semibold leading-4 truncate">
                                        <span className="nx-num">{res?.time}</span> · {res?.clientName}
                                        {heightPx < 40 && <span className="font-normal text-nexus-text-secondary"> · {res?.serviceName}</span>}
                                      </span>
                                      {heightPx >= 40 && (
                                        <span className="block w-full text-xs leading-4 truncate text-nexus-text-secondary">{res?.serviceName}</span>
                                      )}
                                    </button>
                                  );
                                })}

                                {barberBl.map(bl => {
                                  const startMin = timeToMin(bl?.startTime);
                                  const endMin = timeToMin(bl?.endTime);
                                  const duration = endMin - startMin;
                                  const topPx = toTop(startMin);
                                  const heightPx = duration * PX_PER_MIN;

                                  return (
                                    <div
                                      key={bl?.id}
                                      style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                                      className="absolute left-1 right-1 pl-2 pr-1 py-1 rounded-md border shadow-sm bg-nexus-error-bg border-nexus-error/30 text-nexus-error-text flex items-start gap-1 overflow-hidden cursor-default z-[5]"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-semibold leading-4 flex items-center gap-1 min-w-0">
                                          <XCircle className="w-3.5 h-3.5 text-nexus-error shrink-0" aria-hidden="true" />
                                          <span className="truncate">Bloqueado <span className="nx-num font-normal">{bl?.startTime}–{bl?.endTime}</span></span>
                                        </p>
                                        {bl?.reason && <p className="text-xs leading-4 truncate text-nexus-error-text/80">{bl?.reason}</p>}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteBlockout(bl?.id)}
                                        aria-label={`Eliminar bloqueo de ${bl?.startTime} a ${bl?.endTime}`}
                                        title="Eliminar bloqueo"
                                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-nexus-error hover:bg-nexus-error/10 cursor-pointer"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  );
                                })}

                              </div>
                            );
                          })}

                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                </div>
                );
              })()}


              {agendaView === 'semana' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
                  {getWeekDates(selectedDate).map(day => {
                    const dayRes = (agendaBranchReservations || []).filter(r => r?.date === day?.dateStr);
                    return (
                      <div key={day?.dateStr} className="bg-nexus-surface border border-nexus-border rounded-xl p-3 flex flex-col xl:h-80 min-w-0">
                        <div className="border-b border-nexus-border pb-2 mb-2 flex justify-between items-center gap-2">
                          <span className="text-sm font-semibold text-nexus-text">{day?.dayName}</span>
                          <span className="min-w-7 h-7 px-1 rounded-full bg-nexus-primary-soft flex items-center justify-center text-sm font-semibold text-nexus-primary nx-num">
                            {day?.dayNum}
                          </span>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-1.5 scrollbar-none">
                          {dayRes.map(res => (
                            <button
                              type="button"
                              key={res?.id}
                              onClick={() => handleOpenEditReservation(res)}
                              className="w-full text-left px-2.5 py-2 bg-nexus-background border border-nexus-border rounded-lg cursor-pointer hover:border-nexus-primary transition-colors min-w-0"
                            >
                              <span className="flex flex-wrap items-baseline gap-x-2 text-sm min-w-0">
                                <span className="nx-num text-nexus-primary font-semibold shrink-0">{res?.time}</span>
                                <span className="font-semibold text-nexus-text truncate min-w-0 max-w-full">{res?.clientName}</span>
                              </span>
                              <span className="block text-xs text-nexus-text-secondary truncate mt-0.5">{res?.serviceName}</span>
                            </button>
                          ))}
                          {dayRes.length === 0 && (
                            <p className="text-sm text-nexus-text-muted text-center py-2 xl:py-8">Sin {tl('appointments')}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setNewReservation(prev => ({ ...prev, date: day?.dateStr, professionalId: 'pending', barberId: 'pending', time: '' }));
                            setActiveModal('add-reservation');
                          }}
                          className="w-full h-9 mt-2 border border-dashed border-nexus-border hover:border-nexus-primary/50 rounded-lg text-sm font-medium text-nexus-text-secondary hover:text-nexus-text transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Plus className="w-4 h-4" aria-hidden="true" /> Agregar {tl('appointment')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {agendaView === 'mes' && (
                <MonthCalendar
                  dateStr={selectedDate}
                  countFor={(dateStr) => (agendaBranchReservations || []).filter(r => r?.date === dateStr).length}
                  highlighted={selectedDate}
                  onPick={(dateStr) => {
                    setSelectedDate(dateStr);
                    setAgendaView('dia');
                  }}
                  ariaLabelFor={(day, count) => `${day.dayNum}: ${count} ${tl('appointments')}`}
                />
              )}

             {agendaView === 'año' && (
                <YearCalendar
                  countFor={(idx) => {
                    const yearVal = parseDate(selectedDate).getFullYear();
                    const monthId = (idx + 1).toString().padStart(2, '0');
                    return agendaYearCountsMode
                      ? (yearMonthCounts?.[idx] ?? 0)
                      : (agendaBranchReservations || []).filter(r => r?.date?.startsWith(`${yearVal}-${monthId}`)).length;
                  }}
                  unitLabel="Reservas"
                  onPick={(idx) => {
                    const yearVal = parseDate(selectedDate).getFullYear();
                    const monthId = (idx + 1).toString().padStart(2, '0');
                    setSelectedDate(`${yearVal}-${monthId}-01`);
                    setAgendaView('mes');
                  }}
                />
              )}
            </div>
          )}

          {/* ==========================================
              3. PESTAÑA: LISTADO DE STAFF PROFESIONAL
              (Fase 4: tabla en escritorio y tarjetas en celular, mismos datos y acciones)
              ========================================== */}
          {(activeTab === 'barbers' || activeTab === 'assistance') && hasFeature(planFeatures, 'asistencia') && hasModule('assistance') && (
            <SectionTabs
              ariaLabel={t('professionals')}
              active={activeTab}
              onChange={setActiveTab}
              tabs={[{ id: 'barbers', label: t('professionals') }, { id: 'assistance', label: 'Asistencia' }]}
            />
          )}

          {(activeTab === 'services' || activeTab === 'promotions') && hasFeature(planFeatures, 'promociones') && (
            <SectionTabs
              ariaLabel={t('services')}
              active={activeTab}
              onChange={setActiveTab}
              tabs={[{ id: 'services', label: t('services') }, { id: 'promotions', label: 'Promociones' }]}
            />
          )}

          {activeTab === 'barbers' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <SearchField
                  value={searchBarberQuery}
                  onChange={(e) => setSearchBarberQuery(e.target.value)}
                  placeholder={`Buscar ${tl('professional')} por nombre o sucursal...`}
                />
                <Button
                  icon={Plus}
                  className="w-full sm:w-auto"
                  onClick={() => {
                    const staffLimit = getFeatureLimit(planFeatures, 'profesionales');
                    if (staffLimit !== null && barbers.length >= staffLimit) {
                      triggerToast(`Tu plan permite hasta ${staffLimit} ${tl('professionals')}. Amplía tu plan o agrega ${tl('professionals')} adicionales para registrar más.`, 'error');
                      return;
                    }
                    resetBarberForm();
                    setEditingBarberId(null);
                    setActiveModal('add-barber');
                  }}
                >
                  Registrar {t('professional')}
                </Button>
              </div>

              {barberBranchFilter !== 'all' && (
                <div className="flex items-center gap-2 text-sm text-nexus-text-secondary">
                  <span>Sucursal: <strong className="text-nexus-text">{barberBranchFilter}</strong></span>
                  <button type="button" onClick={() => setBarberBranchFilter('all')} className="text-xs font-semibold text-nexus-primary underline cursor-pointer">Ver todas</button>
                </div>
              )}

              {filteredBarbersList.length === 0 ? (
                <div className="rounded-xl border border-nexus-border bg-nexus-surface">
                  <EmptyState icon={Users} title={`No se encontraron ${tl('professionals')} ${g('professional', 'registrados', 'registradas')}.`} />
                </div>
              ) : (
                // Tarjetas: una columna en celular, cuadrícula en tablet y escritorio.
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredBarbersList.map((b) => (
                    <div key={b?.id} className="rounded-xl border border-nexus-border bg-nexus-surface p-4 shadow-[var(--nx-shadow-sm)]">
                      <div className="flex items-center gap-3">
                        <Avatar src={b?.avatar} name={b?.name} className="w-12 h-12 rounded-xl object-cover border border-nexus-border shrink-0" textClassName="text-sm" />
                        <span className="min-w-0 flex-1 truncate font-semibold text-nexus-text">{b?.name}</span>
                        <IconButton icon={Edit3} tone="primary" label={`Editar a ${b?.name}`} onClick={() => handleEditBarber(b)} />
                        <IconButton icon={Trash2} tone="danger" label={`Eliminar a ${b?.name}`} onClick={() => handleDeleteBarber(b?.id)} />
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-nexus-border pt-3 text-sm">
                        <div className="min-w-0">
                          <dt className="text-xs text-nexus-text-muted">Sucursal</dt>
                          <dd className="mt-0.5 truncate text-nexus-text">{b?.branch || '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-nexus-text-muted">Estado</dt>
                          <dd className="mt-0.5"><Badge tone={b?.active ? 'success' : 'danger'}>{b?.active ? 'Activo' : 'Inactivo'}</Badge></dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ==========================================
              4. PESTAÑA: SERVICIOS (NEUTROS)
              ========================================== */}
          {activeTab === 'services' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-nexus-text">
                  {t('services')} disponibles <span className="font-normal text-nexus-text-muted nx-num">({(services || []).length})</span>
                </h3>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  {/* Modo registros: sin link público, no hay fotos que mostrar ahí. */}
                  {!registrosMode && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={heroConfig.showServiceImages !== false}
                    onClick={handleToggleServiceImages}
                    className="inline-flex h-10 items-center justify-between sm:justify-start gap-2 rounded-lg border border-nexus-border bg-nexus-surface px-3 text-sm font-medium text-nexus-text-secondary hover:bg-nexus-surface-hover cursor-pointer"
                  >
                    <span>Fotos en el link público</span>
                    {heroConfig.showServiceImages !== false
                      ? <ToggleRight className="w-7 h-7 text-nexus-success" aria-hidden="true" />
                      : <ToggleLeft className="w-7 h-7 text-nexus-text-muted" aria-hidden="true" />}
                  </button>
                  )}
                  <Button icon={Plus} className="w-full sm:w-auto" onClick={openNewServiceModal}>
                    Agregar {t('service')}
                  </Button>
                </div>
              </div>

              {(services || []).length === 0 ? (
                <div className="rounded-xl border border-nexus-border bg-nexus-surface">
                  <EmptyState icon={ServiceIcon} title={`Aún no hay ${tl('services')}`} description={`Agrega ${g('service', 'tu primer', 'tu primera')} ${tl('service')} para empezar a recibir reservas.`} />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                  {(services || []).map(s => (
                    <div key={s?.id} className="bg-nexus-surface border border-nexus-border rounded-xl p-4 flex flex-col justify-between shadow-sm min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditService(s)}
                          aria-label={s?.image ? `Cambiar foto de ${s?.name}` : `Agregar foto a ${s?.name}`}
                          title={s?.image ? 'Cambiar foto' : 'Agregar foto'}
                          className="w-14 h-14 shrink-0 overflow-hidden rounded-lg border border-nexus-border bg-nexus-background flex items-center justify-center text-nexus-text-muted hover:border-nexus-primary/50 cursor-pointer"
                        >
                          {s?.image
                            ? <img src={cloudinaryThumb(s.image, 160)} alt="" className="w-full h-full object-cover" loading="lazy" />
                            : <ImagePlus className="w-5 h-5" aria-hidden="true" />}
                        </button>
                        <div className="min-w-0 pt-1 flex-1">
                          <h4 className="font-semibold text-nexus-text text-base leading-snug break-words">{s?.name}</h4>
                          <p className="text-sm text-nexus-text-secondary mt-1">
                            Duración: <span className="nx-num">{s?.duration} min</span>
                          </p>
                        </div>
                        <div className="flex items-center -mr-2 -mt-1 shrink-0">
                          <IconButton icon={Edit3} tone="primary" label={`Editar ${tl('service')} ${s?.name}`} onClick={() => handleEditService(s)} />
                          <IconButton icon={Trash2} tone="danger" label={`Eliminar ${tl('service')} ${s?.name}`} onClick={() => handleDeleteService(s?.id)} />
                        </div>
                      </div>
                      <div className="flex justify-between items-center gap-3 border-t border-nexus-border pt-3 mt-4">
                        <span className="text-sm text-nexus-text-secondary">Precio general</span>
                        <span className="text-nexus-primary nx-num font-bold text-base">{formatServicePrice(s)}</span>
                      </div>
                      {hasCustomPrices(s, barbers) && (
                        <div className="flex justify-between items-center gap-3 pt-1.5">
                          <span className="text-xs text-nexus-text-muted">Varía por {tl('professional')}</span>
                          <span className="nx-num text-xs font-semibold text-nexus-text-secondary">{formatServicePriceFor(s, { professionals: barbers })}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ==========================================
              5. PESTAÑA: CLIENTES
              ========================================== */}
          {activeTab === 'clients' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <SearchField
                  value={searchClientQuery}
                  onChange={(e) => setSearchClientQuery(e.target.value)}
                  placeholder={`Buscar ${tl('client')} por nombre o teléfono...`}
                />
                <p className="text-sm text-nexus-text-secondary nx-num">{filteredClientsList.length} {tl('clients')}</p>
              </div>

              <ResponsiveTable
                rows={filteredClientsList}
                rowKey={(c) => c?.id}
                onRowClick={(c) => setSelectedClientId(c?.id)}
                empty={(
                  <div className="rounded-xl border border-nexus-border bg-nexus-surface">
                    <EmptyState icon={UserCheck} title={`No se encontraron ${tl('clients')}`} />
                  </div>
                )}
                columns={[
                  {
                    key: 'name',
                    header: 'Nombre completo',
                    primary: true,
                    render: (c) => <span className="font-semibold text-nexus-text">{c?.name}</span>,
                  },
                  { key: 'phone', header: 'Teléfono', render: (c) => <span className="nx-num text-nexus-text-secondary">{c?.phone}</span> },
                  {
                    key: 'visits',
                    header: 'Visitas',
                    align: 'center',
                    render: (c) => <span className="inline-flex min-w-7 justify-center rounded-full bg-nexus-primary-soft px-2 py-0.5 text-sm font-semibold text-nexus-primary nx-num">{c?.visits}</span>,
                  },
                  { key: 'lastVisit', header: 'Última visita', render: (c) => <span className="nx-num text-nexus-text-secondary">{c?.lastVisit || '—'}</span> },
                  { key: 'favoriteService', header: `${t('service')} ${g('service', 'favorito', 'favorita')}`, render: (c) => <span className="text-nexus-text-secondary">{c?.favoriteService || '—'}</span> },
                ]}
              />
            </div>
          )}

          {/* ==========================================
              6. PESTAÑA: SUCURSALES (SOPORTE AVANZADO)
              ========================================== */}
          {activeTab === 'branches' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <SearchField
                  value={searchBranchQuery}
                  onChange={(e) => setSearchBranchQuery(e.target.value)}
                  placeholder="Buscar sucursal por dirección..."
                />
                <Button
                  icon={Plus}
                  className="w-full sm:w-auto"
                  onClick={() => {
                    const sucursalesLimit = getFeatureLimit(planFeatures, 'sucursales');
                    if (sucursalesLimit !== null && branches.length >= sucursalesLimit) {
                      triggerToast(`Tu plan permite hasta ${sucursalesLimit} ${sucursalesLimit === 1 ? 'sucursal' : 'sucursales'}. Amplía tu plan para agregar más.`, 'error');
                      return;
                    }
                    setEditingBranchId(null);
                    setNewBranch({ name: '', phone: '', address: '', schedule: '', lat: -17.7732, lng: -63.1821, createdDate: '' });
                    setLocationSearch('');
                    setActiveModal('add-branch');
                  }}
                >
                  Nueva sucursal
                </Button>
              </div>

              {filteredBranchesList.length === 0 ? (
                <div className="rounded-xl border border-nexus-border bg-nexus-surface">
                  <EmptyState icon={Building2} title="No se encontraron sucursales" />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                  {filteredBranchesList.map(b => (
                    <div key={b?.id} className="bg-nexus-surface border border-nexus-border rounded-xl overflow-hidden flex flex-col justify-between shadow-sm min-w-0">
                      <div className="relative h-28 bg-nexus-primary-soft">
                        {b?.image ? (
                          <img src={cloudinaryThumb(b.image, 700)} alt="" className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-nexus-primary/60"><Building2 className="w-8 h-8" aria-hidden="true" /></div>
                        )}
                        {!b?.image && (
                          <span className="absolute bottom-2 left-2 rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white">
                            Sin foto del local
                          </span>
                        )}
                      </div>
                      <div className="p-4 sm:p-5 pb-0 sm:pb-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h4 className="text-base font-semibold text-nexus-text pt-1.5 break-words min-w-0">{b?.name}</h4>
                          <div className="flex -mr-2 -mt-0.5 shrink-0">
                            <IconButton icon={Edit3} tone="primary" label={`Editar sucursal ${b?.name}`} onClick={() => handleEditBranch(b)} />
                            <IconButton icon={Trash2} tone="danger" label={`Eliminar sucursal ${b?.name}`} onClick={() => handleDeleteBranch(b?.id)} />
                          </div>
                        </div>
                        {b?.phone && <p className="text-sm text-nexus-text-secondary nx-num mb-1">{b?.phone}</p>}
                        {b?.address && (
                          <p className="text-sm text-nexus-text-secondary leading-relaxed mb-4 flex gap-1.5">
                            <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-nexus-text-muted" aria-hidden="true" />
                            <span className="min-w-0">{b?.address}</span>
                          </p>
                        )}
                      </div>
                      <div className="mx-4 sm:mx-5 mb-4 sm:mb-5 border-t border-nexus-border pt-3 flex justify-between items-center gap-3 text-xs text-nexus-text-muted">
                        <span>Coordenadas</span>
                        <span className="nx-num">{typeof b?.lat === 'number' && typeof b?.lng === 'number' ? `${b.lat.toFixed(3)}, ${b.lng.toFixed(3)}` : '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'promotions' && (
            <PromotionsPage
              negocioId={negocioId}
              services={services}
              branches={branches}
              onToast={triggerToast}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryPage
              negocioId={negocioId}
              branches={branches}
              clients={clients}
              user={user}
              onToast={triggerToast}
            />
          )}

          {/* ==========================================
              7. PESTAÑA: COMISIONES DEL STAFF
              ========================================== */}
          {activeTab === 'commissions' && (
            <div className="space-y-4">
              {/* Fase 4: tabla en escritorio y tarjetas en celular; mismas cifras y acciones.
                  "Liquidar" se bloquea mientras guarda para no liquidar dos veces. */}
              <ResponsiveTable
                rows={barberCommissionsList}
                rowKey={(b) => b?.id}
                breakpoint="lg"
                mobileActions="bottom"
                empty={(
                  <div className="rounded-xl border border-nexus-border bg-nexus-surface">
                    <EmptyState icon={DollarSign} title={`Sin ${tl('professionals')} ${g('professional', 'asignados', 'asignadas')} en esta sucursal.`} />
                  </div>
                )}
                columns={[
                  {
                    key: 'name',
                    header: t('professional'),
                    primary: true,
                    render: (barb) => (
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Avatar src={barb?.avatar} name={barb?.name} className="w-9 h-9 rounded-full object-cover border border-nexus-border shrink-0" textClassName="text-xs" />
                        <span className="font-semibold text-nexus-text truncate">{barb?.name}</span>
                      </span>
                    ),
                  },
                  { key: 'serviciosCount', header: t('services'), align: 'right', render: (barb) => <span className="nx-num text-nexus-text-secondary">{barb?.serviciosCount}</span> },
                  { key: 'comisionTotal', header: 'Comisión total', align: 'right', render: (barb) => <span className="nx-num font-bold text-nexus-primary">{formatBs(barb?.comisionTotal)}</span> },
                  { key: 'comisionPagada', header: 'Pagada', align: 'right', render: (barb) => <span className="nx-num font-semibold text-nexus-success-text">{formatBs(barb?.comisionPagada)}</span> },
                  { key: 'comisionPendiente', header: 'Pendiente', align: 'right', render: (barb) => <span className="nx-num font-semibold text-nexus-error-text">{formatBs(barb?.comisionPendiente)}</span> },
                ]}
                actions={(barb) => (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => setCommissionDetailBarberId(barb?.id)}>
                      Ver detalle
                    </Button>
                    <Button size="sm" disabled={!(barb?.comisionPendiente > 0)} onClick={() => handleLiquidarComisiones(barb)}>
                      Liquidar
                    </Button>
                  </>
                )}
              />

              {commissionDetailBarberId && (() => {
                const detailBarber = barberCommissionsList.find(b => b?.id === commissionDetailBarberId);
                if (!detailBarber) return null;
                return (
                  <Modal
                    open
                    onClose={() => setCommissionDetailBarberId(null)}
                    title="Detalle de comisiones"
                    description={detailBarber?.name}
                    size="md"
                  >
                    <div className="space-y-2">
                      {(detailBarber?.detalle || []).map(item => (
                        <div key={item.id} className="flex items-center justify-between gap-3 bg-nexus-background border border-nexus-border rounded-lg p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-nexus-text truncate">{item.serviceName}</p>
                            <p className="text-xs text-nexus-text-secondary nx-num">{item.date}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm nx-num font-bold text-nexus-primary">{formatBs(item.amount)}</p>
                            <Badge tone={item.paid ? 'success' : 'danger'}>{item.paid ? 'Pagada' : 'Pendiente'}</Badge>
                          </div>
                        </div>
                      ))}
                      {(detailBarber?.detalle || []).length === 0 && (
                        <p className="text-center text-nexus-text-muted text-sm py-6">Sin {tl('services')} {g('service', 'completados', 'completadas')} en este periodo.</p>
                      )}
                    </div>
                  </Modal>
                );
              })()}

              {payingBarber && (
                <CommissionPayModal
                  professional={payingBarber}
                  amount={payingBarber.comisionPendiente}
                  periodLabel={periodStart === periodEnd ? periodStart : `${periodStart} al ${periodEnd}`}
                  paymentMethods={businessSettings.paymentMethods}
                  onClose={() => setPayingBarber(null)}
                  onPay={(method) => payCommission({
                    barberId: payingBarber.id,
                    startDate: periodStart,
                    endDate: periodEnd,
                    method,
                    branchId: branches.find(b => b?.name === payingBarber.branch)?.id || null,
                  })}
                />
              )}
            </div>
          )}

          {/* ==========================================
              8. PESTAÑA: ASISTENCIAS
              ========================================== */}
          {activeTab === 'assistance' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-nexus-surface p-4 border border-nexus-border rounded-xl">
                <h3 className="text-base font-semibold text-nexus-text">Asistencia</h3>
                <button
                  onClick={() => setActiveModal('assistance')}
                  className="inline-flex h-10 items-center justify-center gap-1.5 px-4 bg-nexus-primary text-white font-extrabold rounded-lg text-sm shadow-md cursor-pointer font-bold"
                >
                  Marcar asistencia
                </button>
              </div>

              <ResponsiveTable
                rows={attendanceSummaryList}
                rowKey={(barb) => barb?.id}
                breakpoint="lg"
                columns={[
                  {
                    key: 'name',
                    header: t('professional'),
                    primary: true,
                    render: (barb) => (
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Avatar src={barb?.avatar} name={barb?.name} className="w-9 h-9 rounded-full object-cover border border-nexus-border shrink-0" textClassName="text-xs" />
                        <span className="font-semibold text-nexus-text">{barb?.name}</span>
                      </span>
                    ),
                  },
                  { key: 'attended', header: 'Asistido', align: 'center', render: (barb) => <span className="nx-num font-semibold">{barb?.attended} días</span> },
                  { key: 'delayed', header: 'Retrasos', align: 'center', render: (barb) => <span className="nx-num font-semibold text-nexus-error-text">{barb?.delayed} días</span> },
                  { key: 'ontime', header: 'A tiempo', align: 'center', render: (barb) => <span className="nx-num font-semibold text-nexus-primary">{barb?.ontime} días</span> },
                  { key: 'absent', header: 'Faltas', align: 'center', render: (barb) => <span className="nx-num text-nexus-text-secondary">{barb?.absent} días</span> },
                  {
                    key: 'today',
                    header: 'Hoy (entrada / salida)',
                    align: 'right',
                    render: (barb) => (
                      <span className="nx-num">
                        <span className={barb?.attendance?.in ? 'text-nexus-primary font-semibold' : 'text-nexus-text-muted'}>{barb?.attendance?.in || '--:--'}</span>
                        <span className="text-nexus-text-muted mx-1.5">/</span>
                        <span className={barb?.attendance?.out ? 'text-nexus-primary font-semibold' : 'text-nexus-text-muted'}>{barb?.attendance?.out || '--:--'}</span>
                      </span>
                    ),
                  },
                ]}
              />
            </div>
          )}

          {/* ==========================================
              9. PESTAÑA: ANALÍTICAS
              ========================================== */}
          {activeTab === 'registros' && canUseCapability('registroServicios') && (
            <div className="p-4 md:p-6">
            <RegistrosPanel
              isAdmin
              professionals={barbers}
              services={services}
              clients={clients}
              paymentMethods={businessSettings.paymentMethods}
              refreshKey={registrosTick}
              onRegister={() => setRegistroModalOpen(true)}
              registerDesktopOnly={registrosMode}
              onToast={triggerToast}
            />
            </div>
          )}

          {activeTab === 'reports' && (
           <AnalyticsSection
           reservations={branchReservations}
           barbers={branchBarbers}
           agendaView={agendaView}
           selectedDate={selectedDate}
           selectedBranch={selectedBranch}
           negocioId={negocioId}
           paymentMethods={businessSettings.paymentMethods}
           branches={branches}
           registros={registrosMode}
           />
         )}

         {activeTab === 'settings' && (
            <SettingsPage 
            negocioId={negocioId} 
            user={user} 
            businessName={businessName}
            setBusinessName={setBusinessName}
            isEditingBusinessName={isEditingBusinessName}
            setIsEditingBusinessName={setIsEditingBusinessName}
            onLogout={logout}
            activeSection={settingsSection === 'automation' && !hasFeature(planFeatures, 'asistenteWhatsapp') ? 'business' : settingsSection}
            onChangeSection={setSettingsSection}
            registrosMode={registrosMode}
          />
          )}

        </div>

        

    </main>

      {/* ==========================================
          NOTIFICATION TOAST SYSTEM
          ========================================== */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 max-w-xs">
        {toasts.map(t => (
          <div 
            key={t?.id} 
            className={`p-3 rounded-xl border shadow-2xl flex items-center gap-2.5 transition-all transform duration-300 ${
              t?.type === 'error' 
                ? 'bg-nexus-error-bg border-nexus-error/25 text-nexus-error-text animate-fadeIn' 
                : 'bg-nexus-success-bg border-nexus-success/25 text-nexus-success-text animate-fadeIn'
            }`}
          >
            {t?.type === 'error' ? (
              <XCircle className="w-4 h-4 text-nexus-error shrink-0" />
            ) : (
              <CheckCircle className="w-4 h-4 text-nexus-success shrink-0" />
            )}
            <p className="text-[11px] font-bold">{t?.message}</p>
          </div>
        ))}
      </div>

      {/* ==========================================
          MODALES DE ACCIONES DEL PANEL
          ========================================== */}
      
      {/* 1. MODAL: AGENDAR CITA */}
      {activeModal === 'add-reservation' && (
        <AppointmentCreateModal
        services={services}
        professionals={branchBarbers}
        clients={clients}
        initialDate={newReservation.date || selectedDate}
        initialTime={newReservation.time || '12:00'}
        initialProfessionalId={newReservation.professionalId}   // ← nuevo
        onClose={() => setActiveModal(null)}
          onSubmit={(draft) => {
            // Reutilizar handleCreateReservation pero alimentado por el draft
            // del componente compartido en lugar del state newReservation.
            setNewReservation({
              clientName: draft.clientName,
              phone: draft.phone || '',
              clientId: draft.clientId || null,
              serviceId: draft.serviceId,
              professionalId: draft.professionalId,
              barberId: draft.professionalId,
              date: draft.date,
              time: draft.time,
              paymentMethod: draft.paymentMethod,
              bookedBy: 'admin',
              notes: draft.notes || '',
            });
            // handleCreateReservation lee de newReservation, pero setState es
            // asíncrono. Lo llamamos con el draft directamente para evitar un
            // ciclo de render extra. Se devuelve la promesa para que el modal
            // bloquee el botón mientras se guarda (evita reservas duplicadas).
            return handleCreateReservationFromDraft(draft);
          }}
        />
      )}

      {/* 2. MODAL EDITAR / MODIFICAR RESERVACIÓN */}
      {activeModal === 'edit-reservation' && editingReservation && (
        <AppointmentManageModal
        appointment={editingReservation}
        clients={clients}
        role="admin"
        services={services}
        professionals={branchBarbers}
        candidateProfessionals={pendingEditCandidates}
        paymentMethods={businessSettings.paymentMethods}
        onClose={() => setActiveModal(null)}
          onChangeField={(field, value) => {
            if (field === 'professionalId') {
              setEditingReservation(prev => ({ ...prev, professionalId: value, barberId: value, ...repriceForProfessional(prev, value) }));
            } else {
              setEditingReservation(prev => ({ ...prev, [field]: value }));
            }
          }}
          onSubmit={handleUpdateReservation}
          onDelete={handleDeleteReservation}
          onTransition={(nextStatus, paymentMethod) => handleUpdateStatus(editingReservation?.id, nextStatus, paymentMethod)}
        />
      )}

      {/* 3. MODAL EXCLUSIVO: BLOQUEAR HORARIO ADMINISTRATIVO */}
      {activeModal === 'add-blockout' && (
        <div className="fixed inset-0 bg-nexus-navy/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div role="dialog" aria-modal="true" className="max-h-[92dvh] overflow-y-auto bg-nexus-surface border border-nexus-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 relative shadow-xl">
            <h3 className="text-base font-bold text-nexus-error-text mb-1 nx-num">Bloquear horario</h3>
            <p className="text-xs text-nexus-text-secondary mb-4">Nadie podrá reservar en ese horario.</p>

            <form onSubmit={handleCreateBlockout} className="space-y-3.5">
              <div>
                <label className="text-xs text-nexus-text-secondary font-bold block mb-1 font-sans">{t('professional')} *</label>
                <select 
                  required
                  value={blockoutForm.barberId}
                  onChange={(e) => setBlockoutForm(prev => ({ ...prev, barberId: e.target.value }))}
                  className="w-full bg-nexus-background border border-nexus-border rounded-lg text-nexus-text outline-none px-3 h-10 text-base sm:text-sm"
                >
                  <option value="">Elige {tl('professional')}...</option>
                  {(branchBarbers || []).filter(b => b?.active).map(b => (
                    <option key={b?.id} value={b?.id}>{b?.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-nexus-text-secondary font-bold block mb-1">Motivo *</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej. Limpieza, Almuerzo, Reunión"
                  value={blockoutForm.reason}
                  onChange={(e) => setBlockoutForm(prev => ({ ...prev, reason: e.target.value }))}
                  className="w-full bg-nexus-background border border-nexus-border rounded-lg text-nexus-text outline-none px-3 h-10 text-base sm:text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-nexus-text-secondary font-bold block mb-1">Hora de inicio *</label>
                  <input 
                    type="time" 
                    required
                    value={blockoutForm.startTime}
                    onChange={(e) => setBlockoutForm(prev => ({ ...prev, startTime: e.target.value }))}
                    className="w-full bg-nexus-background border border-nexus-border rounded-lg text-nexus-text outline-none nx-num px-3 h-10 text-base sm:text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs text-nexus-text-secondary font-bold block mb-1">Hora de fin *</label>
                  <input 
                    type="time" 
                    required
                    value={blockoutForm.endTime}
                    onChange={(e) => setBlockoutForm(prev => ({ ...prev, endTime: e.target.value }))}
                    className="w-full bg-nexus-background border border-nexus-border rounded-lg text-nexus-text outline-none nx-num px-3 h-10 text-base sm:text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button 
                  type="button" 
                  onClick={() => setActiveModal(null)}
                  className="inline-flex h-10 items-center justify-center gap-1.5 px-4  bg-nexus-surface border border-nexus-border text-nexus-text-secondary text-sm font-semibold rounded-lg hover:bg-nexus-surface-hover cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="inline-flex h-10 items-center justify-center gap-1.5 px-4  bg-nexus-error text-white text-sm font-bold rounded-lg hover:opacity-90 cursor-pointer"
                >
                  Bloquear horario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. MODAL CONTEXTUAL: ACCIONES AL CLICAR ESPACIO VACÍO */}
      {activeModal === 'slot-actions' && (
        <div className="fixed inset-0 bg-nexus-navy/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div role="dialog" aria-modal="true" className="max-h-[92dvh] overflow-y-auto bg-nexus-surface border border-nexus-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xs p-5 relative shadow-xl text-center">
            <h4 className="text-sm font-bold text-nexus-text mb-1">Horario</h4>
            <p className="text-xs text-nexus-text-secondary nx-num mb-4">Bloque: {clickedSlot?.time} ({selectedDate})</p>

            <div className="space-y-2">
              <button 
                onClick={startResFromSlot}
                className="w-full h-10 inline-flex items-center justify-center bg-nexus-primary hover:bg-nexus-primary-hover text-white text-sm font-bold rounded-lg transition-all cursor-pointer"
              >
                Crear nueva reserva
              </button>
              <button 
                onClick={startBlockoutFromSlot}
                className="w-full h-10 inline-flex items-center justify-center bg-nexus-surface border border-nexus-border hover:bg-nexus-surface-hover text-nexus-error-text text-sm font-bold rounded-lg transition-all cursor-pointer"
              >
                Bloquear este espacio
              </button>
              <button 
                onClick={() => setActiveModal(null)}
                className="w-full h-10 text-nexus-text-secondary hover:text-nexus-text text-sm font-semibold cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          5. MODAL MULTI-STEP: AGREGAR / EDITAR PROFESIONAL
          ========================================== */}
            {credentialNotice && (
        <Modal
          open
          onClose={() => setCredentialNotice(null)}
          title="Datos de acceso"
          description={credentialNotice.name}
          size="sm"
          footer={<Button onClick={() => setCredentialNotice(null)}>Listo</Button>}
        >
          <div className="space-y-3">
            <p className="text-sm text-nexus-text-secondary">Pásale estos datos. Por seguridad, la contraseña no se volverá a mostrar.</p>
            <div className="bg-nexus-background border border-nexus-border rounded-lg p-3">
              <p className="text-xs text-nexus-text-secondary">Usuario</p>
              <p className="text-sm font-bold text-nexus-text">{credentialNotice.username}</p>
              <p className="text-xs text-nexus-text-secondary mt-2">Contraseña</p>
              <p className="text-sm font-bold text-nexus-text nx-num tracking-wide">{credentialNotice.password}</p>
            </div>
            <Button variant="secondary" onClick={handleCopyCredentials} className="w-full">
              <Copy className="w-4 h-4" /> Copiar datos
            </Button>
          </div>
        </Modal>
      )}

      {activeModal === 'add-barber' && (
        <div className="fixed inset-0 bg-nexus-navy/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div role="dialog" aria-modal="true" className="bg-nexus-surface border border-nexus-border rounded-t-2xl sm:rounded-2xl w-full max-w-4xl p-0 relative shadow-xl overflow-hidden flex flex-col max-h-[92dvh]">
            
            <div className="bg-nexus-background border-b border-nexus-border px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold text-nexus-text tracking-tight flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-nexus-primary" />
                  {editingBarberId ? `Editar ${tl('professional')}` : `${g('professional', 'Nuevo', 'Nueva')} ${tl('professional')}`}
                </h3>
              </div>

              <div className={`grid ${lastBarberStep === 3 ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5 text-xs sm:text-sm w-full md:flex md:items-center md:gap-2.5 md:w-auto`}>
                <button 
                  type="button"
                  onClick={() => setBarberStep(1)}
                  className={`h-9 px-2.5 sm:px-3 rounded-md font-semibold transition-all flex items-center justify-center gap-1.5 min-w-0 whitespace-nowrap ${
                    barberStep === 1 
                      ? 'bg-nexus-primary text-white shadow-md' 
                      : 'bg-nexus-surface text-nexus-text-secondary hover:text-nexus-text'
                  }`}
                >
                  <span className="w-5 h-5 shrink-0 rounded-full bg-black/10 flex items-center justify-center text-xs font-bold">1</span>
                  Básico
                </button>
                <div className="w-6 h-[1.5px] bg-nexus-border hidden md:block" />
                <button 
                  type="button"
                  onClick={() => {
                    if (validateStep1()) {
                      setBarberStep(2);
                    }
                  }}
                  className={`h-9 px-2.5 sm:px-3 rounded-md font-semibold transition-all flex items-center justify-center gap-1.5 min-w-0 whitespace-nowrap ${
                    barberStep === 2 
                      ? 'bg-nexus-primary text-white shadow-md' 
                      : 'bg-nexus-surface text-nexus-text-secondary hover:text-nexus-text'
                  }`}
                >
                  <span className="w-5 h-5 shrink-0 rounded-full bg-black/10 flex items-center justify-center text-xs font-bold">2</span>
                  {t('services')}
                </button>
                {lastBarberStep === 3 && (<>
                <div className="w-6 h-[1.5px] bg-nexus-border hidden md:block" />
                <button 
                  type="button"
                  onClick={() => {
                    if (validateStep1()) {
                      setBarberStep(3);
                    }
                  }}
                  className={`h-9 px-2.5 sm:px-3 rounded-md font-semibold transition-all flex items-center justify-center gap-1.5 min-w-0 whitespace-nowrap ${
                    barberStep === 3 
                      ? 'bg-nexus-primary text-white shadow-md' 
                      : 'bg-nexus-surface text-nexus-text-secondary hover:text-nexus-text'
                  }`}
                >
                  <span className="w-5 h-5 shrink-0 rounded-full bg-black/10 flex items-center justify-center text-xs font-bold">3</span>
                  Disponibilidad
                </button>
                </>)}
              </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto space-y-6">
              
              {barberStep === 1 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
                  
                  <div 
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-nexus-background border border-dashed border-nexus-border hover:border-nexus-primary/60 rounded-xl p-5 flex flex-col items-center justify-center gap-4 shadow-inner text-center cursor-pointer group transition-all"
                  >
                    <input 
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="image/*"
                      className="hidden"
                    />
                    <span className="text-xs text-nexus-text-secondary  block mb-1">Fotografía {g('professional', 'del', 'de la')} {t('professional')}</span>
                    <div className="relative">
                    <Avatar
                        src={newBarber.avatar}
                        name={newBarber.name}
                        alt="Preview Avatar"
                        className="w-32 h-32 rounded-xl object-cover border-4 border-nexus-border group-hover:border-nexus-primary transition-all duration-300 shadow-md"
                        textClassName="text-4xl"
                      />
                      <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Upload className="w-6 h-6 text-white" />
                      </div>
                    </div>
                    <div className="text-xs text-nexus-text-secondary mt-2">
                      <span className="text-nexus-primary font-bold block mb-1">Subir foto</span>
                      Arrastra una imagen o toca para elegirla.
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-4">
                    <div className="grid grid-cols-2 gap-3.5">
                      <div>
                        <label className="text-xs text-nexus-text-secondary font-bold block mb-1">Nombre *</label>
                        <input 
                          type="text" 
                          required
                          placeholder="Ej. Sofía"
                          value={newBarber.firstName}
                          onChange={(e) => setNewBarber(prev => ({ ...prev, firstName: e.target.value }))}
                          className="w-full bg-nexus-background border border-nexus-border rounded-lg text-nexus-text outline-none focus:border-nexus-primary px-3 h-10 text-base sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-nexus-text-secondary font-bold block mb-1">Apellido *</label>
                        <input 
                          type="text" 
                          required
                          placeholder="Ej. Méndez"
                          value={newBarber.lastName}
                          onChange={(e) => setNewBarber(prev => ({ ...prev, lastName: e.target.value }))}
                          className="w-full bg-nexus-background border border-nexus-border rounded-lg text-nexus-text outline-none focus:border-nexus-primary px-3 h-10 text-base sm:text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3.5">
                      <div>
                        <label className="text-xs text-nexus-text-secondary font-bold block mb-1">Usuario</label>
                        <div className="flex items-center bg-nexus-surface border border-nexus-border rounded-lg h-10 px-3 text-sm text-nexus-text-secondary font-semibold select-none">
                          <input 
                            type="text"
                            readOnly
                            value={newBarber.username}
                            placeholder="sofia.mendez"
                            className="bg-transparent border-none outline-none text-nexus-primary w-full font-semibold text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-nexus-text-secondary font-bold block mb-1">Sucursal *</label>
                        <select 
                          value={newBarber.branch}
                          onChange={(e) => setNewBarber(prev => ({ ...prev, branch: e.target.value }))}
                          className="w-full bg-nexus-background border border-nexus-border rounded-lg text-nexus-text outline-none focus:border-nexus-primary px-3 h-10 text-base sm:text-sm"
                        >
                          {(branches || []).map(b => (
                            <option key={b?.id} value={b?.name}>{b?.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3.5">
                      <div>
                        <label className="text-xs text-nexus-text-secondary font-bold block mb-1">PIN de asistencia</label>
                        <div className="flex items-center bg-nexus-background border border-nexus-border rounded-lg overflow-hidden pr-1.5">
                          <input 
                            type="text"
                            required
                            maxLength="4"
                            value={newBarber.pin}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9]/g, '');
                              setNewBarber(prev => ({ ...prev, pin: val }));
                            }}
                            className="w-full bg-transparent border-none text-nexus-text outline-none nx-num font-bold tracking-widest px-3 h-10 text-base sm:text-sm"
                          />
                          <button 
                            type="button"
                            onClick={handleRegeneratePin}
                            className="inline-flex h-9 w-9 items-center justify-center hover:bg-nexus-surface-hover text-nexus-text-secondary hover:text-nexus-text rounded-md transition-colors cursor-pointer"
                            title="Regenerar PIN Aleatorio"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-nexus-primary" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-nexus-text-secondary font-bold block mb-1">Estado</label>
                        <div className="flex items-center gap-2 mt-2">
                          <button 
                            type="button"
                            onClick={() => setNewBarber(prev => ({ ...prev, active: !prev.active }))}
                            className="inline-flex h-9 w-9 items-center justify-center hover:bg-nexus-surface-hover rounded-md transition-colors cursor-pointer"
                          >
                            {newBarber.active ? (
                              <ToggleRight className="w-8 h-8 text-nexus-primary" />
                            ) : (
                              <ToggleLeft className="w-8 h-8 text-nexus-text-muted" />
                            )}
                          </button>
                          <span className="text-xs font-bold text-nexus-text nx-num">
                            {newBarber.active ? g('professional', 'Activo', 'Activa') : g('professional', 'Inactivo', 'Inactiva')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3.5 pt-2 border-t border-nexus-border">
                      <div>
                      <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-nexus-text-secondary font-bold">{editingBarberId ? 'Restablecer contraseña (opcional)' : 'Contraseña de Portal *'}</label>
                          <button type="button" onClick={handleGeneratePassword} className="text-xs font-bold text-nexus-primary hover:underline cursor-pointer">Generar</button>
                        </div>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Lock className="w-3.5 h-3.5 text-nexus-text-muted" />
                          </span>
                          <input 
                            type={showPassword ? "text" : "password"} 
                            placeholder={editingBarberId ? 'Dejar vacío para no cambiarla' : '••••••••'}
                            value={newBarber.password}
                            onChange={(e) => setNewBarber(prev => ({ ...prev, password: e.target.value }))}
                            className="w-full bg-nexus-background border border-nexus-border rounded-lg pl-9 pr-10 text-nexus-text outline-none focus:border-nexus-primary nx-num h-10 text-base sm:text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-nexus-text-muted hover:text-nexus-text-secondary transition-colors"
                          >
                            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-nexus-text-secondary font-bold block mb-1">Confirmar contraseña *</label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <KeyRound className="w-3.5 h-3.5 text-nexus-text-muted" />
                          </span>
                          <input 
                            type={showConfirmPassword ? "text" : "password"} 
                            required
                            placeholder="••••••••"
                            value={newBarber.confirmPassword}
                            onChange={(e) => setNewBarber(prev => ({ ...prev, confirmPassword: e.target.value }))}
                            className="w-full bg-nexus-background border border-nexus-border rounded-lg pl-9 pr-10 text-nexus-text outline-none focus:border-nexus-primary nx-num h-10 text-base sm:text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-nexus-text-muted hover:text-nexus-text-secondary transition-colors"
                          >
                            {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

{barberStep === 2 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
                  
                  <div className="bg-nexus-background border border-nexus-border rounded-xl p-5 flex flex-col h-[380px] shadow-sm">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-xs font-semibold text-nexus-primary ">{t('services')} {g('service', 'Seleccionados', 'Seleccionadas')} ({newBarber.services.length})</h4>
                      <button 
                        type="button" 
                        onClick={() => setNewBarber(prev => ({ ...prev, services: [] }))}
                        className="text-xs py-2 text-nexus-error-text font-bold hover:underline"
                      >
                        Limpiar selección
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3.5 pr-2.5 scrollbar-thin">
                      {newBarber.services.map(assigned => {
                        const original = services.find(s => s.id === assigned.serviceId);
                        if (!original) return null;

                        return (
                          <div key={assigned.serviceId} className="bg-nexus-surface border border-nexus-border rounded-xl p-3 space-y-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <h5 className="text-xs font-bold text-nexus-text leading-tight">{original.name}</h5>
                                <p className="text-xs text-nexus-text-muted nx-num">Precio base: {formatServicePrice(original)}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setNewBarber(prev => ({
                                    ...prev,
                                    services: prev.services.filter(s => s.serviceId !== assigned.serviceId)
                                  }));
                                }}
                                className="inline-flex h-9 w-9 items-center justify-center hover:bg-nexus-error-bg text-nexus-error-text rounded-lg cursor-pointer"
                                title={`Quitar ${t('service')}`}
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="pt-2 border-t border-nexus-border">
                              <label htmlFor={`custom-price-${assigned.serviceId}`} className="text-xs text-nexus-text-secondary font-bold">
                                {original.priceVariable ? `Precio mínimo ${g('professional', 'de este', 'de esta')} ${tl('professional')} (Bs)` : `Precio ${g('professional', 'de este', 'de esta')} ${tl('professional')} (Bs)`}
                              </label>
                              <input
                                id={`custom-price-${assigned.serviceId}`}
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="any"
                                value={assigned.customPrice ?? ''}
                                placeholder={`${original.price ?? 0} (precio base)`}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setNewBarber(prev => ({
                                    ...prev,
                                    services: prev.services.map(s =>
                                      s.serviceId === assigned.serviceId
                                        ? { ...s, customPrice: raw === '' ? null : raw }
                                        : s
                                    )
                                  }));
                                }}
                                className="mt-1 w-full bg-nexus-background border border-nexus-border rounded-lg text-nexus-text nx-num px-3 h-10 text-base sm:text-sm"
                              />
                              <p className="mt-1 text-xs text-nexus-text-muted">Vacío = usa el precio base. Solo afecta {tl('appointments')} nuevas.</p>
                            </div>

                            <div className="pt-2 border-t border-nexus-border flex items-center justify-between">
                              <span className="text-xs text-nexus-text-secondary font-bold nx-num">Personalizar comisión</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setNewBarber(prev => ({
                                    ...prev,
                                    services: prev.services.map(s => 
                                      s.serviceId === assigned.serviceId 
                                        ? { ...s, commissionEnabled: !s.commissionEnabled } 
                                        : s
                                    )
                                  }));
                                }}
                                className="text-xs py-2 font-extrabold text-nexus-primary hover:underline"
                              >
                                {assigned.commissionEnabled ? 'ACTIVADA' : 'DESACTIVADA'}
                              </button>
                            </div>

                            {assigned.commissionEnabled && (
                              <div className="grid grid-cols-2 gap-2 pt-1.5 animate-fadeIn">
                                <div>
                                  <label className="text-xs text-nexus-text-muted font-bold nx-num">Tipo</label>
                                  <select
                                    value={assigned.type}
                                    onChange={(e) => {
                                      setNewBarber(prev => ({
                                        ...prev,
                                        services: prev.services.map(s => 
                                          s.serviceId === assigned.serviceId 
                                            ? { ...s, type: e.target.value } 
                                            : s
                                        )
                                      }));
                                    }}
                                    className="w-full bg-nexus-background border border-nexus-border rounded-lg text-nexus-text px-3 h-10 text-base sm:text-sm"
                                  >
                                    <option value="%">Porcentaje %</option>
                                    <option value="Bs">Monto fijo (Bs)</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-nexus-text-muted font-bold nx-num">Comisión</label>
                                  <input 
                                    type="number"
                                    value={assigned.value}
                                    onChange={(e) => {
                                      setNewBarber(prev => ({
                                        ...prev,
                                        services: prev.services.map(s => 
                                          s.serviceId === assigned.serviceId 
                                            ? { ...s, value: Number(e.target.value) } 
                                            : s
                                        )
                                      }));
                                    }}
                                    className="w-full bg-nexus-background border border-nexus-border rounded-lg text-nexus-text nx-num px-3 h-10 text-base sm:text-sm"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {newBarber.services.length === 0 && (
                        <div className="text-center text-nexus-text-muted py-16">
                          <ServiceIcon className="w-8 h-8 mx-auto mb-2 opacity-35" />
                          <p className="text-xs font-bold">No hay {tl('services')} {g('service', 'seleccionados', 'seleccionadas')}</p>
                          <p className="text-xs text-nexus-text-muted">Agrégar de la lista de disponibles a la derecha.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-nexus-background border border-nexus-border rounded-xl p-5 flex flex-col h-[380px] shadow-sm">
                    <div className="space-y-3.5 mb-3">
                      <div className="flex justify-between items-center">
                        <h4 className="text-xs font-semibold text-nexus-text-secondary ">{t('services')} Disponibles</h4>
                        <button 
                          type="button"
                          onClick={() => {
                            const currentIds = newBarber.services.map(s => s.serviceId);
                            const toAdd = filteredWizardServices
                              .filter(s => !currentIds.includes(s.id))
                              .map(s => ({ serviceId: s.id, commissionEnabled: false, type: '%', value: 40 }));
                            setNewBarber(prev => ({ ...prev, services: [...prev.services, ...toAdd] }));
                          }}
                          className="text-xs py-2 text-nexus-primary font-bold hover:underline cursor-pointer"
                        >
                          Seleccionar todos
                        </button>
                      </div>

                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                          <Search className="w-3.5 h-3.5 text-nexus-text-muted" />
                        </span>
                        <input 
                          type="text" 
                          placeholder={`Buscar ${tl('service')}...`} 
                          value={serviceSearch}
                          onChange={(e) => setServiceSearch(e.target.value)}
                          className="w-full bg-nexus-surface border border-nexus-border rounded-lg pl-8 pr-3 text-nexus-text outline-none h-10 text-base sm:text-sm"
                        />
                      </div>

                      <div className="flex bg-nexus-surface border border-nexus-border rounded-lg p-0.5">
                        {['Todos', 'Públicos', 'Internos'].map(tab => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setServiceTab(tab)}
                            className={`flex-1 h-9 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                              serviceTab === tab ? 'bg-nexus-primary text-white shadow-md' : 'text-nexus-text-secondary hover:text-nexus-text'
                            }`}
                          >
                            {tab}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-2.5 scrollbar-thin">
                      {filteredWizardServices.map(s => {
                        const isSelected = newBarber.services.some(assigned => assigned.serviceId === s.id);

                        return (
                          <div 
                            key={s.id} 
                            data-service-row={s.id}
                            onClick={() => {
                              if (isSelected) {
                                setNewBarber(prev => ({
                                  ...prev,
                                  services: prev.services.filter(assigned => assigned.serviceId !== s.id)
                                }));
                              } else {
                                setNewBarber(prev => ({
                                  ...prev,
                                  services: [...prev.services, { serviceId: s.id, commissionEnabled: false, type: '%', value: 40 }]
                                }));
                              }
                            }}
                            className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between ${
                              draggingServiceId === s.id ? 'opacity-60 shadow-lg ring-1 ring-nexus-primary/50' : ''
                            } ${
                              isSelected 
                                ? 'bg-nexus-primary-soft border-nexus-primary/40 hover:opacity-90' 
                                : 'bg-nexus-surface border-nexus-border hover:bg-nexus-surface-hover'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span
                                onPointerDown={(e) => startServiceDrag(e, s.id)}
                                onClick={(e) => e.stopPropagation()}
                                title="Arrastrar para reordenar"
                                className="p-1 -ml-1 text-nexus-text-muted hover:text-nexus-text cursor-grab active:cursor-grabbing touch-none select-none"
                              >
                                <Menu size={16} />
                              </span>
                              <div>
                                <p className="font-bold text-nexus-text">{s.name}</p>
                                <p className="text-xs text-nexus-text-muted nx-num">{s.duration} min — {s.price} Bs</p>
                              </div>
                            </div>
                            <span className={`text-xs px-1.5 py-0.5 rounded-md font-bold nx-num ${
                              isSelected ? 'bg-nexus-primary text-white' : 'bg-nexus-surface-hover text-nexus-text-secondary'
                            }`}>
                              {isSelected ? 'Agregado' : 'Añadir'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

                

{barberStep === 3 && lastBarberStep === 3 && (
                <div className="bg-nexus-background border border-nexus-border rounded-xl p-5 shadow-sm space-y-4 animate-fadeIn">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-xs font-semibold text-nexus-text-secondary ">Horario de trabajo</h4>
                      <p className="text-xs text-nexus-text-muted">Días y horas en que atiende.</p>
                    </div>
                  </div>

                  {/* Fase 4: en escritorio, filas tipo tabla; en celular, cada día en su propio bloque
                      con los mismos controles (estado, inicio, fin y copiar a todos). */}
                  <div className="rounded-lg border border-nexus-border bg-nexus-surface divide-y divide-nexus-border">
                    <div className="hidden md:grid grid-cols-[1fr_8rem_8rem_8rem_10rem] items-center gap-3 px-4 py-2.5 bg-nexus-background rounded-t-lg text-xs font-semibold text-nexus-text-secondary">
                      <span>Día de la semana</span>
                      <span className="text-center">Estado</span>
                      <span className="text-center">Hora de inicio</span>
                      <span className="text-center">Hora de finalización</span>
                      <span className="text-right">Plantilla</span>
                    </div>
                    {newBarber.availability.map((av, idx) => {
                      const isRest = av.status === 'Descanso';
                      const timeCls = `h-10 w-full rounded-lg border border-nexus-border bg-nexus-surface px-2 text-base sm:text-sm text-nexus-text nx-num text-center outline-none focus:border-nexus-primary transition-opacity ${isRest ? 'opacity-40 pointer-events-none' : ''}`;
                      return (
                        <div key={av.day} className="grid grid-cols-2 md:grid-cols-[1fr_8rem_8rem_8rem_10rem] items-center gap-x-3 gap-y-2 px-3 md:px-4 py-3 md:py-2 hover:bg-nexus-surface-hover transition-colors">
                          <span className="text-sm font-semibold text-nexus-text">{av.day}</span>
                          <div className="justify-self-end md:justify-self-center">
                            <button
                              type="button"
                              aria-pressed={!isRest}
                              onClick={() => {
                                setNewBarber(prev => ({
                                  ...prev,
                                  availability: prev.availability.map((d, i) => 
                                    i === idx 
                                      ? { ...d, status: d.status === 'Disponible' ? 'Descanso' : 'Disponible' } 
                                      : d
                                  )
                                }));
                              }}
                              className={`h-9 px-3 rounded-md text-sm font-semibold transition-colors border cursor-pointer whitespace-nowrap ${
                                isRest 
                                  ? 'bg-nexus-error-bg text-nexus-error-text border-nexus-error/25 hover:opacity-80' 
                                  : 'bg-nexus-primary-soft text-nexus-primary border-nexus-primary/25 hover:opacity-80'
                              }`}
                            >
                              {av.status}
                            </button>
                          </div>
                          <label className="flex flex-col gap-1">
                            <span className="text-xs text-nexus-text-muted md:sr-only">Inicio</span>
                            <input 
                              type="time"
                              disabled={isRest}
                              value={av.start}
                              onChange={(e) => {
                                setNewBarber(prev => ({
                                  ...prev,
                                  availability: prev.availability.map((d, i) => 
                                    i === idx ? { ...d, start: e.target.value } : d
                                  )
                                }));
                              }}
                              className={timeCls}
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-xs text-nexus-text-muted md:sr-only">Fin</span>
                            <input 
                              type="time"
                              disabled={isRest}
                              value={av.end}
                              onChange={(e) => {
                                setNewBarber(prev => ({
                                  ...prev,
                                  availability: prev.availability.map((d, i) => 
                                    i === idx ? { ...d, end: e.target.value } : d
                                  )
                                }));
                              }}
                              className={timeCls}
                            />
                          </label>
                          <div className="col-span-2 md:col-span-1 md:justify-self-end">
                            <button
                              type="button"
                              onClick={() => handleCopyAvailabilityToAll(idx)}
                              className="h-9 w-full md:w-auto px-3 bg-nexus-surface border border-nexus-border hover:border-nexus-primary rounded-md text-sm font-medium text-nexus-text-secondary transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                            >
                              <Copy className="w-4 h-4 text-nexus-primary" aria-hidden="true" /> Copiar a todos
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {hasFeature(planFeatures, 'permisosProfesional') && (() => {
                    // Permisos del profesional. "Editar citas" tiene 3 opciones:
                    // Todo / Nada / Personalizado (con casillas).
                    const perms = normalizeStaffPermissions(newBarber.permissions);
                    const editMode = getEditMode(perms);
                    const setPerms = (patch) => setNewBarber(prev => ({
                      ...prev,
                      permissions: { ...normalizeStaffPermissions(prev.permissions), ...patch }
                    }));
                    const setEditMode = (mode) => setPerms(
                      mode === 'none' ? { editAppointments: false }
                        : mode === 'all' ? { editAppointments: true, editMode: 'all' }
                        : { editAppointments: true, editMode: 'custom' }
                    );
                    const renderPermCheck = (opt, checked, onToggle) => (
                      <label key={opt.key} className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${checked ? 'bg-nexus-primary-soft border-nexus-primary/30' : 'bg-nexus-surface border-nexus-border'}`}>
                        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-nexus-primary" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
                        <span className="text-sm leading-snug">
                          <strong className="text-nexus-text block font-semibold">{opt.label}</strong>
                          <span className="text-xs text-nexus-text-secondary">{opt.hint}</span>
                        </span>
                      </label>
                    );
                    return (
                  <div className="pt-4 border-t border-nexus-border space-y-3">
                    <div>
                      <h4 className="text-sm font-semibold text-nexus-text">Permisos {g('professional', 'del', 'de la')} {t('professional')}</h4>
                      <p className="text-xs text-nexus-text-secondary">Define qué puede hacer en su panel. Se aplica al volver a abrir su sesión.</p>
                    </div>

                    <div className="rounded-lg border border-nexus-border bg-nexus-surface p-3 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-nexus-text">Editar {tl('appointments')}</p>
                          <p className="text-xs text-nexus-text-secondary">Qué puede cambiar en sus {tl('appointments')}.</p>
                        </div>
                        <SegmentedControl
                          ariaLabel={`Editar ${tl('appointments')}`}
                          value={editMode}
                          onChange={setEditMode}
                          options={[
                            { value: 'all', label: 'Todo' },
                            { value: 'none', label: 'Nada' },
                            { value: 'custom', label: 'Personalizado' },
                          ]}
                          className="w-full sm:w-auto shrink-0"
                        />
                      </div>
                      {editMode === 'custom' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {getEditPartOptions(businessProfile).map(opt => (
                            renderPermCheck(opt, perms[opt.key], (v) => setPerms({ [opt.key]: v }))
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {getStaffPermissionOptions(businessProfile).filter(opt => opt.key !== 'editAppointments').map(opt => (
                        renderPermCheck(opt, perms[opt.key], (v) => setPerms({ [opt.key]: v }))
                      ))}
                    </div>
                  </div>
                    );
                  })()}
                </div>
              )}

            </div>

            <div className="bg-nexus-background border-t border-nexus-border px-6 py-4 flex items-center justify-between">
              <button 
                type="button" 
                onClick={() => {
                  setActiveModal(null);
                  setEditingBarberId(null);
                  resetBarberForm();
                }}
                className="inline-flex h-10 items-center justify-center gap-1.5 px-4 bg-nexus-surface border border-nexus-border hover:bg-nexus-surface-hover text-nexus-text-secondary font-bold rounded-lg text-sm transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <div className="flex items-center gap-2.5">
                {barberStep > 1 && (
                  <button 
                    type="button"
                    onClick={() => setBarberStep(prev => prev - 1)}
                    className="inline-flex h-10 items-center justify-center gap-1.5 px-4 bg-nexus-surface hover:bg-nexus-surface-hover border border-nexus-border text-nexus-text-secondary font-bold rounded-lg text-sm transition-colors cursor-pointer"
                  >
                    Anterior
                  </button>
                )}

                {barberStep < lastBarberStep ? (
                  <button 
                    type="button"
                    onClick={handleNextStep}
                    className="inline-flex h-10 items-center justify-center gap-1.5 px-4 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-bold rounded-lg text-sm shadow-md transition-colors cursor-pointer font-bold"
                  >
                    Siguiente paso
                  </button>
                ) : (
                  <button 
                    type="button"
                    onClick={handleSaveBarber}
                    className="inline-flex h-10 items-center justify-center gap-1.5 px-4 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-extrabold rounded-lg text-sm shadow-md transition-all cursor-pointer font-bold"
                  >
                    {editingBarberId ? 'Guardar cambios' : `Crear ${tl('professional')}`}
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ==========================================
          6. MODAL: AGREGAR / EDITAR SUCURSALES
          ========================================== */}
      {activeModal === 'add-branch' && (
        <div className="fixed inset-0 bg-nexus-navy/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div role="dialog" aria-modal="true" className="bg-nexus-surface border border-nexus-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg p-5 sm:p-6 relative shadow-xl max-h-[92dvh] overflow-y-auto">
            <h3 className="text-base font-extrabold text-nexus-text mb-1 tracking-tight flex items-center gap-2 font-bold">
              <Building2 className="w-5 h-5 text-nexus-primary" />
              {editingBranchId ? 'Editar sucursal' : 'Nueva sucursal'}
            </h3>

            <form onSubmit={handleCreateBranch} className="space-y-4">
              <div>
                <label className="text-xs text-nexus-text-secondary font-bold block mb-1">Nombre *</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej. Equipetrol Premium"
                  value={newBranch.name}
                  onChange={(e) => setNewBranch(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-nexus-background border border-nexus-border rounded-lg text-nexus-text outline-none focus:border-nexus-primary px-3 h-10 text-base sm:text-sm"
                />
              </div>

              <ImageUploader
                label="Foto de la sucursal (opcional)"
                shape="wide"
                hint="Foto del local: la fachada o el interior. Ayuda al cliente a reconocerlo."
                value={newBranch.image || ''}
                onChange={(url) => setNewBranch(prev => ({ ...prev, image: url }))}
                onUploadingChange={setImageUploading}
                maxSize={1200}
              />

              <div>
                <label className="text-xs text-nexus-text-secondary font-bold block mb-1">Teléfono</label>
                <div className="flex items-center bg-nexus-background border border-nexus-border rounded-lg px-2.5 gap-2">
                  {detectedBranchCountry && (
                    <div className="flex items-center gap-1 shrink-0 text-xs">
                      <span>{detectedBranchCountry?.flag}</span>
                      <span className="text-xs nx-num text-nexus-text-secondary font-bold">{detectedBranchCountry?.code}</span>
                    </div>
                  )}
                  <input 
                    type="tel" 
                    value={newBranch.phone}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9+]/g, '');
                      setNewBranch(prev => ({ ...prev, phone: val }));
                    }}
                    placeholder="+591 71234567"
                    className="w-full bg-transparent border-0 text-nexus-text outline-none px-3 h-10 text-base sm:text-sm"
                  />
                </div>
                {detectedBranchCountry && (
                  <span className="text-xs text-nexus-primary font-bold mt-1 block">
                    País: {detectedBranchCountry?.country}
                  </span>
                )}
              </div>

              <div>
                <label className="text-xs text-nexus-text-secondary font-bold block mb-1">Horario de atención</label>
                <input 
                  type="text" 
                  placeholder="Ej. Lunes a Sábado, 09:00 - 20:00"
                  value={newBranch.schedule}
                  onChange={(e) => setNewBranch(prev => ({ ...prev, schedule: e.target.value }))}
                  className="w-full bg-nexus-background border border-nexus-border rounded-lg text-nexus-text outline-none focus:border-nexus-primary px-3 h-10 text-base sm:text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-nexus-text-secondary font-bold block mb-1">Enlace de Google Maps (opcional)</label>
                <input
                  type="text"
                  inputMode="url"
                  placeholder="https://maps.app.goo.gl/..."
                  value={newBranch.mapsUrl || ''}
                  onChange={(e) => setNewBranch(prev => ({ ...prev, mapsUrl: e.target.value }))}
                  className="w-full bg-nexus-background border border-nexus-border rounded-lg text-nexus-text outline-none focus:border-nexus-primary px-3 h-10 text-base sm:text-sm"
                />
                <p className="text-xs text-nexus-text-muted mt-1">En Google Maps: Compartir → Copiar enlace. Si lo dejas vacío, se usa la dirección.</p>
              </div>

              <div className="relative">
                <label className="text-xs text-nexus-text-secondary font-bold block mb-1">Dirección *</label>
                <div className="relative flex items-center">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <MapPin className="w-4 h-4 text-nexus-error" />
                  </span>
                  <input 
                    type="text" 
                    required
                    placeholder="Busca la dirección (ej. Equipetrol)"
                    value={locationSearch}
                    onChange={(e) => {
                      setLocationSearch(e.target.value);
                      setNewBranch(prev => ({ ...prev, address: e.target.value }));
                      setShowLocationList(true);
                    }}
                    onFocus={() => setShowLocationList(true)}
                    className="w-full bg-nexus-background border border-nexus-border rounded-lg pl-8 pr-2.5 text-nexus-text outline-none focus:border-nexus-primary h-10 text-base sm:text-sm"
                  />
                </div>

                {showLocationList && (
                  <div className="absolute left-0 right-0 mt-1.5 bg-nexus-surface border border-nexus-border rounded-xl shadow-xl max-h-40 overflow-y-auto z-50 divide-y divide-nexus-border scrollbar-thin">
                    {filteredSimulatedLocations.map((l, i) => (
                      <div
                        key={i}
                        onClick={() => {
                          setNewBranch(prev => ({ 
                            ...prev, 
                            address: l?.address,
                            lat: l?.lat,
                            lng: l?.lng
                          }));
                          setLocationSearch(l?.address);
                          setShowLocationList(false);
                        }}
                        className="p-2.5 hover:bg-nexus-surface-hover cursor-pointer flex items-center gap-2.5 text-xs text-nexus-text-secondary transition-colors"
                      >
                        <MapPin className="w-3.5 h-3.5 text-nexus-error shrink-0" />
                        <div className="min-w-0">
                          <p className="font-bold text-nexus-text text-xs truncate">{l?.name}</p>
                          <p className="text-xs text-nexus-text-muted truncate">{l?.address}</p>
                        </div>
                      </div>
                    ))}
                    {filteredSimulatedLocations.length === 0 && (
                      <p className="p-3 text-xs text-nexus-text-muted text-center">Sin resultados. Prueba con otra calle.</p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs text-nexus-text-muted font-bold">Ubicación en el mapa</label>
                  <span className="text-xs text-nexus-primary nx-num">Mueve el pin para ajustar</span>
                </div>
                
                <div className="relative h-48 w-full rounded-xl overflow-hidden border border-nexus-border bg-nexus-background z-10">
                  <div ref={mapContainerRef} className="w-full h-full text-black" />
                  
                  <div className="absolute bottom-2 left-2 bg-nexus-surface/90 border border-nexus-border px-2 py-1 rounded text-xs text-nexus-text-secondary nx-num z-25 flex gap-2 select-none pointer-events-none">
                    <span>Lat: {newBranch?.lat?.toFixed(5)}</span>
                    <span>Lng: {newBranch?.lng?.toFixed(5)}</span>
                  </div>
                </div>
              </div>

              <div className="sticky -bottom-5 sm:-bottom-6 z-20 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 px-5 sm:px-6 pt-3 pb-5 sm:pb-6 bg-nexus-surface flex justify-end gap-2.5 border-t border-nexus-border">
                <button 
                  type="button" 
                  onClick={() => {
                    setActiveModal(null);
                    setNewBranch({ name: '', phone: '', address: '', schedule: '', lat: -17.7732, lng: -63.1821, createdDate: '' });
                    setLocationSearch('');
                  }} 
                  className="inline-flex h-10 items-center justify-center gap-1.5 px-4 bg-nexus-surface border border-nexus-border hover:bg-nexus-surface-hover text-nexus-text-secondary text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="inline-flex h-10 items-center justify-center gap-1.5 px-4 bg-nexus-primary hover:bg-nexus-primary-hover text-white text-sm font-bold rounded-lg shadow-md transition-all cursor-pointer font-bold"
                >
                  {imageUploading ? 'Subiendo foto…' : editingBranchId ? 'Guardar cambios' : 'Crear sucursal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modo registros: "Registrar servicio" fijo abajo en celular y tablet, en todas las pestañas. */}
      {registrosMode && (
        <RegistrarServicioBar label={`Registrar ${tl('service')}`} onClick={() => setRegistroModalOpen(true)} />
      )}

      {/* 7. MODAL: AGREGAR SERVICIOS */}
      {/* 7. MODAL: AGREGAR SERVICIOS */}
      {registroModalOpen && (
        <RegistrarServicioModal
          services={services}
          professionals={barbers}
          clients={clients}
          paymentMethods={businessSettings.paymentMethods}
          promotions={activePromotions}
          branches={branches}
          onRegistered={() => setRegistrosTick(n => n + 1)}
          onClose={() => setRegistroModalOpen(false)}
          onToast={triggerToast}
        />
      )}
      {selectedClientId && clients.find(c => c.id === selectedClientId) && (
        <ClientProfileModal
          negocioId={negocioId}
          client={clients.find(c => c.id === selectedClientId)}
          professionals={barbers}
          services={services}
          fieldSuggestions={[...new Set(clients.flatMap(c => (c.customFields || []).map(f => f.label)).filter(Boolean))]}
          onClose={() => setSelectedClientId(null)}
          onToast={triggerToast}
          capabilities={planFeatures}
        />
      )}
      {activeModal === 'add-service' && (
        <div className="fixed inset-0 bg-nexus-navy/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div role="dialog" aria-modal="true" className="bg-nexus-surface border border-nexus-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 sm:p-6 relative shadow-xl max-h-[92dvh] overflow-y-auto">
            <h3 className="text-base font-extrabold text-nexus-text mb-1 tracking-tight flex items-center gap-2 font-bold">
              <ServiceIcon className="w-5 h-5 text-nexus-primary" />
              {editingServiceId ? `Editar ${tl('service')}` : `${g('service', 'Nuevo', 'Nueva')} ${tl('service')}`}
            </h3>
            
            <form onSubmit={handleCreateService} className="space-y-4">
              <div>
                <label className="text-xs text-nexus-text-secondary font-bold block mb-1">Nombre {g('service', 'del', 'de la')} {t('service')} *</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej. Sesión Express"
                  value={newService.name}
                  onChange={(e) => setNewService(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-nexus-background border border-nexus-border rounded-lg text-nexus-text outline-none focus:border-nexus-primary px-3 h-10 text-base sm:text-sm"
                />
              </div>

              <ImageUploader
                label={`Foto ${g('service', 'del', 'de la')} ${tl('service')} (opcional)`}
                hint={heroConfig.showServiceImages === false ? 'Las fotos están ocultas en el link público (puedes activarlas en la pestaña de ' + tl('services') + ').' : 'Se muestra en el link público de reservas.'}
                value={newService.image || ''}
                onChange={(url) => setNewService(prev => ({ ...prev, image: url }))}
                onUploadingChange={setImageUploading}
                maxSize={900}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-nexus-text-secondary font-bold block mb-1">{newService.priceVariable ? 'Precio mínimo *' : 'Precio *'}</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      required
                      placeholder="100"
                      value={newService.price}
                      onChange={(e) => setNewService(prev => ({ ...prev, price: e.target.value }))}
                      className="w-full bg-nexus-background border border-nexus-border rounded-lg pl-3 pr-8 text-nexus-text outline-none focus:border-nexus-primary nx-num font-bold h-10 text-base sm:text-sm"
                    />
                    <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs font-bold text-nexus-text-muted select-none font-bold">Bs</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-nexus-text-secondary font-bold block mb-1">Duración *</label>
                  <select 
                    required
                    value={newService.duration}
                    onChange={(e) => setNewService(prev => ({ ...prev, duration: e.target.value }))}
                    className="w-full bg-nexus-background border border-nexus-border rounded-lg text-nexus-text outline-none focus:border-nexus-primary font-bold font-sans px-3 h-10 text-base sm:text-sm"
                  >
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">1 hora</option>
                    <option value="75">1h 15min</option>
                    <option value="90">1h 30min</option>
                    <option value="120">2 horas</option>
                  </select>
                </div>
              </div>

              <label className="flex items-start gap-2 p-2.5 bg-nexus-background border border-nexus-border rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={!!newService.priceVariable}
                  onChange={(e) => setNewService(prev => ({ ...prev, priceVariable: e.target.checked }))}
                />
                <span className="text-xs text-nexus-text-secondary leading-snug">
                  <strong className="text-nexus-text">Precio variable.</strong> Se muestra como
                  {' '}<span className="nx-num text-nexus-primary">Desde Bs {newService.price || 'XX'}</span>.
                </span>
              </label>

              {!registrosMode && (
                <label className="flex items-start gap-2 p-2.5 bg-nexus-background border border-nexus-border rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={!!newService.featured}
                    onChange={(e) => setNewService(prev => ({ ...prev, featured: e.target.checked }))}
                  />
                  <span className="text-xs text-nexus-text-secondary leading-snug">
                    <strong className="text-nexus-text">Destacado.</strong> Aparece primero en el link de reservas y en WhatsApp.
                  </span>
                </label>
              )}

              {/* Modo registros (sin agenda ni link público): oculto. El servicio nuevo
                  se guarda con todos los días; uno existente conserva los suyos. */}
              {!registrosMode && (
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs text-nexus-text-secondary font-bold">Días disponibles *</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNewService(prev => ({ ...prev, availableDays: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] }))}
                      className="text-xs py-2 text-nexus-primary hover:underline font-bold cursor-pointer"
                    >
                      Todos
                    </button>
                    <span className="text-nexus-text-muted text-xs font-bold">|</span>
                    <button
                      type="button"
                      onClick={() => setNewService(prev => ({ ...prev, availableDays: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] }))}
                      className="text-xs py-2 text-nexus-primary hover:underline font-bold cursor-pointer"
                    >
                      Lun-Sáb
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-7 gap-1.5 p-2 bg-nexus-background border border-nexus-border rounded-xl">
                  {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(day => {
                    const isSelected = newService.availableDays.includes(day);
                    const label = day.charAt(0);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          setNewService(prev => {
                            const alreadySelected = prev.availableDays.includes(day);
                            const updated = alreadySelected
                              ? prev.availableDays.filter(d => d !== day)
                              : [...prev.availableDays, day];
                            return { ...prev, availableDays: updated };
                          });
                        }}
                        className={`h-9 w-full rounded-lg text-xs font-extrabold flex items-center justify-center transition-all border cursor-pointer ${
                          isSelected 
                            ? 'bg-nexus-primary-soft border-nexus-primary text-nexus-primary shadow-sm' 
                            : 'bg-nexus-surface border-nexus-border text-nexus-text-muted hover:text-nexus-text hover:border-nexus-text-muted'
                        }`}
                        title={day}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              )}

              <div className="sticky -bottom-5 sm:-bottom-6 z-20 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 px-5 sm:px-6 pt-3 pb-5 sm:pb-6 bg-nexus-surface flex justify-end gap-2.5 border-t border-nexus-border">
                <button 
                  type="button" 
                  onClick={() => setActiveModal(null)} 
                  className="inline-flex h-10 items-center justify-center gap-1.5 px-4 bg-nexus-surface border border-nexus-border hover:bg-nexus-surface-hover text-nexus-text-secondary text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="inline-flex h-10 items-center justify-center gap-1.5 px-4 bg-nexus-primary hover:bg-nexus-primary-hover text-white text-sm font-bold rounded-lg shadow-md transition-all cursor-pointer font-bold"
                >
                  {imageUploading ? 'Subiendo foto…' : editingServiceId ? 'Guardar cambios' : `Crear ${tl('service')}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. MODAL: ASISTENCIA BIOMÉTRICO */}
      {/* 8. MODAL: ASISTENCIA BIOMÉTRICO */}
      {activeModal === 'assistance' && (
        <div className="fixed inset-0 bg-nexus-navy/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div role="dialog" aria-modal="true" className="bg-nexus-surface border border-nexus-border rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-5 relative shadow-xl">
            <h3 className="text-base font-bold text-nexus-text mb-1">Marcar asistencia</h3>
            <p className="text-xs text-nexus-text-secondary mb-4">Ingresa tu PIN.</p>
            <form onSubmit={handleRegisterAttendance} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-nexus-background rounded-lg border border-nexus-border mb-3">
                <button type="button" onClick={() => setAssistType('in')} className={`py-1 rounded text-xs font-bold transition-all cursor-pointer ${assistType === 'in' ? 'bg-nexus-primary-soft text-nexus-primary' : 'text-nexus-text-secondary'}`}>Entrada</button>
                <button type="button" onClick={() => setAssistType('out')} className={`py-1 rounded text-xs font-bold transition-all cursor-pointer ${assistType === 'out' ? 'bg-nexus-primary text-white' : 'text-nexus-text-secondary'}`}>Salida</button>
              </div>
              <input 
                type="password" 
                maxLength="4" 
                placeholder="••••" 
                autoFocus 
                required 
                value={assistPin} 
                onChange={(e) => setAssistPin(e.target.value)} 
                className="w-full bg-nexus-background border border-nexus-border text-center tracking-widest text-lg rounded-lg text-nexus-text outline-none nx-num px-3 h-10 text-base sm:text-sm" 
              />
              <div className="flex justify-end gap-2.5 pt-2">
                <button type="button" onClick={() => { setActiveModal(null); setAssistPin(''); }} className="inline-flex h-10 items-center justify-center gap-1.5 px-4  bg-nexus-surface border border-nexus-border text-nexus-text-secondary text-sm font-semibold rounded-lg nx-num font-bold cursor-pointer">Cerrar</button>
                <button type="submit" className="inline-flex h-10 items-center justify-center gap-1.5 px-4  bg-nexus-primary hover:bg-nexus-primary-hover text-white text-sm font-bold rounded-lg nx-num font-bold cursor-pointer">Registrar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <svg className="absolute w-0 h-0" width="0" height="0">
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--nx-primary)" stopOpacity="0.15"/>
            <stop offset="100%" stopColor="var(--nx-primary)" stopOpacity="0.0"/>
          </linearGradient>
        </defs>
      </svg>

    </div>
    </BusinessProfileContext.Provider>
  );
}
