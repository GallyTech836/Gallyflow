import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Sparkles, Tag, Clock, User, Calendar as CalendarIcon, Check, ChevronLeft, ChevronRight, CreditCard, Wallet, Store, Star, Info, CircleCheck as CheckCircle2, CalendarDays, MapPin, Clock3, Phone, CircleCheck as CheckCircle, Circle as XCircle } from 'lucide-react';
import { useHeroConfig } from '../shared/heroConfig/useHeroConfig';
import HeroDisplay from '../shared/heroConfig/HeroDisplay';
import { DEFAULT_HERO_CONFIG } from '../shared/heroConfig/heroConfigModel';
import { notify, NotificationType } from '../shared/notifications';
import { formatServicePriceFor, formatAmountRange } from '../shared/servicePricing/servicePricing';
import { buildCitaServices, getCustomPrice } from '../shared/servicePricing/professionalPricing';
import DirectionsButton from '../shared/location/DirectionsButton';
import WhatsAppButton from '../shared/location/WhatsAppButton';
import Avatar from '../shared/avatar/Avatar';
import { buildDirectionsUrl } from '../shared/location/mapsLink';
import { buildWhatsAppUrl } from '../shared/location/whatsappLink';
import { compareServicios } from '../firebase/useServicios';
import { cloudinaryThumb } from '../shared/cloudinary/uploadImage';
import { confirmBookingToClient } from './useClientBookingConfirmation';
import { useNegocioStatus } from '../shared/negocioStatus/useNegocioStatus';
import SuspendedScreen from '../shared/negocioStatus/SuspendedScreen';
import { useNegocioPlan } from '../shared/negocioPlan/useNegocioPlan';
import { useBusinessSettings } from '../shared/businessSettings/useBusinessSettings';
import BusinessInfoPage from './BusinessInfoPage';
import { getPendingCandidates, professionalCanDo, getProfessionalServiceIds } from '../shared/appointments/pendingModel';
import { processPendingCita, reevaluatePending } from '../shared/appointments/pendingApi';
import { fetchBusyAppointments, createPublicBooking } from '../shared/appointments/publicBookingApi';
import { BusinessProfileContext, useBusinessProfile, useBusinessTerms } from '../shared/businessProfiles/useBusinessProfile';

// === CONSTANTES QUE NO VIENEN DE FIRESTORE ===
// Los métodos de pago no tienen colección propia en el sistema (tampoco la
// usan Admin ni Barber), así que se mantienen igual que antes.
const PAYMENT_METHODS = [
  { id: 'qr', name: 'Pago por QR', icon: <CreditCard className="w-5 h-5" />, desc: 'Transferencia rápida' },
  { id: 'efectivo', name: 'Efectivo', icon: <Wallet className="w-5 h-5" />, desc: 'Paga al terminar' },
  { id: 'local', name: 'En el Local', icon: <Store className="w-5 h-5" />, desc: 'Tarjeta o QR presencial' },
];

// Horario de respaldo únicamente para la opción "Pendiente" (sin profesional
// específico todavía no hay un `availability` propio que consultar).
const DEFAULT_HOURS = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"
];

