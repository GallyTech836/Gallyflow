import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../firebase/config';
import { collection, doc, onSnapshot, updateDoc, addDoc, setDoc, deleteDoc, query, where } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { LogOut } from 'lucide-react';
import { useBarberAuth } from './useBarberAuth';
import { useServicios } from '../firebase/useServicios';
import BarberLoginPage from './BarberLoginPage';
import AppointmentStatusBadge from '../shared/appointments/AppointmentStatusBadge';
import AppointmentManageModal from '../shared/appointments/AppointmentManageModal';
import { FIELD_PERMISSIONS } from '../shared/appointments/permissions';
import AppointmentCreateModal from '../shared/appointments/AppointmentCreateModal';
import { STATUS } from '../shared/appointments/statusModel';
import { calculateCommission, calculateCommissionForCita } from '../shared/commissions/commissionModel';
import { getServicesFromCita } from '../shared/appointments/serviceSelection';
import { useNotifications, notify, NotificationType } from '../shared/notifications';

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

// --- CITAS DEL NEGOCIO (TIEMPO REAL) ---
useEffect(() => {
  if (!negocioId) return;
  const ref = collection(db, 'negocios', negocioId, 'citas');
  const unsub = onSnapshot(ref, (snap) => {
    console.log('[BARBER] citas recibidas:', snap.docs.length);
    snap.docs.forEach(d => {
      const data = d.data();
      console.log('[BARBER] cita', d.id, {
        professionalId: data.professionalId,
        barberId: data.barberId,
        barber: data.barber,
        date: data.date,
        status: data.status
      });
    });
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
}, [negocioId]);

// --- HORARIOS BLOQUEADOS DEL NEGOCIO (TIEMPO REAL) ---
useEffect(() => {
  if (!negocioId) return;
  const ref = collection(db, 'negocios', negocioId, 'horariosBloqueados');
  const unsub = onSnapshot(ref, (snap) => {
    setBlockedSlots(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
  return () => unsub();
}, [negocioId]);

  // --- AGENDAR NUEVA CITA ---
  const handleAddAppointment = async (e) => {
    e.preventDefault();

    if (!newClientName.trim()) {
      triggerToast("Ingresa el nombre del cliente", "error");
      return;
    }

    if (!newService) {
      triggerToast("Selecciona un servicio", "error");
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
      triggerToast("Este profesional ya tiene una reserva agendada a esta hora.", "error");
      return;
    }

    const newAppt = {
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
      paymentMethod: newPaymentMethod,
      createdAt: new Date().toISOString(),
      notes: newNotes,
      branch: activeBarber.branch
    };


    if (!isFirebaseConfigured || !db || !negocioId) {
      triggerToast("Sin conexión al negocio, intenta de nuevo.", "error");
      return;
    }

    try {
      await addDoc(collection(db, 'negocios', negocioId, 'citas'), newAppt);
      triggerToast("Cita agendada correctamente");
      notify(NotificationType.RESERVA_CREADA_BARBER, negocioId, { clientName: newAppt.clientName, time: newAppt.time }, barberUser?.id, barberUser?.id);
    } catch (err) {
      triggerToast("Error al agendar la cita: " + err.message, "error");
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
      triggerToast("Por favor, ingresa el nombre completo del cliente", "error");
      return;
    }
    if (!newClientModalPhone.trim()) {
      triggerToast("Por favor, ingresa el teléfono del cliente", "error");
      return;
    }

    const formattedPhone = `${newClientModalCountryCode} ${newClientModalPhone.trim()}`;
    const phoneId = formattedPhone.replace(/[^0-9]/g, '');
    const phoneExists = clientes.some(c => c.phone === formattedPhone);

    if (phoneExists) {
      triggerToast("Ya existe un cliente registrado con ese número de teléfono", "error");
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
    triggerToast(`Cliente ${newClientObj.name} guardado y seleccionado`);
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
    const conflictAppt = appointments.find(appt => {
      if (appt.barber !== activeBarber.id || appt.date !== blockDate || appt.status === "Cancelado") return false;
      const apptMin = convertTimeToMinutes(appt.time);
      return apptMin >= startMin && apptMin < endMin;
    });

    if (conflictAppt) {
      triggerToast(`Hay una cita existente con ${conflictAppt.clientName} en el rango seleccionado.`, "error");
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

  const updateStatus = async (apptId, nextStatus) => {
    try {
      const docRef = doc(db, 'negocios', negocioId, 'citas', apptId);
      await updateDoc(docRef, { status: nextStatus });
      triggerToast(`Cita marcada como ${normalizeStatus(nextStatus)}`);
    } catch (err) {
      triggerToast('Error al actualizar la cita: ' + err.message, 'error');
    }
  };
  const handleChangeManagingField = (field, value) => {
    setManagingAppt(prev => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSubmitManagingAppt = async (e) => {
    e.preventDefault();
    if (!managingAppt) return;
    // Construir el payload solo con los campos que Barber tiene permiso
    // de editar según permissions.js — sin hardcodear campo a campo.
    const allowed = FIELD_PERMISSIONS['barber'] || {};
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
    try {
      await updateDoc(doc(db, 'negocios', negocioId, 'citas', managingAppt.id), payload);
      triggerToast('Cita actualizada');
      notify(
        payload.status === 'cancelled' ? NotificationType.RESERVA_CANCELADA : NotificationType.RESERVA_MODIFICADA,
        negocioId,
        { citaId: managingAppt.id, clientName: managingAppt.clientName, time: managingAppt.time },
        barberUser?.id,
        barberUser?.id
      );
    } catch (err) {
      triggerToast('Error al actualizar la cita: ' + err.message, 'error');
    }
    setManagingAppt(null);
  };

  const handleBarberCreateReservation = async (draft) => {
    const blockConflict = blockedSlots.find(block => {
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

    const newAppt = {
      barber: activeBarber.id,
      professionalId: activeBarber.id,
      barberId: activeBarber.id,
      clientName: draft.clientName,
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
      createdAt: new Date().toISOString(),
      notes: draft.notes || '',
      branch: activeBarber.branch,
    };
    try {
      await addDoc(collection(db, 'negocios', negocioId, 'citas'), newAppt);
      triggerToast('Cita agendada correctamente');
      notify(NotificationType.RESERVA_CREADA_BARBER, negocioId, { clientName: newAppt.clientName, time: newAppt.time }, barberUser?.id, barberUser?.id);
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

  const deleteAppointment = async (apptId) => {
    const targetAppt = appointments.find(a => a.id === apptId);
    try {
      await deleteDoc(doc(db, 'negocios', negocioId, 'citas', apptId));
      triggerToast("Cita eliminada", "info");
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

  // --- HORAS VISIBLES EN LA GRILLA DEL DÍA SEGÚN LA DISPONIBILIDAD DEL PROFESIONAL ---
  const visibleHorariosGrid = useMemo(() => {
    const date = new Date(selectedDate + "T00:00:00");
    const dayName = DIAS_SEMANA_NOMBRES[(date.getDay() + 6) % 7];
    const dayAvailability = (activeBarber?.availability || []).find(a => a?.day === dayName);

    if (!dayAvailability || dayAvailability.status !== "Disponible") return [];

    const [startH] = (dayAvailability.start || "00:00").split(":").map(Number);
    const [endH] = (dayAvailability.end || "00:00").split(":").map(Number);

    return HORARIOS_GRID.filter(hourSlot => {
      const hourNum = parseInt(hourSlot.split(":")[0], 10);
      return hourNum >= startH && hourNum < endH;
    });
  }, [activeBarber, selectedDate]);

  // --- DISTRIBUCIÓN MENSUAL SIMPLE PARA VISTA ANUAL ---
  const annualMonthlyDistribution = useMemo(() => {
    const targetYear = new Date(selectedDate + "T00:00:00").getFullYear();
    const list = Array(12).fill(0).map((_, i) => ({ monthIndex: i, count: 0 }));
    
    appointments.forEach(appt => {
      if (appt.barber === activeBarber.id) {
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
    const crecimientoPorcentaje = totalServicios > 0 ? 12.5 : 0;

    return {
      pieData: pieData.length > 0 ? pieData : [{ name: "Ninguno", value: 1 }],
      barData: barData.length > 0 ? barData : [{ name: "Sin datos", monto: 0 }],
      totalServicios,
      totalGanado,
      crecimientoPorcentaje
    };
  }, [appointments, activeBarber, selectedRange, selectedDate, currentWeekDays]);

  // --- RENDERIZADOR DEL CONTENEDOR DEL SELECTOR UNIFICADO ---
  const renderUnifiedSelector = (showAlternator = false) => {
    return (
      <div className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <div className="relative flex items-center justify-center w-full">
          {/* Selector de fecha con flechas estilizadas */}
          <div className="flex items-center bg-[#121422] border border-[#1E2138] rounded-xl px-2 py-1 justify-between shrink-0">
            <button 
              onClick={() => handleDateChange(-1)} 
              className="p-1.5 hover:bg-white/5 rounded-lg text-[#3B3EF4] transition-all"
            >
              <Icons.ChevronLeft className="w-4 h-4" />
            </button>
            
            <span className="text-xs font-bold tracking-wide text-white px-4 min-w-[120px] text-center whitespace-nowrap">
              {selectedRange === "Año" ? (
                new Date(selectedDate + "T00:00:00").getFullYear()
              ) : selectedRange === "Mes" ? (
                MESES_NOMBRES[new Date(selectedDate + "T00:00:00").getMonth()] + " " + new Date(selectedDate + "T00:00:00").getFullYear()
              ) : selectedRange === "Semana" ? (
                (() => {
                  const start = new Date(currentWeekDays[0] + "T00:00:00");
                  const end = new Date(currentWeekDays[6] + "T00:00:00");
                  const startDay = String(start.getDate()).padStart(2, '0');
                  const startMonth = MESES_NOMBRES[start.getMonth()].slice(0, 3);
                  const endDay = String(end.getDate()).padStart(2, '0');
                  const endMonth = MESES_NOMBRES[end.getMonth()].slice(0, 3);
                  const year = start.getFullYear();
                  return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${year}`;
                })()
              ) : (
                new Date(selectedDate + "T00:00:00").toLocaleDateString('es-ES', { 
                  weekday: 'short', 
                  day: 'numeric', 
                  month: 'short' 
                })
              )}
            </span>
            
            <button 
              onClick={() => handleDateChange(1)} 
              className="p-1.5 hover:bg-white/5 rounded-lg text-[#3B3EF4] transition-all"
            >
              <Icons.ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* ALTERNADOR DE VISTA DÍA (Acoplado al extremo derecho) */}
          {showAlternator && selectedRange === "Día" && (
            <div className="absolute right-1 flex bg-[#121422] p-1 rounded-xl border border-[#1E2138] items-center gap-1 shrink-0 animate-fade-in">
              <button
                onClick={() => setDiaViewStyle("Calendario")}
                className={`p-2 rounded-lg transition-all ${
                  diaViewStyle === "Calendario" 
                    ? "bg-[#3B3EF4] text-white" 
                    : "text-gray-400 hover:text-gray-200"
                }`}
                title="Vista Calendario"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 3V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                onClick={() => setDiaViewStyle("Lista")}
                className={`p-2 rounded-lg transition-all ${
                  diaViewStyle === "Lista" 
                    ? "bg-[#3B3EF4] text-white" 
                    : "text-gray-400 hover:text-gray-200"
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
    return <div style={{ background: '#08090E', width: '100vw', height: '100vh' }} />;
  }

  return (
    <div className="min-h-screen bg-[#08090E] text-[#D1D5DB] flex flex-col font-sans select-none pb-24 md:pb-0">
      
      {/* HEADER SUPERIOR */}
      {activeTab !== "perfil" && (
        <header className="sticky top-0 z-40 bg-[#0A0B10] border-b border-[#1A1C2C] py-4 px-4 w-full">
          <div className="w-full max-w-md mx-auto flex bg-[#111322] p-1.5 rounded-2xl border border-[#1E2138] items-center justify-between shadow-inner">
            {["Día", "Semana", "Mes", "Año"].map(range => (
              <button
                key={range}
                onClick={() => setSelectedRange(range)}
                className={`flex-1 py-2.5 px-3 sm:px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 text-center select-none active:scale-[0.98] ${
                  selectedRange === range 
                    ? "bg-gradient-to-r from-[#3B3EF4] to-[#4D50F7] text-white shadow-[0_3px_12px_rgba(59,62,244,0.35)] font-black" 
                    : "text-gray-400 hover:text-gray-200"
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
          <div className={`px-4 py-2.5 rounded-xl border backdrop-blur-md shadow-2xl flex items-center gap-2 text-xs font-bold tracking-wide ${
            toast.type === "error" 
              ? "bg-[#251015] border-red-900/40 text-red-300" 
              : toast.type === "info"
              ? "bg-[#0C1B33] border-blue-900/40 text-blue-300"
              : "bg-[#092B1B] border-[#10B981]/40 text-emerald-300"
          }`}>
            <div className={`w-2 h-2 rounded-full ${toast.type === "error" ? "bg-red-500" : toast.type === "info" ? "bg-blue-500" : "bg-[#34D399]"}`}></div>
            {toast.text}
          </div>
        </div>
      )}

      {/* CONTENEDOR PRINCIPAL */}
      <main className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 space-y-6">

        {loading ? (
          <div className="space-y-4 py-12">
            <div className="h-10 bg-[#121421] rounded-xl animate-pulse"></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="h-24 bg-[#121421] rounded-2xl animate-pulse"></div>
              <div className="h-24 bg-[#121421] rounded-2xl animate-pulse"></div>
              <div className="h-24 bg-[#121421] rounded-2xl animate-pulse"></div>
              <div className="h-24 bg-[#121421] rounded-2xl animate-pulse"></div>
            </div>
            <div className="h-64 bg-[#121421] rounded-2xl animate-pulse"></div>
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
                    <div className="bg-[#11131E] border border-[#1D2032] p-5 rounded-2xl">
                      <h3 className="text-sm font-bold text-white mb-1 uppercase tracking-wide">
                        Distribución de Reservas Anuales ({new Date(selectedDate + "T00:00:00").getFullYear()})
                      </h3>
                      <p className="text-xs text-gray-500">
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
                            <div key={m.monthIndex} className="bg-[#161826] border border-[#1D2032] p-4 rounded-xl flex flex-col justify-between h-28">
                              <span className="text-xs font-black text-gray-400 uppercase tracking-widest">{MESES_NOMBRES[m.monthIndex]}</span>
                              <div className="mt-2">
                                <span className="text-2xl font-black text-white">{count}</span>
                                <span className="text-[10px] text-gray-500 block">Reservas</span>
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
                    <div className="bg-[#11131E] border border-[#1D2032] rounded-3xl p-4 shadow-2xl overflow-hidden">
                      {/* Cabecera de los días de la semana */}
                      <div className="grid grid-cols-7 gap-1 text-center border-b border-[#1D2032] pb-3 select-none">
                        {DIAS_SEMANA_NOMBRES.map(d => (
                          <span key={d} className="text-[10px] sm:text-xs font-black text-[#3B3EF4] uppercase tracking-wider">
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
                                  ? "bg-[#3B3EF4]/20 border-[#3B3EF4] shadow-[0_0_15px_rgba(59,62,244,0.15)]" 
                                  : gridItem.isCurrentMonth
                                  ? "bg-[#161826]/40 border-[#1D2032] hover:bg-[#1C1F32]"
                                  : "bg-transparent border-transparent opacity-30 hover:opacity-50"
                              }`}
                            >
                              <span className={`text-xs font-bold ${isSelected ? "text-white" : "text-gray-400"}`}>
                                {gridItem.dayNum}
                              </span>

                              {/* Indicadores de Reservas / Bloqueos */}
                              <div className="flex flex-wrap gap-1 mt-1 justify-start">
                                {dayAppts.map((appt) => (
                                  <div 
                                    key={appt.id}
                                    className={`w-2 h-2 rounded-full ${
                                      appt.status === "Finalizado" ? "bg-[#34D399]" :
                                      appt.status === "Confirmado" ? "bg-[#60A5FA]" :
                                      "bg-[#FBBF24]"
                                    }`}
                                    title={`${appt.clientName}: ${appt.service}`}
                                  />
                                ))}
                                {dayBlocks.map((block) => (
                                  <div 
                                    key={block.id}
                                    className="w-2 h-2 rounded-full bg-red-500"
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
                                ? "bg-[#3B3EF4]/20 border-[#3B3EF4] shadow-[0_0_12px_rgba(59,62,244,0.15)]"
                                : "bg-[#11131E] border-[#1D2032] hover:bg-[#161826]"
                            }`}
                          >
                            <div className="text-center border-b border-[#1D2032] pb-2 select-none">
                              <span className="block text-[10px] text-[#3B3EF4] font-black uppercase tracking-wider">{DIAS_SEMANA_NOMBRES[idx].slice(0,3)}</span>
                              <span className="block text-base font-black text-white leading-none mt-1">{dateObj.getDate()}</span>
                            </div>

                            <div className="space-y-1.5 mt-2 flex-1 flex flex-col justify-end">
                              {dayAppts.length === 0 ? (
                                <span className="text-[9px] text-gray-600 block text-center italic">Vacío</span>
                              ) : (
                                dayAppts.slice(0, 3).map((appt) => (
                                  <div 
                                    key={appt.id} 
                                    className={`text-[9px] font-bold p-1 rounded text-center truncate ${
                                      appt.status === "Finalizado" ? "bg-[#082F1D]/60 text-[#34D399]" :
                                      appt.status === "Confirmado" ? "bg-[#0B2545]/60 text-[#60A5FA]" :
                                      "bg-[#3A2208]/60 text-[#FBBF24]"
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
                  
                  /* ================= VISTA DÍA: CALENDARIO (GRILLA HORARIA) ================= */
                  <div className="bg-[#11131E] border border-[#1D2032] rounded-3xl overflow-hidden shadow-2xl divide-y divide-[#1D2032] animate-fade-in">
                    {visibleHorariosGrid.length === 0 && (
                      <div className="p-6 text-center text-xs text-slate-500 font-bold">
                        No disponible este día según tu horario configurado.
                      </div>
                    )}
                    {visibleHorariosGrid.map((hourSlot) => {
                      const prefix = hourSlot.split(":")[0];
                      
                      // Cita en este bloque horario
                      const slotAppointments = filteredAppointments.filter(appt => appt.time.startsWith(prefix));
                      const hasAppt = slotAppointments.length > 0;

                      // Bloqueo administrativo en este rango de hora
                      const activeHourNum = parseInt(prefix, 10);
                      const isBlocked = blockedSlots.find(block => {
                        if (block.barber !== activeBarber.id || block.date !== selectedDate) return false;
                        const startHour = parseInt(block.startTime.split(":")[0], 10);
                        const endHour = parseInt(block.endTime.split(":")[0], 10);
                        return activeHourNum >= startHour && activeHourNum < endHour;
                      });

                      return (
                        <div key={hourSlot} className="flex min-h-[90px] hover:bg-[#141624]/10 transition-colors">
                          <div className="w-20 border-r border-[#1D2032] py-4 px-3 flex flex-col items-center justify-start shrink-0 bg-[#0A0B10]/30 select-none">
                            <span className="text-xs font-black text-[#3B3EF4]">{hourSlot}</span>
                          </div>

                          <div className="flex-1 p-3 flex flex-col gap-2.5 justify-center">
                            {isBlocked ? (
                              /* DISEÑO SLOT BLOQUEADO ADMINISTRATIVAMENTE */
                              <div className="bg-[#2D161B] text-red-400 border border-red-900/30 rounded-2xl p-4 flex items-center gap-3">
                                <Icons.Lock className="w-5 h-5 text-red-400" />
                                <div>
                                  <span className="font-extrabold text-sm block">Espacio Reservado / Bloqueo Administrativo</span>
                                  <span className="text-xs opacity-75">{isBlocked.reason} ({isBlocked.startTime} - {isBlocked.endTime})</span>
                                </div>
                              </div>
                            ) : hasAppt ? (
                              /* DISEÑO SLOT CON RESERVA */
                              slotAppointments.map((appt) => (
                                <div 
                                  key={appt.id}
                                  onClick={() => setManagingAppt({ ...appt, services: appt.services && appt.services.length > 0 ? appt.services : getServicesFromCita(appt) })}
                                  className={`border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg transition-all duration-300 hover:brightness-105 cursor-pointer ${
                                    appt.status === "completed" ? "bg-[#082F1D] text-[#34D399] border-[#10B981]/20" :
                                    appt.status === "confirmed" ? "bg-[#0B2545] text-[#60A5FA] border-[#3B82F6]/20" :
                                    "bg-[#3A2208] text-[#FBBF24] border-[#F59E0B]/20"
                                  }`}
                                >
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-extrabold text-white text-sm">{appt.clientName}</span>
                                      <span className="text-[9px] font-black tracking-widest uppercase bg-black/35 px-2 py-0.5 rounded-md">
                                        {appt.time}
                                      </span>
                                    </div>
                                    <p className="text-xs opacity-90 mt-1 font-semibold">{appt.service}</p>
                                    
                                    {appt.notes && (
                                      <p className="text-[10px] italic opacity-80 mt-1 bg-black/10 px-2 py-1 rounded-lg inline-block border border-white/5">
                                        Nota: {appt.notes}
                                      </p>
                                    )}

                                    <div className="flex items-center gap-3 text-[10px] opacity-75 mt-2">
                                      <span className="flex items-center gap-1 font-bold">
                                        <Icons.Clock className="w-3.5 h-3.5" />
                                        {getServiceDuration(services, appt)}
                                      </span>
                                      <span>•</span>
                                      <span className="font-black text-white">${appt.price} USD</span>
                                    </div>
                                  </div>


                                </div>
                              ))
                            ) : (
                              /* DISEÑO SLOT LIBRE (Interactivo para desplegar Gestión de Horario) */
                              <div 
                                onClick={() => handleSlotClick(hourSlot, isBlocked, hasAppt)}
                                className="group/btn h-12 border border-dashed border-[#1E2138] hover:border-[#3B3EF4]/50 hover:bg-[#3B3EF4]/5 rounded-2xl flex items-center justify-between px-4 cursor-pointer transition-all duration-300"
                              >
                                <span className="text-[11px] text-gray-500 group-hover/btn:text-purple-400 font-bold transition-colors">
                                  Bloque libre para {activeBarber.name}
                              
                                </span>
                                <span className="opacity-0 group-hover/btn:opacity-100 text-[10px] text-[#3B3EF4] font-black uppercase tracking-wider flex items-center gap-1">
                                  <Icons.Plus className="w-3 h-3 text-[#3B3EF4]" />
                                  Gestionar horario
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* ================= LISTADO DE CITAS ESTÁNDAR (Día-Lista) ================= */
                  <div className="space-y-3 animate-fade-in">
                    {filteredAppointments.length === 0 ? (
                      <div className="bg-[#11131E] border border-[#1D2032] rounded-2xl p-12 text-center flex flex-col items-center justify-center">
                        <Icons.Calendar className="w-10 h-10 text-gray-600 mb-3" />
                        <h3 className="text-sm font-bold text-gray-300">No hay citas registradas</h3>
                        <p className="text-xs text-gray-500 mt-1 max-w-xs">
                          {selectedRange === "Día" && "No hay citas programadas para hoy."}
                        </p>
                      </div>
                    ) : (
                      filteredAppointments.map((appt) => (
                        <div 
                          key={appt.id} 
                          onClick={() => setManagingAppt({ ...appt, services: appt.services && appt.services.length > 0 ? appt.services : getServicesFromCita(appt) })}
                          className="bg-[#11131E] border border-[#1D2032] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-[#2D314E] transition-all duration-200 shadow-md cursor-pointer"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-xl bg-[#161826] border border-[#1D2032] flex flex-col items-center justify-center shrink-0">
                              <span className="text-[9px] text-[#3B3EF4] font-black uppercase tracking-widest">Hora</span>
                              <span className="text-base font-black text-white leading-none mt-1">{appt.time}</span>
                            </div>

                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-white text-sm tracking-wide">{appt.clientName}</h4>
                                
                                <AppointmentStatusBadge status={appt.status} variant="barber" />
                              </div>
                              
                              <p className="text-xs text-gray-400 mt-1 font-medium">{appt.service}</p>
                              
                              {appt.notes && (
                                <p className="text-[10px] italic opacity-85 mt-1 bg-black/10 px-2 py-1 rounded-lg inline-block border border-white/5">
                                  Nota: {appt.notes}
                                </p>
                              )}

                              <div className="flex items-center gap-3 text-[10px] text-gray-500 mt-2">
                                <span className="flex items-center gap-1 font-semibold text-gray-400">
                                  <Icons.Clock className="w-3.5 h-3.5 text-gray-500" />
                                  {getServiceDuration(services, appt)}
                                </span>
                                <span>•</span>
                                <span className="text-emerald-400 font-bold">{appt.price} Bs</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-2 pt-3 sm:pt-0 border-t sm:border-0 border-white/5">
                            {appt.status !== "Finalizado" && (
                              <div className="flex gap-2">
                                {appt.status === "Confirmado" && (
                                  <button
                                  onClick={(e) => { e.stopPropagation(); updateStatus(appt.id, "completed"); }}
                                    className="px-4 py-1.5 bg-[#3B3EF4] hover:bg-[#2E31D4] text-white rounded-xl text-[11px] font-bold transition-all shadow-md"
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
                  <div className="bg-[#11131E] border border-[#1D2032] rounded-2xl p-4 relative overflow-hidden">
                    <span className="block text-[9px] text-gray-500 font-black uppercase tracking-widest">Servicios</span>
                    <span className="block text-2.5xl font-black text-white mt-1">{commissionSummary.totalServicios}</span>
                  </div>

                  <div className="bg-[#11131E] border border-[#1D2032] rounded-2xl p-4 relative overflow-hidden">
                    <span className="block text-[9px] text-[#3B3EF4] font-black uppercase tracking-widest">Comisión total</span>
                    <span className="block text-2.5xl font-black text-emerald-400 mt-1">{commissionSummary.comisionTotal} Bs</span>
                  </div>

                  <div className="bg-[#11131E] border border-[#1D2032] rounded-2xl p-4 relative overflow-hidden">
                    <span className="block text-[9px] text-[#3B3EF4] font-black uppercase tracking-widest">Pagada</span>
                    <span className="block text-2.5xl font-black text-[#60A5FA] mt-1">{commissionSummary.comisionPagada} Bs</span>
                  </div>

                  <div className="bg-[#11131E] border border-[#1D2032] rounded-2xl p-4 relative overflow-hidden">
                    <span className="block text-[9px] text-gray-500 font-black uppercase tracking-widest">Pendiente</span>
                    <span className="block text-2.5xl font-black text-[#FBBF24] mt-1">{commissionSummary.comisionPendiente} Bs</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-white">Transacciones & Comisiones</h3>
                    <p className="text-xs text-gray-500">Historial completo de cortes finalizados para este periodo.</p>
                  </div>

                  <div className="space-y-2.5">
                    {commissionSummary.allFinalized.length === 0 ? (
                      <div className="bg-[#11131E] border border-[#1D2032] rounded-2xl p-12 text-center">
                        <Icons.Dollar className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                        <span className="text-sm font-bold text-gray-400 block">No hay comisiones generadas</span>
                        <p className="text-xs text-gray-600 mt-1">Completa citas de la agenda para registrar su comisión.</p>
                      </div>
                    ) : (
                      commissionSummary.allFinalized.map((item) => (
                        <div 
                          key={item.id} 
                          className="bg-[#11131E] border border-[#1D2032] rounded-2xl p-4 flex items-center justify-between gap-4"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-xs">{item.clientName}</span>
                              <span className="text-[10px] text-[#3B3EF4] bg-[#3B3EF4]/10 px-2 py-0.5 rounded-md font-bold">
                                {item.service}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-1">
                              <span>Fecha: {item.date}</span>
                              <span>•</span>
                              <span>Pago: {item.paymentMethod || "Efectivo"}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="block text-sm font-black text-emerald-400">Bs {item.commission} </span>
                              <span className={`text-[9px] font-black uppercase tracking-wider ${item.commissionPaid ? "text-[#60A5FA]" : "text-[#FBBF24]"}`}>
                                {item.commissionPaid ? "Pagada" : "Pendiente"}
                              </span>
                            </div>

                            {!item.commissionPaid && (
                              <button 
                                onClick={() => markCommissionPaid(item.id)}
                                className="px-3.5 py-1.5 bg-[#3B3EF4] hover:bg-[#2E31D4] text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1"
                              >
                                <Icons.Check className="w-3.5 h-3.5" />
                                Cobrar
                              </button>
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
                  <div className="bg-[#11131E] border border-[#1D2032] rounded-2xl p-5 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Cortes completados</span>
                      <span className="block text-3xl font-black text-white mt-1">{performanceData.totalServicios}</span>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-[#3B3EF4]/10 flex items-center justify-center text-[#3B3EF4]">
                      <Icons.Scissors className="w-6 h-6" />
                    </div>
                  </div>

                  <div className="bg-[#11131E] border border-[#1D2032] rounded-2xl p-5 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Facturado Total</span>
                      <span className="block text-3xl font-black text-emerald-400 mt-1">{performanceData.totalGanado}Bs</span>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                      <Icons.Dollar className="w-6 h-6" />
                    </div>
                  </div>

                  <div className="bg-[#11131E] border border-[#1D2032] rounded-2xl p-5 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Crecimiento Estimado</span>
                      <span className="block text-3xl font-black text-[#60A5FA] mt-1">+{performanceData.crecimientoPorcentaje}%</span>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                      <Icons.TrendingUp className="w-6 h-6" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-[#11131E] border border-[#1D2032] rounded-3xl p-5 space-y-4">
                    <div>
                      <h4 className="text-sm font-bold text-white">Ingresos por Método de Pago (Bs)</h4>
                      <p className="text-[11px] text-gray-500">Monto total facturado por caja.</p>
                    </div>
                    <div className="h-64">
                      {performanceData.totalServicios === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-gray-500">
                          Sin transacciones en este periodo
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={performanceData.barData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                            <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                            <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: '#11131E', borderColor: '#1D2032', borderRadius: '12px', fontSize: '11px' }} />
                            <Bar dataKey="monto" fill="#3B3EF4" radius={[8, 8, 0, 0]}>
                              {performanceData.barData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={index === 0 ? '#3B3EF4' : index === 1 ? '#60A5FA' : '#34D399'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  <div className="bg-[#11131E] border border-[#1D2032] rounded-3xl p-5 space-y-4">
                    <div>
                      <h4 className="text-sm font-bold text-white">Servicios más Solicitados</h4>
                      <p className="text-[11px] text-gray-500">Distribución de servicios realizados.</p>
                    </div>
                    <div className="h-64 flex items-center justify-center relative">
                      {performanceData.totalServicios === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-gray-500">
                          Sin servicios en este periodo
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
                                  <Cell key={`cell-${index}`} fill={['#3B3EF4', '#34D399', '#60A5FA', '#FBBF24', '#f472b6', '#fb7185'][index % 6]} />
                                ))}
                              </Pie>
                              <Tooltip contentStyle={{ backgroundColor: '#11131E', borderColor: '#1D2032', borderRadius: '12px', fontSize: '11px' }} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute flex flex-col items-center">
                            <span className="text-2xl font-black text-white">{performanceData.totalServicios}</span>
                            <span className="text-[9px] text-[#3B3EF4] font-bold uppercase tracking-widest">Totales</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* ================= TAB 4: PERFIL ================= */}
            {activeTab === "perfil" && (
              <div className="max-w-md mx-auto bg-[#11131E] border border-[#1D2032] rounded-3xl p-6 space-y-6 text-center animate-fade-in shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-[#3B3EF4]/10 to-transparent"></div>

                <div className="relative pt-6">
                  <div className="relative inline-block">
                    <img 
                      src={activeBarber.avatar} 
                      alt={activeBarber.name} 
                      className="w-24 h-24 rounded-full mx-auto object-cover border-4 border-[#3B3EF4]/20 shadow-xl"
                    />
                    <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-[#11131E] animate-pulse"></div>
                  </div>

                  <h3 className="text-xl font-bold tracking-tight text-white mt-4">{activeBarber.name} </h3>
                  <span className="text-xs text-[#3B3EF4] font-bold uppercase tracking-wider">{activeBarber.role}</span>
                  <p className="text-[11px] text-gray-500 mt-1">Gallyflow Staff</p>
                </div>

                <div className="space-y-3 pt-4">
                  <button 
                    onClick={() => triggerToast("Tutorial de la App: ¡Prueba agendar una cita o completar un corte!", "info")}
                    className="w-full py-3 px-4 bg-[#3B3EF4]/10 hover:bg-[#3B3EF4]/20 border border-[#3B3EF4]/30 text-[#60A5FA] font-bold text-xs tracking-wider uppercase rounded-xl transition-all"
                  >
                    Ver Tutorial
                  </button>

                  <button 
                    onClick={() => triggerToast("Conexión de seguridad establecida con éxito", "success")}
                    className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-bold text-xs tracking-wider uppercase rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Icons.Shield className="w-4 h-4 text-[#3B3EF4]" />
                    Estado del Sistema
                  </button>

                  <button
                    onClick={logout}
                    className="w-full py-3 px-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-bold text-xs tracking-wider uppercase rounded-xl transition-all flex items-center justify-center gap-2"
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
      {activeTab === "agenda" && (
        <button 
          onClick={() => {
            setIsCreateModalOpen(true); 
          }}
          className="fixed bottom-24 right-5 md:bottom-8 md:right-8 w-14 h-14 bg-[#3B3EF4] hover:bg-[#2E31D4] text-white rounded-full flex items-center justify-center shadow-[0_4px_20px_rgba(59,62,244,0.4)] active:scale-95 transition-all z-40 border border-white/10"
          title="Agendar Nueva Cita"
        >
          <Icons.Plus className="w-7 h-7" />
        </button>
      )}

      {/* ================= MODAL DE GESTIÓN DE HORARIO ================= */}
      {isSlotModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#11131E] border border-[#1D2032] rounded-3xl max-w-sm w-full p-6 space-y-5 shadow-2xl relative animate-fade-in text-center">
            <div>
              <h3 className="text-lg font-black text-white">Gestión de Horario</h3>
              <p className="text-xs text-gray-400 mt-1">Rango seleccionado: <strong className="text-[#3B3EF4]">{tempSelectedTime}</strong></p>
            </div>

            <div className="space-y-3 pt-2">
              <button
                onClick={() => {
                  setIsModalOpenSlot(false);
                  setIsCreateModalOpen(true); 
                }}
                className="w-full py-3 bg-[#3B3EF4] hover:bg-[#2E31D4] text-white font-extrabold text-xs tracking-wider uppercase rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
              >
                <Icons.Calendar className="w-4 h-4 text-white" />
                Crear Nueva Reserva
              </button>

              <button
                onClick={() => {
                  setBlockDate(selectedDate);
                  setBlockStartTime(tempSelectedTime);
                  const [hrs, mins] = tempSelectedTime.split(":").map(Number);
                  const endHrs = String(hrs + 1).padStart(2, '0');
                  setBlockEndTime(`${endHrs}:00`);
                  setIsModalOpenSlot(false);
                  setIsBlockModalOpen(true); 
                }}
                className="w-full py-3 bg-[#2D161B] hover:bg-[#3d1a21] text-red-400 border border-red-900/30 font-extrabold text-xs tracking-wider uppercase rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <Icons.Lock className="w-4 h-4 text-red-400" />
                Bloquear este espacio
              </button>
            </div>

            <div className="border-t border-[#1D2032] pt-3">
              <button
                onClick={() => setIsModalOpenSlot(false)}
                className="w-full py-2 bg-transparent text-gray-400 hover:text-white text-xs font-bold transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL DE BLOQUEO ADMINISTRATIVO ================= */}
      {isBlockModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#11131E] border border-[#1D2032] rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl relative animate-fade-in">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-white">Bloquear Horario Administrativo</h3>
                <p className="text-[11px] text-gray-500">Asignada a: {activeBarber.name}</p>
              </div>
              <button 
                onClick={() => setIsBlockModalOpen(false)}
                className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 transition-all"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddBlockSlot} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] text-[#3B3EF4] font-black uppercase tracking-wider">Fecha *</label>
                <input 
                  type="date"
                  value={blockDate}
                  onChange={(e) => setBlockDate(e.target.value)}
                  className="w-full bg-[#161826] border border-[#1D2032] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3B3EF4] transition-all"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-[#3B3EF4] font-black uppercase tracking-wider">Hora Inicio *</label>
                  <input 
                    type="time"
                    value={blockStartTime}
                    onChange={(e) => setBlockStartTime(e.target.value)}
                    className="w-full bg-[#161826] border border-[#1D2032] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3B3EF4] transition-all"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-[#3B3EF4] font-black uppercase tracking-wider">Hora Fin *</label>
                  <input 
                    type="time"
                    value={blockEndTime}
                    onChange={(e) => setBlockEndTime(e.target.value)}
                    className="w-full bg-[#161826] border border-[#1D2032] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3B3EF4] transition-all"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-[#3B3EF4] font-black uppercase tracking-wider">Motivo / Razón del bloqueo *</label>
                <input 
                  type="text"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="Ej: Reunión, Almuerzo, Descanso"
                  className="w-full bg-[#161826] border border-[#1D2032] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#3B3EF4] transition-all"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBlockModalOpen(false)}
                  className="flex-1 py-3 bg-[#161826] border border-[#1D2032] hover:bg-[#1E2138] text-gray-300 font-black text-xs tracking-wider uppercase rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-[#3B3EF4] hover:bg-[#2E31D4] text-white font-black text-xs tracking-wider uppercase rounded-xl transition-all shadow-md"
                >
                  Bloquear Horario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: CREAR NUEVA CITA (compartido con Admin) ================= */}
      {isCreateModalOpen && (
        <AppointmentCreateModal
          services={services}
          professionals={[]}
          clients={clientes}
          initialDate={selectedDate}
          initialTime="12:00"
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
          onClose={() => setManagingAppt(null)}
          onChangeField={handleChangeManagingField}
          onSubmit={handleSubmitManagingAppt}
          onDelete={deleteAppointment}
          onTransition={(nextStatus) => {
            updateStatus(managingAppt.id, nextStatus);
            setManagingAppt(prev => (prev ? { ...prev, status: nextStatus } : prev));
          }}
        />
      )}

      {/* ================= MODAL SECUNDARIO: NUEVO CLIENTE ================= */}
      {isNewClientModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#11131E] border border-[#1D2032] rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl relative animate-fade-in">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-white">Nuevo Cliente</h3>
                <p className="text-[11px] text-gray-500">Registrar un nuevo perfil en el sistema</p>
              </div>
              <button 
                onClick={() => setIsNewClientModalOpen(false)}
                className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 transition-all"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNewClient} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] text-[#3B3EF4] font-black uppercase tracking-wider">Nombre completo *</label>
                <input 
                  type="text" 
                  value={newClientModalName}
                  onChange={(e) => setNewClientModalName(e.target.value)}
                  placeholder="Ej: Carlos Eduardo Siles"
                  className="w-full bg-[#161826] border border-[#1D2032] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#3B3EF4] transition-all"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-[#3B3EF4] font-black uppercase tracking-wider">Teléfono *</label>
                <div className="flex gap-2">
                  <select
                    value={newClientModalCountryCode}
                    onChange={(e) => setNewClientModalCountryCode(e.target.value)}
                    className="bg-[#161826] border border-[#1D2032] rounded-xl px-2 py-2 text-xs text-white focus:outline-none focus:border-[#3B3EF4]"
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
                    className="flex-1 bg-[#161826] border border-[#1D2032] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#3B3EF4] transition-all"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewClientModalOpen(false)}
                  className="flex-1 py-3 bg-[#161826] border border-[#1D2032] hover:bg-[#1E2138] text-gray-300 font-black text-xs tracking-wider uppercase rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-[#3B3EF4] hover:bg-[#2E31D4] text-white font-black text-xs tracking-wider uppercase rounded-xl transition-all shadow-lg"
                >
                  Guardar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BOTTOM NAVIGATION DE ESTILO MÓVIL */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0A0B10] border-t border-[#1A1C2C] flex justify-around py-3 px-4 shadow-[0_-10px_35px_rgba(0,0,0,0.6)] md:static md:shadow-none md:max-w-md md:mx-auto md:pb-6 md:pt-4">
        {[
          { id: "agenda", label: "Agenda", icon: Icons.Calendar },
          { id: "comisiones", label: "Comisiones", icon: Icons.Dollar },
          { id: "rendimiento", label: "Rendimiento", icon: Icons.TrendingUp },
          { id: "perfil", label: "Perfil", icon: Icons.User }
        ].map(tab => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex flex-col items-center gap-1 py-1 px-3 transition-all duration-150 group"
            >
              <TabIcon className={`w-5 h-5 transition-all ${
                isActive 
                  ? "text-[#3B3EF4] scale-110 drop-shadow-[0_0_10px_rgba(59,62,244,0.3)]" 
                  : "text-gray-500 group-hover:text-gray-300"
              }`} />
              <span className={`text-[9px] font-black tracking-wider transition-all uppercase ${
                isActive ? "text-white" : "text-gray-500"
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
  <span className="text-[9px] font-black tracking-wider uppercase">Salir</span>
      </button>*/}
      </nav>

    </div>
  );
}