import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../firebase/config';
import { collection, doc, onSnapshot, updateDoc, addDoc, setDoc, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { getPeriodRange, getMonthGridRange, getPreviousPeriodRange } from '../shared/appointments/dateRanges';
import { useBusinessSettings } from '../shared/businessSettings/useBusinessSettings';
import { signOut } from 'firebase/auth';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { LogOut } from 'lucide-react';
import { useBarberAuth } from './useBarberAuth';
import { useServicios } from '../firebase/useServicios';
import { isOpenPendingCita, professionalCanDo, getCitaServiceIds } from '../shared/appointments/pendingModel';
import { reevaluatePending } from '../shared/appointments/pendingApi';
import { describeAppointmentChanges } from '../shared/appointments/changeSummary';
import BarberLoginPage from './BarberLoginPage';
import { useNegocioStatus } from '../shared/negocioStatus/useNegocioStatus';
import SuspendedScreen from '../shared/negocioStatus/SuspendedScreen';
import AppointmentStatusBadge from '../shared/appointments/AppointmentStatusBadge';
import AppointmentManageModal from '../shared/appointments/AppointmentManageModal';
import { getEffectiveFieldPermissions } from '../shared/appointments/permissions';
import { normalizeStaffPermissions, DEFAULT_STAFF_PERMISSIONS, canEditPart } from '../shared/staffPermissions/staffPermissionsModel';
import { checkWorkingHours } from '../shared/appointments/workingHours';
import { useConfirm, Modal, Button, Field, Input, SegmentedControl } from '../shared/ui';
import { getStatusCardClasses } from '../shared/appointments/statusModel';
import AppointmentCreateModal from '../shared/appointments/AppointmentCreateModal';
import PersonalBookingLink from '../shared/booking/PersonalBookingLink';
import { useNegocioPlan } from '../shared/negocioPlan/useNegocioPlan';
import Avatar from '../shared/avatar/Avatar';
import { buildPersonalBookingUrl } from '../shared/booking/personalLink';
import { STATUS } from '../shared/appointments/statusModel';
import { calculateCommission, calculateCommissionForCita } from '../shared/commissions/commissionModel';
import { getServicesFromCita } from '../shared/appointments/serviceSelection';
import { useNotifications, notify, NotificationType } from '../shared/notifications';
import { BusinessProfileContext, useBusinessProfile } from '../shared/businessProfiles/useBusinessProfile';

// Colores del gráfico "Servicios más Solicitados" (gráfico de torta + su leyenda).
const PIE_COLORS = ['#0F6FFF', '#10B981', '#3B82F6', '#F59E0B', '#f472b6', '#fb7185'];

// --- ICONOS SVG PERSONALIZADOS (Diseño ultra-limpio) ---
const Icons = {
  Calendar: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 3V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  Dollar: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  TrendingUp: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  User: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  ChevronLeft: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  ),
  ChevronRight: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  Plus: ({ className = "w-6 h-6" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
    </svg>
  ),
  Check: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  Clock: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Scissors: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-3M7 21V9m0 0a4 4 0 014-4h4a2 2 0 012 2v4a2 2 0 01-2 2H9" />
    </svg>
  ),
  Trash: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  Shield: ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  Lock: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  Search: ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
};

// --- CONFIGURACIÓN DE BARBEROS Y SERVICIOS ---
const BARBEROS = [
  { id: "martin", name: "Martin Torrico", role: "Senior Stylist & Barber", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=256" },
  { id: "ruben", name: "Rubén Torrico", role: "Master Barber Specialist", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=256" }
];

// SERVICIOS hardcodeado eliminado: ahora se usan los servicios reales
// de Firestore vía useServicios(negocioId) -> variable `services`.

// --- HELPERS DE COMPATIBILIDAD ADMIN <-> BARBER ---
function matchesBarber(appt, barberId) {
  return appt.barber === barberId || appt.professionalId === barberId || appt.barberId === barberId;
}

function getApptServiceName(appt) {
  return appt.service || appt.serviceName || 'Servicio';
}

function getServiceDuration(services, appt) {
  const name = getApptServiceName(appt);
  const found = services.find(s => s.name === name);
  return found ? `${found.duration} min` : '30 min';
}

// Admin guarda status en inglés ('confirmed','completed','in-process','pending','cancelled').
// Barber usa vocabulario en español. Normalizamos al leer para que ambos lados se entiendan.
function normalizeStatus(status) {
  const map = {
    confirmed: 'Confirmado',
    completed: 'Finalizado',
    'in-process': 'Confirmado',
    pending: 'Pendiente',
    cancelled: 'Cancelado'
  };
  return map[status] || status || 'Pendiente';
}

const CLIENTES_DEMO = [
  { id: "c-1", name: "Marcelo Quiroga", phone: "+591 70712345" },
  { id: "c-2", name: "Juan de la Cruz", phone: "+591 72289123" },
  { id: "c-3", name: "Rodrigo Melgar", phone: "+591 75544111" },
  { id: "c-4", name: "Mateo Siles", phone: "+591 60601234" },
  { id: "c-5", name: "Sandro Vargas", phone: "+591 79922114" }
];

const CITAS_MOCK = [
  {
    id: "mock-1",
    barber: "martin",
    clientName: "Alejandro Siles",
    service: "Corte Senior",
    date: new Date().toISOString().split('T')[0],
    time: "09:30",
    status: "Finalizado",
    commission: 18,
    price: 30,
    commissionPaid: true,
    paymentMethod: "Efectivo",
    createdAt: new Date().toISOString(),
    notes: "Cortar bien los contornos"
  },
  {
    id: "mock-2",
    barber: "martin",
    clientName: "David Vargas",
    service: "Barba Completa",
    date: new Date().toISOString().split('T')[0],
    time: "11:00",
    status: "Confirmado",
    commission: 9,
    price: 15,
    commissionPaid: false,
    paymentMethod: "Tarjeta",
    createdAt: new Date().toISOString(),
    notes: ""
  },
  {
    id: "mock-3",
    barber: "martin",
    clientName: "Gustavo Claros",
    service: "Corte Senior",
    date: new Date().toISOString().split('T')[0],
    time: "15:00",
    status: "Pendiente",
    commission: 18,
    price: 30,
    commissionPaid: false,
    paymentMethod: "Transferencia",
    createdAt: new Date().toISOString(),
    notes: "Ritual completo"
  },
  {
    id: "mock-4",
    barber: "ruben",
    clientName: "Sebastian Prado",
    service: "Perfilado de Barba",
    date: new Date().toISOString().split('T')[0],
    time: "10:00",
    status: "Finalizado",
    commission: 6,
    price: 10,
    commissionPaid: true,
    paymentMethod: "Efectivo",
    createdAt: new Date().toISOString()
  },
  {
    id: "mock-5",
    barber: "ruben",
    clientName: "Fernando Lanza",
    service: "Corte Junior",
    date: new Date().toISOString().split('T')[0],
    time: "14:15",
    status: "Confirmado",
    commission: 12,
    price: 20,
    commissionPaid: false,
    paymentMethod: "Efectivo",
    createdAt: new Date().toISOString()
  }
];

// Listado de slots de horas para la grilla
const HORARIOS_GRID = [
  "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"
];

const DIAS_SEMANA_NOMBRES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const MESES_NOMBRES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export default function App() {
  const { barberUser, error: authError, loading: authLoading, loginBarber, logoutBarber } = useBarberAuth();
  const negocioId = barberUser?.negocioId;
  const { businessSettings } = useBusinessSettings(negocioId);
  const { isBlocked, status: negocioStatus } = useNegocioStatus(negocioId);
  const { can: canUseCapability, loading: planLoading } = useNegocioPlan(negocioId);
  // Tipo de negocio -> terminología (businessProfileModel).
  const businessProfile = useBusinessProfile(negocioId);
  const { t, tl, g } = businessProfile;
  // Confirmación "Agendar en sobrehorario" (Fase 4/5).
  const [confirmAction, confirmDialog] = useConfirm();
  // Hora actual (para la línea roja de la agenda Día). Se actualiza cada minuto.
  const [nowMinutes, setNowMinutes] = useState(() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); });
  useEffect(() => {
    const id = setInterval(() => { const n = new Date(); setNowMinutes(n.getHours() * 60 + n.getMinutes()); }, 60000);
    return () => clearInterval(id);
  }, []);
  const todayLocalStr = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; })();
  useNotifications({ uid: barberUser?.id, rol: 'barber', negocioId });