const DAY_NAMES_MON_FIRST = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export default function App({ negocioSlug } = {}) {
  const [step, setStep] = useState(0); 
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedBarber, setSelectedBarber] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedHour, setSelectedHour] = useState(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTuesday, setIsTuesday] = useState(false);
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date());
  const [toasts, setToasts] = useState([]);

    // Precio confirmado al reservar (lo que se guardó), para la pantalla final.
    const [bookedPricing, setBookedPricing] = useState(null);
  // Servicio elegido desde «Más información» (botón Reservar de un servicio):
  // en el paso de profesional solo se ofrecen quienes lo realizan.
  const [preselectedServiceId, setPreselectedServiceId] = useState(null);

    const resetBooking = () => {
      setBookedPricing(null);
    setPreselectedServiceId(null);
    setSelectedBranch(null)
    setSelectedServices([]);
    setSelectedBarber(null);
    setSelectedDate(null);
    setSelectedHour(null);
    setClientName('');
    setClientPhone('');
    setLoading(false);
    setIsTuesday(false);
    setCurrentCalendarMonth(new Date());
    setStep(0);
  };

  // === RESOLUCIÓN DEL NEGOCIO (mismo mecanismo que useNegocio.js: negocios/{slug}) ===
  // Admin lo resuelve desde el email del admin logueado; Barber desde su login por
  // username/password. Cliente no tiene ningún login en este flujo, así que el
  // slug debe llegar desde afuera: por prop (cuando se integre la ruta) o por
  // el query param ?negocio=slug mientras tanto.
  const [negocioId, setNegocioId] = useState(null);
  const [negocioResolving, setNegocioResolving] = useState(true);
  const [negocioNotFound, setNegocioNotFound] = useState(false);
  const { isBlocked, status: negocioStatus } = useNegocioStatus(negocioId);
  // Capacidades: `reservaPublica` habilita este flujo y
  // `linkPersonalProfesional` el link ?pro=ID. (También se valida en reglas
  // de Firestore / backend; esto solo decide qué se muestra.)
  const { can: canUseCapability, loading: capabilitiesLoading } = useNegocioPlan(negocioId);
  const { businessSettings } = useBusinessSettings(negocioId);
  // Tipo de negocio -> terminología (los pasos la leen con useBusinessTerms).
  const businessProfile = useBusinessProfile(negocioId);

  useEffect(() => {
    const resolveNegocio = async () => {
      const params = new URLSearchParams(window.location.search);
      const slug = negocioSlug || params.get('negocio');

      if (!slug) {
        setNegocioNotFound(true);
        setNegocioResolving(false);
        return;
      }

      try {
        const ref = doc(db, 'negocios', slug);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setNegocioNotFound(true);
        } else {
          setNegocioId(slug);
        }
      } catch (err) {
        console.error('Error al resolver el negocio:', err);
        setNegocioNotFound(true);
      } finally {
        setNegocioResolving(false);
      }
    };
    resolveNegocio();
  }, [negocioSlug]);

  // === PANTALLA DE BIENVENIDA CONFIGURABLE (negocios/{negocioId}.heroConfig) ===
  // Mismo hook que usa el formulario de Admin: si el negocio no tiene
  // heroConfig todavía (o el doc no cargó), cae automáticamente a los
  // valores por defecto sin romper la pantalla inicial.
  const { heroConfig } = useHeroConfig(negocioId);

  // Título de pestaña dinámico: usa el nombre real del negocio en cuanto
  // heroConfig carga (multi-negocio, sin nombres hardcodeados). Antes de
  // eso, o si el negocio no existe, se mantiene el "Nexus" por
  // defecto de index.html.
  useEffect(() => {
    if (heroConfig?.businessName) {
      document.title = heroConfig.businessName;
    }
  }, [heroConfig?.businessName]);

  // === SERVICIOS DESDE FIRESTORE (negocios/{negocioId}/servicios) ===
  const [services, setServices] = useState([]);
  useEffect(() => {
    if (!negocioId) return;
    const ref = collection(db, 'negocios', negocioId, 'servicios');
    const unsub = onSnapshot(ref, (snap) => {
      const lista = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name,
          price: Number(data.price || 0),
          priceVariable: data.priceVariable === true,
          promoPrice: data.promoPrice ? Number(data.promoPrice) : undefined,
          duration: `${data.duration || 30} min`,
          durationMin: Number(data.duration || 30),
          description: data.description || '',
          image: typeof data.image === 'string' ? data.image : '',
          availableDays: data.availableDays || [],
          createdAt: data.createdAt || 0,
          order: Number.isFinite(data.order) ? data.order : undefined
        };
      });
      // Mismo orden que en Admin: por fecha de creación real, no por el ID.
      lista.sort(compareServicios);
      setServices(lista);
    });
    return () => unsub();
  }, [negocioId]);

  // === SUCURSALES DESDE FIRESTORE (negocios/{negocioId}/sucursales) ===
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);
  useEffect(() => {
    if (!negocioId) return;
    const ref = collection(db, 'negocios', negocioId, 'sucursales');
    const unsub = onSnapshot(ref, (snap) => {
      setBranches(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(b => b.active !== false)
      );
    });
    return () => unsub();
  }, [negocioId]);

  // === PROFESIONALES + SU AVAILABILITY DESDE FIRESTORE (negocios/{negocioId}/profesionales) ===
  const [barbers, setBarbers] = useState([]);
  useEffect(() => {
    if (!negocioId) return;
    const ref = collection(db, 'negocios', negocioId, 'profesionales');
    const unsub = onSnapshot(ref, (snap) => {
      const activos = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(b => b.active !== false)
        .map(b => ({
          id: b.id,
          name: b.name,
          specialty: typeof b.specialty === 'string' ? b.specialty.trim() : '',
          image: b.avatar,
          branch: b.branch,
          availability: b.availability || [],
          services: b.services || [],
          isPending: false
        }));

      setBarbers([
        ...activos,
        {
          id: 'pending',
          name: 'Pendiente',
          specialty: 'Asignar al profesional disponible más rápido',
          image: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&q=80&w=200',
          availability: [],
          isPending: true
        }
      ]);
    });
    return () => unsub();
  }, [negocioId]);

  // === LINK PERSONAL DE UN PROFESIONAL: /reservar?negocio=slug&pro=ID ===
  const personalProId = useMemo(() => new URLSearchParams(window.location.search).get('pro'), []);
  const personalBarber = personalProId && canUseCapability('linkPersonalProfesional')
    ? barbers.find(b => b.id === personalProId && !b.isPending)
    : null;
  const isPersonalLink = !!personalBarber;
  // Con una sola sucursal (o ninguna) no se pregunta: se pasa directo al profesional.
  const skipBranch = !isPersonalLink && branches.length <= 1;
  const stepOffset = isPersonalLink ? 2 : skipBranch ? 1 : 0;
  useEffect(() => {
    if (!personalBarber) return;
    if (selectedBarber !== personalBarber) setSelectedBarber(personalBarber);
    const branch =
      branches.find(b => b.id === personalBarber.branch || b.name === personalBarber.branch) ||
      (branches.length === 1 ? branches[0] : null);
    if ((branch?.id || null) !== (selectedBranch?.id || null)) setSelectedBranch(branch);
  }, [personalBarber, branches, selectedBarber, selectedBranch]);

  // === CITAS EXISTENTES DEL NEGOCIO (para calcular disponibilidad real) ===
  // Solo se consultan las citas y bloqueos de la fecha elegida (selectedDate).
  // citasFecha / bloqueosFecha indican de qué fecha son los datos cargados, para no
  // calcular horarios con datos de otro día mientras llega la consulta nueva.
  // Seguridad: citas y bloqueos llegan del backend SIN nombres, teléfonos
  // ni motivos (antes se leían completos desde Firestore). Se refrescan cada
  // 30 s mientras hay una fecha elegida, y al pedir `refreshBusy`.
  const [citasNegocio, setCitasNegocio] = useState([]);
  const [citasFecha, setCitasFecha] = useState(null);
  const [blockouts, setBlockouts] = useState([]);
  const [bloqueosFecha, setBloqueosFecha] = useState(null);
  const [busyTick, setBusyTick] = useState(0);
  const refreshBusy = () => setBusyTick(t => t + 1);
  useEffect(() => {
    if (!negocioId || !selectedDate) {
      setCitasNegocio([]);
      setCitasFecha(null);
      setBlockouts([]);
      setBloqueosFecha(null);
      return undefined;
    }
    let activo = true;
    const cargar = async () => {
      const ocupado = await fetchBusyAppointments(negocioId, selectedDate);
      if (!activo || ocupado === null) return; // sin conexión: se mantiene lo último cargado
      setCitasNegocio(ocupado.citas);
      setCitasFecha(selectedDate);
      setBlockouts(ocupado.bloqueos);
      setBloqueosFecha(selectedDate);
    };
    cargar();
    const id = setInterval(cargar, 30000);
    return () => { activo = false; clearInterval(id); };
  }, [negocioId, selectedDate, busyTick]);

  useEffect(() => {
    if (selectedDate) {
      const day = new Date(selectedDate + "T12:00:00").getDay();
      setIsTuesday(day === 2); 
    }
  }, [selectedDate]);

  // === HORAS DISPONIBLES: availability del profesional + citas existentes + duración del servicio ===
  const timeToMin = (t) => {
    const [h, m] = (t || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const minToTime = (min) => {
    const h = Math.floor(min / 60).toString().padStart(2, '0');
    const m = (min % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  // === FLUJO DE RESERVA: Sucursal (si hay más de una) → Profesional → Servicios → Fecha y hora ===
  // Profesionales de la sucursal elegida (si el negocio tiene varias). Los que
  // no tienen sucursal asignada se muestran en todas.
  const branchPros = useMemo(() => {
    const reales = barbers.filter(b => !b.isPending);
    if (!selectedBranch || branches.length < 2) return reales;
    return reales.filter(b => !b.branch || b.branch === selectedBranch.name || b.branch === selectedBranch.id);
  }, [barbers, selectedBranch, branches]);

  // Servicios del paso 3 (ya no dependen de la fecha: se eligen antes).
  // Profesional elegido: los suyos. "Pendiente": los que al menos un
  // profesional de la sucursal realiza (sin profesionales: todos).
  const servicesForProfessional = useMemo(() => {
    if (!selectedBarber || selectedBarber.isPending) {
      if (branchPros.length === 0) return services;
      return services.filter(service => branchPros.some(b => professionalCanDo(b, [service.id])));
    }
    // En Firestore, `services` del profesional es un array de objetos
    // { serviceId, commissionEnabled, type, value }; se tolera también un array de strings.
    const assignedIds = new Set(
      (Array.isArray(selectedBarber.services) ? selectedBarber.services : [])
        .map(a => (typeof a === 'string' ? a : a?.serviceId))
        .filter(Boolean)
        .map(String)
    );
    return services.filter(service => assignedIds.has(String(service.id)));
  }, [services, selectedBarber, branchPros]);

  // Días del calendario: cerrado si el negocio no atiende ese día o si algún
  // servicio elegido no se ofrece ese día (availableDays vacío = todos).
  const isDayDisabled = (dateStr) => {
    const dayName = DAY_NAMES_MON_FIRST[(new Date(dateStr + "T12:00:00").getDay() + 6) % 7];
    const businessDay = (businessSettings?.schedule || []).find(d => d?.day === dayName);
    if (businessDay && businessDay.status !== 'Disponible') return true;
    return selectedServices.some(sel => {
      const svc = services.find(x => x.id === sel.id) || sel;
      return svc?.availableDays?.length > 0 && !svc.availableDays.includes(dayName);
    });
  };

  const availableHours = useMemo(() => {
    // Duración TOTAL de los servicios elegidos (ahora se eligen antes de la hora).
    const serviceDuration = selectedServices.reduce((acc, s) => acc + (s?.durationMin || 30), 0) || 30;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isToday = selectedDate === todayStr;
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const minAdvance = businessSettings?.minAdvanceMinutes || 0;
    const cumpleAnticipacion = (hourStr) => !isToday || timeToMin(hourStr) >= nowMin + minAdvance;

    const eligePendiente = !selectedBarber || selectedBarber.isPending;
    const realBarbers = branchPros;

    // Negocio sin profesionales activos: comportamiento anterior para "Pendiente".
    if (eligePendiente && realBarbers.length === 0) {
      if (selectedDate) {
        const pendingDate = new Date(selectedDate + "T12:00:00");
        const pendingDayName = DAY_NAMES_MON_FIRST[(pendingDate.getDay() + 6) % 7];
        const pendingBusinessDay = (businessSettings?.schedule || []).find(d => d?.day === pendingDayName);
        if (pendingBusinessDay && pendingBusinessDay.status !== 'Disponible') return [];
      }
      return DEFAULT_HOURS.filter(cumpleAnticipacion);
    }

    if (!selectedDate) return [];
    if (citasFecha !== selectedDate || bloqueosFecha !== selectedDate) return [];

    const date = new Date(selectedDate + "T12:00:00");
    const dayName = DAY_NAMES_MON_FIRST[(date.getDay() + 6) % 7];

    const businessDay = (businessSettings?.schedule || []).find(d => d?.day === dayName);
    if (businessDay && businessDay.status !== 'Disponible') return [];

    const SLOT_STEP = 30;

    // Horas libres de UN profesional ese día.
    const freeHoursOf = (barber) => {
      const dayAvailability = (barber.availability || []).find(a => a?.day === dayName);
      if (!dayAvailability || dayAvailability.status !== 'Disponible') return [];

      const barberStartMin = timeToMin(dayAvailability.start || '00:00');
      const barberEndMin = timeToMin(dayAvailability.end || '00:00');
      const businessStartMin = businessDay ? timeToMin(businessDay.start || '00:00') : 0;
      const businessEndMin = businessDay ? timeToMin(businessDay.end || '23:59') : (24 * 60 - 1);

      const startOfDayMin = Math.max(barberStartMin, businessStartMin);
      const endOfDayMin = Math.min(barberEndMin, businessEndMin);
      if (isNaN(startOfDayMin) || isNaN(endOfDayMin) || endOfDayMin <= startOfDayMin) return [];

      const citasDelBarbero = citasNegocio.filter(c =>
        c?.date === selectedDate &&
        (c?.professionalId === barber.id || c?.barberId === barber.id) &&
        c?.status !== 'cancelled'
      );
      const bloqueosDelBarbero = blockouts.filter(b =>
        b?.date === selectedDate &&
        (b?.barberId === barber.id || b?.professionalId === barber.id)
      );

      const hours = [];
      for (let slotStart = startOfDayMin; slotStart < endOfDayMin; slotStart += SLOT_STEP) {
        const slotEnd = slotStart + serviceDuration;

        const seCruza = citasDelBarbero.some(c => {
          const cStart = timeToMin(c?.time);
          const cEnd = cStart + (c?.duration || 30);
          return slotStart < cEnd && slotEnd > cStart;
        });
        if (seCruza) continue;

        const seCruzaBloqueo = bloqueosDelBarbero.some(b => {
          const bStart = timeToMin(b?.startTime);
          const bEnd = timeToMin(b?.endTime);
          return slotStart < bEnd && slotEnd > bStart;
        });
        if (seCruzaBloqueo) continue;

        hours.push(minToTime(slotStart));
      }
      return hours;
    };

    // "Pendiente": la hora aparece si AL MENOS UN profesional activo que pueda
    // realizar el/los servicio(s) la tiene libre. Una cita Pendiente existente
    // NUNCA resta capacidad ni oculta la hora (solo es un indicador visual).
    if (eligePendiente) {
      const selectedIds = selectedServices.map(s => s.id);
      const pool = realBarbers.filter(b =>
        selectedIds.length > 0
          ? professionalCanDo(b, selectedIds)
          : getProfessionalServiceIds(b).size > 0
      );
      const hoursSet = new Set();
      pool.forEach(b => freeHoursOf(b).forEach(h => hoursSet.add(h)));
      return [...hoursSet].filter(cumpleAnticipacion).sort();
    }

    // Profesional elegido: sus horas libres.
    return freeHoursOf(selectedBarber).filter(cumpleAnticipacion);
  }, [selectedBarber, branchPros, selectedDate, selectedServices, citasNegocio, blockouts, citasFecha, bloqueosFecha, businessSettings]);

    // === PRECIO POR PROFESIONAL ===
    const realBarbers = branchPros;
    const chosenPro = selectedBarber && !selectedBarber.isPending ? selectedBarber : null;
  
    // "Pendiente": el precio es un rango entre los profesionales que podrían
    // atender (candidatos libres a esa hora; si aún no hay hora, todos los que
    // hacen esos servicios). Se guarda el mínimo y se recalcula al asignar.
    const pendingPricePool = useMemo(() => {
      if (chosenPro) return [];
      const ids = selectedServices.map(s => s.id);
      const canDoAll = realBarbers.filter(b => (ids.length ? professionalCanDo(b, ids) : true));
      if (!ids.length || !selectedDate || !selectedHour || citasFecha !== selectedDate || bloqueosFecha !== selectedDate) return canDoAll;
      const candidates = getPendingCandidates({
        professionals: realBarbers,
        serviceIds: ids,
        fecha: selectedDate,
        time: selectedHour,
        duration: selectedServices.reduce((acc, s) => acc + (s?.durationMin || 30), 0),
        citas: citasNegocio,
        bloqueos: blockouts,
        businessSchedule: businessSettings?.schedule || [],
      });
      return candidates.length ? candidates : canDoAll;
    }, [chosenPro, selectedServices, realBarbers, selectedDate, selectedHour, citasFecha, bloqueosFecha, citasNegocio, blockouts, businessSettings]);
  
    // Siempre con los datos actuales del catálogo (por id).
    const bookingPricing = useMemo(() => {
      // Promo de martes heredada: solo servicios 'sr'/'jr' (igual que antes).
      const promoFor = (service) => isTuesday && (service?.id === 'sr' || service?.id === 'jr');
      const catalog = selectedServices.map(sel => services.find(s => s.id === sel.id) || sel);
      return buildCitaServices(catalog, { professional: chosenPro, candidates: pendingPricePool, promoActive: promoFor });
    }, [selectedServices, services, chosenPro, pendingPricePool, isTuesday]);
  
    const hasVariablePrice = bookingPricing.hasVariable;
    const calculateTotal = bookingPricing.priceMin;
    const calculateTotalMax = bookingPricing.priceMax;

  // Selección única de servicio (igual que el modelo de Admin/Barber: un
  // serviceId por cita). Se mantiene un array de 1 elemento para no tocar
  // el resto de los componentes que ya leen `selected` como lista.
  const toggleService = (service) => {
    setSelectedServices(prev =>
      prev.find(s => s.id === service.id)
        ? prev.filter(s => s.id !== service.id)
        : [...prev, service]
    );
  };
  
  const triggerToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Servicios → Fecha y hora. La hora se vuelve a elegir porque la duración
  // (y por lo tanto los horarios libres) depende de los servicios elegidos.
  const handleServicesNext = () => {
    if (selectedServices.length === 0) return;
    setSelectedHour(null);
    if (selectedDate && isDayDisabled(selectedDate)) setSelectedDate(null);
    setStep(4);
  };


  const handleBooking = async (e) => {
    if (e) e.preventDefault();
    if (!clientName.trim()) {
      triggerToast("Por favor ingresa tu nombre de reserva");
      return;
    }
    if (clientPhone.replace(/[^0-9]/g, '').length < 7) {
      triggerToast("Por favor ingresa un número de celular válido");
      return;
    }
    if (!negocioId || selectedServices.length === 0 || !selectedBarber || !selectedDate || !selectedHour) {
      triggerToast("Faltan datos para completar la reserva.");
      return;
    }
    const now = new Date();
    const [year, month, day] = selectedDate.split('-').map(Number);
    const [hour, minute] = selectedHour.split(":").map(Number);
    const reservationDate = new Date(year, month - 1, day, hour, minute, 0, 0);
    const diffMinutes = (reservationDate.getTime() - now.getTime()) / 60000;

    if (diffMinutes < 30) {
     triggerToast("Las reservas online deben realizarse con al menos 30 minutos de anticipación.");
     return;
    }
    setLoading(true);
    try {
      // El precio que se guarda lo calcula el backend (mismo criterio que se
      // muestra aquí: el del profesional, o el mínimo entre candidatos).
      const { services: servicesForCita, totalDuration } = bookingPricing;
      const professionalId = selectedBarber.isPending ? 'pending' : selectedBarber.id;

      // "Pendiente": revalida que siga existiendo algún candidato. La asignación
      // automática (si queda UN solo candidato) la decide el backend en una
      // transacción, para no duplicar lógica ni competir entre clientes.
      if (selectedBarber.isPending) {
        const pros = branchPros;
        if (pros.length > 0) {
          const candidates = getPendingCandidates({
            professionals: pros,
            serviceIds: servicesForCita.map(sv => sv.serviceId),
            fecha: selectedDate,
            time: selectedHour,
            duration: totalDuration,
            citas: citasNegocio,
            bloqueos: blockouts,
            businessSchedule: businessSettings?.schedule || [],
          });
          if (candidates.length === 0) {
            triggerToast('Ese horario ya no está disponible. Elige otro horario.', 'error');
            setSelectedHour(null);
            setStep(4);
            return;
          }
        }
      }

      // La reserva la guarda el backend: valida el horario en una transacción,
      // toma precio y duración del catálogo y guarda/actualiza el cliente.
      const result = await createPublicBooking({
        negocioId,
        professionalId,
        serviceIds: servicesForCita.map(sv => sv.serviceId),
        date: selectedDate,
        time: selectedHour,
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        branch: selectedBarber?.branch || selectedBranch?.name || '',
        ...(professionalId === 'pending' ? { candidateIds: branchPros.map(p => p.id) } : {}),
      });
      if (!result.ok) {
        triggerToast(result.error, 'error');
        if (result.code === 'UNAVAILABLE' || result.code === 'TOO_SOON') {
          setSelectedHour(null);
          refreshBusy();
          setStep(4);
        }
        return;
      }
      const citaRef = { id: result.cita.id };
      if (professionalId === 'pending') {
        // El backend asigna (si hay un único candidato) o avisa SOLO a los candidatos.
        // Si no responde, se avisa únicamente a los administradores.
        processPendingCita(negocioId, citaRef.id).then((r) => {
          if (!r) {
            notify(NotificationType.RESERVA_CREADA_CLIENTE, negocioId, { clientName: clientName.trim(), time: selectedHour }, undefined, undefined, []);
          }
        });
      } else {
        notify(NotificationType.RESERVA_CREADA_CLIENTE, negocioId, { clientName: clientName.trim(), time: selectedHour }, undefined, professionalId);
        // Este profesional se ocupó: puede que alguna Pendiente ya tenga un único candidato.
        reevaluatePending(negocioId, selectedDate);
      }
      // Sin "await" a propósito: la confirmación visual (SuccessStep) no
      // debe esperar al diálogo de permiso de notificaciones del navegador.
      confirmBookingToClient({ time: selectedHour, negocioId }); // negocioId: solo para la terminología del push
      setBookedPricing({ min: bookingPricing.priceMin, max: bookingPricing.priceMax, hasVariable: bookingPricing.hasVariable });
      setStep(6); 
    } catch (error) {
      console.error("Error al registrar la reserva en Firestore:", error);
      triggerToast("Error al guardar reserva. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  // Empieza la reserva: link personal → servicios; una sola sucursal →
  // profesional; varias → elegir sucursal.
  const startBooking = () => {
    if (isPersonalLink) { setStep(3); return; }
    if (skipBranch) {
      if ((branches[0]?.id || null) !== (selectedBranch?.id || null)) setSelectedBranch(branches[0] || null);
      setStep(2);
      return;
    }
    setStep(1);
  };

  // Reserva normal (portada o «Reservar ahora»): empieza sin el servicio que
  // se haya elegido antes desde «Más información».
  // Borra lo elegido en una reserva anterior (profesional, servicios, fecha y
  // hora). En el link personal el profesional se mantiene.
  const clearSelection = () => {
    setPreselectedServiceId(null);
    setSelectedServices([]);
    if (!isPersonalLink) setSelectedBarber(null);
    setSelectedDate(null);
    setSelectedHour(null);
    setCurrentCalendarMonth(new Date());
  };

  const startFreshBooking = () => {
    clearSelection();
    startBooking();
  };

  const reserveService = (service) => {
    clearSelection();
    setSelectedServices([service]);
    setPreselectedServiceId(service.id);
    if (isPersonalLink) { setStep(4); return; }
    startBooking();
  };

  // Al cambiar de profesional se quitan los servicios que no realiza.
  const chooseBarber = (b) => {
    setSelectedBarber(b);
    if (b && !b.isPending) setSelectedServices(prev => prev.filter(sv => professionalCanDo(b, [sv.id])));
  };

  const barberOptions = [
    ...branchPros.filter(b => !preselectedServiceId || professionalCanDo(b, [preselectedServiceId])),
    ...barbers.filter(b => b.isPending),
  ];

  // Si el servicio ya se eligió desde «Más información», no se vuelve a pedir.
  const skipServices = !!preselectedServiceId && selectedServices.some(sv => sv.id === preselectedServiceId);

  // Pasos visibles (para la barra de progreso y el botón Volver).
  const visibleSteps = [1, 2, 3, 4, 5].filter(st =>
    st > stepOffset && !(skipServices && st === 3)
  );
  const prevStep = (st) => {
    const i = visibleSteps.indexOf(st);
    return i > 0 ? visibleSteps[i - 1] : 0;
  };

  const goToDateTime = () => {
    setSelectedHour(null);
    if (selectedDate && isDayDisabled(selectedDate)) setSelectedDate(null);
    setStep(4);
  };

  // Precios por profesional en el paso de profesional (reemplaza la
  // calificación de ejemplo). Con un servicio ya elegido, solo ese.
  const proPrices = (b) => {
    const list = preselectedServiceId
      ? services.filter(sv => sv.id === preselectedServiceId)
      : services.filter(sv => (b.isPending ? branchPros.some(p => professionalCanDo(p, [sv.id])) : professionalCanDo(b, [sv.id])));
    return list.map(sv => ({
      id: sv.id,
      name: sv.name,
      price: b.isPending
        ? formatServicePriceFor(sv, { professionals: branchPros.filter(p => professionalCanDo(p, [sv.id])) })
        : formatServicePriceFor(sv, { professional: b }),
    }));
  };

  const renderStep = () => {
    switch(step) {
      case 0: return <Home onNext={startFreshBooking} onInfo={() => setStep('info')} heroConfig={heroConfig} branches={branches} proName={personalBarber?.name} />;
      // Página «Más información del negocio»: usa los datos ya cargados y
      // "Reservar ahora" entra al mismo flujo que el botón de la portada.
      case 'info': return <BusinessInfoPage
        heroConfig={heroConfig || DEFAULT_HERO_CONFIG}
        services={services}
        professionals={barbers}
        branches={branches}
        businessSettings={businessSettings}
        personalPro={personalBarber}
        onReserve={startFreshBooking}
        onReserveService={reserveService}
        onBack={() => setStep(0)}
      />;
      case 1: return <BranchStep 
        branches={branches}
        selected={selectedBranch}
        setSelected={setSelectedBranch}
        onNext={() => setStep(2)}
      />;
      case 2: return <BarberStep 
        barbers={barberOptions}
        selected={selectedBarber} 
        setSelected={chooseBarber} 
        pricesOf={proPrices}
        highlightService={!!preselectedServiceId}
        onNext={() => (skipServices ? goToDateTime() : setStep(3))} 
        onBack={() => setStep(skipBranch ? 0 : 1)} 
      />;
      case 3: return <ServicesStep 
      services={servicesForProfessional}
        selected={selectedServices} 
        toggle={toggleService} 
        onNext={handleServicesNext} 
        onBack={() => setStep(isPersonalLink ? 0 : 2)} 
        total={calculateTotal}
        totalMax={calculateTotalMax}
        hasVariable={hasVariablePrice}
        professional={chosenPro}
        professionals={realBarbers}
        showImages={(heroConfig || DEFAULT_HERO_CONFIG).showServiceImages !== false}
      />;
      case 4: return <DateTimeStep 
        hours={availableHours}
        date={selectedDate} setDate={setSelectedDate} 
        hour={selectedHour} setHour={setSelectedHour} 
        isTuesday={isTuesday}
        isDayDisabled={isDayDisabled}
        currentMonth={currentCalendarMonth}
        setCurrentMonth={setCurrentCalendarMonth}
        onNext={() => setStep(5)} 
        onBack={() => setStep(prevStep(4))}
      />;
      case 5: return <ConfirmStep 
        name={clientName} setName={setClientName} 
        phone={clientPhone} setPhone={setClientPhone}
        total={calculateTotal}
        totalMax={calculateTotalMax}
        selectedServices={selectedServices}
        selectedBarber={selectedBarber}
        selectedDate={selectedDate}
        selectedHour={selectedHour}
        branch={selectedBranch}
        hasVariable={hasVariablePrice}
        onConfirm={handleBooking} 
        loading={loading}
        onBack={() => setStep(4)} 
      />;
      case 6: return <SuccessStep 
        onReset={resetBooking} 
        selectedDate={selectedDate}
        selectedHour={selectedHour}
        selectedBarber={selectedBarber}
        selectedServices={selectedServices}
        total={bookedPricing ? bookedPricing.min : calculateTotal}
        totalMax={bookedPricing ? bookedPricing.max : calculateTotalMax}
        hasVariable={bookedPricing ? bookedPricing.hasVariable : hasVariablePrice}
        branch={selectedBranch}
      />;
      default: return <Home heroConfig={heroConfig} />;
    }
  };

  if (negocioResolving) {
    return (
      <div className="min-h-screen bg-nexus-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-nexus-border border-t-nexus-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (negocioNotFound) {
    return (
      <div className="min-h-screen bg-nexus-background text-nexus-text font-sans flex items-center justify-center p-6 text-center">
        <p className="text-sm text-nexus-text-secondary">No se encontró el negocio solicitado.</p>
      </div>
    );
  }

  if (isBlocked) {
    return <SuspendedScreen status={negocioStatus} />;
  }

  if (negocioId && !capabilitiesLoading && !canUseCapability('reservaPublica')) {
    return <SuspendedScreen status="suspended" />;
  }

  return (
    <BusinessProfileContext.Provider value={businessProfile}>
    <div className="min-h-dvh bg-nexus-background text-nexus-text font-sans selection:bg-nexus-primary selection:text-white relative overflow-x-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-nexus-primary/5 blur-[140px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-nexus-primary/5 blur-[160px] rounded-full" />
        <div className="absolute top-[40%] right-[-10%] w-[35%] h-[35%] bg-nexus-accent/5 blur-[120px] rounded-full" />
      </div>
      

      {/* min-h-dvh: el pie queda siempre al fondo de lo que se ve (100vh incluye
          la barra del navegador y obligaba a deslizar; svh dejaba un hueco
          debajo del pie al ocultarse la barra). */}
      <main className="relative z-10 max-w-md mx-auto min-h-dvh flex flex-col p-5 sm:p-6 justify-between">
        
        {step > 0 && step < 6 && (
          // Encabezado de los pasos: flecha para volver + título del paso +
          // «Paso X/Y» a la derecha; debajo, centrada, la barra de progreso. Sin recuadro.
          <div className="mb-5 animate-fade-in">
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setStep(prevStep(step));
                }}
                aria-label="Volver"
                className="-ml-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-nexus-text hover:bg-nexus-surface-hover transition-colors cursor-pointer"
              >
                <ChevronLeft size={24} />
              </button>
              <h2 className="min-w-0 flex-1 text-2xl font-extrabold text-nexus-text leading-tight break-words">
                {({
                  1: 'Selecciona Sucursal',
                  2: `Selecciona ${businessProfile.t('professional')}`,
                  3: `Selecciona ${businessProfile.t('services')}`,
                  4: 'Fecha & Hora',
                  5: 'Confirmar Reserva',
                })[step]}
              </h2>
              <span className="shrink-0 pl-2 text-xs text-nexus-text-secondary font-bold nx-num">Paso {visibleSteps.indexOf(step) + 1}/{visibleSteps.length}</span>
            </div>
            <div className="mt-4 flex items-center justify-center">
              <div className="flex gap-1">
                {visibleSteps.map((s) => (
                  <div
                    key={s}
                    // Todos los pasos son líneas: la actual más larga (16 px), las
                    // demás de 8 px. Tamaño en línea para no depender de clases nuevas.
                    style={{ height: 4, width: step === s ? 16 : 8 }}
                    className={`shrink-0 rounded-full transition-all duration-300 ${
                      step === s
                        ? 'bg-nexus-primary'
                        : step > s
                          ? 'bg-nexus-primary/50'
                          : 'bg-nexus-border'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        
        <div className="flex-1 flex flex-col justify-center">
          {renderStep()}
        </div>

        {/* «Más información» tiene su propio pie de página. */}
        {step !== 'info' && (
          <div className="text-center pt-6 pb-1 text-xs text-nexus-text-muted">
            Potenciado por <span className="text-nexus-primary font-semibold">Nexus</span>
          </div>
        )}
      </main>
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 max-w-xs">
        {toasts.map(t => (
          <div 
            key={t?.id} 
            className={`p-3 rounded-xl border shadow-lg flex items-center gap-2.5 transition-all transform duration-300 ${
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
            <p className="text-xs font-bold">{t?.message}</p>
          </div>
        ))}
      </div>
    </div>
    </BusinessProfileContext.Provider>
  );
}

// === COMPONENTES DE PANTALLA ===

const Home = ({ onNext, onInfo, heroConfig, branches = [], proName = '' }) => {
  const terms = useBusinessTerms();
  // Con portada, todo arranca arriba (la portada toca el borde superior);
  // sin portada se mantiene centrado como siempre.
  const hasCover = !!(heroConfig || DEFAULT_HERO_CONFIG).cover;
  return (
  <div className={`flex-1 flex flex-col items-center text-center animate-scale-up ${hasCover ? 'justify-start' : 'justify-center py-10'}`}>
    <HeroDisplay
      config={heroConfig || DEFAULT_HERO_CONFIG}
      onReservar={onNext}
      ctaLabel={`Reservar ${terms.g('appointment', 'un', 'una')} ${terms.tl('appointment')}`}
    />
    {onInfo && (
      <button
        type="button"
        onClick={onInfo}
        className="mt-3 w-full py-4 px-6 rounded-2xl border border-nexus-border bg-nexus-surface hover:bg-nexus-surface-hover text-nexus-text font-semibold text-sm transition-colors active:scale-[0.97] flex items-center justify-center gap-2 cursor-pointer shadow-sm"
      >
        <Info size={16} className="text-nexus-text-secondary" />
        Más información del negocio
      </button>
    )}
    {proName && (
      <p className="mt-4 text-xs text-nexus-text-secondary">
        Reservando con <span className="font-bold text-nexus-primary">{proName}</span>
      </p>
    )}
    
  </div>
  );
};

const BranchStep = ({ branches, selected, setSelected, onNext }) => {
  const terms = useBusinessTerms();
  return (
  <div className="flex-1 flex flex-col justify-between animate-fade-in py-2">
    <div>
      <p className="text-xs text-nexus-text-secondary mb-5">Elige el local donde quieres realizar tu {terms.tl('appointment')}.</p>

      {branches.length === 0 ? (
        <p className="text-center py-8 text-xs text-nexus-text-muted">No hay sucursales disponibles por el momento.</p>
      ) : (
        <ul className="divide-y divide-nexus-border border-y border-nexus-border">
          {branches.map((b) => {
            // Solo la foto propia del local (la portada del negocio no se usa aquí).
            const foto = b.image || '';
            const isSel = selected?.id === b.id;
            const elegir = () => { setSelected(b); onNext(); };
            return (
            <li
              key={b.id}
              role="button"
              tabIndex={0}
              aria-pressed={isSel}
              onClick={elegir}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(); }
              }}
              className="flex items-start gap-4 py-4 cursor-pointer transition-colors hover:bg-nexus-surface-hover/60"
            >
              {foto ? (
                <img src={cloudinaryThumb(foto, 300)} alt={`Sucursal ${b.name}`} className="w-20 h-16 rounded-lg object-cover border border-nexus-border shrink-0" loading="lazy" />
              ) : (
                <div className="w-20 h-16 rounded-lg bg-nexus-surface-hover border border-nexus-border flex items-center justify-center text-nexus-text-muted shrink-0">
                  <MapPin size={20} />
                </div>
              )}
              <div className="text-left flex-1 min-w-0">
                <h3 className={`text-[15px] font-semibold break-words ${isSel ? 'text-nexus-primary' : 'text-nexus-text'}`}>{b.name}</h3>
                {b.address && (
                  <p className="text-nexus-text-secondary text-sm mt-0.5 leading-snug break-words">{b.address}</p>
                )}
                {b.schedule && (
                  <p className="text-nexus-text-secondary text-sm mt-1 flex items-center gap-1.5">
                    <Clock3 size={14} className="text-nexus-text-muted shrink-0" /> {b.schedule}
                  </p>
                )}
                <div className="mt-2.5 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <DirectionsButton branch={b} compact />
                  <WhatsAppButton phone={b.phone} message={`Hola, quiero consultar sobre ${terms.g('appointment', 'un', 'una')} ${terms.tl('appointment')}.`} compact />
                </div>
              </div>
              <SelectMark selected={isSel} className="mt-1" />
            </li>
            );
          })}
        </ul>
      )}
    </div>
  </div>
  );
};

/** Círculo de selección de las filas de los pasos de reserva. */
const SelectMark = ({ selected, className = '' }) => (
  selected ? (
    <span className={`w-5 h-5 shrink-0 rounded-full bg-nexus-primary flex items-center justify-center text-white ${className}`}>
      <Check size={12} strokeWidth={3} />
    </span>
  ) : (
    <span className={`w-5 h-5 shrink-0 rounded-full border-2 border-nexus-border ${className}`} />
  )
);

const ServicesStep = ({ services, selected, toggle, onNext, total, totalMax, hasVariable = false, professional = null, professionals = [], showImages = true }) => {
  const terms = useBusinessTerms();
  return (
  <div className="flex-1 flex flex-col justify-between animate-fade-in py-2">
    <div>
      <p className="text-xs text-nexus-text-secondary mb-5">Puedes elegir múltiples {terms.tl('services')} para tu {terms.tl('appointment')}.</p>
      
      <ul className="max-h-[44vh] overflow-y-auto no-scrollbar divide-y divide-nexus-border border-y border-nexus-border">
        {services.map((s) => {
          const isSelected = !!selected.find(serv => serv.id === s.id);
          const isTodayTuesday = new Date().getDay() === 2;
          const enPromo = isTodayTuesday && s.promoPrice && !(professional && getCustomPrice(professional, s.id) !== null);

          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => toggle(s)}
                aria-pressed={isSelected}
                className="w-full flex items-center gap-3 py-3.5 text-left cursor-pointer transition-colors hover:bg-nexus-surface-hover/60"
              >
                {showImages && s.image && (
                  <img src={cloudinaryThumb(s.image, 200)} alt="" className="w-12 h-12 rounded-lg object-cover border border-nexus-border shrink-0" loading="lazy" />
                )}
                <span className="flex-1 min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className={`text-[15px] font-semibold break-words ${isSelected ? 'text-nexus-primary' : 'text-nexus-text'}`}>{s.name}</span>
                    {enPromo && (
                      <span className="rounded-md bg-nexus-primary-soft px-1.5 py-0.5 text-xs font-bold text-nexus-primary">Promo hoy</span>
                    )}
                  </span>
                  {s.description && (
                    <span className="block mt-0.5 text-nexus-text-secondary text-xs leading-relaxed line-clamp-2">{s.description}</span>
                  )}
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-nexus-text-secondary nx-num">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <Tag size={14} className="text-nexus-text-muted" />
                      {enPromo ? (
                        <>
                          <span className="text-nexus-text-muted line-through">{s.price} Bs</span>
                          <span className="font-semibold text-nexus-success-text">{s.promoPrice} Bs</span>
                        </>
                      ) : (
                        formatServicePriceFor(s, { professional, professionals })
                      )}
                    </span>
                    {s.duration && (
                      <>
                        <span aria-hidden="true" className="text-nexus-text-muted">·</span>
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <Clock size={14} className="text-nexus-text-muted" /> {s.duration}
                        </span>
                      </>
                    )}
                  </span>
                </span>
                <SelectMark selected={isSelected} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>

    {/* CONTENEDOR Y BOTÓN: Máxima altura, padding generoso y presencia de pantalla */}
    <div className="pt-6 mt-2">
      <div className="flex justify-between items-center mb-5 px-1">
        <div>
          <span className="text-nexus-text-secondary text-xs font-bold block">{terms.t('services')} {terms.g('service', 'Seleccionados', 'Seleccionadas')}</span>
          <span className="text-xs text-nexus-primary font-semibold">{selected.length} {selected.length === 1 ? 'ítem' : 'ítems'}</span>
        </div>
        <div className="text-right">
          <span className="text-nexus-text-muted text-xs block font-semibold">Total Estimado</span>
          <span className="text-xl font-bold text-nexus-text">{formatAmountRange(total, totalMax ?? total, hasVariable)}</span>
        </div>
      </div>
      <button 
        disabled={selected.length === 0}
        onClick={onNext}
        className="w-full py-5 sm:py-5.5 px-8 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-bold text-sm sm:text-base rounded-2xl disabled:opacity-30 disabled:pointer-events-none transition-all duration-300 shadow-md active:scale-[0.97] flex items-center justify-center gap-2 transform hover:-translate-y-0.5"
      >
        <span>Continuar {terms.t('appointment')}</span>
        <ChevronRight size={16} />
      </button>
    </div>
  </div>
  );
};

const BarberStep = ({ barbers, selected, setSelected, pricesOf = () => [], highlightService = false, onNext, onBack }) => {
  const terms = useBusinessTerms();
  return (
  <div className="flex-1 flex flex-col justify-between animate-fade-in py-2">
    <div>
      <p className="text-xs text-nexus-text-secondary mb-5">Elige {terms.g('professional', 'un', 'una')} {terms.tl('professional')} o selecciona la opción pendiente para agilizar tu turno.</p>
      
      <ul className="divide-y divide-nexus-border border-y border-nexus-border">
        {barbers.map((b) => {
          const isSel = selected?.id === b.id;
          return (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => setSelected(b)}
              aria-pressed={isSel}
              className="w-full flex items-center gap-4 py-3 text-left cursor-pointer transition-colors hover:bg-nexus-surface-hover/60"
            >
              {b.isPending ? (
                <div className="w-16 h-16 rounded-lg bg-nexus-primary-soft border border-nexus-primary/20 flex items-center justify-center text-nexus-primary shrink-0">
                  <Sparkles size={22} />
                </div>
              ) : (
                <Avatar src={b.image} name={b.name} className="w-16 h-16 aspect-square rounded-lg object-cover border border-nexus-border shrink-0" textClassName="text-lg" />
              )}

              <div className="flex-1 min-w-0">
                <h3 className={`text-[15px] font-semibold break-words ${isSel ? 'text-nexus-primary' : 'text-nexus-text'}`}>{b.name}</h3>
                {(b.isPending || b.specialty) && (
                  <p className="text-nexus-text-secondary text-sm mt-0.5 leading-snug">{b.isPending ? `Asignar ${terms.g('professional', 'al', 'a la')} ${terms.tl('professional')} disponible más rápido` : b.specialty}</p>
                )}
                {(() => {
                  // Precio de sus servicios (en vez de la calificación de ejemplo).
                  const precios = pricesOf(b);
                  if (!precios.length) return null;
                  if (highlightService) {
                    const p0 = precios[0];
                    return (
                      <p className="mt-1 text-sm text-nexus-text-secondary">
                        {p0.name}: <span className="nx-num font-semibold text-nexus-primary">{p0.price}</span>
                      </p>
                    );
                  }
                  const visibles = precios.slice(0, 3);
                  return (
                    <p className="mt-1 text-xs text-nexus-text-secondary leading-relaxed">
                      {visibles.map((x, i) => (
                        <span key={x.id}>
                          {i > 0 && ' · '}{x.name} <span className="nx-num font-semibold text-nexus-text">{x.price}</span>
                        </span>
                      ))}
                      {precios.length > visibles.length && <span className="text-nexus-text-muted"> · +{precios.length - visibles.length} más</span>}
                    </p>
                  );
                })()}
              </div>

              <SelectMark selected={isSel} />
            </button>
          </li>
          );
        })}
      </ul>
    </div>

    {/* BOTÓN: siempre abajo (la lista ya tiene su línea inferior) */}
    <div className="pt-6 mt-2">
      <button 
        disabled={!selected}
        onClick={onNext}
        className="w-full py-5 sm:py-5.5 px-8 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-bold text-sm sm:text-base rounded-2xl disabled:opacity-30 disabled:pointer-events-none transition-all duration-300 shadow-md active:scale-[0.97] flex items-center justify-center gap-2 transform hover:-translate-y-0.5"
      >
        <span>Siguiente Paso</span>
        <ChevronRight size={16} />
      </button>
    </div>
  </div>
  );
};

const DateTimeStep = ({ hours, date, setDate, hour, setHour, onNext, onBack, isTuesday, isDayDisabled = () => false, currentMonth, setCurrentMonth }) => {
  const terms = useBusinessTerms();
  
  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const daysInMonth = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    let startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    
    const cells = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push({ dayNum: null });
    }
    const today = new Date();
    today.setHours(0,0,0,0);
    
    for (let i = 1; i <= totalDays; i++) {
      const cellDate = new Date(year, month, i);
      const isPast = cellDate < today;
      const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const isTuesdayDay = cellDate.getDay() === 2;

      cells.push({
        dayNum: i,
        dateString,
        isPast,
        isTuesday: isTuesdayDay
      });
    }
    return cells;
  }, [currentMonth]);

  const monthLabel = currentMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  return (
    <div className="flex-1 flex flex-col justify-between animate-fade-in py-2">
      <div>
        <p className="text-xs text-nexus-text-secondary mb-4">Elige la fecha de tu preferencia en el calendario.</p>
        
        <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-nexus-text capitalize">{monthLabel}</span>
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={handlePrevMonth} 
                aria-label="Mes anterior"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-nexus-surface-hover hover:bg-nexus-border text-nexus-text-secondary transition-colors cursor-pointer"
              >
                <ChevronLeft size={18} />
              </button>
              <button 
                type="button"
                onClick={handleNextMonth} 
                aria-label="Mes siguiente"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-nexus-surface-hover hover:bg-nexus-border text-nexus-text-secondary transition-colors cursor-pointer"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 text-center text-xs font-bold text-nexus-text-muted mb-2">
            <span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {daysInMonth.map((cell, idx) => {
              if (!cell.dayNum) return <div key={`empty-${idx}`} />;
              
              const isSelected = date === cell.dateString;
              // Pasado, o día en que el negocio no atiende / el servicio no se ofrece.
              const isPast = cell.isPast || isDayDisabled(cell.dateString);

              return (
                <button
                  key={cell.dateString}
                  disabled={isPast}
                  onClick={() => {
                    setDate(cell.dateString);
                    setHour(null); 
                  }}
                  className={`py-2 rounded-lg text-xs font-bold flex flex-col items-center justify-center relative transition-all duration-200 ${
                    isSelected 
                      ? 'bg-nexus-primary text-white shadow-md scale-[1.05]' 
                      : isPast
                        ? 'text-nexus-text-muted cursor-not-allowed opacity-30'
                        : 'bg-nexus-background hover:bg-nexus-surface-hover text-nexus-text-secondary'
                  }`}
                >
                  <span>{cell.dayNum}</span>
                  
                </button>
              );
            })}
          </div>
        </div>


        {date ? (
          hours.length > 0 ? (
            <div className="space-y-2">
              <span className="text-xs text-nexus-text-secondary font-bold block">Horas Disponibles</span>
              <div className="grid grid-cols-4 gap-2">
                {hours.map((h) => (
                  <button 
                    key={h}
                    onClick={() => setHour(h)}
                    className={`py-2.5 rounded-xl font-bold text-sm transition-all border ${
                      hour === h 
                        ? 'bg-nexus-primary border-nexus-primary text-white shadow-md' 
                        : 'bg-nexus-surface border-nexus-border text-nexus-text-secondary hover:border-nexus-primary/40'
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center py-4 text-xs text-nexus-text-muted">{terms.g('professional', 'Este', 'Esta')} {terms.tl('professional')} no tiene horario disponible ese día.</p>
          )
        ) : (
          <p className="text-center py-4 text-xs text-nexus-text-muted">Selecciona un día del calendario para ver horarios.</p>
        )}
      </div>

      {/* BOTÓN: Agigantado para alta presencia táctil en cualquier tipo de dispositivo */}
      <div className="pt-6 mt-6 border-t border-nexus-border">
        <button 
          disabled={!date || !hour}
          onClick={onNext}
          className="w-full py-5 sm:py-5.5 px-8 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-bold text-sm sm:text-base rounded-2xl disabled:opacity-30 disabled:pointer-events-none transition-all duration-300 shadow-md active:scale-[0.97] flex items-center justify-center gap-2 transform hover:-translate-y-0.5"
        >
          <span>Siguiente Paso</span>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

const PaymentStep = ({ method, setMethod, onNext, onBack }) => (
  <div className="flex-1 flex flex-col justify-between animate-fade-in py-2">
    <div>
      <h2 className="text-2xl font-extrabold text-nexus-text mb-1">Método de Pago</h2>
      <p className="text-xs text-nexus-text-secondary mb-5">Elige tu forma preferida de pago de manera segura.</p>
      
      <div className="space-y-3.5">
        {PAYMENT_METHODS.map((m) => (
          <div 
            key={m.id}
            onClick={() => setMethod(m)}
            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-4 ${
              method?.id === m.id 
                ? 'border-nexus-primary bg-nexus-primary-soft' 
                : 'border-nexus-border bg-nexus-surface hover:border-nexus-primary/40'
            }`}
          >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
              method?.id === m.id ? 'bg-nexus-primary text-white' : 'bg-nexus-primary-soft text-nexus-primary'
            }`}>
              {m.icon}
            </div>
            <div className="text-left">
              <h3 className="font-bold text-sm text-nexus-text">{m.name}</h3>
              <p className="text-nexus-text-secondary text-xs">{m.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* BOTÓN: Idéntico tamaño premium del home */}
    <div className="pt-6 mt-6 border-t border-nexus-border">
      <button 
        disabled={!method}
        onClick={onNext}
        className="w-full py-5 sm:py-5.5 px-8 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-bold text-sm sm:text-base rounded-2xl disabled:opacity-30 disabled:pointer-events-none transition-all duration-300 shadow-md active:scale-[0.97] flex items-center justify-center gap-2 transform hover:-translate-y-0.5"
      >
        <span>Detalles Finales</span>
        <ChevronRight size={16} />
      </button>
    </div>
  </div>
);

const ConfirmStep = ({ 
  name, setName, 
  phone, setPhone, 
  total,
  totalMax, 
  selectedServices, 
  selectedBarber, 
  selectedDate, 
  selectedHour, 
  branch,
  hasVariable = false,
  onConfirm, 
  loading 
}) => {
  const terms = useBusinessTerms();
  return (
  <div className="flex-1 flex flex-col justify-between animate-fade-in py-2">
    <div>
      <p className="text-xs text-nexus-text-secondary mb-5">Ingresa tus datos personales de contacto para asegurar el agendamiento.</p>
      
      <form onSubmit={onConfirm} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs text-nexus-primary font-bold block">Nombre Completo *</label>
          <input 
            type="text" 
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Alejandro Flores"
            className="w-full bg-nexus-background border border-nexus-border p-3.5 rounded-xl outline-none focus:border-nexus-primary transition-all text-sm font-bold text-nexus-text placeholder-nexus-text-muted"
          />
        </div>

        <div className="space-y-1.5">
        <label className="text-xs text-nexus-primary font-bold block">Teléfono / Celular *</label>
          <input 
            type="tel" 
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Ej: +591 70000000"
            className="w-full bg-nexus-background border border-nexus-border p-3.5 rounded-xl outline-none focus:border-nexus-primary transition-all text-sm font-bold text-nexus-text placeholder-nexus-text-muted"
          />
        </div>

        <div className="bg-nexus-surface border border-nexus-border p-4 rounded-2xl space-y-3 mt-4 text-xs text-nexus-text-secondary">
          <div className="flex justify-between pb-2 border-b border-nexus-border">
            <span className="font-semibold text-nexus-text-secondary">{terms.t('services')}:</span>
            <span className="font-bold text-right text-nexus-text">
              {selectedServices.map(s => s.name).join(', ')}
            </span>
          </div>
          <div className="flex justify-between pb-2 border-b border-nexus-border">
            <span className="font-semibold text-nexus-text-secondary">{terms.t('professional')}:</span>
            <span className="font-bold text-nexus-text">{selectedBarber?.name}</span>
          </div>
          <div className="flex justify-between pb-2 border-b border-nexus-border">
            <span className="font-semibold text-nexus-text-secondary">Fecha y Hora:</span>
            <span className="font-bold text-nexus-primary">{selectedDate} - {selectedHour} Hrs</span>
          </div>
          
          <div className="flex justify-between pt-1">
            <span className="font-bold text-nexus-text-secondary">Total a pagar:</span>
            <span className="text-base font-bold text-nexus-success-text">{formatAmountRange(total, totalMax ?? total, hasVariable)}</span>
          </div>
        </div>
      </form>
    </div>

    

    {/* CTA FINAL DE PÁGINA */}
    <div className="pt-6 mt-6 border-t border-nexus-border">
      <button 
        disabled={!name.trim() || loading}
        onClick={onConfirm}
        className="w-full py-5 sm:py-5.5 px-8 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-bold text-sm sm:text-base rounded-2xl disabled:opacity-30 disabled:pointer-events-none transition-all duration-300 flex items-center justify-center gap-3 shadow-md hover:shadow-lg active:scale-[0.97] transform hover:-translate-y-0.5"
      >
        {loading ? (
          <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          `Confirmar ${terms.t('appointment')}`
        )}
      </button>
    </div>
  </div>
  );
};

const SuccessStep = ({ onReset, selectedDate, selectedHour, selectedBarber, selectedServices, total, totalMax, hasVariable = false, branch = null }) => {
  const terms = useBusinessTerms();

  useEffect(() => {
    const timer = setTimeout(() => {
      onReset();
    }, 30000);

    return () => clearTimeout(timer);
  }, [onReset]);

  const fechaLegible = useMemo(() => {
    if (!selectedDate) return '';
    const texto = new Date(selectedDate + "T12:00:00").toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }, [selectedDate]);

  return (
    <div className="flex-1 flex flex-col justify-center items-center text-center py-6 space-y-6 animate-scale-up">
      <div className="w-20 h-20 bg-nexus-success-bg border border-nexus-success/30 rounded-3xl flex items-center justify-center shadow-sm">
        <CheckCircle2 className="w-12 h-12 text-nexus-success" />
      </div>

      <div className="space-y-2">
        <h2 className="text-3xl font-extrabold text-nexus-text tracking-tight">
          ¡Reserva Confirmada!
        </h2>

        <p className="text-nexus-text-secondary text-xs leading-relaxed max-w-xs mx-auto">
          Tu {terms.tl('appointment')} {terms.g('appointment', 'quedó agendado', 'quedó agendada')}. {terms.g('professional', 'El', 'La')} {terms.tl('professional')} {terms.g('professional', 'seleccionado', 'seleccionada')} ya recibió la información y se preparará para tu llegada.
        </p>
      </div>

      {(selectedDate || selectedHour || selectedBarber) && (
        <div className="w-full bg-nexus-surface border border-nexus-border p-4 rounded-2xl space-y-2.5 text-xs text-nexus-text-secondary text-left">
          {selectedServices?.length > 0 && (
            <div className="flex justify-between gap-3 pb-2 border-b border-nexus-border">
              <span className="font-semibold text-nexus-text-secondary shrink-0">{terms.t('services')}:</span>
              <span className="font-bold text-right text-nexus-text">
                {selectedServices.map(s => s.name).join(', ')}
              </span>
            </div>
          )}
          {selectedBarber && (
            <div className="flex justify-between pb-2 border-b border-nexus-border">
              <span className="font-semibold text-nexus-text-secondary">{terms.t('professional')}:</span>
              <span className="font-bold text-nexus-text">{selectedBarber.name}</span>
            </div>
          )}
          {(fechaLegible || selectedHour) && (
            <div className="flex justify-between gap-3 pb-2 border-b border-nexus-border">
              <span className="font-semibold text-nexus-text-secondary shrink-0">Fecha y Hora:</span>
              <span className="font-bold text-nexus-primary text-right">
                {fechaLegible}{selectedHour ? ` · ${selectedHour} Hrs` : ''}
              </span>
            </div>
          )}
          {typeof total === 'number' && (
            <div className="flex justify-between pt-1">
              <span className="font-bold text-nexus-text-secondary">Total a pagar:</span>
              <span className="text-base font-bold text-nexus-success-text">{formatAmountRange(total, totalMax ?? total, hasVariable)}</span>
            </div>
          )}
        </div>
      )}

      

{branch && (buildDirectionsUrl(branch) || buildWhatsAppUrl(branch.phone)) && (
        <div className="w-full space-y-2">
          <p className="text-xs text-nexus-text-secondary">
            ¿Cómo llegar o tienes dudas? Escríbenos.
          </p>
          <div className="flex items-stretch gap-2">
            <div className="flex-1"><DirectionsButton branch={branch} /></div>
            <div className="flex-1">
              <WhatsAppButton
                phone={branch.phone}
                message={`Hola, acabo de reservar ${terms.g('appointment', 'un', 'una')} ${terms.tl('appointment')}${fechaLegible ? ` para el ${fechaLegible}` : ''}${selectedHour ? ` a las ${selectedHour} Hrs` : ''}.`}
              />
            </div>
          </div>
        </div>
      )}

      

      <div className="w-full">
        <button
          onClick={onReset}
          className="w-full py-5 sm:py-5.5 px-8 bg-nexus-primary-soft hover:opacity-80 border border-nexus-primary/30 text-nexus-primary font-bold text-xs sm:text-sm rounded-2xl transition-all active:scale-[0.97]"
        >
          Volver al Inicio
        </button>
      </div>
      </div>
  );
};