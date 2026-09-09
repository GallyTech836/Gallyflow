import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDoc, collection, onSnapshot, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Sparkles, Clock, User, Calendar as CalendarIcon, Check, ChevronLeft, ChevronRight, CreditCard, Wallet, Store, Star, Info, CircleCheck as CheckCircle2, CalendarDays, MapPin, Clock3, Phone, CircleCheck as CheckCircle, Circle as XCircle } from 'lucide-react';
import { useHeroConfig } from '../shared/heroConfig/useHeroConfig';
import HeroDisplay from '../shared/heroConfig/HeroDisplay';
import { DEFAULT_HERO_CONFIG } from '../shared/heroConfig/heroConfigModel';
import { notify, NotificationType } from '../shared/notifications';
import { calculateTotals } from '../shared/appointments/serviceSelection';
import { confirmBookingToClient } from './useClientBookingConfirmation';

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
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTuesday, setIsTuesday] = useState(false);
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date());
  const [toasts, setToasts] = useState([]);

  const resetBooking = () => {
    setSelectedBranch(null)
    setSelectedServices([]);
    setSelectedBarber(null);
    setSelectedDate(null);
    setSelectedHour(null);
    setPaymentMethod(null);
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
  // eso, o si el negocio no existe, se mantiene el "GallyFlow" por
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
          promoPrice: data.promoPrice ? Number(data.promoPrice) : undefined,
          duration: `${data.duration || 30} min`,
          durationMin: Number(data.duration || 30),
          description: data.description || '',
          availableDays: data.availableDays || [],
          createdAt: data.createdAt || 0
        };
      });
      // Mismo orden que en Admin: por fecha de creación real, no por el ID.
      lista.sort((a, b) => a.createdAt - b.createdAt);
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
          specialty: '',
          image: b.avatar,
          branch: b.branch,
          availability: b.availability || [],
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

  // === CITAS EXISTENTES DEL NEGOCIO (para calcular disponibilidad real) ===
  const [citasNegocio, setCitasNegocio] = useState([]);
  useEffect(() => {
    if (!negocioId) return;
    const ref = collection(db, 'negocios', negocioId, 'citas');
    const unsub = onSnapshot(ref, (snap) => {
      setCitasNegocio(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [negocioId]);

  const [blockouts, setBlockouts] = useState([]);
  useEffect(() => {
    if (!negocioId) return;
    const ref = collection(db, 'negocios', negocioId, 'horariosBloqueados');
    const unsub = onSnapshot(ref, (snap) => {
      setBlockouts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [negocioId]);

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

  // Servicios visibles para el día elegido en el calendario. Si el servicio
  // no tiene availableDays configurado (o viene vacío), se muestra todos los
  // días — así no rompemos servicios creados antes de esta función.
  const servicesForDate = useMemo(() => {
    if (!selectedDate) return services;
    const date = new Date(selectedDate + "T12:00:00");
    const dayName = DAY_NAMES_MON_FIRST[(date.getDay() + 6) % 7];
    return services.filter(s => !s?.availableDays?.length || s.availableDays.includes(dayName));
  }, [services, selectedDate]);

  const availableHours = useMemo(() => {
    const serviceDuration = selectedServices[0]?.durationMin || 30;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isToday = selectedDate === todayStr;
    const nowMin = now.getHours() * 60 + now.getMinutes();

    // Regla de los 30 minutos de anticipación (solo aplica a ClienteApp, y solo si la fecha elegida es hoy)
    const cumpleAnticipacion = (hourStr) => !isToday || timeToMin(hourStr) >= nowMin + 30;

    if (!selectedBarber || selectedBarber.isPending) {
      return DEFAULT_HOURS.filter(cumpleAnticipacion);
    }
    if (!selectedDate) return [];

    const date = new Date(selectedDate + "T12:00:00");
    const dayName = DAY_NAMES_MON_FIRST[(date.getDay() + 6) % 7];
    const dayAvailability = (selectedBarber.availability || []).find(a => a?.day === dayName);

    if (!dayAvailability || dayAvailability.status !== 'Disponible') return [];

    const startOfDayMin = timeToMin(dayAvailability.start || '00:00');
    const endOfDayMin = timeToMin(dayAvailability.end || '00:00');
    if (isNaN(startOfDayMin) || isNaN(endOfDayMin) || endOfDayMin <= startOfDayMin) return [];

    const citasDelBarbero = citasNegocio.filter(c =>
      c?.date === selectedDate &&
      (c?.professionalId === selectedBarber.id || c?.barberId === selectedBarber.id) &&
      c?.status !== 'cancelled'
    );

    const bloqueosDelBarbero = blockouts.filter(b =>
      b?.date === selectedDate &&
      (b?.barberId === selectedBarber.id || b?.professionalId === selectedBarber.id)
    );

    const SLOT_STEP = 30; // minutos entre cada horario mostrado (09:00, 09:30, ...)
    const hours = [];
    for (let slotStart = startOfDayMin; slotStart < endOfDayMin; slotStart += SLOT_STEP) {
      const hourStr = minToTime(slotStart);
      const slotEnd = slotStart + serviceDuration;

      // Se permite iniciar el servicio en cualquier horario dentro de la
      // jornada, incluso si termina después del cierre (el profesional
      // puede quedarse atendiendo el último cliente del día).

      // No debe cruzarse con ninguna cita ya existente de ese profesional
      const seCruza = citasDelBarbero.some(c => {
        const cDuration = c?.duration || 30;
        const cStart = timeToMin(c?.time);
        const cEnd = cStart + cDuration;
        return slotStart < cEnd && slotEnd > cStart;
      });
      if (seCruza) continue;

      // No debe cruzarse con ningún bloqueo administrativo del profesional
      const seCruzaBloqueo = bloqueosDelBarbero.some(b => {
        const bStart = timeToMin(b?.startTime);
        const bEnd = timeToMin(b?.endTime);
        return slotStart < bEnd && slotEnd > bStart;
      });
      if (seCruzaBloqueo) continue;

      if (!cumpleAnticipacion(hourStr)) continue;

      hours.push(hourStr);
    }
    return hours;
  }, [selectedBarber, selectedDate, selectedServices, citasNegocio, blockouts]);

  const calculateTotal = useMemo(() => {
    return selectedServices.reduce((acc, curr) => {
      if (isTuesday && (curr.id === 'sr' || curr.id === 'jr')) {
        return acc + curr.promoPrice;
      }
      return acc + curr.price;
    }, 0);
  }, [selectedServices, isTuesday]);

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

  // Ahora los servicios se eligen DESPUÉS de la hora, así que recién acá
  // sabemos la duración real. Revalidamos que el horario elegido siga
  // alcanzando (que no se cruce con otra cita real del profesional) antes
  // de dejar avanzar; si no alcanza, se manda de vuelta a elegir otra hora.
  const handleServicesNext = () => {
    if (selectedServices.length === 0) return;

    if (selectedBarber && !selectedBarber.isPending && selectedDate && selectedHour) {
      const totalDuration = selectedServices.reduce((acc, s) => acc + (s?.durationMin || 30), 0);
      const slotStart = timeToMin(selectedHour);
      const slotEnd = slotStart + totalDuration;

      const citasDelBarbero = citasNegocio.filter(c =>
        c?.date === selectedDate &&
        (c?.professionalId === selectedBarber.id || c?.barberId === selectedBarber.id) &&
        c?.status !== 'cancelled'
      );

      const seCruza = citasDelBarbero.some(c => {
        const cStart = timeToMin(c?.time);
        const cEnd = cStart + (c?.duration || 30);
        return slotStart < cEnd && slotEnd > cStart;
      });

      if (seCruza) {
        triggerToast('El horario elegido no alcanza para estos servicios. Elige otro horario.', 'error');
        setSelectedHour(null);
        setStep(3);
        return;
      }
    }

    setStep(5);
  };

  const handleBooking = async (e) => {
    if (e) e.preventDefault();
    if (!clientName.trim()) {
      triggerToast("Por favor ingresa tu nombre de reserva");
      return;
    }
    if (!negocioId || selectedServices.length === 0 || !selectedBarber || !selectedDate || !selectedHour || !paymentMethod) {
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
      const servicesForCita = selectedServices.map((service) => {
        const finalPrice = (isTuesday && service.promoPrice && (service.id === 'sr' || service.id === 'jr'))
          ? service.promoPrice
          : service.price;
        return {
          serviceId: service.id,
          serviceName: service.name,
          price: finalPrice,
          duration: service.durationMin || 30,
        };
      });
      const { totalPrice, totalDuration } = calculateTotals(servicesForCita);
      const professionalId = selectedBarber.isPending ? 'pending' : selectedBarber.id;

      // Misma colección que usan Admin y Barber: negocios/{negocioId}/citas.
      // Se guarda el array completo en `services[]`, y además se mantienen
      // serviceId/serviceName/price/duration a nivel raíz como alias de
      // compatibilidad (apuntando al primer servicio / totales), para que
      // el código que todavía no fue actualizado (reportes, agenda) siga
      // funcionando sin romperse mientras se completan las fases siguientes.
      await addDoc(collection(db, 'negocios', negocioId, 'citas'), {
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim() || 'No especificado',
        professionalId,
        barberId: professionalId,
        services: servicesForCita,
        serviceId: servicesForCita[0]?.serviceId || '',
        serviceName: servicesForCita.map(s => s.serviceName).join(' + '),
        duration: totalDuration,
        price: totalPrice,
        date: selectedDate,
        time: selectedHour,
        status: 'confirmed',
        paymentMethod: paymentMethod.name,
        bookedBy: 'client',
        notes: '',
        branch: selectedBarber?.branch || selectedBranch?.name || '',
        createdAt: new Date().toISOString()
      });
      notify(NotificationType.RESERVA_CREADA_CLIENTE, negocioId, { clientName: clientName.trim(), time: selectedHour }, undefined, professionalId);
      // Sin "await" a propósito: la confirmación visual (SuccessStep) no
      // debe esperar al diálogo de permiso de notificaciones del navegador.
      confirmBookingToClient({ time: selectedHour });
      setStep(7); 
    } catch (error) {
      console.error("Error al registrar la reserva en Firestore:", error);
      triggerToast("Error al guardar reserva. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch(step) {
      case 0: return <Home onNext={() => setStep(1)} heroConfig={heroConfig} />;
      case 1: return <BranchStep 
        branches={branches}
        selected={selectedBranch}
        setSelected={setSelectedBranch}
        onNext={() => setStep(2)}
      />;
      case 2: return <BarberStep 
        barbers={barbers}
        selected={selectedBarber} 
        setSelected={setSelectedBarber} 
        onNext={() => setStep(3)} 
        onBack={() => setStep(1)} 
      />;
      case 3: return <DateTimeStep 
        hours={availableHours}
        date={selectedDate} setDate={setSelectedDate} 
        hour={selectedHour} setHour={setSelectedHour} 
        isTuesday={isTuesday}
        currentMonth={currentCalendarMonth}
        setCurrentMonth={setCurrentCalendarMonth}
        onNext={() => setStep(4)} 
        onBack={() => setStep(2)} 
      />;
      case 4: return <ServicesStep 
        services={servicesForDate}
        selected={selectedServices} 
        toggle={toggleService} 
        onNext={handleServicesNext} 
        onBack={() => setStep(3)} 
        total={calculateTotal}
      />;
      case 5: return <PaymentStep 
        method={paymentMethod} setMethod={setPaymentMethod} 
        onNext={() => setStep(6)} 
        onBack={() => setStep(4)} 
      />;
      case 6: return <ConfirmStep 
        name={clientName} setName={setClientName} 
        phone={clientPhone} setPhone={setClientPhone}
        total={calculateTotal}
        selectedServices={selectedServices}
        selectedBarber={selectedBarber}
        selectedDate={selectedDate}
        selectedHour={selectedHour}
        paymentMethod={paymentMethod}
        onConfirm={handleBooking} 
        loading={loading}
        onBack={() => setStep(5)} 
      />;
      case 7: return <SuccessStep 
        onReset={resetBooking} 
        selectedDate={selectedDate}
        selectedHour={selectedHour}
        selectedBarber={selectedBarber}
        selectedServices={selectedServices}
        total={calculateTotal}
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

  return (
    <div className="min-h-screen bg-nexus-background text-nexus-text font-sans selection:bg-nexus-primary selection:text-white relative overflow-x-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-nexus-primary/5 blur-[140px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-nexus-primary/5 blur-[160px] rounded-full" />
        <div className="absolute top-[40%] right-[-10%] w-[35%] h-[35%] bg-nexus-accent/5 blur-[120px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-md mx-auto min-h-screen flex flex-col p-5 sm:p-6 justify-between">
        
        {step > 0 && step < 7 && (
          <div className="mb-6 animate-fade-in bg-nexus-surface border border-nexus-border rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <button 
              onClick={() => {
                if (step === 1) setStep(0);
                else setStep(step - 1);
              }}
              className="p-1.5 rounded-lg bg-nexus-surface-hover hover:bg-nexus-border text-nexus-text-secondary hover:text-nexus-text transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((s) => (
                <div 
                  key={s} 
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    step === s 
                      ? 'w-6 bg-nexus-primary' 
                      : step > s 
                        ? 'w-3 bg-nexus-primary/50' 
                        : 'w-2 bg-nexus-border'
                  }`} 
                />
              ))}
            </div>
            <span className="text-[10px] uppercase tracking-wider text-nexus-text-secondary font-bold font-mono">Paso {step}/6</span>
          </div>
        )}
        
        <div className="flex-1 flex flex-col justify-center">
          {renderStep()}
        </div>

        <div className="text-center pt-8 pb-2 text-[10px] text-nexus-text-muted tracking-widest font-bold">
          POTENCIADO POR <span className="text-nexus-primary">GALLYFLOW</span>
        </div>
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
            <p className="text-[11px] font-bold">{t?.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// === COMPONENTES DE PANTALLA ===

const Home = ({ onNext, heroConfig }) => (
  <div className="flex-1 flex flex-col justify-center items-center text-center py-10 animate-scale-up">
    <HeroDisplay config={heroConfig || DEFAULT_HERO_CONFIG} onReservar={onNext} />
  </div>
);

const BranchStep = ({ branches, selected, setSelected, onNext }) => (
  <div className="flex-1 flex flex-col justify-between animate-fade-in py-2">
    <div>
      <h2 className="text-2xl font-extrabold text-nexus-text mb-1">Selecciona Sucursal</h2>
      <p className="text-xs text-nexus-text-secondary mb-5">Elige el local donde quieres realizar tu cita.</p>

      {branches.length === 0 ? (
        <p className="text-center py-8 text-xs text-nexus-text-muted">No hay sucursales disponibles por el momento.</p>
      ) : (
        <div className="space-y-3.5">
          {branches.map((b) => (
            <div
              key={b.id}
              onClick={() => {
                setSelected(b);
                onNext();
              }}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-3.5 ${
                selected?.id === b.id
                  ? 'border-nexus-primary bg-nexus-primary-soft'
                  : 'border-nexus-border bg-nexus-surface hover:border-nexus-primary/40'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-nexus-primary-soft flex items-center justify-center text-nexus-primary shrink-0">
                <MapPin size={18} />
              </div>
              <div className="text-left flex-1">
                <h3 className="font-bold text-sm text-nexus-text">{b.name}</h3>
                {b.address && (
                  <p className="text-nexus-text-secondary text-[11px] mt-0.5">{b.address}</p>
                )}
                {b.schedule && (
                  <p className="text-nexus-primary text-[10px] font-bold mt-1 flex items-center gap-1">
                    <Clock3 size={10} /> {b.schedule}
                  </p>
                )}
              </div>
              {selected?.id === b.id && (
                <div className="w-5 h-5 bg-nexus-primary rounded-full flex items-center justify-center text-white shrink-0">
                  <Check size={12} strokeWidth={3} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

const ServicesStep = ({ services, selected, toggle, onNext, total }) => (
  <div className="flex-1 flex flex-col justify-between animate-fade-in py-2">
    <div>
      <h2 className="text-2xl font-extrabold text-nexus-text mb-1">Selecciona Servicios</h2>
      <p className="text-xs text-nexus-text-secondary mb-5">Puedes elegir múltiples tratamientos para tu cita.</p>
      
      <div className="space-y-3 max-h-[44vh] overflow-y-auto pr-1 no-scrollbar pb-4">
        {services.map((s) => {
          const isSelected = selected.find(serv => serv.id === s.id);
          const isTodayTuesday = new Date().getDay() === 2; 
          
          return (
            <div 
              key={s.id} 
              onClick={() => toggle(s)}
              className={`p-4 rounded-2xl border-2 transition-all duration-350 cursor-pointer flex flex-col justify-between relative overflow-hidden ${
                isSelected 
                  ? 'border-nexus-primary bg-nexus-primary-soft shadow-sm' 
                  : 'border-nexus-border bg-nexus-surface hover:border-nexus-primary/30'
              }`}
            >
              {isTodayTuesday && s.promoPrice && (
                <div className="absolute top-2.5 right-2.5 bg-nexus-primary-soft text-nexus-primary border border-nexus-primary/30 px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wider">
                  Promo Hoy
                </div>
              )}

              <div className="flex justify-between items-start">
                <div className="space-y-0.5 pr-8">
                  <h3 className={`font-bold text-sm ${isSelected ? 'text-nexus-primary' : 'text-nexus-text'}`}>{s.name}</h3>
                  <p className="text-nexus-text-secondary text-[10px] leading-relaxed line-clamp-2">{s.description}</p>
                </div>
                {isSelected ? (
                  <div className="w-5 h-5 rounded-full bg-nexus-primary flex items-center justify-center text-white">
                    <Check size={12} strokeWidth={3} />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full border border-nexus-border" />
                )}
              </div>

              <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-nexus-border">
                <span className="text-[10px] text-nexus-text-muted flex items-center gap-1">
                  <Clock size={10} /> {s.duration}
                </span>
                <div>
                  {isTodayTuesday && s.promoPrice ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-nexus-text-muted line-through">{s.price} Bs</span>
                      <span className="text-xs font-black text-nexus-success-text">{s.promoPrice} Bs</span>
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-nexus-text">{s.price} Bs</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>

    {/* CONTENEDOR Y BOTÓN: Máxima altura, padding generoso y presencia de pantalla */}
    <div className="pt-6 border-t border-nexus-border mt-6">
      <div className="flex justify-between items-center mb-5 px-1">
        <div>
          <span className="text-nexus-text-secondary text-[10px] font-bold uppercase tracking-wider block">Servicios Seleccionados</span>
          <span className="text-xs text-nexus-primary font-semibold">{selected.length} {selected.length === 1 ? 'ítem' : 'ítems'}</span>
        </div>
        <div className="text-right">
          <span className="text-nexus-text-muted text-[9px] uppercase block tracking-wider font-semibold">Total Estimado</span>
          <span className="text-xl font-black text-nexus-text">{total} Bs</span>
        </div>
      </div>
      <button 
        disabled={selected.length === 0}
        onClick={onNext}
        className="w-full py-5 sm:py-5.5 px-8 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-black text-sm sm:text-base uppercase tracking-widest rounded-2xl disabled:opacity-30 disabled:pointer-events-none transition-all duration-300 shadow-md active:scale-[0.97] flex items-center justify-center gap-2 transform hover:-translate-y-0.5"
      >
        <span>Continuar Cita</span>
        <ChevronRight size={16} />
      </button>
    </div>
  </div>
);

const BarberStep = ({ barbers, selected, setSelected, onNext, onBack }) => (
  <div className="flex-1 flex flex-col justify-between animate-fade-in py-2">
    <div>
      <h2 className="text-2xl font-extrabold text-nexus-text mb-1">Selecciona Especialista</h2>
      <p className="text-xs text-nexus-text-secondary mb-5">Elige un profesional o selecciona la opción pendiente para agilizar tu turno.</p>
      
      <div className="space-y-3.5">
        {barbers.map((b) => (
          <div 
            key={b.id} 
            onClick={() => setSelected(b)}
            className={`p-3.5 rounded-2xl border-2 transition-all duration-300 cursor-pointer flex items-center gap-4 ${
              selected?.id === b.id 
                ? 'border-nexus-primary bg-nexus-primary-soft' 
                : 'border-nexus-border bg-nexus-surface hover:border-nexus-primary/40'
            }`}
          >
            {b.isPending ? (
              <div className="w-14 h-14 rounded-xl bg-nexus-primary-soft border border-nexus-primary/30 flex items-center justify-center text-nexus-primary">
                <Sparkles size={24} className="animate-pulse" />
              </div>
            ) : (
              <img src={b.image} className="w-14 h-14 rounded-xl object-cover border border-nexus-border" alt={b.name} />
            )}
            
            <div className="flex-1 text-left">
              <h3 className="font-bold text-sm text-nexus-text">{b.name}</h3>
              <p className="text-nexus-text-secondary text-[11px] mt-0.5">{b.specialty}</p>
              {!b.isPending && (
                <div className="flex items-center gap-1 mt-1">
                  <Star size={10} className="text-amber-400 fill-amber-400" />
                  <span className="text-[9px] text-nexus-text-secondary font-semibold">5.0 (Excelente)</span>
                </div>
              )}
            </div>
            
            {selected?.id === b.id ? (
              <div className="w-5 h-5 bg-nexus-primary rounded-full flex items-center justify-center text-white">
                <Check size={12} strokeWidth={3} />
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full border border-nexus-border" />
            )}
          </div>
        ))}
      </div>
    </div>

    {/* BOTÓN: Reajustado con el nuevo tamaño dominante */}
    <div className="pt-6 mt-6 border-t border-nexus-border">
      <button 
        disabled={!selected}
        onClick={onNext}
        className="w-full py-5 sm:py-5.5 px-8 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-black text-sm sm:text-base uppercase tracking-widest rounded-2xl disabled:opacity-30 disabled:pointer-events-none transition-all duration-300 shadow-md active:scale-[0.97] flex items-center justify-center gap-2 transform hover:-translate-y-0.5"
      >
        <span>Siguiente Paso</span>
        <ChevronRight size={16} />
      </button>
    </div>
  </div>
);

const DateTimeStep = ({ hours, date, setDate, hour, setHour, onNext, onBack, isTuesday, currentMonth, setCurrentMonth }) => {
  
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
        <h2 className="text-2xl font-extrabold text-nexus-text mb-1">Fecha & Hora</h2>
        <p className="text-xs text-nexus-text-secondary mb-4">Elige la fecha de tu preferencia en el calendario.</p>
        
        <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-nexus-text capitalize">{monthLabel}</span>
            <div className="flex gap-2">
              <button 
                onClick={handlePrevMonth} 
                className="p-1 rounded bg-nexus-surface-hover hover:bg-nexus-border text-nexus-text-secondary transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <button 
                onClick={handleNextMonth} 
                className="p-1 rounded bg-nexus-surface-hover hover:bg-nexus-border text-nexus-text-secondary transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 text-center text-[9px] font-bold text-nexus-text-muted uppercase tracking-wider mb-2">
            <span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {daysInMonth.map((cell, idx) => {
              if (!cell.dayNum) return <div key={`empty-${idx}`} />;
              
              const isSelected = date === cell.dateString;
              const isPast = cell.isPast;

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
                  {cell.isTuesday && !isPast && (
                    <span className={`w-1 h-1 rounded-full absolute bottom-1 ${isSelected ? 'bg-white' : 'bg-nexus-primary'}`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {isTuesday && (
          <div className="bg-nexus-primary-soft border border-nexus-primary/20 p-3 rounded-xl mb-4 flex gap-2.5 items-center animate-pulse">
            <Info size={16} className="text-nexus-primary shrink-0" />
            <p className="text-[10px] text-nexus-primary font-semibold uppercase tracking-tight">
              ¡Día de Beneficios! Descuento de Promo Martes activo.
            </p>
          </div>
        )}

        {date ? (
          hours.length > 0 ? (
            <div className="space-y-2">
              <span className="text-[10px] uppercase tracking-wider text-nexus-text-secondary font-bold block">Horas Disponibles</span>
              <div className="grid grid-cols-4 gap-2">
                {hours.map((h) => (
                  <button 
                    key={h}
                    onClick={() => setHour(h)}
                    className={`py-2.5 rounded-xl font-bold text-xs transition-all border ${
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
            <p className="text-center py-4 text-xs text-nexus-text-muted">Este profesional no tiene horario disponible ese día.</p>
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
          className="w-full py-5 sm:py-5.5 px-8 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-black text-sm sm:text-base uppercase tracking-widest rounded-2xl disabled:opacity-30 disabled:pointer-events-none transition-all duration-300 shadow-md active:scale-[0.97] flex items-center justify-center gap-2 transform hover:-translate-y-0.5"
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
              <p className="text-nexus-text-secondary text-[10px] uppercase tracking-wider">{m.desc}</p>
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
        className="w-full py-5 sm:py-5.5 px-8 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-black text-sm sm:text-base uppercase tracking-widest rounded-2xl disabled:opacity-30 disabled:pointer-events-none transition-all duration-300 shadow-md active:scale-[0.97] flex items-center justify-center gap-2 transform hover:-translate-y-0.5"
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
  selectedServices, 
  selectedBarber, 
  selectedDate, 
  selectedHour, 
  paymentMethod,
  onConfirm, 
  loading 
}) => (
  <div className="flex-1 flex flex-col justify-between animate-fade-in py-2">
    <div>
      <h2 className="text-2xl font-extrabold text-nexus-text mb-1">Confirmar Reserva</h2>
      <p className="text-xs text-nexus-text-secondary mb-5">Ingresa tus datos personales de contacto para asegurar el agendamiento.</p>
      
      <form onSubmit={onConfirm} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-nexus-primary font-bold block">Nombre Completo *</label>
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
          <label className="text-[10px] uppercase tracking-wider text-nexus-primary font-bold block">Teléfono / Celular (Opcional)</label>
          <input 
            type="tel" 
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Ej: +591 70000000"
            className="w-full bg-nexus-background border border-nexus-border p-3.5 rounded-xl outline-none focus:border-nexus-primary transition-all text-sm font-bold text-nexus-text placeholder-nexus-text-muted"
          />
        </div>

        <div className="bg-nexus-surface border border-nexus-border p-4 rounded-2xl space-y-3 mt-4 text-xs text-nexus-text-secondary">
          <div className="flex justify-between pb-2 border-b border-nexus-border">
            <span className="font-semibold text-nexus-text-secondary">Servicios:</span>
            <span className="font-bold text-right text-nexus-text">
              {selectedServices.map(s => s.name).join(', ')}
            </span>
          </div>
          <div className="flex justify-between pb-2 border-b border-nexus-border">
            <span className="font-semibold text-nexus-text-secondary">Profesional:</span>
            <span className="font-bold text-nexus-text">{selectedBarber?.name}</span>
          </div>
          <div className="flex justify-between pb-2 border-b border-nexus-border">
            <span className="font-semibold text-nexus-text-secondary">Fecha y Hora:</span>
            <span className="font-bold text-nexus-primary">{selectedDate} - {selectedHour} Hrs</span>
          </div>
          <div className="flex justify-between pb-2 border-b border-nexus-border">
            <span className="font-semibold text-nexus-text-secondary">Método de Pago:</span>
            <span className="font-bold text-nexus-text">{paymentMethod?.name}</span>
          </div>
          <div className="flex justify-between pt-1">
            <span className="font-bold text-nexus-text-secondary">Total a pagar:</span>
            <span className="text-base font-black text-nexus-success-text">{total} Bs</span>
          </div>
        </div>
      </form>
    </div>

    {/* CTA FINAL DE PÁGINA */}
    <div className="pt-6 mt-6 border-t border-nexus-border">
      <button 
        disabled={!name.trim() || loading}
        onClick={onConfirm}
        className="w-full py-5 sm:py-5.5 px-8 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-black text-sm sm:text-base uppercase tracking-widest rounded-2xl disabled:opacity-30 disabled:pointer-events-none transition-all duration-300 flex items-center justify-center gap-3 shadow-md hover:shadow-lg active:scale-[0.97] transform hover:-translate-y-0.5"
      >
        {loading ? (
          <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          "Confirmar Reserva Cita"
        )}
      </button>
    </div>
  </div>
);

const SuccessStep = ({ onReset, selectedDate, selectedHour, selectedBarber, selectedServices, total }) => {

  useEffect(() => {
    const timer = setTimeout(() => {
      onReset();
    }, 10000);

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
          Tu cita quedó agendada. El profesionales seleccionado ya recibió la información y se preparará para tu llegada.
        </p>
      </div>

      {(selectedDate || selectedHour || selectedBarber) && (
        <div className="w-full bg-nexus-surface border border-nexus-border p-4 rounded-2xl space-y-2.5 text-xs text-nexus-text-secondary text-left">
          {selectedServices?.length > 0 && (
            <div className="flex justify-between gap-3 pb-2 border-b border-nexus-border">
              <span className="font-semibold text-nexus-text-secondary shrink-0">Servicios:</span>
              <span className="font-bold text-right text-nexus-text">
                {selectedServices.map(s => s.name).join(', ')}
              </span>
            </div>
          )}
          {selectedBarber && (
            <div className="flex justify-between pb-2 border-b border-nexus-border">
              <span className="font-semibold text-nexus-text-secondary">Profesional:</span>
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
              <span className="text-base font-black text-nexus-success-text">{total} Bs</span>
            </div>
          )}
        </div>
      )}

      <p className="text-nexus-primary text-[11px] font-semibold">
        Volviendo al inicio...
      </p>

      <div className="w-full">
        <button
          onClick={onReset}
          className="w-full py-5 sm:py-5.5 px-8 bg-nexus-primary-soft hover:opacity-80 border border-nexus-primary/30 text-nexus-primary font-black uppercase text-xs sm:text-sm tracking-widest rounded-2xl transition-all active:scale-[0.97]"
        >
          Volver al Inicio
        </button>
      </div>
      </div>
  );
};