console.log('[BARBER] negocioId:', negocioId, '| barberUser:', barberUser);
  const { servicios: services } = useServicios(negocioId);

  const logout = logoutBarber;
  const [activeTab, setActiveTab] = useState("agenda"); 
  const [activeBarber, setActiveBarber] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [blockedSlots, setBlockedSlots] = useState([]); // Bloqueos administrativos
  const [selectedRange, setSelectedRange] = useState("Día"); // Día, Semana, Mes, Año
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const isFirebaseConfigured = !!(db);

  const [diaViewStyle, setDiaViewStyle] = useState("Calendario"); 

  // Listado de clientes dinámico en estado local
  const [clientes, setClientes] = useState([]);
  useEffect(() => {
    if (!negocioId) return;
    const ref = collection(db, 'negocios', negocioId, 'clientes');
    const unsub = onSnapshot(ref, (snap) => {
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [negocioId]);

  // Modales y estados de agendamiento premium
  const [isSlotModalOpen, setIsModalOpenSlot] = useState(false); // Modal Gestión de Horario (Al hacer click en slot)
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false); // Modal Bloquear Horario Administrativo
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false); // Modal Secundario "Nuevo Cliente"
  const [managingAppt, setManagingAppt] = useState(null); // Cita abierta en AppointmentManageModal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  // Selección de slot temporal al hacer click en grilla
  const [tempSelectedTime, setTempSelectedTime] = useState("");

  // Campos de formulario Nuevo Cliente (Modal Secundario)
  const [newClientModalName, setNewClientModalName] = useState("");
  const [newClientModalPhone, setNewClientModalPhone] = useState("");
  const [newClientModalCountryCode, setNewClientModalCountryCode] = useState("+591");

  // Campos de formulario Bloqueo
  const [blockDate, setBlockDate] = useState("");
  const [blockStartTime, setBlockStartTime] = useState("");
  const [blockEndTime, setBlockEndTime] = useState("");
  const [blockReason, setBlockReason] = useState("");


  const triggerToast = (text, type = "success") => {
    setToast({ text, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  useEffect(() => {
      setLoading(false);
      }, []);

  // --- ACCESO A FIRESTORE CON FALLBACK SEGURO ---
  useEffect(() => {
    setLoading(false);
    }, []);

// --- PERFIL REAL DEL PROFESIONAL ---
useEffect(() => {
  if (!negocioId || !barberUser?.uidFirebase) return;
  const ref = doc(db, 'negocios', negocioId, 'profesionales', barberUser.uidFirebase);
  const unsub = onSnapshot(ref, (snap) => {
    if (snap.exists()) setActiveBarber({ id: snap.id, ...snap.data() });
    setLoading(false);
  });
  return () => unsub();
}, [negocioId, barberUser]);

// Sin la capacidad `permisosProfesional` todos usan los permisos por defecto.
const permisosPersonalizados = canUseCapability('permisosProfesional');
const staffPerms = useMemo(
  () => (permisosPersonalizados ? normalizeStaffPermissions(activeBarber?.permissions) : { ...DEFAULT_STAFF_PERMISSIONS }),
  [activeBarber, permisosPersonalizados],
);
const isVisibleAppt = (appt) => staffPerms.viewOthersAppointments || matchesBarber(appt, activeBarber?.id);
// Comisiones: permiso del profesional Y capacidad comercial `comisiones` del plan.
// (Negocios sin plan: `comisiones` es false por defecto -> la pestaña no aparece.)
const canSeeCommissions = staffPerms.viewCommissions && canUseCapability('comisiones');
useEffect(() => {
  if (activeTab === "comisiones" && !planLoading && !canSeeCommissions) setActiveTab("agenda");
  if (activeTab === "rendimiento" && !staffPerms.viewFinancials) setActiveTab("agenda");
}, [activeTab, staffPerms, canSeeCommissions, planLoading]);

// --- RANGO DE FECHAS QUE MUESTRA LA PANTALLA (Día / Semana / Mes / Año) ---
// Mes incluye las 42 celdas de la grilla (días de meses vecinos). Solo se descarga este rango.
const barberRange = useMemo(() => {
  if (selectedRange === "Mes") return getMonthGridRange(selectedDate);
  const view = selectedRange === "Semana" ? 'semana' : selectedRange === "Año" ? 'año' : 'dia';
  return getPeriodRange(selectedDate, view);
}, [selectedRange, selectedDate]);
const rangeStart = barberRange.start;
const rangeEnd = barberRange.end;

// --- GANANCIAS DEL PERÍODO ANTERIOR (solo para "Crecimiento Estimado" en Rendimiento) ---
// "Mes" usa el mes calendario exacto (no la grilla de 42 días que usa la Agenda).
const comparisonView = selectedRange === "Semana" ? 'semana' : selectedRange === "Mes" ? 'mes' : selectedRange === "Año" ? 'año' : 'dia';
const [prevEarnings, setPrevEarnings] = useState(null);
useEffect(() => {
  if (!negocioId || activeTab !== 'rendimiento') return;
  let cancelled = false;
  const prevRange = getPreviousPeriodRange(selectedDate, comparisonView);
  getDocs(query(
    collection(db, 'negocios', negocioId, 'citas'),
    where('date', '>=', prevRange.start),
    where('date', '<=', prevRange.end)
  ))
    .then((snap) => {
      if (cancelled) return;
      const total = snap.docs
        .map(d => d.data())
        .filter(c => matchesBarber(c, activeBarber?.id) && c.status === STATUS.COMPLETED)
        .reduce((sum, c) => sum + Number(c.price || 0), 0);
      setPrevEarnings(total);
    })
    .catch((err) => {
      console.error('[Rendimiento] error al leer el período anterior:', err);
      if (!cancelled) setPrevEarnings(null);
    });
  return () => { cancelled = true; };
}, [negocioId, activeTab, selectedDate, comparisonView, activeBarber?.id]);

// --- CITAS DEL NEGOCIO (TIEMPO REAL, SOLO EL PERÍODO VISIBLE) ---
// Un solo listener compartido por Agenda, Comisiones y Rendimiento (mismo selector y mismo rango).
// En Perfil no se usa: no hay listener de citas.
const citasTabActive = activeTab === "agenda" || activeTab === "comisiones" || activeTab === "rendimiento";
useEffect(() => {
  if (!negocioId || !citasTabActive) return;
  const q = query(
    collection(db, 'negocios', negocioId, 'citas'),
    where('date', '>=', rangeStart),
    where('date', '<=', rangeEnd)
  );
  const unsub = onSnapshot(q, (snap) => {
    console.log('[BARBER] citas recibidas:', snap.docs.length);
    setAppointments(snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        service: getApptServiceName(data),
        status: data.status
      };
    }));
  });
  return () => unsub();
}, [negocioId, citasTabActive, rangeStart, rangeEnd]);

// --- HORARIOS BLOQUEADOS DEL NEGOCIO (TIEMPO REAL, MISMO RANGO) ---
// Solo la Agenda usa los bloqueos (grilla, crear cita, bloquear horario).
const bloqueosTabActive = activeTab === "agenda";
useEffect(() => {
  if (!negocioId || !bloqueosTabActive) return;
  const q = query(
    collection(db, 'negocios', negocioId, 'horariosBloqueados'),
    where('date', '>=', rangeStart),
    where('date', '<=', rangeEnd)
  );
  const unsub = onSnapshot(q, (snap) => {
    setBlockedSlots(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
  return () => unsub();
}, [negocioId, bloqueosTabActive, rangeStart, rangeEnd]);

// Para validar una fecha fuera del período cargado (ej. el modal permite elegir otra fecha):
// se consulta solo esa fecha.
const isDateLoaded = (date) => !!date && date >= rangeStart && date <= rangeEnd;
const fetchByDate = async (subcollection, date) => {
  const snap = await getDocs(query(collection(db, 'negocios', negocioId, subcollection), where('date', '==', date)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

  // --- AGENDAR NUEVA CITA ---
  const handleAddAppointment = async (e) => {
    e.preventDefault();

    if (!newClientName.trim()) {
      triggerToast(`Ingresa el nombre ${g('client', 'del', 'de la')} ${tl('client')}`, "error");
      return;
    }

    if (!newService) {
      triggerToast(`Selecciona ${g('service', 'un', 'una')} ${tl('service')}`, "error");
      return;
    }

    const blockConflict = blockedSlots.find(block => {
      if (block.barber !== activeBarber.id || block.date !== selectedDate) return false;
      const apptMin = convertTimeToMinutes(newTime);
      const startMin = convertTimeToMinutes(block.startTime);
      const endMin = convertTimeToMinutes(block.endTime);
      return apptMin >= startMin && apptMin < endMin;
    });

    if (blockConflict) {
      triggerToast(`Horario ocupado por bloqueo administrativo: ${blockConflict.reason}`, "error");
      return;
    }

    const duplicateAppt = appointments.find(appt =>
      matchesBarber(appt, activeBarber.id) &&
      appt.date === selectedDate &&
      appt.time === newTime &&
      appt.status !== "Cancelado"
    );

    if (duplicateAppt) {
      triggerToast(`${g('professional', 'Este', 'Esta')} ${tl('professional')} ya tiene una reserva agendada a esta hora.`, "error");
      return;
    }

    // Guarda o actualiza el cliente (igual que hace Admin), para que aparezca en
    // Clientes del panel aunque el barbero escriba un nombre nuevo directo aquí.
    let clientObj = clientes.find(c => (c.name || '').toLowerCase() === newClientName.trim().toLowerCase());
    if (!clientObj) {
      const slug = newClientName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      clientObj = {
        id: `${slug || 'cliente'}-${Date.now()}`,
        name: newClientName.trim(),
        phone: 'N/A',
        visits: 1,
        totalSpent: 0,
        lastVisit: selectedDate,
        favoriteService: newService.name
      };
    } else {
      clientObj = { ...clientObj, visits: (clientObj.visits || 0) + 1, lastVisit: selectedDate };
    }
    try {
      await setDoc(doc(db, 'negocios', negocioId, 'clientes', clientObj.id), clientObj, { merge: true });
    } catch (err) {
      triggerToast('Error al guardar el cliente: ' + err.message, 'error');
    }

    const nowIso = new Date().toISOString();
    const newAppt = {
      clientId: clientObj.id,
      barber: activeBarber.id,
      professionalId: activeBarber.id,
      clientName: newClientName,
      service: newService.name,
      serviceName: newService.name,
      serviceId: newService.id || null,
      price: newService.price,
      commission: Number(newService.commission || 0),
      date: selectedDate,
      time: newTime,
      status: "confirmed",
      commissionPaid: false,
      paymentMethod: 'Pendiente',
      createdAt: nowIso,
      updatedAt: nowIso,
      notes: newNotes,
      branch: activeBarber.branch,
      bookedBy: 'barber'
    };


    if (!isFirebaseConfigured || !db || !negocioId) {
      triggerToast("Sin conexión al negocio, intenta de nuevo.", "error");
      return;
    }

    try {
      await addDoc(collection(db, 'negocios', negocioId, 'citas'), newAppt);
      triggerToast(`${t('appointment')} ${g('appointment', 'agendado', 'agendada')} correctamente`);
      notify(NotificationType.RESERVA_CREADA_BARBER, negocioId, { clientName: newAppt.clientName, time: newAppt.time }, barberUser?.id, barberUser?.id);
      reevaluatePending(negocioId, newAppt.date);
    } catch (err) {
      triggerToast(`Error al agendar ${g('appointment', 'el', 'la')} ${tl('appointment')}: ` + err.message, "error");
      return;
    }

    setNewClientName("");
    setNewNotes("");
    setSearchQuery("");
    setIsModalOpen(false);
  };

  // --- REGISTRAR NUEVO CLIENTE (MODAL SECUNDARIO) ---
  const handleCreateNewClient = async (e) => {
    e.preventDefault();
    if (!newClientModalName.trim()) {
      triggerToast(`Por favor, ingresa el nombre completo ${g('client', 'del', 'de la')} ${tl('client')}`, "error");
      return;
    }
    if (!newClientModalPhone.trim()) {
      triggerToast(`Por favor, ingresa el teléfono ${g('client', 'del', 'de la')} ${tl('client')}`, "error");
      return;
    }

    const formattedPhone = `${newClientModalCountryCode} ${newClientModalPhone.trim()}`;
    const phoneId = formattedPhone.replace(/[^0-9]/g, '');
    const phoneExists = clientes.some(c => c.phone === formattedPhone);

    if (phoneExists) {
      triggerToast(`Ya existe ${g('client', 'un', 'una')} ${tl('client')} ${g('client', 'registrado', 'registrada')} con ese número de teléfono`, "error");
      return;
    }

    const newClientObj = {
      id: phoneId,
      name: newClientModalName.trim(),
      phone: formattedPhone,
      visits: 0,
      totalSpent: 0,
      lastVisit: null,
      favoriteService: 'N/A'
    };

    try {
      await setDoc(doc(db, 'negocios', negocioId, 'clientes', phoneId), newClientObj, { merge: true });
    } catch (err) {
      triggerToast('Error al guardar el cliente: ' + err.message, 'error');
      return;
    }

    // Completar automáticamente en el formulario de la reserva actual
    setNewClientName(newClientObj.name);
    setSearchQuery(newClientObj.name);
    setShowDropdownDropdownClients(false);

    // Cerrar modal secundario
    setIsNewClientModalOpen(false);
    triggerToast(`${t('client')} ${newClientObj.name} ${g('client', 'guardado y seleccionado', 'guardada y seleccionada')}`);
  };

  // --- BLOQUEAR HORARIO ADMINISTRATIVO ---
  const handleAddBlockSlot = async (e) => {
    e.preventDefault();
    if (!blockReason.trim()) {
      triggerToast("Ingresa el motivo del bloqueo", "error");
      return;
    }

    const startMin = convertTimeToMinutes(blockStartTime);
    const endMin = convertTimeToMinutes(blockEndTime);

    if (startMin >= endMin) {
      triggerToast("La hora de inicio debe ser anterior a la hora de fin.", "error");
      return;
    }

    // Validar superposición con reservas existentes
    let citasDeLaFecha = appointments;
    if (!isDateLoaded(blockDate)) {
      try {
        citasDeLaFecha = await fetchByDate('citas', blockDate);
      } catch (err) {
        triggerToast(`No se pudo verificar ${g('appointment', 'los', 'las')} ${tl('appointments')} de esa fecha: ` + err.message, "error");
        return;
      }
    }
    const conflictAppt = citasDeLaFecha.find(appt => {
      if (appt.barber !== activeBarber.id || appt.date !== blockDate || appt.status === "Cancelado") return false;
      const apptMin = convertTimeToMinutes(appt.time);
      return apptMin >= startMin && apptMin < endMin;
    });

    if (conflictAppt) {
      triggerToast(`Hay ${g('appointment', 'un', 'una')} ${tl('appointment')} existente con ${conflictAppt.clientName} en el rango seleccionado.`, "error");
      return;
    }

    const newBlock = {
      barber: activeBarber.id,
      barberId: activeBarber.id, // para que AdminApp lo reconozca en checkConflicts
      date: blockDate,
      startTime: blockStartTime,
      endTime: blockEndTime,
      reason: blockReason
    };

    if (!isFirebaseConfigured || !db || !negocioId) {
      triggerToast("Sin conexión al negocio, intenta de nuevo.", "error");
      return;
    }

    try {
      await addDoc(collection(db, 'negocios', negocioId, 'horariosBloqueados'), newBlock);
      reevaluatePending(negocioId, newBlock.date);
      triggerToast("Horario administrativo bloqueado");
    } catch (err) {
      triggerToast("Error al bloquear el horario: " + err.message, "error");
      return;
    }

    setBlockReason("");
    setIsBlockModalOpen(false);
  };

  const convertTimeToMinutes = (timeString) => {
    const [hrs, mins] = timeString.split(":").map(Number);
    return hrs * 60 + mins;
  };

  const updateStatus = async (apptId, nextStatus, paymentMethod) => {
    if (!canEditPart(staffPerms, 'editFinish')) { triggerToast(`No tienes permiso para cambiar el estado de ${g('appointment', 'los', 'las')} ${tl('appointments')}.`, 'error'); return; }
    try {
      const docRef = doc(db, 'negocios', negocioId, 'citas', apptId);
      const payload = { status: nextStatus, updatedAt: new Date().toISOString() };
      if (paymentMethod) payload.paymentMethod = paymentMethod;
      await updateDoc(docRef, payload);
      triggerToast(`${t('appointment')} ${g('appointment', 'marcado', 'marcada')} como ${normalizeStatus(nextStatus)}`);
    } catch (err) {
      triggerToast('Error al actualizar la cita: ' + err.message, 'error');
    }
  };

  const managingPerms = managingAppt && !matchesBarber(managingAppt, activeBarber?.id)
    ? { ...staffPerms, editAppointments: false, deleteAppointments: false, changeAppointmentClient: false }
    : staffPerms;
  const handleChangeManagingField = (field, value) => {
    setManagingAppt(prev => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSubmitManagingAppt = async (e) => {
    e.preventDefault();
    if (!managingAppt) return;
    // Construir el payload solo con los campos que Barber tiene permiso
    // de editar según permissions.js — sin hardcodear campo a campo.
    if (!managingPerms.editAppointments) { setManagingAppt(null); return; }
    const allowed = getEffectiveFieldPermissions('barber', managingPerms) || {};
    const payload = Object.entries(allowed)
      .filter(([, canEdit]) => canEdit)
      .reduce((acc, [field]) => {
        acc[field] = managingAppt[field] ?? '';
        return acc;
      }, {});
    if (Object.keys(payload).length === 0) {
      setManagingAppt(null);
      return;
    }
    // Cita original (antes de editar) para decir qué cambió en la notificación.
    const before = appointments.find(a => a.id === managingAppt.id);
    // Horario laboral (Fase 4/5): solo si cambió la hora o la duración.
    const timeChanged = 'time' in payload && payload.time !== before?.time;
    const durationChanged = 'duration' in payload && (Number(payload.duration) || 0) !== (Number(before?.duration) || 0);
    if ((timeChanged || durationChanged) && !(await confirmOutsideHours({ date: managingAppt.date, time: managingAppt.time, duration: Number(managingAppt.duration) || 30 }))) return;
    const changes = describeAppointmentChanges(before, { ...before, ...payload }, { terms: businessProfile });
    try {
      await updateDoc(doc(db, 'negocios', negocioId, 'citas', managingAppt.id), { ...payload, updatedAt: new Date().toISOString() });
      triggerToast(`${t('appointment')} ${g('appointment', 'actualizado', 'actualizada')}`);
      notify(
        payload.status === 'cancelled' ? NotificationType.RESERVA_CANCELADA : NotificationType.RESERVA_MODIFICADA,
        negocioId,
        { citaId: managingAppt.id, clientName: managingAppt.clientName, time: managingAppt.time, changes },
        barberUser?.id,
        barberUser?.id
      );
      reevaluatePending(negocioId, managingAppt.date);
    } catch (err) {
      triggerToast('Error al actualizar la cita: ' + err.message, 'error');
    }
    setManagingAppt(null);
  };

  // Fase 4/5: fuera del horario del negocio o del profesional. Con el permiso
  // "Agendar en sobrehorario" se puede confirmar; sin él, no se guarda.
  const confirmOutsideHours = async ({ date, time, duration }) => {
    const res = checkWorkingHours({ date, time, duration, businessSchedule: businessSettings?.schedule, professional: activeBarber, terms: businessProfile });
    if (res.ok) return true;
    if (!staffPerms.overtimeAppointments) {
      triggerToast(`${res.message} No tienes permiso para agendar fuera del horario.`, 'error');
      return false;
    }
    return confirmAction({
      title: 'Está fuera del horario',
      subject: res.message,
      message: `¿Quieres agendar ${g('appointment', 'este', 'esta')} ${tl('appointment')} igual, en sobrehorario?`,
      irreversible: false,
      tone: 'primary',
      confirmLabel: 'Agendar en sobrehorario',
      cancelLabel: 'Volver',
    });
  };

  const handleBarberCreateReservation = async (draft) => {
    if (!staffPerms.createAppointments) { triggerToast('No tienes permiso para crear citas.', 'error'); return; }
    let bloqueosDeLaFecha = blockedSlots;
    if (!isDateLoaded(draft.date)) {
      try {
        bloqueosDeLaFecha = await fetchByDate('horariosBloqueados', draft.date);
      } catch (err) {
        triggerToast('No se pudo verificar los bloqueos de esa fecha: ' + err.message, 'error');
        return;
      }
    }
    const blockConflict = bloqueosDeLaFecha.find(block => {
      if (block.barber !== activeBarber.id || block.date !== draft.date) return false;
      const apptMin = convertTimeToMinutes(draft.time);
      const startMin = convertTimeToMinutes(block.startTime);
      const endMin = convertTimeToMinutes(block.endTime);
      return apptMin >= startMin && apptMin < endMin;
    });

    if (blockConflict) {
      triggerToast(`Horario ocupado por bloqueo administrativo: ${blockConflict.reason}`, 'error');
      return;
    }
    if (!(await confirmOutsideHours({ date: draft.date, time: draft.time, duration: Number(draft.duration) || 30 }))) return;

    // Guarda o actualiza el cliente (mismo criterio que Admin): si venía de la
    // lista (draft.clientId) solo suma una visita; si es nuevo, lo crea.
    let clientObj;
    if (draft.clientId) {
      const existing = clientes.find(c => c.id === draft.clientId);
      clientObj = existing
        ? { ...existing, visits: (existing.visits || 0) + 1, lastVisit: draft.date }
        : { id: draft.clientId, name: draft.clientName, phone: draft.phone || 'N/A', visits: 1, totalSpent: 0, lastVisit: draft.date, favoriteService: draft.serviceName };
    } else {
      const phoneId = (draft.phone || '').replace(/[^0-9]/g, '');
      const slug = (draft.clientName || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const existingByName = clientes.find(c => (c.name || '').toLowerCase() === (draft.clientName || '').trim().toLowerCase());
      clientObj = existingByName
        ? { ...existingByName, visits: (existingByName.visits || 0) + 1, lastVisit: draft.date }
        : {
            id: phoneId || `${slug || 'cliente'}-${Date.now()}`,
            name: draft.clientName,
            phone: draft.phone || 'N/A',
            visits: 1,
            totalSpent: 0,
            lastVisit: draft.date,
            favoriteService: draft.serviceName
          };
    }
    try {
      await setDoc(doc(db, 'negocios', negocioId, 'clientes', clientObj.id), clientObj, { merge: true });
    } catch (err) {
      triggerToast('Error al guardar el cliente: ' + err.message, 'error');
    }

    const nowIso = new Date().toISOString();
    const newAppt = {
      clientId: clientObj.id,
      barber: activeBarber.id,
      professionalId: activeBarber.id,
      barberId: activeBarber.id,
      clientName: draft.clientName,
      clientPhone: (draft.phone || (clientObj.phone !== 'N/A' ? clientObj.phone : '') || ''),
      service: draft.serviceName,
      serviceName: draft.serviceName,
      serviceId: draft.serviceId,
      services: draft.services,
      price: draft.price,
      duration: draft.duration,
      date: draft.date,
      time: draft.time,
      status: 'confirmed',
      commissionPaid: false,
      paymentMethod: draft.paymentMethod,
      createdAt: nowIso,
      updatedAt: nowIso,
      notes: draft.notes || '',
      branch: activeBarber.branch,
      bookedBy: 'barber',
    };
    try {
      await addDoc(collection(db, 'negocios', negocioId, 'citas'), newAppt);
      triggerToast(`${t('appointment')} ${g('appointment', 'agendado', 'agendada')} correctamente`);
      notify(NotificationType.RESERVA_CREADA_BARBER, negocioId, { clientName: newAppt.clientName, time: newAppt.time }, barberUser?.id, barberUser?.id);
      reevaluatePending(negocioId, newAppt.date);
    } catch (err) {
      triggerToast('Error al agendar: ' + err.message, 'error');
    }
    setIsCreateModalOpen(false);
  };

  const markCommissionPaid = async (apptId) => {
    try {
      const docRef = doc(db, 'negocios', negocioId, 'citas', apptId);
      await updateDoc(docRef, { commissionPaid: true });
      triggerToast("Comisión marcada como PAGADA");
    } catch (err) {
      triggerToast('Error al marcar la comisión: ' + err.message, 'error');
    }
  };

  // Marca como pagadas TODAS las comisiones pendientes del período que está
  // seleccionado ahora mismo (Día/Semana/Mes/Año) — usa commissionSummary,
  // que ya está filtrado por ese mismo período.
  const [collectingAll, setCollectingAll] = useState(false);
  const markAllCommissionsPaid = async () => {
    const pendientes = (commissionSummary.allFinalized || []).filter(item => !item.commissionPaid);
    if (pendientes.length === 0 || collectingAll) return;
    setCollectingAll(true);
    try {
      await Promise.all(pendientes.map(item =>
        updateDoc(doc(db, 'negocios', negocioId, 'citas', item.id), { commissionPaid: true })
      ));
      triggerToast(`${pendientes.length} comisión(es) marcada(s) como PAGADA`);
    } catch (err) {
      triggerToast('Error al cobrar todo: ' + err.message, 'error');
    } finally {
      setCollectingAll(false);
    }
  };

  const deleteAppointment = async (apptId) => {
    if (!staffPerms.deleteAppointments) { triggerToast('No tienes permiso para eliminar citas.', 'error'); return; }
    const targetAppt = appointments.find(a => a.id === apptId);
    try {
      await deleteDoc(doc(db, 'negocios', negocioId, 'citas', apptId));
      // Descuenta la visita del cliente (se había sumado al crear la cita).
      if (targetAppt?.clientId) {
        const clientDoc = clientes.find(c => c.id === targetAppt.clientId);
        if (clientDoc) {
          const newVisits = Math.max(0, (clientDoc.visits || 0) - 1);
          setDoc(doc(db, 'negocios', negocioId, 'clientes', clientDoc.id), { visits: newVisits }, { merge: true }).catch(() => {});
        }
      }
      triggerToast(`${t('appointment')} ${g('appointment', 'eliminado', 'eliminada')}`, "info");
      notify(NotificationType.RESERVA_CANCELADA, negocioId, { citaId: apptId, clientName: targetAppt?.clientName, time: targetAppt?.time }, barberUser?.id, barberUser?.id);
    } catch (err) {
      triggerToast('Error al eliminar la cita: ' + err.message, 'error');
    }
  };

  const handleDateChange = (days) => {
    const current = new Date(selectedDate + "T00:00:00");
    if (selectedRange === "Año") {
      current.setFullYear(current.getFullYear() + days);
    } else if (selectedRange === "Mes") {
      current.setMonth(current.getMonth() + days);
    } else if (selectedRange === "Semana") {
      current.setDate(current.getDate() + (days * 7));
    } else {
      current.setDate(current.getDate() + days);
    }
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  // --- OBTENER RANGO SEMANAL ACTUAL (LUNES A DOMINGO) ---
  const currentWeekDays = useMemo(() => {
    const targetDate = new Date(selectedDate + "T00:00:00");
    const dayOfWeek = targetDate.getDay(); 
    const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const monday = new Date(targetDate);
    monday.setDate(targetDate.getDate() + distanceToMonday);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      days.push(day.toISOString().split('T')[0]);
    }
    return days;
  }, [selectedDate]);

  // --- FILTRADO AVANZADO DE VISTAS (Día, Semana, Mes, Año) ---
  const filteredAppointments = useMemo(() => {
    return appointments.filter(appt => {
      if (!matchesBarber(appt, activeBarber.id)) return false;

      const targetDate = new Date(selectedDate + "T00:00:00");
      const apptDate = new Date(appt.date + "T00:00:00");

      if (selectedRange === "Día") {
        return appt.date === selectedDate;
      } 
      
      if (selectedRange === "Semana") {
        const mondayStr = currentWeekDays[0];
        const sundayStr = currentWeekDays[6];
        return appt.date >= mondayStr && appt.date <= sundayStr;
      } 
      
      if (selectedRange === "Mes") {
        return targetDate.getMonth() === apptDate.getMonth() && targetDate.getFullYear() === apptDate.getFullYear();
      }

      if (selectedRange === "Año") {
        return targetDate.getFullYear() === apptDate.getFullYear();
      }

      return true;
    }).sort((a, b) => a.time.localeCompare(b.time));
  }, [appointments, activeBarber, selectedRange, selectedDate, currentWeekDays]);

  // --- DISTRIBUCIÓN MENSUAL SIMPLE PARA VISTA ANUAL ---
  const annualMonthlyDistribution = useMemo(() => {
    const targetYear = new Date(selectedDate + "T00:00:00").getFullYear();
    const list = Array(12).fill(0).map((_, i) => ({ monthIndex: i, count: 0 }));
    
    appointments.forEach(appt => {
      if (matchesBarber(appt, activeBarber.id)) {
        const d = new Date(appt.date + "T00:00:00");
        if (d.getFullYear() === targetYear) {
          list[d.getMonth()].count += 1;
        }
      }
    });
    return list;
  }, [appointments, activeBarber, selectedDate]);

  // --- MATRIZ DE DÍAS DEL MES PARA LA VISTA MENSUAL ---
  const monthlyGridDays = useMemo(() => {
    const targetDate = new Date(selectedDate + "T00:00:00");
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    let startOffset = firstDayOfMonth.getDay() - 1;
    if (startOffset < 0) startOffset = 6; 

    const days = [];
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      days.push({ dateStr: d.toISOString().split('T')[0], dayNum: d.getDate(), isCurrentMonth: false });
    }

    const totalDaysCurrent = lastDayOfMonth.getDate();
    for (let i = 1; i <= totalDaysCurrent; i++) {
      const d = new Date(year, month, i);
      days.push({ dateStr: d.toISOString().split('T')[0], dayNum: i, isCurrentMonth: true });
    }

    const remainingSlots = 42 - days.length; 
    for (let i = 1; i <= remainingSlots; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ dateStr: d.toISOString().split('T')[0], dayNum: i, isCurrentMonth: false });
    }

    return days;
  }, [selectedDate]);

  // --- CÁLCULO DE COMISIONES DEL BARBERO SEGÚN PERIODO ---
  const commissionSummary = useMemo(() => {
    const barbtAppts = appointments.filter(appt => {
      if (!matchesBarber(appt, activeBarber.id)) return false;

      const targetDate = new Date(selectedDate + "T00:00:00");
      const apptDate = new Date(appt.date + "T00:00:00");

      if (selectedRange === "Día") {
        return appt.date === selectedDate;
      } 
      
      if (selectedRange === "Semana") {
        const mondayStr = currentWeekDays[0];
        const sundayStr = currentWeekDays[6];
        return appt.date >= mondayStr && appt.date <= sundayStr;
      } 
      
      if (selectedRange === "Mes") {
        return targetDate.getMonth() === apptDate.getMonth() && targetDate.getFullYear() === apptDate.getFullYear();
      }

      if (selectedRange === "Año") {
        return targetDate.getFullYear() === apptDate.getFullYear();
      }

      return true;
    });

    const finalizedAppts = barbtAppts.filter(a => a.status === STATUS.COMPLETED);
    const finalizedWithCommission = finalizedAppts.map(item => {
      const result = calculateCommissionForCita(item, activeBarber, services);

      return {
        ...item,
        commission: result.totalAmount
      };
    });
    const totalServicios = finalizedAppts.length;

    let comisionTotal = 0;
    let comisionPaid = 0;
    let sinConfigurar = 0;

    finalizedAppts.forEach(item => {
      const result = calculateCommissionForCita(item, activeBarber, services);
      if (!result.allConfigured) sinConfigurar += 1;
      comisionTotal += result.totalAmount;
      if (item.commissionPaid) comisionPaid += result.totalAmount;
    });

    const comisionPending = comisionTotal - comisionPaid;

    return {
      totalServicios,
      comisionTotal,
      comisionPagada: comisionPaid,
      comisionPendiente: comisionPending,
      serviciosSinComisionConfigurada: sinConfigurar,
      allFinalized: finalizedWithCommission
    };
  }, [appointments, activeBarber, selectedRange, selectedDate, currentWeekDays]);

  // --- DATOS OPERATIVOS Y GRÁFICOS SEGÚN PERIODO ---
  const performanceData = useMemo(() => {
    const barbtAppts = appointments.filter(appt => {
      if (!matchesBarber(appt, activeBarber.id) || appt.status !== STATUS.COMPLETED) return false;

      const targetDate = new Date(selectedDate + "T00:00:00");
      const apptDate = new Date(appt.date + "T00:00:00");

      if (selectedRange === "Día") {
        return appt.date === selectedDate;
      } 
      
      if (selectedRange === "Semana") {
        const mondayStr = currentWeekDays[0];
        const sundayStr = currentWeekDays[6];
        return appt.date >= mondayStr && appt.date <= sundayStr;
      } 
      
      if (selectedRange === "Mes") {
        return targetDate.getMonth() === apptDate.getMonth() && targetDate.getFullYear() === apptDate.getFullYear();
      }

      if (selectedRange === "Año") {
        return targetDate.getFullYear() === apptDate.getFullYear();
      }

      return true;
    });

    const serviceDistribution = {};
    barbtAppts.forEach(appt => {
      serviceDistribution[appt.service] = (serviceDistribution[appt.service] || 0) + 1;
    });

    const pieData = Object.keys(serviceDistribution).map(key => ({
      name: key,
      value: serviceDistribution[key]
    }));

    const paymentDistribution = {};
    barbtAppts.forEach(appt => {
      paymentDistribution[appt.paymentMethod || "Efectivo"] = (paymentDistribution[appt.paymentMethod || "Efectivo"] || 0) + appt.price;
    });

    const barData = Object.keys(paymentDistribution).map(key => ({
      name: key,
      monto: paymentDistribution[key]
    }));

    const totalServicios = barbtAppts.length;
    const totalGanado = barbtAppts.reduce((sum, item) => sum + Number(item.price || 0), 0);
    const crecimientoPorcentaje = (prevEarnings && prevEarnings > 0)
      ? Math.round(((totalGanado - prevEarnings) / prevEarnings) * 1000) / 10
      : null; // null = sin datos del período anterior para comparar (no "0%", que engaña)

    return {
      pieData: pieData.length > 0 ? pieData : [{ name: "Ninguno", value: 1 }],
      barData: barData.length > 0 ? barData : [{ name: "Sin datos", monto: 0 }],
      totalServicios,
      totalGanado,
      crecimientoPorcentaje
    };
  }, [appointments, activeBarber, selectedRange, selectedDate, currentWeekDays, prevEarnings]);
  const renderUnifiedSelector = (showAlternator = false) => {
    return (
      <div className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center justify-center gap-2 w-full">
          {/* Selector de fecha con flechas estilizadas */}
          <div className="flex items-center bg-nexus-surface border border-nexus-border rounded-xl h-11 px-1 justify-between min-w-0">
            <button 
              type="button"
              onClick={() => handleDateChange(-1)} 
              aria-label="Periodo anterior"
              className="h-9 w-9 inline-flex items-center justify-center hover:bg-nexus-surface-hover rounded-lg text-nexus-primary transition-colors cursor-pointer"
            >
              <Icons.ChevronLeft className="w-5 h-5" />
            </button>
            
            <span className="text-sm font-semibold text-nexus-text px-3 min-w-[132px] text-center whitespace-nowrap nx-num" aria-live="polite">
              {selectedRange === "Año" ? (
                new Date(selectedDate + "T00:00:00").getFullYear()
              ) : selectedRange === "Mes" ? (
                MESES_NOMBRES[new Date(selectedDate + "T00:00:00").getMonth()] + " " + new Date(selectedDate + "T00:00:00").getFullYear()
              ) : selectedRange === "Semana" ? (
                (() => {
                  const start = new Date(currentWeekDays[0] + "T00:00:00");
                  const end = new Date(currentWeekDays[6] + "T00:00:00");
                  const startMonth = MESES_NOMBRES[start.getMonth()].slice(0, 3);
                  const endMonth = MESES_NOMBRES[end.getMonth()].slice(0, 3);
                  if (start.getFullYear() !== end.getFullYear()) return `${start.getDate()} ${startMonth} ${start.getFullYear()} – ${end.getDate()} ${endMonth} ${end.getFullYear()}`;
                  if (startMonth !== endMonth) return `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth} ${end.getFullYear()}`;
                  return `${start.getDate()}–${end.getDate()} ${endMonth} ${end.getFullYear()}`;
                })()
              ) : (
                (() => {
                  const d = new Date(selectedDate + "T00:00:00");
                  return `${DIAS_SEMANA_NOMBRES[(d.getDay() + 6) % 7].slice(0, 3)}, ${d.getDate()} ${MESES_NOMBRES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
                })()
              )}
            </span>
            
            <button 
              type="button"
              onClick={() => handleDateChange(1)} 
              aria-label="Periodo siguiente"
              className="h-9 w-9 inline-flex items-center justify-center hover:bg-nexus-surface-hover rounded-lg text-nexus-primary transition-colors cursor-pointer"
            >
              <Icons.ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* ALTERNADOR DE VISTA DÍA (Acoplado al extremo derecho) */}
          {showAlternator && selectedRange === "Día" && (
            <div className="flex bg-nexus-surface p-1 rounded-xl border border-nexus-border items-center gap-1 shrink-0 animate-fade-in">
              <button
                type="button"
                onClick={() => setDiaViewStyle("Calendario")}
                aria-label="Vista calendario"
                className={`h-9 w-9 inline-flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  diaViewStyle === "Calendario" 
                    ? "bg-nexus-primary text-white" 
                    : "text-nexus-text-muted hover:text-nexus-text-secondary"
                }`}
                title="Vista Calendario"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 3V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setDiaViewStyle("Lista")}
                aria-label="Vista lista"
                className={`h-9 w-9 inline-flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  diaViewStyle === "Lista" 
                    ? "bg-nexus-primary text-white" 
                    : "text-nexus-text-muted hover:text-nexus-text-secondary"
                }`}
                title="Vista Lista"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Duración real de una cita en minutos (cita.duration o la suma de sus servicios).
  const apptDurationMin = (appt) => {
    const d = Number(appt?.duration);
    if (d > 0) return d;
    const fromServices = getServicesFromCita(appt).reduce((sum, s) => sum + (Number(s?.duration) || 0), 0);
    if (fromServices > 0) return fromServices;
    const svc = services.find(s => s.id === appt?.serviceId);
    return Number(svc?.duration) || 30;
  };

  // --- MANEJADOR DE CLIC EN UN SLOT VACÍO DE LA GRILLA ---
  const handleSlotClick = (timeStr, isBlocked, hasAppt) => {
    if (isBlocked || hasAppt) return; 
    setTempSelectedTime(timeStr);
    setIsModalOpenSlot(true); 
  };

  if (!barberUser) {
    return (
      <BarberLoginPage
        onLogin={loginBarber}
        error={authError}
        loading={authLoading}
      />
    );
  }

  if (!activeBarber) {
    return <div style={{ background: '#F8FAFC', width: '100vw', height: '100vh' }} />;
  }

  if (isBlocked) {
    return <SuspendedScreen status={negocioStatus} onLogout={logout} />;
  }

  // Capacidad `appProfesionales`: el plan decide si el staff puede usar su panel.
  // Mientras carga el plan no se bloquea nada (pantalla vacía, igual que arriba);
  // si la lectura falla, useNegocioPlan resuelve el default (true) -> no se bloquea.
  if (planLoading) {
    return <div style={{ background: '#F8FAFC', width: '100vw', height: '100vh' }} />;
  }
  if (!canUseCapability('appProfesionales')) {
    return (
      <SuspendedScreen
        status="not_included"
        title="Acceso no incluido en el plan"
        message="El plan de este negocio no incluye el panel para profesionales. Consulta con el administrador del negocio."
        onLogout={logout}
      />
    );
  }

  return (
    <BusinessProfileContext.Provider value={businessProfile}>
    {confirmDialog}
    <div className="min-h-screen bg-nexus-background text-nexus-text flex flex-col font-sans select-none pb-24 md:pb-0">
      
      {/* HEADER SUPERIOR */}
      {activeTab !== "perfil" && (
        <header className="sticky top-0 z-40 bg-nexus-surface/95 backdrop-blur border-b border-nexus-border py-3 px-3 sm:px-4 w-full">
          <div className="w-full max-w-md mx-auto flex bg-nexus-background p-1 rounded-2xl border border-nexus-border items-center justify-between gap-1">
            {["Día", "Semana", "Mes", "Año"].map(range => (
              <button
                key={range}
                onClick={() => setSelectedRange(range)}
                aria-pressed={selectedRange === range}
                className={`flex-1 h-10 px-3 sm:px-4 rounded-xl text-sm font-semibold transition-colors duration-200 text-center select-none cursor-pointer ${
                  selectedRange === range 
                    ? "bg-nexus-primary text-white shadow-sm" 
                    : "text-nexus-text-secondary hover:text-nexus-text"
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </header>
      )}

      {/* TOAST SYSTEM */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] animate-bounce">
          <div className={`px-4 py-2.5 rounded-xl border backdrop-blur-md shadow-2xl flex items-center gap-2 text-sm font-bold ${
            toast.type === "error" 
              ? "bg-nexus-error-bg border-nexus-error/25 text-nexus-error-text" 
              : toast.type === "info"
              ? "bg-nexus-info-bg border-nexus-info/25 text-nexus-info-text"
              : "bg-nexus-success-bg border-nexus-success/25 text-nexus-success-text"
          }`}>
            <div className={`w-2 h-2 rounded-full ${toast.type === "error" ? "bg-nexus-error" : toast.type === "info" ? "bg-nexus-info" : "bg-nexus-success"}`}></div>
            {toast.text}
          </div>
        </div>
      )}

      {/* CONTENEDOR PRINCIPAL */}
      <main className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 space-y-6">

        {loading ? (
          <div className="space-y-4 py-12">
            <div className="h-10 bg-nexus-surface-hover rounded-xl animate-pulse"></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="h-24 bg-nexus-surface-hover rounded-2xl animate-pulse"></div>
              <div className="h-24 bg-nexus-surface-hover rounded-2xl animate-pulse"></div>
              <div className="h-24 bg-nexus-surface-hover rounded-2xl animate-pulse"></div>
              <div className="h-24 bg-nexus-surface-hover rounded-2xl animate-pulse"></div>
            </div>
            <div className="h-64 bg-nexus-surface-hover rounded-2xl animate-pulse"></div>
          </div>
        ) : (
          <>
            {/* ================= TAB 1: AGENDA ================= */}
            {activeTab === "agenda" && (
              <div className="space-y-5 animate-fade-in">
                
                {/* Header de la Agenda con el selector unificado */}
                {renderUnifiedSelector(true)}

                {/* VISTA CONTEXTUAL PRINCIPAL */}
                {selectedRange === "Año" ? (
                  
                  /* ================= VISTA ANUAL SIMPLE ================= */
                  <div className="space-y-6 animate-fade-in">
                    <div className="bg-nexus-surface border border-nexus-border p-5 rounded-2xl">
                      <h3 className="text-sm font-bold text-nexus-text mb-1">
                        Distribución de Reservas Anuales ({new Date(selectedDate + "T00:00:00").getFullYear()})
                      </h3>
                      <p className="text-xs text-nexus-text-muted">
                        Cantidad total de reservas completadas y agendadas distribuidas por mes.
                      </p>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-5">
                        {annualMonthlyDistribution.map((m) => {
                          const targetYear = new Date(selectedDate + "T00:00:00").getFullYear();
                          const count = appointments.filter(appt => {
                            if (!matchesBarber(appt, activeBarber.id)) return false;
                            const d = new Date(appt.date + "T00:00:00");
                            return d.getFullYear() === targetYear && d.getMonth() === m.monthIndex;
                          }).length;

                          return (
                            <div key={m.monthIndex} className="bg-nexus-surface-hover border border-nexus-border p-4 rounded-xl flex flex-col justify-between h-28">
                              <span className="text-xs font-bold text-nexus-text-secondary">{MESES_NOMBRES[m.monthIndex]}</span>
                              <div className="mt-2">
                                <span className="text-2xl font-bold text-nexus-text">{count}</span>
                                <span className="text-xs text-nexus-text-muted block">Reservas</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                ) : selectedRange === "Mes" ? (
                  
                  /* ================= VISTA MENSUAL: CALENDARIO TIPO GRILLA ================= */
                  <div className="space-y-4 animate-fade-in">
                    <div className="bg-nexus-surface border border-nexus-border rounded-3xl p-4 shadow-lg overflow-hidden">
                      {/* Cabecera de los días de la semana */}
                      <div className="grid grid-cols-7 gap-1 text-center border-b border-nexus-border pb-3 select-none">
                        {DIAS_SEMANA_NOMBRES.map(d => (
                          <span key={d} className="text-xs  font-bold text-nexus-primary">
                            {d.slice(0, 3)}
                          </span>
                        ))}
                      </div>

                      {/* Grilla de Días */}
                      <div className="grid grid-cols-7 gap-1.5 pt-3">
                        {monthlyGridDays.map((gridItem, idx) => {
                          const dayAppts = appointments.filter(appt => matchesBarber(appt, activeBarber.id) && appt.date === gridItem.dateStr);
                          const dayBlocks = blockedSlots.filter(block => block.barber === activeBarber.id && block.date === gridItem.dateStr);
                          const isSelected = gridItem.dateStr === selectedDate;

                          return (
                            <div 
                              key={idx}
                              onClick={() => {
                                setSelectedDate(gridItem.dateStr);
                                triggerToast(`Día seleccionado: ${gridItem.dayNum} de ${MESES_NOMBRES[new Date(gridItem.dateStr + "T00:00:00").getMonth()]}`, "info");
                              }}
                              className={`min-h-[70px] sm:min-h-[85px] p-1.5 rounded-xl border flex flex-col justify-between cursor-pointer transition-all duration-200 ${
                                isSelected 
                                  ? "bg-nexus-primary-soft border-nexus-primary shadow-sm" 
                                  : gridItem.isCurrentMonth
                                  ? "bg-nexus-background border-nexus-border hover:bg-nexus-surface-hover"
                                  : "bg-transparent border-transparent opacity-30 hover:opacity-50"
                              }`}
                            >
                              <span className={`text-xs font-bold ${isSelected ? "text-nexus-primary" : "text-nexus-text-secondary"}`}>
                                {gridItem.dayNum}
                              </span>

                              {/* Indicadores de Reservas / Bloqueos */}
                              <div className="flex flex-wrap gap-1 mt-1 justify-start">
                                {dayAppts.map((appt) => (
                                  <div 
                                    key={appt.id}
                                    className={`w-2 h-2 rounded-full ${
                                      appt.status === "Finalizado" ? "bg-nexus-success" :
                                      appt.status === "Confirmado" ? "bg-nexus-info" :
                                      "bg-nexus-warning"
                                    }`}
                                    title={`${appt.clientName}: ${appt.service}`}
                                  />
                                ))}
                                {dayBlocks.map((block) => (
                                  <div 
                                    key={block.id}
                                    className="w-2 h-2 rounded-full bg-nexus-error"
                                    title={`Bloqueado: ${block.reason}`}
                                  />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                ) : selectedRange === "Semana" ? (
                  
                  /* ================= VISTA SEMANAL ================= */
                  <div className="space-y-4 animate-fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-7 gap-3">
                      {currentWeekDays.map((dayStr, idx) => {
                        const dayAppts = appointments.filter(appt => matchesBarber(appt, activeBarber.id) && appt.date === dayStr);
                        const isSelected = dayStr === selectedDate;
                        const dateObj = new Date(dayStr + "T00:00:00");

                        return (
                          <div 
                            key={dayStr}
                            onClick={() => setSelectedDate(dayStr)}
                            className={`rounded-2xl border p-3 flex flex-col justify-between min-h-[140px] cursor-pointer transition-all duration-200 ${
                              isSelected 
                                ? "bg-nexus-primary-soft border-nexus-primary shadow-sm"
                                : "bg-nexus-surface border-nexus-border hover:bg-nexus-surface-hover"
                            }`}
                          >
                            <div className="text-center border-b border-nexus-border pb-2 select-none">
                              <span className="block text-xs text-nexus-primary font-bold">{DIAS_SEMANA_NOMBRES[idx].slice(0,3)}</span>
                              <span className="block text-base font-bold text-nexus-text leading-none mt-1">{dateObj.getDate()}</span>
                            </div>

                            <div className="space-y-1.5 mt-2 flex-1 flex flex-col justify-end">
                              {dayAppts.length === 0 ? (
                                <span className="text-xs text-nexus-text-muted block text-center italic">Vacío</span>
                              ) : (
                                dayAppts.slice(0, 3).map((appt) => (
                                  <div 
                                    key={appt.id} 
                                    className={`text-xs font-bold p-1 rounded text-center truncate ${
                                      appt.status === "Finalizado" ? "bg-nexus-success-bg text-nexus-success-text" :
                                      appt.status === "Confirmado" ? "bg-nexus-info-bg text-nexus-info-text" :
                                      "bg-nexus-warning-bg text-nexus-warning-text"
                                    }`}
                                  >
                                    {appt.time} - {appt.clientName.split(" ")[0]}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                ) : selectedRange === "Día" && diaViewStyle === "Calendario" ? (
                  
                  /* ================= VISTA DÍA: CALENDARIO (Fase 4) =================
                     Cada cita ocupa el alto de su duración (igual que la agenda del Admin).
                     48px por cada media hora. */
                  (() => {
                    const SLOT_PX = 48;
                    const PX_PER_MIN = SLOT_PX / 30;
                    const dateObj = new Date(selectedDate + "T00:00:00");
                    const dayName = DIAS_SEMANA_NOMBRES[(dateObj.getDay() + 6) % 7];
                    const dayAv = (activeBarber?.availability || []).find(a => a?.day === dayName);
                    const works = !!dayAv && dayAv.status === "Disponible";
                    const avStart = works ? convertTimeToMinutes(dayAv.start || "00:00") : null;
                    const avEnd = works ? convertTimeToMinutes(dayAv.end || "00:00") : null;
                    const dayAppts = filteredAppointments.filter(a => a.date === selectedDate);
                    const dayBlocks = blockedSlots.filter(b => b.barber === activeBarber.id && b.date === selectedDate);
                    const dayPendings = appointments.filter(a =>
                      isOpenPendingCita(a) && a.date === selectedDate && professionalCanDo(activeBarber, getCitaServiceIds(a))
                    );
                    // Rango visible: la jornada + cualquier cita o bloqueo fuera de ella (sobrehorario).
                    const starts = [], ends = [];
                    if (works) { starts.push(avStart); ends.push(avEnd); }
                    dayAppts.forEach(a => { const st = convertTimeToMinutes(a.time || "00:00"); starts.push(st); ends.push(st + apptDurationMin(a)); });
                    dayBlocks.forEach(b => { starts.push(convertTimeToMinutes(b.startTime)); ends.push(convertTimeToMinutes(b.endTime)); });
                    const hasGrid = starts.length > 0;
                    const gridStart = hasGrid ? Math.floor(Math.min(...starts) / 60) * 60 : 0;
                    const gridEnd = hasGrid ? Math.min(24 * 60, Math.ceil(Math.max(...ends) / 60) * 60) : 0;
                    const slots = [];
                    for (let m = gridStart; m < gridEnd; m += 30) slots.push(m);
                    const toTop = (min) => (min - gridStart) * PX_PER_MIN;
                    const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
                    const inWorkHours = (min) => works && min >= avStart && min + 30 <= avEnd;
                    const showNow = selectedDate === todayLocalStr && nowMinutes >= gridStart && nowMinutes <= gridEnd;

                    return (
                  <div className="space-y-3 animate-fade-in">
                    {dayPendings.length > 0 && (
                      <div className="rounded-2xl border border-dashed border-nexus-warning/60 bg-nexus-warning-bg p-3 space-y-2">
                        <p className="text-sm font-semibold text-nexus-warning-text">
                          {dayPendings.length === 1 ? `Hay 1 reserva` : `Hay ${dayPendings.length} reservas`} sin {tl('professional')} {g('professional', 'asignado', 'asignada')} que puedes atender
                        </p>
                        {dayPendings.map(pa => (
                          <p key={pa.id} className="text-sm text-nexus-warning-text">
                            <span className="nx-num font-semibold">{pa.time}</span> · {pa.serviceName}
                          </p>
                        ))}
                      </div>
                    )}

                    {!hasGrid ? (
                      <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-8 text-center">
                        <Icons.Calendar className="w-8 h-8 text-nexus-text-muted mx-auto mb-2" />
                        <p className="text-sm font-semibold text-nexus-text">No trabajas este día</p>
                        <p className="text-sm text-nexus-text-secondary mt-1">Según tu horario configurado no hay turnos para {dayName.toLowerCase()}.</p>
                      </div>
                    ) : (
                    <div className="bg-nexus-surface border border-nexus-border rounded-2xl overflow-hidden shadow-sm">
                      <div className="relative flex" style={{ height: slots.length * SLOT_PX }}>
                        {/* Columna de horas */}
                        <div className="relative w-16 shrink-0 border-r border-nexus-border bg-nexus-background/60">
                          {slots.map(m => (
                            <div key={m} style={{ height: SLOT_PX }} className="flex items-start justify-end pr-2 pt-1 border-b border-nexus-border/60">
                              <span className={`nx-num ${m % 60 === 0 ? 'text-sm font-semibold text-nexus-text-secondary' : 'text-xs text-nexus-text-muted'}`}>{fmt(m)}</span>
                            </div>
                          ))}
                          {showNow && (
                            <span
                              className="absolute right-0.5 z-20 -translate-y-1/2 rounded-full bg-nexus-error px-1.5 py-0.5 text-xs font-bold text-white nx-num shadow-sm"
                              style={{ top: toTop(nowMinutes) }}
                              title="Hora actual"
                            >
                              {fmt(nowMinutes)}
                            </span>
                          )}
                        </div>

                        {/* Columna de citas */}
                        <div className="relative flex-1 min-w-0">
                          {slots.map(m => (
                            inWorkHours(m) ? (
                              <button
                                type="button"
                                key={m}
                                style={{ height: SLOT_PX }}
                                onClick={() => handleSlotClick(fmt(m), false, false)}
                                aria-label={`Espacio libre a las ${fmt(m)}`}
                                className="group block w-full border-b border-nexus-border/50 hover:bg-nexus-primary-soft/60 cursor-pointer text-left px-3"
                              >
                                <span className="hidden group-hover:inline-flex items-center gap-1 text-xs font-semibold text-nexus-primary">
                                  <Icons.Plus className="w-3.5 h-3.5" /> {fmt(m)}
                                </span>
                              </button>
                            ) : (
                              <div key={m} style={{ height: SLOT_PX }} className="w-full border-b border-nexus-border/50 bg-nexus-border/30" aria-hidden="true" />
                            )
                          ))}

                          {dayBlocks.map(block => {
                            const st = convertTimeToMinutes(block.startTime);
                            const en = convertTimeToMinutes(block.endTime);
                            return (
                              <div
                                key={block.id}
                                style={{ top: toTop(st), height: Math.max(20, (en - st) * PX_PER_MIN) }}
                                className="absolute left-1 right-1 z-[5] rounded-lg border border-nexus-error/30 bg-nexus-error-bg text-nexus-error-text px-3 py-1 overflow-hidden"
                              >
                                <p className="text-sm font-semibold leading-5 flex items-center gap-1.5 min-w-0">
                                  <Icons.Lock className="w-4 h-4 shrink-0 text-nexus-error" />
                                  <span className="truncate">Bloqueado <span className="nx-num font-normal">{block.startTime}–{block.endTime}</span></span>
                                </p>
                                {block.reason && <p className="text-xs leading-4 truncate opacity-80">{block.reason}</p>}
                              </div>
                            );
                          })}

                          {dayAppts.map(appt => {
                            const st = convertTimeToMinutes(appt.time || "00:00");
                            const dur = apptDurationMin(appt);
                            const h = dur * PX_PER_MIN;
                            return (
                              <button
                                type="button"
                                key={appt.id}
                                onClick={() => setManagingAppt({ ...appt, services: appt.services && appt.services.length > 0 ? appt.services : getServicesFromCita(appt) })}
                                style={{ top: toTop(st), height: h }}
                                title={`${appt.time} · ${appt.clientName} · ${appt.serviceName || appt.service || ''}`}
                                className={`absolute left-1 right-1 z-[6] rounded-lg border shadow-sm px-3 ${h < 40 ? 'py-0.5 justify-center' : 'py-1.5'} flex flex-col items-start overflow-hidden text-left cursor-pointer transition-opacity ${getStatusCardClasses(appt.status)}`}
                              >
                                <span className="block w-full text-sm font-semibold leading-5 truncate">
                                  <span className="nx-num">{appt.time}</span> · {appt.clientName}
                                  {h < 40 && <span className="font-normal text-nexus-text-secondary"> · {appt.serviceName || appt.service}</span>}
                                </span>
                                {h >= 40 && (
                                  <span className="block w-full text-sm leading-5 truncate text-nexus-text-secondary">{appt.serviceName || appt.service}</span>
                                )}
                                {h >= 72 && (
                                  <span className="flex items-center gap-2 text-xs text-nexus-text-secondary mt-0.5">
                                    <span className="inline-flex items-center gap-1 nx-num"><Icons.Clock className="w-3.5 h-3.5" /> {dur} min</span>
                                    {staffPerms.viewFinancials && <span className="nx-num font-semibold text-nexus-text">{appt.price} Bs</span>}
                                    {appt.notes && <span className="truncate italic">Nota: {appt.notes}</span>}
                                  </span>
                                )}
                              </button>
                            );
                          })}

                          {showNow && (
                            <div className="absolute left-0 right-0 z-[15] border-t-2 border-nexus-error pointer-events-none" style={{ top: toTop(nowMinutes) }} aria-hidden="true" />
                          )}
                        </div>
                      </div>
                    </div>
                    )}
                  </div>
                    );
                  })()
                ) : (
                  /* ================= LISTADO DE CITAS ESTÁNDAR (Día-Lista) ================= */
                  <div className="space-y-3 animate-fade-in">
                    {filteredAppointments.length === 0 ? (
                      <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-12 text-center flex flex-col items-center justify-center">
                        <Icons.Calendar className="w-10 h-10 text-nexus-text-muted mb-3" />
                        <h3 className="text-sm font-bold text-nexus-text">No hay {tl('appointments')} {g('appointment', 'registrados', 'registradas')}</h3>
                        <p className="text-xs text-nexus-text-muted mt-1 max-w-xs">
                          {selectedRange === "Día" && `No hay ${tl('appointments')} ${g('appointment', 'programados', 'programadas')} para hoy.`}
                        </p>
                      </div>
                    ) : (
                      filteredAppointments.map((appt) => (
                        <div 
                          key={appt.id} 
                          onClick={() => setManagingAppt({ ...appt, services: appt.services && appt.services.length > 0 ? appt.services : getServicesFromCita(appt) })}
                          className="bg-nexus-surface border border-nexus-border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-nexus-primary/40 transition-all duration-200 shadow-sm cursor-pointer"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-xl bg-nexus-background border border-nexus-border flex flex-col items-center justify-center shrink-0">
                              <span className="text-xs text-nexus-primary font-bold">Hora</span>
                              <span className="text-base font-bold text-nexus-text leading-none mt-1">{appt.time}</span>
                            </div>

                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-nexus-text text-sm">{appt.clientName}</h4>
                                
                                <AppointmentStatusBadge status={appt.status} variant="barber" />
                              </div>
                              
                              <p className="text-xs text-nexus-text-secondary mt-1 font-medium">{appt.service}</p>
                              
                              {appt.notes && (
                                <p className="text-xs italic opacity-85 mt-1 bg-black/10 px-2 py-1 rounded-lg inline-block border border-black/5">
                                  Nota: {appt.notes}
                                </p>
                              )}

                              <div className="flex items-center gap-3 text-xs text-nexus-text-muted mt-2">
                                <span className="flex items-center gap-1 font-semibold text-nexus-text-secondary">
                                  <Icons.Clock className="w-3.5 h-3.5 text-nexus-text-muted" />
                                  {getServiceDuration(services, appt)}
                                </span>
                                <span>•</span>
                                {staffPerms.viewFinancials && <span className="text-nexus-success-text font-bold">{appt.price} Bs</span>}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-2 pt-3 sm:pt-0 border-t sm:border-0 border-nexus-border">
                            {appt.status !== "Finalizado" && (
                              <div className="flex gap-2">
                                {appt.status === "Confirmado" && (
                                  <button
                                  onClick={(e) => { e.stopPropagation(); updateStatus(appt.id, "completed"); }}
                                    className="px-4 py-1.5 bg-nexus-primary hover:bg-nexus-primary-hover text-white rounded-xl text-xs font-bold transition-all shadow-md"
                                  >
                                    Finalizar
                                  </button>
                                )}
                              </div>
                            )}

                          
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ================= TAB 2: COMISIONES ================= */}
            {activeTab === "comisiones" && (
              <div className="space-y-6 animate-fade-in">
                {renderUnifiedSelector(false)}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-4 relative overflow-hidden">
                    <span className="block text-xs text-nexus-text-muted font-bold">{t('services')}</span>
                    <span className="block text-2xl font-bold text-nexus-text mt-1">{commissionSummary.totalServicios}</span>
                  </div>

                  <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-4 relative overflow-hidden">
                    <span className="block text-xs text-nexus-primary font-bold">Comisión total</span>
                    <span className="block text-2xl font-bold text-nexus-success-text mt-1">{commissionSummary.comisionTotal} Bs</span>
                  </div>

                  <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-4 relative overflow-hidden">
                    <span className="block text-xs text-nexus-primary font-bold">Pagada</span>
                    <span className="block text-2xl font-bold text-nexus-info-text mt-1">{commissionSummary.comisionPagada} Bs</span>
                  </div>

                  <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-4 relative overflow-hidden">
                    <span className="block text-xs text-nexus-text-muted font-bold">Pendiente</span>
                    <span className="block text-2xl font-bold text-nexus-warning-text mt-1">{commissionSummary.comisionPendiente} Bs</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="text-base font-bold text-nexus-text">Transacciones & Comisiones</h3>
                      <p className="text-xs text-nexus-text-muted">{`${t('services')} ${g('service', 'finalizados', 'finalizadas')} en este periodo.`}</p>
                    </div>
                    {commissionSummary.allFinalized.some(item => !item.commissionPaid) && (
                      <button
                        onClick={markAllCommissionsPaid}
                        disabled={collectingAll}
                        className="h-10 px-4 bg-nexus-success hover:opacity-90 disabled:opacity-50 text-white font-semibold text-sm rounded-xl shadow-sm transition-all inline-flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <Icons.Check className="w-3.5 h-3.5" />
                        {collectingAll ? 'Cobrando...' : `Cobrar Todo (${commissionSummary.allFinalized.filter(item => !item.commissionPaid).length})`}
                      </button>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {commissionSummary.allFinalized.length === 0 ? (
                      <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-12 text-center">
                        <Icons.Dollar className="w-10 h-10 text-nexus-text-muted mx-auto mb-2" />
                        <span className="text-sm font-bold text-nexus-text-secondary block">No hay comisiones generadas</span>
                        <p className="text-xs text-nexus-text-muted mt-1">Completa {tl('appointments')} de la agenda para registrar su comisión.</p>
                      </div>
                    ) : (
                      commissionSummary.allFinalized.map((item) => (
                        <div 
                          key={item.id} 
                          className="bg-nexus-surface border border-nexus-border rounded-2xl p-4 flex items-center justify-between gap-4"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-nexus-text text-xs">{item.clientName}</span>
                              <span className="text-xs text-nexus-primary bg-nexus-primary-soft px-2 py-0.5 rounded-md font-bold">
                                {item.service}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-nexus-text-muted mt-1">
                              <span>Fecha: {item.date}</span>
                              <span>•</span>
                              <span>Pago: {item.paymentMethod || "Efectivo"}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="block text-sm font-bold text-nexus-success-text">Bs {item.commission} </span>
                              <span className={`text-xs font-bold ${item.commissionPaid ? "text-nexus-info-text" : "text-nexus-warning-text"}`}>
                                {item.commissionPaid ? "Pagada" : "Pendiente"}
                              </span>
                            </div>

                            {!item.commissionPaid && (
                              <Button size="sm" icon={Icons.Check} onClick={() => markCommissionPaid(item.id)}>
                                Cobrar
                              </Button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* ================= TAB 3: RENDIMIENTO ================= */}
            {activeTab === "rendimiento" && (
              <div className="space-y-6 animate-fade-in">
                {renderUnifiedSelector(false)}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-nexus-text-muted font-bold">{`${t('services')} ${g('service', 'completados', 'completadas')}`}</span>
                      <span className="block text-3xl font-bold text-nexus-text mt-1">{performanceData.totalServicios}</span>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-nexus-primary-soft flex items-center justify-center text-nexus-primary">
                      <Icons.Scissors className="w-6 h-6" />
                    </div>
                  </div>

                  <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-nexus-text-muted font-bold">Facturado Total</span>
                      <span className="block text-3xl font-bold text-nexus-success-text mt-1">{performanceData.totalGanado}Bs</span>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-nexus-success-bg flex items-center justify-center text-nexus-success-text">
                      <Icons.Dollar className="w-6 h-6" />
                    </div>
                  </div>

                  <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-nexus-text-muted font-bold">
                        {performanceData.crecimientoPorcentaje === null ? 'Crecimiento' : 'Crecimiento Estimado'}
                      </span>
                      <span className="block text-3xl font-bold text-nexus-info-text mt-1">
                        {performanceData.crecimientoPorcentaje === null
                          ? 'Sin datos previos'
                          : `${performanceData.crecimientoPorcentaje > 0 ? '+' : ''}${performanceData.crecimientoPorcentaje}%`}
                      </span>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-nexus-info-bg flex items-center justify-center text-nexus-info-text">
                      <Icons.TrendingUp className="w-6 h-6" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-nexus-surface border border-nexus-border rounded-3xl p-5 space-y-4">
                    <div>
                      <h4 className="text-sm font-bold text-nexus-text">Ingresos por Método de Pago (Bs)</h4>
                      <p className="text-xs text-nexus-text-muted">Monto total facturado por caja.</p>
                    </div>
                    <div className="h-64">
                      {performanceData.totalServicios === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-nexus-text-muted">
                          Sin transacciones en este periodo
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={performanceData.barData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                            <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                            <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E9EDF2', borderRadius: '12px', fontSize: '11px' }} />
                            <Bar dataKey="monto" fill="#0F6FFF" radius={[8, 8, 0, 0]}>
                              {performanceData.barData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={index === 0 ? '#0F6FFF' : index === 1 ? '#3B82F6' : '#10B981'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  <div className="bg-nexus-surface border border-nexus-border rounded-3xl p-5 space-y-4">
                    <div>
                      <h4 className="text-sm font-bold text-nexus-text">{t('services')} más {g('service', 'Solicitados', 'Solicitadas')}</h4>
                      <p className="text-xs text-nexus-text-muted">Distribución de {tl('services')} {g('service', 'realizados', 'realizadas')}.</p>
                    </div>
                    <div className="h-64 flex items-center justify-center relative">
                      {performanceData.totalServicios === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-nexus-text-muted">
                          Sin {tl('services')} en este periodo
                        </div>
                      ) : (
                        <>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={performanceData.pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={85}
                                paddingAngle={5}
                                dataKey="value"
                              >
                                {performanceData.pieData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E9EDF2', borderRadius: '12px', fontSize: '11px' }} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute flex flex-col items-center">
                            <span className="text-2xl font-bold text-nexus-text">{performanceData.totalServicios}</span>
                            <span className="text-xs text-nexus-primary font-bold">Totales</span>
                          </div>
                        </>
                      )}
                    </div>
                    {performanceData.totalServicios > 0 && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center pt-1">
                        {performanceData.pieData.map((entry, index) => (
                          <div key={entry.name} className="flex items-center gap-1.5 text-xs text-nexus-text-secondary">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                            />
                            <span className="font-semibold text-nexus-text">{entry.name}</span>
                            <span className="text-nexus-text-muted">({entry.value})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* ================= TAB 4: PERFIL ================= */}
            {activeTab === "perfil" && (
              <div className="max-w-md mx-auto bg-nexus-surface border border-nexus-border rounded-3xl p-6 space-y-6 text-center animate-fade-in shadow-lg relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-nexus-primary/10 to-transparent"></div>

                <div className="relative pt-6">
                  <div className="relative inline-block">
                  <Avatar
                      src={activeBarber.avatar}
                      name={activeBarber.name}
                      className="w-24 h-24 rounded-full mx-auto object-cover border-4 border-nexus-primary/20 shadow-xl"
                      textClassName="text-3xl"
                    />
                    <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-nexus-success border-2 border-nexus-surface animate-pulse"></div>
                  </div>

                  <h3 className="text-xl font-bold tracking-tight text-nexus-text mt-4">{activeBarber.name} </h3>
                  <span className="text-xs text-nexus-primary font-bold">{activeBarber.role}</span>
                  <p className="text-xs text-nexus-text-muted mt-1">Nexus Staff</p>
                </div>

                {canUseCapability('linkPersonalProfesional') && (
                  <PersonalBookingLink url={buildPersonalBookingUrl(negocioId, activeBarber.id)} onToast={triggerToast} />
                )}

                <div className="space-y-3 pt-4">
                  <button 
                    onClick={() => triggerToast(`Tutorial de la App: ¡Prueba agendar ${g('appointment', 'un', 'una')} ${tl('appointment')} o completar ${g('service', 'un', 'una')} ${tl('service')}!`, "info")}
                    className="w-full py-3 px-4 bg-nexus-primary-soft hover:opacity-80 border border-nexus-primary/30 text-nexus-primary font-bold text-sm rounded-xl transition-all"
                  >
                    Ver Tutorial
                  </button>

                  <button 
                    onClick={() => triggerToast("Conexión de seguridad establecida con éxito", "success")}
                    className="w-full py-3 px-4 bg-nexus-surface-hover hover:bg-nexus-border border border-nexus-border text-nexus-text-secondary font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Icons.Shield className="w-4 h-4 text-nexus-primary" />
                    Estado del Sistema
                  </button>

                  <button
                    onClick={logout}
                    className="w-full py-3 px-4 bg-nexus-error-bg hover:opacity-80 border border-nexus-error/30 text-nexus-error-text font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2"
                   >
                    <LogOut className="w-4 h-4" />
                    Cerrar Sesión
                  </button>
                </div>
              </div>
            )}
          </>
        )}

      </main>

      {/* BOTÓN FLOTANTE "+" DE AGENDA */}
      {activeTab === "agenda" && staffPerms.createAppointments && (
        <button 
          onClick={() => {
            setTempSelectedTime("");
            setIsCreateModalOpen(true); 
          }}
          className="fixed bottom-24 right-5 md:bottom-8 md:right-8 w-14 h-14 bg-nexus-primary hover:bg-nexus-primary-hover text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all z-40 border border-white/10"
          title={`Agendar ${g('appointment', 'Nuevo', 'Nueva')} ${t('appointment')}`}
        >
          <Icons.Plus className="w-7 h-7" />
        </button>
      )}

      {/* ================= MODAL DE GESTIÓN DE HORARIO (Fase 4: ventana estándar) ================= */}
      <Modal
        open={isSlotModalOpen}
        onClose={() => setIsModalOpenSlot(false)}
        title="Gestión de horario"
        description={`Espacio de las ${tempSelectedTime}`}
        size="sm"
      >
        <div className="space-y-2.5">
          {staffPerms.createAppointments && (
            <Button
              fullWidth
              size="lg"
              icon={Icons.Calendar}
              onClick={() => {
                setIsModalOpenSlot(false);
                setIsCreateModalOpen(true); 
              }}
            >
              {g('appointment', 'Nuevo', 'Nueva')} {tl('appointment')}
            </Button>
          )}
          <Button
            fullWidth
            size="lg"
            variant="danger-soft"
            icon={Icons.Lock}
            onClick={() => {
              setBlockDate(selectedDate);
              setBlockStartTime(tempSelectedTime);
              const endMin = Math.min(convertTimeToMinutes(tempSelectedTime) + 60, 23 * 60 + 59);
              setBlockEndTime(`${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`);
              setIsModalOpenSlot(false);
              setIsBlockModalOpen(true); 
            }}
          >
            Bloquear este espacio
          </Button>
          <Button fullWidth variant="ghost" onClick={() => setIsModalOpenSlot(false)}>Cancelar</Button>
        </div>
      </Modal>

      {/* ================= MODAL DE BLOQUEO ADMINISTRATIVO (Fase 4: ventana estándar) ================= */}
      <Modal
        open={isBlockModalOpen}
        onClose={() => setIsBlockModalOpen(false)}
        title="Bloquear horario"
        description={`Para: ${activeBarber.name}`}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setIsBlockModalOpen(false)} fullWidth className="sm:w-auto">Cancelar</Button>
            <Button type="submit" form="barber-block-form" fullWidth className="sm:w-auto">Bloquear horario</Button>
          </>
        )}
      >
        <form id="barber-block-form" onSubmit={handleAddBlockSlot} className="space-y-4">
          <Field label="Fecha" required>
            <Input type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hora inicio" required>
              <Input type="time" value={blockStartTime} onChange={(e) => setBlockStartTime(e.target.value)} required className="nx-num" />
            </Field>
            <Field label="Hora fin" required>
              <Input type="time" value={blockEndTime} onChange={(e) => setBlockEndTime(e.target.value)} required className="nx-num" />
            </Field>
          </div>
          <Field label="Motivo del bloqueo" required>
            <Input type="text" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Ej: Reunión, Almuerzo, Descanso" required />
          </Field>
        </form>
      </Modal>

      {/* ================= MODAL: CREAR NUEVA CITA (compartido con Admin) ================= */}
      {isCreateModalOpen && (
        <AppointmentCreateModal
          services={services}
          professionals={[]}
          clients={clientes}
          initialDate={selectedDate}
          initialTime={tempSelectedTime || "12:00"}
          fixedProfessional={activeBarber}
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={handleBarberCreateReservation}
        />
      )}

      {/* ================= MODAL: GESTIONAR CITA (compartido con Admin) ================= */}
      {managingAppt && (
        <AppointmentManageModal
          appointment={managingAppt}
          role="barber"
          services={services}
          professionals={activeBarber ? [activeBarber] : []}
          clients={clientes}
        staffPermissions={managingPerms}
        showPrices={staffPerms.viewFinancials}
          paymentMethods={businessSettings.paymentMethods}
          onClose={() => setManagingAppt(null)}
          onChangeField={handleChangeManagingField}
          onSubmit={handleSubmitManagingAppt}
          onDelete={deleteAppointment}
          onTransition={(nextStatus, paymentMethod) => {
            updateStatus(managingAppt.id, nextStatus, paymentMethod);
            setManagingAppt(prev => (prev ? { ...prev, status: nextStatus, paymentMethod: paymentMethod || prev.paymentMethod } : prev));
          }}
        />
      )}

      {/* ================= MODAL SECUNDARIO: NUEVO CLIENTE ================= */}
      {isNewClientModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-nexus-surface border border-nexus-border rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-xl relative animate-fade-in">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-nexus-text">{g('client', 'Nuevo', 'Nueva')} {t('client')}</h3>
                <p className="text-xs text-nexus-text-muted">Registrar un nuevo perfil en el sistema</p>
              </div>
              <button 
                onClick={() => setIsNewClientModalOpen(false)}
                className="p-1.5 hover:bg-nexus-surface-hover rounded-lg text-nexus-text-secondary transition-all"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNewClient} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-nexus-primary font-bold">Nombre completo *</label>
                <input 
                  type="text" 
                  value={newClientModalName}
                  onChange={(e) => setNewClientModalName(e.target.value)}
                  placeholder="Ej: Carlos Eduardo Siles"
                  className="w-full bg-nexus-background border border-nexus-border rounded-xl px-3.5 py-2.5 text-sm text-nexus-text placeholder-nexus-text-muted focus:outline-none focus:border-nexus-primary transition-all"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-nexus-primary font-bold">Teléfono *</label>
                <div className="flex gap-2">
                  <select
                    value={newClientModalCountryCode}
                    onChange={(e) => setNewClientModalCountryCode(e.target.value)}
                    className="bg-nexus-background border border-nexus-border rounded-xl px-2 py-2 text-xs text-nexus-text focus:outline-none focus:border-nexus-primary"
                  >
                    <option value="+591">🇧🇴 +591</option>
                    <option value="+54">🇦🇷 +54</option>
                    <option value="+56">🇨🇱 +56</option>
                    <option value="+51">🇵🇪 +51</option>
                    <option value="+57">🇨🇴 +57</option>
                    <option value="+1">🇺🇸 +1</option>
                    <option value="+34">🇪🇸 +34</option>
                  </select>
                  <input 
                    type="tel"
                    pattern="[0-9]*"
                    inputMode="numeric"
                    value={newClientModalPhone}
                    onChange={(e) => setNewClientModalPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="Número de celular"
                    className="flex-1 bg-nexus-background border border-nexus-border rounded-xl px-3.5 py-2.5 text-sm text-nexus-text placeholder-nexus-text-muted focus:outline-none focus:border-nexus-primary transition-all"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewClientModalOpen(false)}
                  className="flex-1 py-3 bg-nexus-background border border-nexus-border hover:bg-nexus-surface-hover text-nexus-text-secondary font-bold text-sm rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-bold text-sm rounded-xl transition-all shadow-md"
                >
                  Guardar {t('client')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BOTTOM NAVIGATION DE ESTILO MÓVIL */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-nexus-surface border-t border-nexus-border flex justify-around py-1.5 px-2 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(15,23,42,0.08)] md:static md:shadow-none md:max-w-md md:mx-auto md:pb-6 md:pt-4">
        {[
          { id: "agenda", label: "Agenda", icon: Icons.Calendar },
          { id: "comisiones", label: "Comisiones", icon: Icons.Dollar },
          { id: "rendimiento", label: "Rendimiento", icon: Icons.TrendingUp },
          { id: "perfil", label: "Perfil", icon: Icons.User }
        ].filter(tab => (tab.id !== "comisiones" || canSeeCommissions) && (tab.id !== "rendimiento" || staffPerms.viewFinancials)).map(tab => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className="flex flex-col items-center justify-center gap-1 min-w-16 min-h-12 px-2 transition-colors duration-150 group cursor-pointer"
            >
              <TabIcon className={`w-5 h-5 transition-all ${
                isActive 
                  ? "text-nexus-primary scale-110" 
                  : "text-nexus-text-muted group-hover:text-nexus-text-secondary"
              }`} />
              <span className={`text-xs font-semibold transition-colors ${
                isActive ? "text-nexus-primary" : "text-nexus-text-muted"
              }`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      {/*<button
  onClick={logout}
  className="flex flex-col items-center gap-1 p-2 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
>
  <LogOut size={16} />
  <span className="text-xs font-bold">Salir</span>
      </button>*/}
      </nav>

    </div>
    </BusinessProfileContext.Provider>
  );
}
