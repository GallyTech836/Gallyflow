import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Menu, X, LayoutDashboard, Calendar as CalendarIcon, Users, Scissors, UserCheck, DollarSign, ChartBar as BarChart3, Clock, Plus, Search, CircleCheck as CheckCircle, Circle as XCircle, TrendingUp, FileSliders as Sliders, Trash2, CreditCard as Edit3, Award, ArrowUpRight, MapPin, CalendarCheck, UserPlus, Info, CalendarDays, ChevronLeft, ChevronRight, ChevronDown, Settings, Circle as HelpCircle, CircleAlert as AlertCircle, Check, Building2, Lock, Eye, EyeOff, KeyRound, RefreshCw, Copy, ToggleLeft, ToggleRight, Upload, Globe, Package, LogOut } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { useServicios } from '../firebase/useServicios';
import { auth, db } from '../firebase/config';
import { doc, setDoc, addDoc, collection, onSnapshot, deleteDoc, updateDoc } from 'firebase/firestore';
import { useNegocio } from '../firebase/useNegocio';
import { useNegocioStatus } from '../shared/negocioStatus/useNegocioStatus';
import { useNegocioPlan, hasFeature, getFeatureLimit } from '../shared/negocioPlan/useNegocioPlan';
import SuspendedScreen from '../shared/negocioStatus/SuspendedScreen';
import { getStatusCardClasses } from '../shared/appointments/statusModel';
import AppointmentManageModal from '../shared/appointments/AppointmentManageModal';
import AppointmentCreateModal from '../shared/appointments/AppointmentCreateModal';
import { calculateCommission, calculateCommissionForCita } from '../shared/commissions/commissionModel';
import { getServicesFromCita } from '../shared/appointments/serviceSelection';
import { uploadImage } from '../shared/cloudinary/uploadImage';
import { useNotifications, notify, NotificationType } from '../shared/notifications';
import SettingsPage from './settings';
import { SETTINGS_SECTIONS } from './settings/SettingsSidebar';

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

const INITIAL_AUTOMATION_LOGS = [];

export default function App({ user }) {
const { logout } = useAuth();
  const { negocioId } = useNegocio(user);
  const { isBlocked, status: negocioStatus } = useNegocioStatus(negocioId);
  useNotifications({ uid: user?.uid, rol: 'admin', negocioId });
console.log('[ADMIN] negocioId:', negocioId);
const [activeTab, setActiveTab] = useState('agenda');
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState('profile');
  const [agendaView, setAgendaView] = useState('dia');
  const [inventoryTab, setInventoryTab] = useState('stock');
  const [showNewProductPanel, setShowNewProductPanel] = useState(false);
  const [showSaleModal, setShowSaleModal] = useState(false);
const [sales, setSales] = useState([]);
const [saleForm, setSaleForm] = useState({
  date: new Date().toISOString().split('T')[0],
  clientName: '',
  items: [{ productId: '', productName: '', price: 0, qty: 1, subtotal: 0 }],
  paymentMethod: 'Efectivo',
  status: 'Pagado',
  notes: '',
});
  
  const [products, setProducts] = useState([
    {
      id: 'p1',
      name: 'Aceite de Argán Premium',
      category: 'Cuidado Capilar',
      stock: 24,
      minStock: 5,
      price: 180,
      image: 'https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=100&auto=format&fit=crop&q=80',
      status: 'Disponible'
    },
    {
      id: 'p2',
      name: 'Cera Fijadora Mate Fuerte',
      category: 'Fijación',
      stock: 4,
      minStock: 5,
      price: 95,
      image: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=100&auto=format&fit=crop&q=80',
      status: 'Bajo Stock'
    },
    {
      id: 'p3',
      name: 'Shampoo Purificante GallyFlow',
      category: 'Limpieza',
      stock: 0,
      minStock: 5,
      price: 120,
      image: 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=100&auto=format&fit=crop&q=80',
      status: 'Agotado'
    }
  ]);

  const [newProductForm, setNewProductForm] = useState({
    name: '',
    category: 'capilar',
    sku: '',
    type: 'venta',
    description: '',
    stock: 0,
    minStock: 5,
    price: 120
  });

  const handleSaveProduct = (e) => {
    if (e) e.preventDefault();
    if (!newProductForm.name.trim()) {
      triggerToast('Por favor ingrese el nombre del producto', 'error');
      return;
    }

    const categoryLabels = {
      'capilar': 'Cuidado Capilar',
      'fijacion': 'Fijación',
      'limpieza': 'Limpieza',
      'cosmeticos': 'Cosméticos'
    };

    const currentStock = Number(newProductForm.stock || 0);
    const minimumStock = Number(newProductForm.minStock || 5);

    let statusVal = 'Disponible';
    if (currentStock === 0) {
      statusVal = 'Agotado';
    } else if (currentStock <= minimumStock) {
      statusVal = 'Bajo Stock';
    }

    const newProduct = {
      id: 'p' + (products.length + 1),
      name: newProductForm.name,
      category: categoryLabels[newProductForm.category] || newProductForm.category || 'Otros',
      stock: currentStock,
      minStock: minimumStock,
      price: newProductForm.price || 100,
      image: 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=100&auto=format&fit=crop&q=80',
      status: statusVal
    };

    setProducts([newProduct, ...products]);
    triggerToast('¡Producto registrado con éxito!');
    setShowNewProductPanel(false);

    setNewProductForm({
      name: '',
      category: 'capilar',
      sku: '',
      type: 'venta',
      description: '',
      stock: 0,
      minStock: 5,
      price: 120
    });
  };
  

// ── Handler: Registrar nueva venta ──────────────────────────────────────
  const handleSaveSale = () => {
    const validItems = saleForm.items.filter(i => i.productId !== '');
    if (validItems.length === 0) {
      triggerToast('Selecciona al menos un producto.', 'error');
      return;
    }
    const total = validItems.reduce((acc, i) => acc + i.subtotal, 0);
    const newSale = {
      id: 'sale_' + Date.now(),
      date: saleForm.date,
      clientName: saleForm.clientName || 'Cliente general',
      items: validItems,
      total,
      paymentMethod: saleForm.paymentMethod,
      status: saleForm.status,
      notes: saleForm.notes,
      createdAt: new Date().toISOString(),
    };
    setSales(prev => [newSale, ...prev]);
    triggerToast('¡Venta registrada con éxito!');
    setShowSaleModal(false);
    setSaleForm({
      date: new Date().toISOString().split('T')[0],
      clientName: '',
      items: [{ productId: '', productName: '', price: 0, qty: 1, subtotal: 0 }],
      paymentMethod: 'Efectivo',
      status: 'Pagado',
      notes: '',
    });
  };

  const updateSaleItem = (index, field, value) => {
    setSaleForm(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      if (field === 'productId') {
        const found = products.find(p => p.id === value);
        if (found) {
          items[index].productName = found.name;
          items[index].price = found.price;
          items[index].subtotal = found.price * items[index].qty;
        }
      }
      if (field === 'qty') {
        const qty = Math.max(1, Number(value));
        items[index].qty = qty;
        items[index].subtotal = items[index].price * qty;
      }
      return { ...prev, items };
    });
  };

  const addSaleItem = () => {
    setSaleForm(prev => ({
      ...prev,
      items: [...prev.items, { productId: '', productName: '', price: 0, qty: 1, subtotal: 0 }],
    }));
  };

  const removeSaleItem = (index) => {
    setSaleForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const saleTotal = saleForm.items.reduce((acc, i) => acc + (i.subtotal || 0), 0);

  const todaySalesMetrics = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todaySalesList = (sales || []).filter(s => s?.date === today);
    const count = todaySalesList.length;
    const totalIncome = todaySalesList.reduce((sum, s) => sum + Number(s?.total || 0), 0);
    return { count, totalIncome };
  }, [sales]);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const [businessName, setBusinessName] = useState('GallyFlow');
  const [isEditingBusinessName, setIsEditingBusinessName] = useState(false);

  // Carga el nombre real del negocio desde Firestore (heroConfig.businessName,
  // el mismo campo que usa la Pantalla de Bienvenida) — antes se quedaba fijo
  // en "GallyFlow" para todos los negocios, sin importar cuál fuera.
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
  const [reservations, setReservations] = useState([]);
  useEffect(() => {
    if (!negocioId) return;
    const ref = collection(db, 'negocios', negocioId, 'citas');
    const unsub = onSnapshot(ref, (snap) => {
      setReservations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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

// Antes eran flags fijos (apagados a mano para todos). Ahora se leen
// del plan real asignado al negocio — cada uno ve solo lo que su plan
// incluye, sin tocar código cada vez que cambie.
const { features: planFeatures } = useNegocioPlan(negocioId);
  const [whatsappSettings, setWhatsappSettings] = useState({
    isConnected: true,
    connectionStatus: 'connected', // connected, disconnected, pairing
    lastSync: '2026-05-29T20:45:00.000Z',
    qrGeneratedAt: null,
    autoConfirmationEnabled: true,
    autoReminderEnabled: true,
    autoCancellationEnabled: true,
    autoThankYouEnabled: true,
    messageTemplates: {
      confirmation: "¡Hola {{clientName}}! Tu cita de {{serviceName}} ha sido agendada con éxito para el {{date}} a las {{time}} en {{branchName}}.",
      cancellation: "Hola {{clientName}}. Te notificamos que tu cita para {{serviceName}} el día {{date}} a las {{time}} ha sido cancelada.",
      reminder: "Hola {{clientName}}, te recordamos que tienes una cita de {{serviceName}} el día {{date}} a las {{time}}.",
      thankYou: "¡Gracias por visitarnos hoy, {{clientName}}! Esperamos que hayas tenido una excelente experiencia con nuestro profesional."
    }
  });

  const [automationLogs, setAutomationLogs] = useState(INITIAL_AUTOMATION_LOGS);

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterBarberId, setFilterBarberId] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedBranch, setSelectedBranch] = useState(null);

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

  const branchReservations = useMemo(() => {
    if (!Array.isArray(reservations)) return [];
    return reservations.filter(r => r?.branch === selectedBranch);
  }, [reservations, selectedBranch]);

  const [searchClientQuery, setSearchClientQuery] = useState('');
  const [searchBarberQuery, setSearchBarberQuery] = useState('');
  const [searchBranchQuery, setSearchBranchQuery] = useState('');
  const [toasts, setToasts] = useState([]);

  const [activeModal, setActiveModal] = useState(null); 
  const [editingReservation, setEditingReservation] = useState(null);
  const [clickedSlot, setClickedSlot] = useState({ barberId: '', time: '' });

  const [showPassword, setShowPassword] = useState(false);
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
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
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
        <span class="absolute inline-flex h-10 w-10 rounded-full bg-blue-500/30 animate-ping"></span>
        <div class="w-8 h-8 rounded-full bg-[#0F6FFF] border-2 border-white shadow-xl flex items-center justify-center">
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
        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const y = date.getFullYear();
        return `${d}/${m}/${y}`;
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

        return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${year}`;
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
    if (!Array.isArray(branchReservations)) return [];
    return branchReservations.filter(res => res?.date === selectedDate);
  }, [branchReservations, selectedDate]);

  const rangeReservations = useMemo(() => {
    if (!Array.isArray(branchReservations)) return [];
    return branchReservations.filter(res => isDateInSelectedRange(res?.date));
  }, [branchReservations, selectedDate, agendaView]);

  const filteredReservations = useMemo(() => {
    if (!Array.isArray(dayReservations)) return [];
    return dayReservations.filter(res => {
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
          serviceName: res?.serviceName || res?.service || 'Servicio',
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
  }, [branchBarbers, rangeReservations, services]);

  const handleLiquidarComisiones = async (barb) => {
    const pendientes = (barb?.detalle || []).filter(d => !d.paid);
    if (pendientes.length === 0) {
      triggerToast('No hay comisiones pendientes', 'error');
      return;
    }
    try {
      await Promise.all(
        pendientes.map(d => updateDoc(doc(db, 'negocios', negocioId, 'citas', d.id), { commissionPaid: true }))
      );
      triggerToast(`Comisiones liquidadas para ${barb?.name}`);
    } catch (err) {
      triggerToast('Error al liquidar comisiones: ' + err.message, 'error');
    }
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

  const hoursRange = Array.from({ length: 28 }, (_, i) => 8 + i * 0.5);

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

  const checkConflicts = (ignoreId, barberId, date, startTime, endTime, isBlockout = false, isClientRole = false) => {
    if (!barberId || barberId === 'pending') return { isValid: true };

    const startVal = timeToMin(startTime);
    const endVal = timeToMin(endTime);

    if (endVal <= startVal) {
      return { isValid: false, message: 'La hora de fin debe ser posterior a la hora de inicio.' };
    }

    if (isClientRole) {
      const todayStr = formatDate(new Date());
      if (date < todayStr) {
        return { isValid: false, message: 'No se permiten citas en fechas pasadas para clientes.' };
      }
      if (date === todayStr) {
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
        if (startVal < nowMin + 30) {
          return { isValid: false, message: 'Las citas en línea deben agendarse con al menos 30 minutos de anticipación.' };
        }
      }
    }

    const activeRes = (reservations || []).filter(r => 
      r?.id !== ignoreId && 
      r?.date === date && 
      (r?.professionalId === barberId || r?.barberId === barberId) && 
      r?.status !== 'cancelled'
    );

    for (const res of activeRes) {
      const resDuration = getReservationDuration(res, services);
      const resStart = timeToMin(res?.time);
      const resEnd = resStart + resDuration;

      if (startVal < resEnd && endVal > resStart) {
        return { isValid: false, message: `El horario interfiere con una reserva existente de ${res?.clientName} (${res?.time} - ${minToTime(resEnd)})` };
      }
    }

    const activeBl = (blockouts || []).filter(b => 
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

  const handleCreateReservation = async (e) => {
    if (e) e.preventDefault();
    const serviceObj = services.find(s => s.id === newReservation.serviceId);
    const duration = serviceObj ? serviceObj.duration : 30;
    const targetProfessionalId = newReservation.professionalId || newReservation.barberId || 'pending';
    const endTimeStr = minToTime(timeToMin(newReservation.time) + duration);

    const isClientRole = false;
    const check = checkConflicts(null, targetProfessionalId, newReservation.date, newReservation.time, endTimeStr, false, isClientRole);
    
    if (!check.isValid) {
      triggerToast(check.message, 'error');
      return;
    }

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
      triggerToast('Error al guardar el cliente: ' + err.message, 'error');
    }

    const finalPrice = (isTuesday && serviceObj?.promoPrice) ? serviceObj.promoPrice : (serviceObj?.price || 120);
    const currentBranchObj = branches.find(b => b.name === selectedBranch) || branches[0];

    /* MODELADO COMPLETO DEL DOCUMENTO DE RESERVA PARA FIRESTORE */
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    let savedReservationId = null;
    try {
      const docRef = await addDoc(collection(db, 'negocios', negocioId, 'citas'), reservationObj);
      savedReservationId = docRef.id;
      triggerToast('¡Cita agendada con éxito!');
      notify(NotificationType.RESERVA_CREADA_ADMIN, negocioId, { citaId: docRef.id, clientName: reservationObj.clientName, time: reservationObj.time }, user?.uid, targetProfessionalId);
    } catch (err) {
      triggerToast('Error al guardar la cita: ' + err.message, 'error');
      return;
    }

    /* COLA DE AUTOMATIZACIÓN DE PRUEBA (SIMULACIÓN FIRESTORE TRIGGER EN RAILWAY) */
    if (whatsappSettings.autoConfirmationEnabled) {
      const parsedText = whatsappSettings.messageTemplates.confirmation
        .replace("{{clientName}}", reservationObj.clientName)
        .replace("{{serviceName}}", reservationObj.serviceName)
        .replace("{{date}}", reservationObj.reservationDate)
        .replace("{{time}}", reservationObj.startTime)
        .replace("{{branchName}}", reservationObj.branch);

      const newLog = {
        id: 'log' + (automationLogs.length + 1),
        reservationId: savedReservationId,
        clientId: reservationObj.clientId,
        phone: `${reservationObj.countryCode} ${reservationObj.clientPhone}`,
        type: 'confirmation',
        status: 'sent',
        createdAt: new Date().toISOString()
      };
      setAutomationLogs(prev => [newLog, ...prev]);
      triggerToast('WhatsApp automático encolado para backend', 'success');
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

    // Aplica la promo de martes a cada servicio individualmente.
    const pricedServices = draftServices.map(s => {
      const fullService = services.find(sv => sv.id === s.serviceId);
      const promoPrice = (isTuesday && fullService?.promoPrice) ? fullService.promoPrice : s.price;
      return { ...s, price: promoPrice };
    });

    const totalPrice = pricedServices.reduce((sum, s) => sum + Number(s.price || 0), 0);
    const totalDuration = pricedServices.reduce((sum, s) => sum + Number(s.duration || 30), 0);

    const targetProfessionalId = draft.professionalId || 'pending';
    const endTimeStr = minToTime(timeToMin(draft.time) + totalDuration);
    const check = checkConflicts(null, targetProfessionalId, draft.date, draft.time, endTimeStr, false, false);
    if (!check.isValid) { triggerToast(check.message, 'error'); return; }

    const phoneId = (draft.phone || 'sin-telefono').replace(/[^0-9]/g, '') || 'sin-telefono';
    let clientObj = clients.find(c => c.name.toLowerCase() === draft.clientName.toLowerCase()) || {
      id: phoneId, name: draft.clientName, phone: draft.phone || 'N/A',
      visits: 1, totalSpent: 0, lastVisit: draft.date, favoriteService: pricedServices[0]?.serviceName || 'N/A'
    };
    try { await setDoc(doc(db, 'negocios', negocioId, 'clientes', clientObj.id), clientObj, { merge: true }); }
    catch (err) { triggerToast('Error al guardar el cliente: ' + err.message, 'error'); }

    const currentBranchObj = branches.find(b => b.name === selectedBranch) || branches[0];

    const reservationObj = {
      clientId: clientObj.id, clientName: clientObj.name,
      professionalId: targetProfessionalId, barberId: targetProfessionalId,
      services: pricedServices,
      serviceId: pricedServices[0]?.serviceId || '',
      serviceName: pricedServices.map(s => s.serviceName).join(' + '),
      price: totalPrice, time: draft.time, startTime: draft.time,
      endTime: endTimeStr, duration: Number(totalDuration),
      date: draft.date, reservationDate: draft.date, status: 'confirmed',
      paymentMethod: draft.paymentMethod, bookedBy: 'admin',
      branch: targetProfessionalId !== 'pending'
        ? (barbers.find(b => b.id === targetProfessionalId)?.branch || selectedBranch)
        : selectedBranch,
      branchId: currentBranchObj?.id || 'br1',
      clientPhone: draft.phone || clientObj.phone || '',
      countryCode: detectPhoneCountry(draft.phone)?.code || '+591',
      notes: draft.notes || '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, 'negocios', negocioId, 'citas'), reservationObj);
      notify(NotificationType.RESERVA_CREADA_ADMIN, negocioId, { negocioId, clientName: reservationObj.clientName, time: reservationObj.time }, user?.uid, targetProfessionalId);
    } catch (err) { triggerToast('Error al guardar: ' + err.message, 'error'); return; }

    setActiveModal(null);
  };

  const handleOpenEditReservation = (res) => {
    const services = res.services && res.services.length > 0 ? res.services : getServicesFromCita(res);
    setEditingReservation({ ...res, services });
    setActiveModal('edit-reservation');
  };

  const handleUpdateReservation = async (e) => {
    if (e) e.preventDefault();
    const targetProfessionalId = editingReservation.professionalId || editingReservation.barberId || 'pending';
    const duration = Number(editingReservation.duration) > 0 ? Number(editingReservation.duration) : 30;
    const endTimeStr = minToTime(timeToMin(editingReservation.time) + duration);
  
    const isClientRole = false;
    const check = checkConflicts(editingReservation.id, targetProfessionalId, editingReservation.date, editingReservation.time, endTimeStr, false, isClientRole);
  
    if (!check.isValid) {
      triggerToast(check.message, 'error');
      return;
    }
  
    const assignedBarber = barbers.find(b => b.id === targetProfessionalId);
    const currentServices = editingReservation.services && editingReservation.services.length > 0
      ? editingReservation.services
      : getServicesFromCita(editingReservation);
  
    const updatedRecord = {
      clientName: editingReservation.clientName,
      professionalId: targetProfessionalId,
      barberId: targetProfessionalId, // alias
      services: currentServices,
      serviceId: currentServices[0]?.serviceId || '',
      serviceName: currentServices.map(s => s.serviceName).join(' + '),
      price: editingReservation.price,
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
  
    try {
      await updateDoc(doc(db, 'negocios', negocioId, 'citas', editingReservation.id), updatedRecord);
      notify(
        editingReservation.status === 'cancelled' ? NotificationType.RESERVA_CANCELADA : NotificationType.RESERVA_MODIFICADA,
        negocioId,
        { citaId: editingReservation.id, clientName: editingReservation.clientName, time: editingReservation.time },
        user?.uid,
        targetProfessionalId
      );
    } catch (err) {
      triggerToast('Error al modificar la cita: ' + err.message, 'error');
      return;
    }

    /* SIMULACIÓN DE TRIGGER DE RAILWAY AL CANCELAR O CAMBIAR ESTADO */
    if (editingReservation.status === 'cancelled' && whatsappSettings.autoCancellationEnabled) {
      const newLog = {
        id: 'log' + (automationLogs.length + 1),
        reservationId: editingReservation.id,
        clientId: editingReservation.clientId,
        phone: `${editingReservation.countryCode || '+591'} ${editingReservation.clientPhone || '70000000'}`,
        type: 'cancellation',
        status: 'sent',
        createdAt: new Date().toISOString()
      };
      setAutomationLogs(prev => [newLog, ...prev]);
    }

    triggerToast('¡Cita modificada con éxito!');
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
    const check = checkConflicts(null, blockoutForm.barberId, blockoutForm.date, blockoutForm.startTime, blockoutForm.endTime, true, false);
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
      triggerToast('¡Horario bloqueado con éxito!');
      setActiveModal(null);
    } catch (err) {
      triggerToast('Error al bloquear el horario: ' + err.message, 'error');
    }
  };

  const handleDeleteBlockout = async (id) => {
    try {
      await deleteDoc(doc(db, 'negocios', negocioId, 'horariosBloqueados', id));
      triggerToast('¡Bloqueo eliminado!');
    } catch (err) {
      triggerToast('Error al eliminar el bloqueo: ' + err.message, 'error');
    }
  };

  const handleUpdateStatus = async (id, status) => {
    try {
      await updateDoc(doc(db, 'negocios', negocioId, 'citas', id), { status, updatedAt: new Date().toISOString() });
      await updateDoc(doc(db, 'negocios', negocioId, 'citas', id), { status, updatedAt: new Date().toISOString() });
      const targetReservation = reservations.find(r => r.id === id);
      notify(
        status === 'cancelled' ? NotificationType.RESERVA_CANCELADA : NotificationType.RESERVA_MODIFICADA,
        negocioId,
        { citaId: id, status, clientName: targetReservation?.clientName, time: targetReservation?.time },
        user?.uid,
        targetReservation?.professionalId || targetReservation?.barberId
      );
    } catch (err) {
      triggerToast('Error al actualizar el estado: ' + err.message, 'error');
      return;
    }

    /* SIMULACIÓN DE EVENTO POST-SERVICIO (THANK YOU) */
    if (status === 'completed' && whatsappSettings.autoThankYouEnabled) {
      const updated = reservations.find(r => r.id === id);
      const newLog = {
        id: 'log' + (automationLogs.length + 1),
        reservationId: id,
        clientId: updated?.clientId,
        phone: `${updated?.countryCode || '+591'} ${updated?.clientPhone || '70000000'}`,
        type: 'thankYou',
        status: 'sent',
        createdAt: new Date().toISOString()
      };
      setAutomationLogs(prev => [newLog, ...prev]);
    }

    triggerToast(`Estado actualizado a ${status === 'completed' ? 'Completado' : status === 'in-process' ? 'En Atención' : 'Confirmada'}`);
  };

  const handleDeleteReservation = async (id) => {
    const targetReservation = reservations.find(r => r.id === id);
    try {
      await deleteDoc(doc(db, 'negocios', negocioId, 'citas', id));
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
    if (!newBranch?.name?.trim() || !newBranch?.address?.trim()) {
      triggerToast('Por favor complete todos los campos obligatorios.', 'error');
      return;
    }

    try {
      if (editingBranchId) {
        await updateDoc(doc(db, 'negocios', negocioId, 'sucursales', editingBranchId), {
          name: newBranch.name,
          phone: newBranch.phone || '',
          address: newBranch.address,
          schedule: newBranch.schedule || '',
          lat: newBranch.lat,
          lng: newBranch.lng
        });
        triggerToast('Sucursal actualizada con éxito.');
        setEditingBranchId(null);
      } else {
        await addDoc(collection(db, 'negocios', negocioId, 'sucursales'), {
          name: newBranch.name,
          phone: newBranch.phone || '',
          address: newBranch.address,
          schedule: newBranch.schedule || '',
          lat: newBranch.lat,
          lng: newBranch.lng,
          active: true,
          createdAt: new Date().toISOString()
        });
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
    if (!newService.name.trim() || !newService.price) {
      triggerToast('Por favor completa todos los campos del servicio.', 'error');
      return;
    }

    const durationMin = Number(newService.duration || 30);
    const serviceObj = {
      name: newService.name,
      price: Number(newService.price),
      promoPrice: null,
      duration: durationMin,
      category: 'Tratamiento',
      availableDays: newService.availableDays || []
    };

    await agregarServicio(serviceObj);
    triggerToast('Servicio creado con éxito.');
    setActiveModal(null);
    setNewService({ name: '', price: '', duration: '30', category: 'Tratamiento', promoPrice: '', availableDays: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] });
  };

  const handleDeleteService = async (id) => {
    await eliminarServicio(id);
    triggerToast('Servicio eliminado.');
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

  const validateStep1 = () => {
    if (isUploadingAvatar) {
      triggerToast('Espera a que termine de subirse la foto.', 'error');
      return false;
    }
    if (!newBarber.firstName.trim() || !newBarber.lastName.trim()) {
      triggerToast('Por favor completa el nombre y apellido.', 'error');
      return false;
    }
    if (!newBarber.password || newBarber.password !== newBarber.confirmPassword) {
      triggerToast('Las contraseñas no coinciden o están vacías.', 'error');
      return false;
    }
    const usernameExists = barbers.some(b => b.id !== editingBarberId && b.username === newBarber.username);
    if (usernameExists) {
      triggerToast('El nombre de usuario ya está registrado.', 'error');
      return false;
    }
    const pinExists = barbers.some(b => b.id !== editingBarberId && b.pin === newBarber.pin);
    if (pinExists) {
      triggerToast('El PIN biométrico ya está registrado por otro profesional.', 'error');
      return false;
    }
    return true;
  };

  const handleNextStep = () => {
    if (barberStep === 1) {
      if (validateStep1()) {
        setBarberStep(2);
      }
    } else if (barberStep === 2) {
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
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
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

  const handleSaveBarber = async () => {
    if (editingBarberId) {
      const updatedData = {
        firstName: newBarber.firstName,
        lastName: newBarber.lastName,
        name: `${newBarber.firstName} ${newBarber.lastName}`,
        branch: newBarber.branch,
        username: newBarber.username,
        pin: newBarber.pin,
        password: newBarber.password,
        avatar: newBarber.avatar,
        active: newBarber.active,
        services: newBarber.services,
        availability: newBarber.availability
      };
      try {
        await updateDoc(doc(db, 'negocios', negocioId, 'profesionales', editingBarberId), updatedData);
        await updateDoc(doc(db, 'usuarios', editingBarberId), {
          username: newBarber.username,
          password: newBarber.password,
        });
        triggerToast('¡Perfil del profesional actualizado!');
      } catch (err) {
        triggerToast('Error al actualizar el profesional: ' + err.message, 'error');
      }
    } else {
      try {
        const newRef = doc(collection(db, 'negocios', negocioId, 'profesionales'));
        const uid = newRef.id;

        await setDoc(doc(db, 'usuarios', uid), {
          username: newBarber.username,
          password: newBarber.password,
          rol: 'barber',
          negocioId,
          uidFirebase: uid
        });

        await setDoc(newRef, {
          firstName: newBarber.firstName,
          lastName: newBarber.lastName,
          name: `${newBarber.firstName} ${newBarber.lastName}`,
          username: newBarber.username,
          branch: newBarber.branch,
          pin: newBarber.pin,
          active: newBarber.active,
          rating: 5.0,
          avatar: newBarber.avatar,
          createdDate: new Date().toISOString(),
          attendance: { in: null, out: null, status: 'inactive' },
          performance: { servicesCount: 0, totalGenerated: 0 },
          services: newBarber.services,
          availability: newBarber.availability
        });

        triggerToast('¡Profesional creado con éxito!');
      } catch (err) {
        triggerToast('Error al crear el profesional: ' + err.message, 'error');
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
      password: barber.password || '',
      confirmPassword: barber.password || '',
      avatar: barber.avatar || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
      active: barber.active !== undefined ? barber.active : true,
      services: barber.services || [],
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
    try {
      await deleteDoc(doc(db, 'negocios', negocioId, 'profesionales', id));
      await deleteDoc(doc(db, 'usuarios', id));
      triggerToast('Perfil del profesional eliminado con éxito.');
    } catch (err) {
      triggerToast('Error al eliminar el profesional: ' + err.message, 'error');
    }
  };

  const handleRegisterAttendance = (e) => {
    if (e) e.preventDefault();
    const barber = barbers.find(b => b.pin === assistPin);
    if (!barber) {
      triggerToast('PIN incorrecto. Intente de nuevo.', 'error');
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

  const filteredWizardServices = useMemo(() => {
    if (!Array.isArray(services)) return [];
    return services.filter(s => {
      const matchSearch = s?.name?.toLowerCase().includes(serviceSearch.toLowerCase());
      if (serviceTab === 'Todos') return matchSearch;
      if (serviceTab === 'Públicos') return matchSearch && s?.category !== 'Estilo';
      if (serviceTab === 'Internos') return matchSearch && s?.category === 'Estilo';
      return matchSearch;
    });
  }, [services, serviceSearch, serviceTab]);

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
    if (!searchBarberQuery) return barbers;
    return barbers.filter(b => 
      b?.name?.toLowerCase().includes(searchBarberQuery.toLowerCase()) ||
      b?.branch?.toLowerCase().includes(searchBarberQuery.toLowerCase())
    );
  }, [barbers, searchBarberQuery]);

  const filteredClientsList = useMemo(() => {
    if (!Array.isArray(clients)) return [];
    if (!searchClientQuery) return clients;
    return clients.filter(c => 
      c?.name?.toLowerCase().includes(searchClientQuery.toLowerCase()) ||
      c?.phone?.includes(searchClientQuery)
    );
  }, [clients, searchClientQuery]);

  const toggleWhatsAppConnection = () => {
    setWhatsappSettings(prev => {
      const nextConnected = !prev.isConnected;
      return {
        ...prev,
        isConnected: nextConnected,
        connectionStatus: nextConnected ? 'connected' : 'disconnected',
        lastSync: nextConnected ? new Date().toISOString() : prev.lastSync
      };
    });
    triggerToast(whatsappSettings.isConnected ? 'WhatsApp desconectado' : 'WhatsApp conectado con éxito');
  };

  const handleTestTriggerMessage = () => {
    const randomClient = clients[Math.floor(Math.random() * clients.length)];
    const randomService = services[Math.floor(Math.random() * services.length)];
    
    const newLog = {
      id: 'log' + (automationLogs.length + 1),
      reservationId: 'r' + Math.floor(Math.random() * 100),
      clientId: randomClient.id,
      phone: `+591 ${randomClient.phone}`,
      type: 'reminder',
      status: 'sent',
      createdAt: new Date().toISOString()
    };

    setAutomationLogs(prev => [newLog, ...prev]);
    triggerToast(`Mensaje de prueba encolado para ${randomClient.name}`);
  };

  if (isBlocked) {
    return <SuspendedScreen status={negocioStatus} onLogout={logout} />;
  }

  return (
    <div className="min-h-screen bg-nexus-background text-nexus-text font-sans antialiased flex flex-col md:flex-row selection:bg-nexus-primary selection:text-white overflow-x-hidden relative">
      
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/75 backdrop-blur-xs z-40 md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {}
      <aside 
        className={`fixed md:relative inset-y-0 left-0 bg-nexus-navy border-r border-nexus-navy-border flex flex-col shrink-0 z-50 transition-all duration-300 ease-in-out ${
          isMobileSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'
        } ${
          isSidebarCollapsed ? 'md:w-20' : 'md:w-60'
        }`}
      >
        <div className={`p-5 border-b border-nexus-navy-border flex items-center justify-between gap-2 ${isSidebarCollapsed ? 'md:justify-center' : ''}`}>
          <div className={`items-center gap-2.5 overflow-hidden flex ${isSidebarCollapsed ? 'md:hidden' : ''}`}>
            <img 
              src="/favicon.svg"
              alt="GallyFlow"
              className="w-9 h-9 rounded-lg shadow-md shrink-0 object-contain"
            />
            {!isSidebarCollapsed && (
              <div className="transition-all duration-300 ease-in-out opacity-100 animate-fadeIn">
                <h1 className="text-xs font-extrabold tracking-wider text-nexus-text-inverse" style={{ color: '#FFFFFF' }}>
                  GallyFlow
                </h1>
                <p className="text-[9px] text-white/40 font-bold tracking-widest uppercase">Multi-Business SaaS</p>
              </div>
            )}
          </div>

          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="hidden md:flex p-1.5 hover:bg-nexus-navy-soft text-white/70 hover:text-white rounded-lg transition-colors"
            title={isSidebarCollapsed ? "Expandir" : "Contraer"}
          >
            <span className={`inline-flex transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-0' : 'rotate-180'}`}>
              {isSidebarCollapsed ? <Menu className="w-4 h-4" /> : <X className="w-4 h-4" />}
            </span>
          </button>

          <button 
            onClick={() => setIsMobileSidebarOpen(false)}
            className="md:hidden p-1.5 hover:bg-nexus-navy-soft text-white/70 hover:text-white rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {!isSidebarCollapsed ? (
            <p className="px-2.5 py-1.5 text-[9px] font-bold tracking-widest text-white/40 uppercase">Principal</p>
          ) : (
            <div className="border-t border-nexus-navy-border my-2 mx-2" />
          )}
          
          <button 
            onClick={() => {
              setActiveTab('dashboard');
              setIsMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
              isSidebarCollapsed ? 'justify-center' : 'gap-2.5'
            } ${
              activeTab === 'dashboard' 
                ? 'bg-nexus-primary text-white border-l-2 border-nexus-primary shadow-md' 
                : 'text-white/70 hover:text-white hover:bg-nexus-navy-soft'
            }`}
          >
            <LayoutDashboard className={`w-4 h-4 shrink-0 ${activeTab === 'dashboard' ? 'text-white' : 'text-nexus-primary'}`} />
            {!isSidebarCollapsed && <span className="truncate">Dashboard</span>}
          </button>

          <button 
            onClick={() => {
              setActiveTab('agenda');
              setIsMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
              isSidebarCollapsed ? 'justify-center' : 'gap-2.5'
            } ${
              activeTab === 'agenda' 
                ? 'bg-nexus-primary text-white border-l-2 border-nexus-primary shadow-md' 
                : 'text-white/70 hover:text-white hover:bg-nexus-navy-soft'
            }`}
          >
            <CalendarIcon className={`w-4 h-4 shrink-0 ${activeTab === 'agenda' ? 'text-white' : 'text-nexus-primary'}`} />
            {!isSidebarCollapsed && (
              <>
                <span className="truncate">Agenda del Staff</span>
                {(dayReservations || []).filter(r => r?.status === 'pending').length > 0 && (
                  <span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold bg-nexus-primary text-white rounded-full">
                    {(dayReservations || []).filter(r => r?.status === 'pending').length}
                  </span>
                )}
              </>
            )}
          </button>

          {!isSidebarCollapsed ? (
            <p className="px-2.5 pt-4 py-1.5 text-[9px] font-bold tracking-widest text-white/40 uppercase">Gestión</p>
          ) : (
            <div className="border-t border-nexus-navy-border my-3 mx-2" />
          )}

          <button 
            onClick={() => {
              setActiveTab('barbers');
              setIsMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
              isSidebarCollapsed ? 'justify-center' : 'gap-2.5'
            } ${
              activeTab === 'barbers' 
                ? 'bg-nexus-primary text-white border-l-2 border-nexus-primary shadow-md' 
                : 'text-white/70 hover:text-white hover:bg-nexus-navy-soft'
            }`}
          >
            <Users className={`w-4 h-4 shrink-0 ${activeTab === 'barbers' ? 'text-white' : 'text-nexus-primary'}`} />
            {!isSidebarCollapsed && <span className="truncate">Staff</span>}
          </button>

          <button 
            onClick={() => {
              setActiveTab('services');
              setIsMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
              isSidebarCollapsed ? 'justify-center' : 'gap-2.5'
            } ${
              activeTab === 'services' 
                ? 'bg-nexus-primary text-white border-l-2 border-nexus-primary shadow-md' 
                : 'text-white/70 hover:text-white hover:bg-nexus-navy-soft'
            }`}
          >
            <Scissors className={`w-4 h-4 shrink-0 ${activeTab === 'services' ? 'text-white' : 'text-nexus-primary'}`} />
            {!isSidebarCollapsed && <span className="truncate">Servicios</span>}
          </button>

          <button 
            onClick={() => {
              setActiveTab('clients');
              setIsMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
              isSidebarCollapsed ? 'justify-center' : 'gap-2.5'
            } ${
              activeTab === 'clients' 
                ? 'bg-nexus-primary text-white border-l-2 border-nexus-primary shadow-md' 
                : 'text-white/70 hover:text-white hover:bg-nexus-navy-soft'
            }`}
          >
            <UserCheck className={`w-4 h-4 shrink-0 ${activeTab === 'clients' ? 'text-white' : 'text-nexus-primary'}`} />
            {!isSidebarCollapsed && <span className="truncate">Clientes</span>}
          </button>

          <button 
            onClick={() => {
              setActiveTab('branches');
              setIsMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
              isSidebarCollapsed ? 'justify-center' : 'gap-2.5'
            } ${
              activeTab === 'branches' 
                ? 'bg-nexus-primary text-white border-l-2 border-nexus-primary shadow-md' 
                : 'text-white/70 hover:text-white hover:bg-nexus-navy-soft'
            }`}
          >
            <Building2 className={`w-4 h-4 shrink-0 ${activeTab === 'branches' ? 'text-white' : 'text-nexus-primary'}`} />
            {!isSidebarCollapsed && <span className="truncate">Sucursales</span>}
          </button>

        {hasFeature(planFeatures, 'inventario') && (
          <button 
            onClick={() => {
              setActiveTab('inventory');
              setIsMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
              isSidebarCollapsed ? 'justify-center' : 'gap-2.5'
            } ${
              activeTab === 'inventory' 
                ? 'bg-nexus-primary text-white border-l-2 border-nexus-primary shadow-md' 
                : 'text-white/70 hover:text-white hover:bg-nexus-navy-soft'
            }`}
          >
            <Package className={`w-4 h-4 shrink-0 ${activeTab === 'inventory' ? 'text-white' : 'text-nexus-primary'}`} />
            {!isSidebarCollapsed && <span className="truncate">Inventario</span>}
          </button>
         )}


          {!isSidebarCollapsed ? (
            <p className="px-2.5 pt-4 py-1.5 text-[9px] font-bold tracking-widest text-white/40 uppercase">Finanzas</p>
          ) : (
            <div className="border-t border-nexus-navy-border my-3 mx-2" />
          )}

{hasFeature(planFeatures, 'comisiones') && (
          <button 
            onClick={() => {
              setActiveTab('commissions');
              setIsMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
              isSidebarCollapsed ? 'justify-center' : 'gap-2.5'
            } ${
              activeTab === 'commissions' 
                ? 'bg-nexus-primary text-white border-l-2 border-nexus-primary shadow-md' 
                : 'text-white/70 hover:text-white hover:bg-nexus-navy-soft'
            }`}
          >
            <DollarSign className={`w-4 h-4 shrink-0 ${activeTab === 'commissions' ? 'text-white' : 'text-nexus-primary'}`} />
            {!isSidebarCollapsed && <span className="truncate">Comisiones</span>}
          </button>
          )}

          {hasFeature(planFeatures, 'asistencia') && (
          <button 
            onClick={() => {
              setActiveTab('assistance');
              setIsMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
              isSidebarCollapsed ? 'justify-center' : 'gap-2.5'
            } ${
              activeTab === 'assistance' 
                ? 'bg-nexus-primary text-white border-l-2 border-nexus-primary shadow-md' 
                : 'text-white/70 hover:text-white hover:bg-nexus-navy-soft'
            }`}
          >
            <Clock className={`w-4 h-4 shrink-0 ${activeTab === 'assistance' ? 'text-white' : 'text-nexus-primary'}`} />
            {!isSidebarCollapsed && <span className="truncate">Asistencia</span>}
          </button>
          )}

          {hasFeature(planFeatures, 'analiticas') && (
          <button 
            onClick={() => {
              setActiveTab('reports');
              setIsMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
              isSidebarCollapsed ? 'justify-center' : 'gap-2.5'
            } ${
              activeTab === 'reports' 
                ? 'bg-nexus-primary text-white border-l-2 border-nexus-primary shadow-md' 
                : 'text-white/70 hover:text-white hover:bg-nexus-navy-soft'
            }`}
          >
            <BarChart3 className={`w-4 h-4 shrink-0 ${activeTab === 'reports' ? 'text-white' : 'text-nexus-primary'}`} />
            {!isSidebarCollapsed && <span className="truncate">Analíticas</span>}
          </button>
          )}

          {!isSidebarCollapsed ? (
            <p className="px-2.5 pt-4 py-1.5 text-[9px] font-bold tracking-widest text-white/40 uppercase">Sistema</p>
          ) : (
            <div className="border-t border-nexus-navy-border my-3 mx-2" />
          )}

         <button 
            onClick={() => {
              if (isSidebarCollapsed) {
                setActiveTab('settings');
                setIsMobileSidebarOpen(false);
                return;
              }
              setActiveTab('settings');
              setIsSettingsMenuOpen((prev) => !prev);
            }}
            className={`w-full flex items-center px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
              isSidebarCollapsed ? 'justify-center' : 'gap-2.5'
            } ${
              activeTab === 'settings' 
                ? 'bg-nexus-primary text-white border-l-2 border-nexus-primary shadow-md' 
                : 'text-white/70 hover:text-white hover:bg-nexus-navy-soft'
            }`}
          >
            <Settings className={`w-4 h-4 shrink-0 ${activeTab === 'settings' ? 'text-white' : 'text-nexus-primary'}`} />
            {!isSidebarCollapsed && (
              <>
                <span className="truncate flex-1 text-left">Configuración</span>
                <ChevronDown 
                  className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isSettingsMenuOpen ? 'rotate-180' : ''}`} 
                />
              </>
            )}
          </button>

          {!isSidebarCollapsed && isSettingsMenuOpen && (
            <div className="ml-3 pl-2.5 border-l border-nexus-navy-border space-y-0.5 py-1">
              {SETTINGS_SECTIONS.filter(({ id }) => id !== 'automation' || hasFeature(planFeatures, 'automatizaciones')).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => {
                    setActiveTab('settings');
                    setSettingsSection(id);
                    setIsMobileSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-150 ${
                    activeTab === 'settings' && settingsSection === id
                      ? 'bg-nexus-navy-soft text-nexus-primary'
                      : 'text-white/40 hover:text-white hover:bg-nexus-navy-soft'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          )}
        </nav>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        
        {}
        <header className="sticky top-0 bg-nexus-background/95 backdrop-blur-md border-b border-nexus-border py-3.5 px-4 md:px-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 z-25">
          <div className="flex items-center gap-3 w-full lg:w-auto">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="md:hidden p-1.5 hover:bg-nexus-surface-hover text-nexus-text-secondary hover:text-nexus-text rounded-lg transition-all shrink-0 border border-nexus-border"
              title="Abrir Menú"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="w-2 h-2 rounded-full bg-nexus-primary animate-pulse
                  bg-nexus-primary animate-pulse"></span>
                <span className="text-[10px] uppercase font-black tracking-widest text-nexus-primary font-mono font-bold">Plataforma GallyFlow Configurada</span>
              </div>
              <h2 className="text-lg font-extrabold text-nexus-text tracking-tight flex items-center gap-2">
                <span className="text-nexus-text-secondary font-normal">{businessName}</span>
                <span className="text-nexus-text-muted">/</span>
                <span>
                  {activeTab === 'dashboard' && 'Panel General'}
                  {activeTab === 'agenda' && 'Agenda del Staff'}
                  {activeTab === 'barbers' && 'Gestión de Staff Profesional'}
                  {activeTab === 'services' && 'Catálogo de Servicios'}
                  {activeTab === 'clients' && 'Base de Datos de Clientes'}
                  {activeTab === 'branches' && 'Gestión de Sucursales'}
                  {activeTab === 'inventory' && 'Inventario'}
                  {activeTab === 'commissions' && 'Liquidación de Comisiones'}
                  {activeTab === 'assistance' && 'Control de Asistencias'}
                  {activeTab === 'reports' && 'Métricas & Informes'}
                  {activeTab === 'settings' && 'Configuración'}
                </span>
              </h2>
            </div>
          </div>

          {['agenda', 'dashboard', 'commissions', 'assistance', 'reports', 'automatizaciones'].includes(activeTab) && (
            <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
              
              <div className="flex items-center bg-nexus-surface border border-nexus-border rounded-lg p-0.5 shadow-inner">
                {['dia', 'semana', 'mes', 'año'].map((view) => (
                  <button
                    key={view}
                    onClick={() => setAgendaView(view)}
                    className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${
                      agendaView === view
                        ? 'bg-nexus-primary text-white shadow-md'
                        : 'text-nexus-text-secondary hover:text-nexus-text'
                    }`}
                  >
                    {view.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="flex items-center bg-nexus-surface border border-nexus-border rounded-lg overflow-hidden shrink-0 shadow-md">
                <button 
                  onClick={handlePrevPeriod}
                  className="p-1.5 hover:bg-nexus-surface-hover text-nexus-text-secondary hover:text-nexus-text transition-colors border-r border-nexus-border"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                
                <div className="flex items-center px-3.5 py-1 text-xs text-nexus-text gap-2 font-mono font-bold select-none min-w-[120px] justify-center">
                  <span>{getFormattedDateLabel(selectedDate, agendaView)}</span>
                </div>

                <button 
                  onClick={handleNextPeriod}
                  className="p-1.5 hover:bg-nexus-surface-hover text-nexus-text-secondary hover:text-nexus-text transition-colors border-l border-nexus-border"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center bg-nexus-surface border border-nexus-border rounded-lg px-2.5 py-1 text-xs text-nexus-text gap-1.5 shrink-0 shadow-md">
              <MapPin className="w-3.5 h-3.5 text-nexus-primary" />
                <select 
                  value={selectedBranch || ''}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="bg-transparent border-0 outline-none text-nexus-text font-bold cursor-pointer text-xs"
                >
                  {(branches || []).map(b => (
                    <option key={b?.id || b?.name} value={b?.name} className="bg-nexus-surface">{b?.name}</option>
                  ))}
                </select>
              </div>

              {negocioId && (
                <a
                  href={`${window.location.origin}/reservar?negocio=${negocioId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir página pública"
                  className="flex items-center justify-center bg-nexus-surface border border-nexus-border hover:border-nexus-primary/60 hover:bg-nexus-surface-hover text-nexus-text-secondary hover:text-nexus-text p-1.5 rounded-lg shrink-0 shadow-md transition-all cursor-pointer"
                >
                  <Globe className="w-3.5 h-3.5" />
                </a>
              )}

              {activeTab === 'agenda' && (
                <button
                  onClick={() => {
                    setNewReservation(prev => ({ ...prev, date: selectedDate }));
                    setActiveModal('add-reservation');
                  }}
                  className="ml-auto lg:ml-0 px-3 py-1.5 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-extrabold rounded-lg text-xs shadow-md transition-all flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nueva Cita
                </button>
              )}
            </div>
          )}  
        </header>

        <div className="flex-1 p-5 space-y-5">
          
          {/* ==========================================
              1. PESTAÑA: DASHBOARD (METRICAS FILTRADAS)
              ========================================== */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-nexus-surface border border-nexus-border rounded-xl p-4 shadow-sm">
                  <span className="text-[10px] font-bold text-nexus-text-secondary tracking-wider uppercase">Ventas periodo</span>
                  <h3 className="text-xl font-black text-nexus-text font-mono mt-1">{formatBs(rangeMetrics?.totalRevenue)}</h3>
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-nexus-primary font-bold">
                    <TrendingUp className="w-3 h-3" />
                    <span>+12.4% vs anterior</span>
                  </div>
                </div>
                <div className="bg-nexus-surface border border-nexus-border rounded-xl p-4 shadow-sm">
                  <span className="text-[10px] font-bold text-nexus-text-secondary tracking-wider uppercase">Citas Agendadas</span>
                  <h3 className="text-xl font-black text-nexus-text font-mono mt-1">{(rangeReservations || []).length}</h3>
                  <p className="text-[9px] text-nexus-text-muted mt-1">Total acumuladas en rango</p>
                </div>
                <div className="bg-nexus-surface border border-nexus-border rounded-xl p-4 shadow-sm">
                  <span className="text-[10px] font-bold text-nexus-text-secondary tracking-wider uppercase">Clientes Atendidos</span>
                  <h3 className="text-xl font-black text-nexus-primary font-mono mt-1">{rangeMetrics?.clientsServed}</h3>
                  <p className="text-[9px] text-nexus-primary mt-1">Fidelización premium activa</p>
                </div>
                <div className="bg-nexus-surface border border-nexus-border rounded-xl p-4 shadow-sm">
                  <span className="text-[10px] font-bold text-nexus-text-secondary tracking-wider uppercase">Comisión Estimada</span>
                  <h3 className="text-xl font-black text-nexus-error-text font-mono mt-1">{formatBs(rangeMetrics?.pendingCommissions)}</h3>
                  <p className="text-[9px] text-nexus-error-text/80 mt-1">Acumulado liquidación periodo</p>
                </div>
              </div>

              <div className="bg-nexus-surface border border-nexus-border rounded-xl p-5 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-xs font-bold text-nexus-text uppercase tracking-wider font-mono">Estimación Gráfica de Productividad ({agendaView.toUpperCase()})</h4>
                  <span className="text-[9px] font-bold bg-nexus-primary-soft text-nexus-primary px-2.5 py-0.5 rounded border border-nexus-border">Tiempo Real</span>
                </div>
                <div className="relative h-44 w-full bg-nexus-background rounded-lg p-2 overflow-hidden border border-nexus-border flex items-end">
                  <svg className="w-full h-full" viewBox="0 0 500 150" preserveAspectRatio="none">
                    <path d="M0,130 Q120,110 250,50 T500,20 L500,150 L0,150 Z" fill="url(#chartGrad)" />
                    <path d="M0,130 Q120,110 250,50 T500,20" fill="none" stroke="var(--nx-primary)" strokeWidth="3" />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              2. PESTAÑA: AGENDA DEL STAFF
              ========================================== */}
          {activeTab === 'agenda' && (
            <div className="space-y-4">
              
              {agendaView === 'dia' && (
                <div className="bg-nexus-surface border border-nexus-border rounded-xl overflow-hidden shadow-lg flex flex-col">
                  
                  {}
                  <div className="grid grid-cols-[60px_1fr] border-b border-nexus-border bg-nexus-background">
                    <div className="border-r border-nexus-border flex items-center justify-center p-2.5">
                      <Clock className="w-4 h-4 text-nexus-text-muted" />
                    </div>
                    <div className="overflow-x-auto scrollbar-none">
                      <div className="flex divide-x divide-nexus-border min-w-[700px] md:min-w-full">
                        
                      {filterBarberId === 'all' && (
                          <div className="flex-1 min-w-[150px] py-2 px-3 bg-nexus-primary-soft flex flex-col items-center justify-center gap-0.5 text-nexus-primary font-bold border-r border-nexus-border">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span className="text-[10px] tracking-wider uppercase font-black font-mono font-bold">Pendientes</span>
                            </div>
                            <span className="text-[9px] font-mono font-bold text-nexus-primary/70">{barberDayCounts['pending'] || 0} reservas</span>
                          </div>
                        )}

                        {(branchBarbers || []).filter(b => filterBarberId === 'all' || b?.id === filterBarberId).map(b => (
                          <div key={b?.id} className="flex-1 min-w-[150px] py-2 px-3 flex flex-col items-center justify-center gap-0.5">
                            <div className="flex items-center gap-2">
                              <img src={b?.avatar} alt={b?.name} className="w-7 h-7 rounded-full object-cover border border-nexus-border" />
                              <h5 className="text-[11px] font-bold text-nexus-text truncate">{b?.name}</h5>
                            </div>
                            <span className="text-[9px] font-mono font-bold text-nexus-text-muted">{barberDayCounts[b?.id] || 0} reservas</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-[60px_1fr] relative h-[560px] overflow-y-auto">
                    
                    {currentTimeMinutes >= 480 && currentTimeMinutes <= 1320 && (
                      <div 
                        className="absolute left-0 right-0 border-t-2 border-nexus-error z-10 flex items-center pointer-events-none"
                        style={{ top: `${((currentTimeMinutes - 480) / 840) * 1120}px` }}
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-nexus-error -ml-1" />
                      </div>
                    )}

                    <div className="bg-nexus-surface border-r border-nexus-border divide-y divide-nexus-border">
                    {hoursRange.map(hour => (
                        <div key={hour} className="h-10 px-1.5 flex items-start justify-end pt-1">
                          <span className="font-mono text-[9px] text-nexus-text-muted font-bold">{formatHourLabel(hour)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="overflow-x-auto min-w-[700px] md:min-w-full relative bg-nexus-background">
                      <div className="absolute inset-0 flex divide-x divide-nexus-border">
                        
                        {filterBarberId === 'all' && (
                          <div className="flex-1 relative min-w-[150px] h-full bg-nexus-surface-hover border-r border-nexus-border">
                            {hoursRange.map(hour => (
                              <div 
                                key={hour} 
                                onClick={() => handleEmptySlotClick('pending', formatHourLabel(hour))}
                                className="h-10 w-full hover:bg-nexus-surface-hover cursor-pointer border-b border-nexus-border/50"
                              />
                            ))}

                            {(filteredReservations || []).filter(r => r?.professionalId === 'pending' || r?.barberId === 'pending').map(res => {
                              const [h, m] = (res?.time || '12:00').split(':').map(Number);
                              const startMin = h * 60 + m;
                              const duration = getReservationDuration(res, services);

                              const topPx = ((startMin - 480) / 840) * 1120;
                                const heightPx = (duration / 840) * 1120;

                              return (
                                <div 
                                  key={res?.id}
                                  onClick={(e) => { e.stopPropagation(); handleOpenEditReservation(res); }}
                                  style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                                  className="absolute left-1 right-1 px-2.5 py-1 rounded border shadow bg-nexus-primary-soft border-nexus-primary/40 text-nexus-primary hover:opacity-80 transition-all cursor-pointer flex flex-col justify-between overflow-hidden"
                                >
                                  <div className="min-w-0">
                                    <p className="font-extrabold text-[10px] truncate leading-tight">{res?.clientName}</p>
                                    <p className="text-[9px] truncate text-nexus-text-secondary">{res?.serviceName}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                       {(branchBarbers || []).filter(b => filterBarberId === 'all' || b?.id === filterBarberId).map(barber => {
                          const barberRes = (filteredReservations || []).filter(r => r?.professionalId === barber?.id || r?.barberId === barber?.id);
                          const barberBl = (blockouts || []).filter(bl => bl?.date === selectedDate && bl?.barberId === barber?.id);
                          const barberDayAvailability = getBarberDayAvailability(barber, selectedDate);

                          return (
                            <div key={barber?.id} className="flex-1 relative min-w-[150px] h-full">
                              
                              {hoursRange.map(hour => (
                                isHourWithinAvailability(barberDayAvailability, hour) ? (
                                  <div 
                                    key={hour} 
                                    onClick={() => handleEmptySlotClick(barber?.id, formatHourLabel(hour))}
                                    className="h-10 w-full hover:bg-nexus-surface-hover cursor-pointer border-b border-nexus-border/50"
                                  />
                                ) : (
                                  <div 
                                    key={hour}
                                    className="h-10 w-full bg-nexus-border/30 border-b border-nexus-border/50 cursor-not-allowed"
                                  />
                                )
                              ))}

                              {barberRes.map(res => {
                                const [h, m] = (res?.time || '12:00').split(':').map(Number);
                                const startMin = h * 60 + m;
                                const duration = getReservationDuration(res, services);

                                const topPx = ((startMin - 480) / 840) * 1120;
                                const heightPx = (duration / 840) * 1120;

                                return (
                                  <div 
                                    key={res?.id}
                                    onClick={(e) => { e.stopPropagation(); handleOpenEditReservation(res); }}
                                    style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                                    className={`absolute left-1 right-1 px-2.5 py-1 rounded border shadow-md flex flex-col justify-between overflow-hidden cursor-pointer transition-all z-20 ${getStatusCardClasses(res?.status)}`}
                                  >
                                    <div className="min-w-0">
                                      <p className="font-extrabold text-[10px] truncate leading-tight">{res?.clientName}</p>
                                      <p className="text-[9px] text-nexus-text-secondary truncate">{res?.serviceName}</p>
                                    </div>
                                    <span className="font-mono text-[8px] font-bold text-nexus-text-muted">{res?.time}</span>
                                  </div>
                                );
                              })}

                              {barberBl.map(bl => {
                                const startMin = timeToMin(bl?.startTime);
                                const endMin = timeToMin(bl?.endTime);
                                const duration = endMin - startMin;

                                const topPx = ((startMin - 480) / 840) * 1120;
                                const heightPx = (duration / 840) * 1120;

                                return (
                                  <div 
                                    key={bl?.id}
                                    style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                                    className="absolute left-1 right-1 px-2 py-1 rounded border shadow bg-nexus-error-bg border-nexus-error/30 text-nexus-error-text flex flex-col justify-between overflow-hidden cursor-default z-20"
                                  >
                                    <div className="min-w-0">
                                      <p className="font-extrabold text-[9px] leading-tight flex items-center gap-1">
                                        <XCircle className="w-3 h-3 text-nexus-error shrink-0" />
                                        BLOQUEADO
                                      </p>
                                      <p className="text-[9px] truncate text-nexus-error-text/80">{bl?.reason}</p>
                                    </div>
                                    <div className="flex items-center justify-between text-[8px] text-nexus-text-muted mt-1">
                                      <span>{bl?.startTime} - {bl?.endTime}</span>
                                      <button 
                                        onClick={() => handleDeleteBlockout(bl?.id)}
                                        className="text-nexus-error hover:opacity-80 font-bold underline cursor-pointer"
                                      >
                                        Eliminar
                                      </button>
                                    </div>
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
              )}

              {agendaView === 'semana' && (
                <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                  {getWeekDates(selectedDate).map(day => {
                    const dayRes = (branchReservations || []).filter(r => r?.date === day?.dateStr);
                    return (
                      <div key={day?.dateStr} className="bg-nexus-surface border border-nexus-border rounded-xl p-3 flex flex-col h-72">
                        <div className="border-b border-nexus-border pb-2 mb-2 flex justify-between items-center">
                          <span className="text-xs font-bold text-nexus-text-secondary">{day?.dayName}</span>
                          <span className="w-6 h-6 rounded-full bg-nexus-primary-soft flex items-center justify-center text-xs font-bold text-nexus-primary font-mono">
                            {day?.dayNum}
                          </span>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-1.5 scrollbar-none">
                          {dayRes.map(res => (
                            <div 
                              key={res?.id} 
                              onClick={() => handleOpenEditReservation(res)}
                              className="p-1.5 bg-nexus-background border border-nexus-border rounded text-[10px] cursor-pointer hover:border-nexus-primary transition-colors"
                            >
                              <div className="flex justify-between">
                                <span className="font-extrabold text-nexus-text truncate max-w-[80px]">{res?.clientName}</span>
                                <span className="text-[8px] font-mono text-nexus-primary font-bold">{res?.time}</span>
                              </div>
                              <p className="text-[9px] text-nexus-text-secondary truncate mt-0.5">{res?.serviceName}</p>
                            </div>
                          ))}
                          {dayRes.length === 0 && (
                            <p className="text-[9px] text-nexus-text-muted text-center py-8 font-semibold">Sin citas</p>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setNewReservation(prev => ({ ...prev, date: day?.dateStr }));
                            setActiveModal('add-reservation');
                          }}
                          className="w-full py-1 mt-2 border border-dashed border-nexus-border hover:border-nexus-primary/50 rounded text-[9px] font-bold text-nexus-text-secondary hover:text-nexus-text transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" /> Agregar Cita
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {agendaView === 'mes' && (
                <div className="bg-nexus-surface border border-nexus-border rounded-xl p-4">
                  <div className="grid grid-cols-7 gap-1.5 text-center mb-2">
                    {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, idx) => (
                      <span key={idx} className="text-xs font-bold text-nexus-text-muted py-1">{d}</span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {getMonthDays(selectedDate).map((day, idx) => {
                      const dayRes = day?.isCurrentMonth ? (branchReservations || []).filter(r => r?.date === day?.dateStr) : [];

                      return (
                        <div 
                          key={idx} 
                          onClick={() => {
                            if (day?.isCurrentMonth) {
                              setSelectedDate(day?.dateStr);
                              setAgendaView('dia');
                            }
                          }}
                          className={`h-16 rounded-lg p-1.5 flex flex-col justify-between border ${
                            day?.isCurrentMonth 
                              ? 'bg-nexus-background border-nexus-border hover:border-nexus-primary cursor-pointer' 
                              : 'bg-transparent border-transparent pointer-events-none'
                          }`}
                        >
                          {day?.isCurrentMonth && (
                            <>
                              <span className="text-[10px] font-extrabold text-nexus-text-secondary font-mono">{day?.dayNum}</span>
                              {dayRes.length > 0 && (
                                <span className="text-[9px] bg-nexus-primary-soft text-nexus-primary border border-nexus-primary/20 px-1 rounded self-end font-bold font-mono">
                                  {dayRes.length} C
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

             {agendaView === 'año' && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((m, idx) => {
                    const yearVal = parseDate(selectedDate).getFullYear();
                    const monthId = (idx + 1).toString().padStart(2, '0');
                    const monthRes = (branchReservations || []).filter(r => r?.date?.startsWith(`${yearVal}-${monthId}`));
                    return (
                      <div key={m} className="bg-nexus-surface border border-nexus-border rounded-xl p-4 text-center hover:border-nexus-primary/40 transition-colors cursor-pointer" onClick={() => {
                        const targetDate = `${yearVal}-${monthId}-01`;
                        setSelectedDate(targetDate);
                        setAgendaView('mes');
                      }}>
                        <h4 className="text-xs font-black text-nexus-text uppercase mb-2 tracking-wider font-mono">{m}</h4>
                        <div className="p-4 bg-nexus-background border border-nexus-border rounded-xl inline-block mt-1">
                          <span className="text-base font-black text-nexus-primary font-mono block">{monthRes.length}</span>
                          <span className="text-[8px] text-nexus-text-muted uppercase tracking-widest block mt-0.5 font-mono font-bold">Reservas</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ==========================================
              3. PESTAÑA: LISTADO DE STAFF PROFESIONAL
              ========================================== */}
          {activeTab === 'barbers' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-nexus-surface p-4 border border-nexus-border rounded-xl">
                <div className="relative w-full sm:w-72">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="w-4 h-4 text-nexus-text-muted" />
                  </span>
                  <input 
                    type="text" 
                    placeholder="Buscar profesional por nombre o sucursal..." 
                    value={searchBarberQuery}
                    onChange={(e) => setSearchBarberQuery(e.target.value)}
                    className="w-full bg-nexus-background border border-nexus-border rounded-lg pl-9 pr-3 py-2 text-xs text-nexus-text outline-none focus:border-nexus-primary"
                  />
                </div>
                <button
                  onClick={() => {
                    const staffLimit = getFeatureLimit(planFeatures, 'staff');
                    if (staffLimit !== null && barbers.length >= staffLimit) {
                      triggerToast(`Tu plan permite hasta ${staffLimit} profesionales. Cambia de plan para agregar más.`, 'error');
                      return;
                    }
                    resetBarberForm();
                    setEditingBarberId(null);
                    setActiveModal('add-barber');
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-extrabold rounded-lg text-xs shadow-md flex items-center justify-center gap-1.5 cursor-pointer font-bold"
                >
                  <Plus className="w-4 h-4" />
                  Registrar Profesional
                </button>
              </div>

              <div className="bg-nexus-surface border border-nexus-border rounded-xl overflow-hidden shadow-lg">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-nexus-border bg-nexus-background text-nexus-text-secondary uppercase tracking-wider font-mono text-[10px] font-bold">
                        <th className="p-4">Foto</th>
                        <th className="p-4">Nombre Completo</th>
                        <th className="p-4">Usuario Comercial</th>
                        <th className="p-4">Sucursal</th>
                        <th className="p-4">PIN</th>
                        <th className="p-4 text-center">Estado</th>
                        <th className="p-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-nexus-border">
                      {filteredBarbersList.map(b => (
                        <tr key={b?.id} className="hover:bg-nexus-surface-hover transition-colors">
                          <td className="p-4">
                            <img src={b?.avatar} alt={b?.name} className="w-10 h-10 rounded-xl object-cover border-2 border-nexus-border shadow" />
                          </td>
                          <td className="p-4 font-bold text-nexus-text text-xs">{b?.name}</td>
                          <td className="p-4 font-mono text-nexus-text-secondary">@{b?.username}</td>
                          <td className="p-4 font-semibold text-nexus-text">{b?.branch}</td>
                          <td className="p-4 font-mono font-black text-nexus-primary tracking-widest font-bold">{b?.pin}</td>
                          <td className="p-4 text-center">
                            <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase font-mono border font-bold ${
                              b?.active 
                                ? 'bg-nexus-success-bg text-nexus-success-text border-nexus-success/25' 
                                : 'bg-nexus-error-bg text-nexus-error-text border-nexus-error/25'
                            }`}>
                              {b?.active ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="inline-flex gap-2">
                              <button 
                                onClick={() => handleEditBarber(b)}
                                className="p-1.5 hover:bg-nexus-primary-soft text-nexus-primary rounded-lg transition-colors cursor-pointer"
                                title="Editar Perfil"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDeleteBarber(b?.id)}
                                className="p-1.5 hover:bg-nexus-error-bg text-nexus-error-text rounded-lg transition-colors cursor-pointer"
                                title="Eliminar Perfil"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredBarbersList.length === 0 && (
                        <tr>
                          <td colSpan="7" className="p-8 text-center text-nexus-text-muted">No se encontraron profesionales registrados.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              4. PESTAÑA: SERVICIOS (NEUTROS)
              ========================================== */}
          {activeTab === 'services' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-nexus-surface p-4 border border-nexus-border rounded-xl">
                <h4 className="text-xs font-bold text-nexus-text uppercase tracking-wider font-mono">Tratamientos y Servicios Disponibles</h4>
                <button
                  onClick={() => setActiveModal('add-service')}
                  className="px-4 py-2 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-extrabold rounded-lg text-xs shadow-md flex items-center justify-center gap-1.5 cursor-pointer font-bold"
                >
                  <Plus className="w-4 h-4" />
                  Agregar Servicio
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(services || []).map(s => (
                  <div key={s?.id} className="bg-nexus-surface border border-nexus-border rounded-xl p-4 flex flex-col justify-between shadow-lg relative group overflow-hidden">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <h5 className="font-bold text-nexus-text text-sm">{s?.name}</h5>
                        <button 
                          onClick={() => handleDeleteService(s?.id)}
                          className="p-1 hover:bg-nexus-error-bg text-nexus-error-text rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-nexus-text-muted text-xs mb-3 font-mono">Duración: {s?.duration} minutos</p>
                    </div>
                    <div className="flex justify-between items-center border-t border-nexus-border pt-3 mt-1">
                      <span className="text-xs font-bold text-nexus-text-secondary font-bold">Precio General</span>
                      <span className="text-nexus-primary font-mono font-extrabold text-sm">{s?.price} Bs</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ==========================================
              5. PESTAÑA: CLIENTES
              ========================================== */}
          {activeTab === 'clients' && (
            <div className="space-y-4">
              <div className="bg-nexus-surface p-4 border border-nexus-border rounded-xl">
                <div className="relative w-full sm:w-72">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="w-4 h-4 text-nexus-text-muted" />
                  </span>
                  <input 
                    type="text" 
                    placeholder="Buscar cliente por nombre o teléfono..." 
                    value={searchClientQuery}
                    onChange={(e) => setSearchClientQuery(e.target.value)}
                    className="w-full bg-nexus-background border border-nexus-border rounded-lg pl-9 pr-3 py-2 text-xs text-nexus-text outline-none focus:border-nexus-primary"
                  />
                </div>
              </div>

              <div className="bg-nexus-surface border border-nexus-border rounded-xl overflow-hidden shadow-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-nexus-border bg-nexus-background text-nexus-text-secondary uppercase tracking-wider font-mono text-[10px] font-bold">
                      <th className="p-4">Nombre Completo</th>
                      <th className="p-4">Teléfono</th>
                      <th className="p-4 text-center">Visitas</th>
                      <th className="p-4">Última Visita</th>
                      <th className="p-4">Servicio Favorito</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-nexus-border">
                    {filteredClientsList.map(c => (
                      <tr key={c?.id} className="hover:bg-nexus-surface-hover transition-colors">
                        <td className="p-4 font-bold text-nexus-text text-xs">{c?.name}</td>
                        <td className="p-4 font-mono text-nexus-text-secondary">{c?.phone}</td>
                        <td className="p-4 text-center">
                          <span className="px-2.5 py-0.5 rounded-full bg-nexus-primary-soft text-nexus-primary font-bold font-mono">
                            {c?.visits}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-nexus-text-muted">{c?.lastVisit}</td>
                        <td className="p-4 text-nexus-text-secondary">{c?.favoriteService}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ==========================================
              6. PESTAÑA: SUCURSALES (SOPORTE AVANZADO)
              ========================================== */}
          {activeTab === 'branches' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-nexus-surface p-4 border border-nexus-border rounded-xl">
                <div className="relative w-full sm:w-72">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="w-4 h-4 text-nexus-text-muted" />
                  </span>
                  <input 
                    type="text" 
                    placeholder="Buscar sucursal por dirección..." 
                    value={searchBranchQuery}
                    onChange={(e) => setSearchBranchQuery(e.target.value)}
                    className="w-full bg-nexus-background border border-nexus-border rounded-lg pl-9 pr-3 py-2 text-xs text-nexus-text outline-none"
                  />
                </div>
                <button
                  onClick={() => {
                    const sucursalesLimit = getFeatureLimit(planFeatures, 'sucursales');
                    if (sucursalesLimit !== null && branches.length >= sucursalesLimit) {
                      triggerToast(`Tu plan permite hasta ${sucursalesLimit} sucursales. Cambia de plan para agregar más.`, 'error');
                      return;
                    }
                    setEditingBranchId(null);
                    setNewBranch({ name: '', phone: '', address: '', schedule: '', lat: -17.7732, lng: -63.1821, createdDate: '' });
                    setLocationSearch('');
                    setActiveModal('add-branch');
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-extrabold rounded-lg text-xs shadow-md flex items-center justify-center gap-1.5 cursor-pointer font-bold"
                >
                  <Plus className="w-4 h-4" />
                  Nueva Sucursal
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredBranchesList.map(b => (
                  <div key={b?.id} className="bg-nexus-surface border border-nexus-border rounded-xl p-5 flex flex-col justify-between shadow-lg relative overflow-hidden">
                    <div>
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="text-sm font-extrabold text-nexus-text tracking-tight">{b?.name}</h4>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => handleEditBranch(b)}
                            className="p-1 hover:bg-nexus-primary-soft text-nexus-primary rounded transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleDeleteBranch(b?.id)}
                            className="p-1 hover:bg-nexus-error-bg text-nexus-error-text rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-nexus-text-secondary font-mono mb-2">{b?.phone}</p>
                      <p className="text-xs text-nexus-text-muted leading-relaxed mb-4">{b?.address}</p>
                    </div>
                    <div className="border-t border-nexus-border pt-3 flex justify-between items-center text-[10px] text-nexus-text-muted font-mono font-bold">
                      <span>Coordenadas</span>
                      <span>{b?.lat?.toFixed(3)}, {b?.lng?.toFixed(3)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'inventory' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Navegación de pestañas internas */}
              <div className="flex border-b border-[#1E2442] gap-6">
                <button
                  type="button"
                  onClick={() => setInventoryTab('stock')}
                  className={`pb-3 text-xs font-extrabold tracking-wider uppercase transition-all relative ${
                    inventoryTab === 'stock'
                      ? 'text-indigo-400'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Stock
                  {inventoryTab === 'stock' && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setInventoryTab('ventas')}
                  className={`pb-3 text-xs font-extrabold tracking-wider uppercase transition-all relative ${
                    inventoryTab === 'ventas'
                      ? 'text-indigo-400'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Ventas
                  {inventoryTab === 'ventas' && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
                  )}
                </button>
              </div>

              {/* Contenido dinámico según pestaña activa */}
              {inventoryTab === 'stock' && (
                <div className="space-y-6 animate-fadeIn">
                  {/* Tarjetas Resumen */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-[#0C0E17] border border-[#1B2136] rounded-xl p-4 shadow-lg flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">Productos Totales</span>
                        <h3 className="text-xl font-black text-white font-mono mt-1">42</h3>
                      </div>
                      <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <Package className="w-5 h-5" />
                      </div>
                    </div>

                    <div className="bg-[#0C0E17] border border-[#1B2136] rounded-xl p-4 shadow-lg flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">Stock Total</span>
                        <h3 className="text-xl font-black text-white font-mono mt-1">284 <span className="text-xs text-slate-500 font-normal">uds</span></h3>
                      </div>
                      <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <Sliders className="w-5 h-5" />
                      </div>
                    </div>

                    <div className="bg-[#0C0E17] border border-[#1B2136] rounded-xl p-4 shadow-lg flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">Bajo Stock</span>
                        <h3 className="text-xl font-black text-amber-400 font-mono mt-1">5</h3>
                      </div>
                      <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                        <AlertCircle className="w-5 h-5" />
                      </div>
                    </div>

                    <div className="bg-[#0C0E17] border border-[#1B2136] rounded-xl p-4 shadow-lg flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">Agotados</span>
                        <h3 className="text-xl font-black text-rose-400 font-mono mt-1">2</h3>
                      </div>
                      <div className="w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                        <XCircle className="w-5 h-5" />
                      </div>
                    </div>
                  </div>

                  {/* Barra Superior */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#0C0E17] p-4 border border-[#1B2136] rounded-xl">
                    <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                      <div className="relative w-full sm:w-64">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Search className="w-4 h-4 text-slate-500" />
                        </span>
                        <input 
                          type="text" 
                          placeholder="Buscar producto..." 
                          className="w-full bg-[#131728] border border-[#232B4C] rounded-lg pl-9 pr-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                        />
                      </div>
                      <select 
                        className="bg-[#131728] border border-[#232B4C] rounded-lg px-3 py-2 text-xs text-slate-300 outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        <option value="all">Todas las categorías</option>
                        <option value="capilar">Cuidado Capilar</option>
                        <option value="fijacion">Fijación</option>
                        <option value="limpieza">Limpieza</option>
                        <option value="cosmeticos">Cosméticos</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowNewProductPanel(true)}
                      className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-700 hover:from-indigo-400 hover:to-indigo-600 text-white font-extrabold rounded-lg text-xs shadow-md flex items-center justify-center gap-1.5 cursor-pointer font-bold transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      Nuevo Producto
                    </button>
                  </div>

                  {/* Modal de Nuevo Producto (Centrado y Simple) */}
                  {showNewProductPanel && (
                    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                      <div className="bg-[#0C0E17] border border-[#232A4C] rounded-2xl w-full max-w-xl p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-thin animate-fadeIn">
                        <div className="border-b border-[#1A1F36] pb-3 flex justify-between items-center mb-4">
                          <div>
                            <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Nuevo Producto</h4>
                            <p className="text-[10px] text-slate-400 mt-0.5">Registre las especificaciones y niveles de stock mínimo.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowNewProductPanel(false)}
                            className="text-slate-400 hover:text-white"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="space-y-4">
                          {/* Sección: Información Básica */}
                          <div className="space-y-3">
                            <h5 className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider font-mono border-b border-[#1E2442] pb-1">Información Básica</h5>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] text-slate-400 font-bold block mb-1">Nombre del producto *</label>
                                <input 
                                  type="text" 
                                  placeholder="Ej. Gel Modelador Premium"
                                  value={newProductForm.name}
                                  onChange={(e) => setNewProductForm({...newProductForm, name: e.target.value})}
                                  className="w-full bg-[#131728] border border-[#232B4C] rounded-lg p-2.5 text-xs text-white outline-none focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-400 font-bold block mb-1">Categoría *</label>
                                <div className="flex gap-2">
                                  <select 
                                    value={newProductForm.category}
                                    onChange={(e) => setNewProductForm({...newProductForm, category: e.target.value})}
                                    className="flex-1 bg-[#131728] border border-[#232B4C] rounded-lg p-2.5 text-xs text-slate-300 outline-none focus:border-indigo-500 cursor-pointer"
                                  >
                                    <option value="capilar">Cuidado Capilar</option>
                                    <option value="fijacion">Fijación</option>
                                    <option value="limpieza">Limpieza</option>
                                    <option value="cosmeticos">Cosméticos</option>
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => triggerToast("Función para crear categoría en desarrollo", "info")}
                                    className="px-2.5 bg-indigo-950 hover:bg-indigo-900 border border-indigo-500/20 rounded-lg text-[10px] font-bold text-indigo-400 whitespace-nowrap transition-colors"
                                  >
                                    Nueva
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] text-slate-400 font-bold block mb-1">SKU (Código interno)</label>
                                <input 
                                  type="text" 
                                  placeholder="Ej. GALLY-CAP-01"
                                  value={newProductForm.sku}
                                  onChange={(e) => setNewProductForm({...newProductForm, sku: e.target.value})}
                                  className="w-full bg-[#131728] border border-[#232B4C] rounded-lg p-2.5 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-400 font-bold block mb-1">Tipo de producto</label>
                                <select 
                                  value={newProductForm.type}
                                  onChange={(e) => setNewProductForm({...newProductForm, type: e.target.value})}
                                  className="w-full bg-[#131728] border border-[#232B4C] rounded-lg p-2.5 text-xs text-slate-300 outline-none focus:border-indigo-500 cursor-pointer"
                                >
                                  <option value="venta">Producto para venta</option>
                                  <option value="insumo">Insumo interno</option>
                                  <option value="ambos">Ambos</option>
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="text-[10px] text-slate-400 font-bold block mb-1">Descripción</label>
                              <textarea 
                                rows="2"
                                placeholder="Escriba los detalles o componentes del producto..."
                                value={newProductForm.description}
                                onChange={(e) => setNewProductForm({...newProductForm, description: e.target.value})}
                                className="w-full bg-[#131728] border border-[#232B4C] rounded-lg p-2.5 text-xs text-white outline-none focus:border-indigo-500 resize-none"
                              />
                            </div>
                          </div>

                          {/* Sección: Inventario */}
                          <div className="space-y-3 pt-1">
                            <h5 className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider font-mono border-b border-[#1E2442] pb-1">Inventario & Precios</h5>
                            
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <label className="text-[10px] text-slate-400 font-bold block mb-1">Precio Venta (Bs)</label>
                                <input 
                                  type="number" 
                                  placeholder="120"
                                  value={newProductForm.price}
                                  onChange={(e) => setNewProductForm({...newProductForm, price: Number(e.target.value)})}
                                  className="w-full bg-[#131728] border border-[#232B4C] rounded-lg p-2.5 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-400 font-bold block mb-1">Stock inicial</label>
                                <input 
                                  type="number" 
                                  placeholder="0"
                                  value={newProductForm.stock}
                                  onChange={(e) => setNewProductForm({...newProductForm, stock: Number(e.target.value)})}
                                  className="w-full bg-[#131728] border border-[#232B4C] rounded-lg p-2.5 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-400 font-bold block mb-1">Stock mínimo</label>
                                <input 
                                  type="number" 
                                  placeholder="5"
                                  value={newProductForm.minStock}
                                  onChange={(e) => setNewProductForm({...newProductForm, minStock: Number(e.target.value)})}
                                  className="w-full bg-[#131728] border border-[#232B4C] rounded-lg p-2.5 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end gap-2.5 pt-4 mt-5 border-t border-[#1E2442]/50">
                          <button 
                            type="button" 
                            onClick={() => setShowNewProductPanel(false)} 
                            className="px-4 py-2 bg-[#1A1F36] border border-[#232B4A] text-slate-300 text-xs font-semibold rounded-lg hover:bg-[#252B4E] transition-colors cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button 
                            type="button" 
                            onClick={handleSaveProduct}
                            className="px-5 py-2 bg-gradient-to-r from-indigo-500 to-indigo-700 text-white text-xs font-bold rounded-lg shadow-md transition-all cursor-pointer font-bold"
                          >
                            Guardar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tabla de Productos */}
                  <div className="bg-[#0C0E17] border border-[#1B2136] rounded-xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[#1B2136] bg-[#0E111E] text-slate-400 uppercase tracking-wider font-mono text-[10px] font-bold">
                            <th className="p-4">Imagen</th>
                            <th className="p-4">Producto</th>
                            <th className="p-4">Categoría</th>
                            <th className="p-4">Stock</th>
                            <th className="p-4 text-right">Precio Venta</th>
                            <th className="p-4 text-center">Estado</th>
                            <th className="p-4 text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1B2136]/40">
                          {products.map(product => (
                            <tr key={product.id} className="hover:bg-[#12162B]/35 transition-colors">
                              <td className="p-4">
                                <img src={product.image} alt={product.name} className="w-10 h-10 rounded-lg object-cover border border-[#1E2442] shadow" />
                              </td>
                              <td className="p-4 font-bold text-white text-xs">{product.name}</td>
                              <td className="p-4 text-slate-300">{product.category}</td>
                              <td className="p-4 font-mono font-bold text-slate-200">{product.stock} uds</td>
                              <td className="p-4 text-right font-mono font-bold text-indigo-400">{product.price} Bs</td>
                              <td className="p-4 text-center">
                                <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase font-mono border font-bold ${
                                  product.status === 'Disponible' 
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' 
                                    : product.status === 'Bajo Stock'
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/25 animate-pulse'
                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                                }`}>
                                  {product.status}
                                </span>
                              </td>
                              <td className="p-4 text-right">
                                <div className="inline-flex gap-2">
                                  <button 
                                    type="button"
                                    onClick={() => triggerToast('Edición en construcción', 'success')}
                                    className="p-1.5 hover:bg-indigo-500/10 text-indigo-400 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={() => {
                                      setProducts(products.filter(p => p.id !== product.id));
                                      triggerToast('¡Producto eliminado!');
                                    }}
                                    className="p-1.5 hover:bg-rose-500/10 text-rose-400 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Módulo de Ventas Ampliado */}
              {inventoryTab === 'ventas' && (
                <div className="space-y-6 animate-fadeIn">

                  {/* Tarjetas Resumen e Ingresos */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-center">
                    <div className="bg-[#0C0E17] border border-[#1B2136] rounded-xl p-4 shadow-lg flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">Ventas del día</span>
                        <h3 className="text-xl font-black text-white font-mono mt-1">{todaySalesMetrics.count}</h3>
                      </div>
                      <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <Package className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="bg-[#0C0E17] border border-[#1B2136] rounded-xl p-4 shadow-lg flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">Ingresos del día</span>
                        <h3 className="text-xl font-black text-white font-mono mt-1">{todaySalesMetrics.totalIncome} Bs</h3>
                      </div>
                      <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <DollarSign className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="flex justify-end w-full lg:w-auto">
                      <button
                        type="button"
                        onClick={() => setShowSaleModal(true)}
                        className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-700 hover:from-indigo-400 hover:to-indigo-600 text-white font-extrabold rounded-lg text-xs shadow-md flex items-center justify-center gap-1.5 cursor-pointer font-bold transition-all"
                      >
                        <Plus className="w-4 h-4" />
                        Nueva Venta
                      </button>
                    </div>
                  </div>

                  {/* Modal Nueva Venta */}
                  {showSaleModal && (
                    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                      <div className="bg-[#0C0E17] border border-[#232A4C] rounded-2xl w-full max-w-2xl p-6 relative shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-thin animate-fadeIn">

                        {/* Cabecera */}
                        <div className="border-b border-[#1A1F36] pb-3 flex justify-between items-center mb-5">
                          <div>
                            <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Nueva Venta</h4>
                            <p className="text-[10px] text-slate-400 mt-0.5">Registra los productos vendidos y el método de pago.</p>
                          </div>
                          <button type="button" onClick={() => setShowSaleModal(false)} className="text-slate-400 hover:text-white transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="space-y-5">

                          {/* ── Sección 1: Datos generales ── */}
                          <div className="space-y-3">
                            <h5 className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider font-mono border-b border-[#1E2442] pb-1">Datos Generales</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] text-slate-400 font-bold block mb-1">Fecha *</label>
                                <input
                                  type="date"
                                  value={saleForm.date}
                                  onChange={e => setSaleForm(p => ({ ...p, date: e.target.value }))}
                                  className="w-full bg-[#131728] border border-[#232B4C] rounded-lg p-2.5 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-400 font-bold block mb-1">Cliente (opcional)</label>
                                <select
                                  value={saleForm.clientName}
                                  onChange={e => setSaleForm(p => ({ ...p, clientName: e.target.value }))}
                                  className="w-full bg-[#131728] border border-[#232B4C] rounded-lg p-2.5 text-xs text-slate-300 outline-none focus:border-indigo-500 cursor-pointer"
                                >
                                  <option value="">Cliente general</option>
                                  {clients.map(c => (
                                    <option key={c.id} value={c.name}>{c.name}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>

                          {/* ── Sección 2: Productos ── */}
                          <div className="space-y-3">
                            <h5 className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider font-mono border-b border-[#1E2442] pb-1">Productos</h5>

                            <div className="space-y-2">
                              {/* Encabezado columnas */}
                              <div className="grid grid-cols-12 gap-2 px-1">
                                <span className="col-span-5 text-[9px] text-slate-500 font-bold uppercase tracking-wider">Producto</span>
                                <span className="col-span-2 text-[9px] text-slate-500 font-bold uppercase tracking-wider">Cantidad</span>
                                <span className="col-span-2 text-[9px] text-slate-500 font-bold uppercase tracking-wider">Precio</span>
                                <span className="col-span-2 text-[9px] text-slate-500 font-bold uppercase tracking-wider">Subtotal</span>
                                <span className="col-span-1" />
                              </div>

                              {saleForm.items.map((item, index) => (
                                <div key={index} className="grid grid-cols-12 gap-2 items-center bg-[#0E111E] border border-[#1E2442] rounded-lg p-2">
                                  {/* Selector producto */}
                                  <div className="col-span-5">
                                    <select
                                      value={item.productId}
                                      onChange={e => updateSaleItem(index, 'productId', e.target.value)}
                                      className="w-full bg-[#131728] border border-[#232B4C] rounded-lg p-2 text-xs text-slate-300 outline-none focus:border-indigo-500 cursor-pointer"
                                    >
                                      <option value="">— Seleccionar —</option>
                                      {products.filter(p => p.stock > 0).map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  {/* Cantidad */}
                                  <div className="col-span-2">
                                    <input
                                      type="number"
                                      min="1"
                                      value={item.qty}
                                      onChange={e => updateSaleItem(index, 'qty', e.target.value)}
                                      className="w-full bg-[#131728] border border-[#232B4C] rounded-lg p-2 text-xs text-white outline-none focus:border-indigo-500 font-mono text-center"
                                    />
                                  </div>
                                  {/* Precio (solo lectura) */}
                                  <div className="col-span-2">
                                    <input
                                      type="text"
                                      readOnly
                                      value={item.price ? `${item.price} Bs` : '—'}
                                      className="w-full bg-[#0C0E17] border border-[#1B2136] rounded-lg p-2 text-xs text-slate-400 font-mono text-center cursor-default"
                                    />
                                  </div>
                                  {/* Subtotal (solo lectura) */}
                                  <div className="col-span-2">
                                    <input
                                      type="text"
                                      readOnly
                                      value={item.subtotal ? `${item.subtotal} Bs` : '—'}
                                      className="w-full bg-[#0C0E17] border border-[#1B2136] rounded-lg p-2 text-xs text-emerald-400 font-mono font-bold text-center cursor-default"
                                    />
                                  </div>
                                  {/* Eliminar fila */}
                                  <div className="col-span-1 flex justify-center">
                                    <button
                                      type="button"
                                      onClick={() => removeSaleItem(index)}
                                      disabled={saleForm.items.length === 1}
                                      className="text-slate-600 hover:text-red-400 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>

                            <button
                              type="button"
                              onClick={addSaleItem}
                              className="flex items-center gap-1.5 text-[10px] text-indigo-400 hover:text-indigo-300 font-bold transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" /> Agregar producto
                            </button>

                            {/* Total */}
                            <div className="flex justify-end pt-2 border-t border-[#1E2442]/50">
                              <div className="bg-[#131728] border border-[#232B4C] rounded-xl px-5 py-3 flex items-center gap-4">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total venta</span>
                                <span className="text-xl font-black text-emerald-400 font-mono">{saleTotal} Bs</span>
                              </div>
                            </div>
                          </div>

                          {/* ── Sección 3: Pago y estado ── */}
                          <div className="space-y-3">
                            <h5 className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider font-mono border-b border-[#1E2442] pb-1">Pago & Estado</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {/* Método de pago */}
                              <div>
                                <label className="text-[10px] text-slate-400 font-bold block mb-1.5">Método de pago *</label>
                                <div className="grid grid-cols-2 gap-2">
                                  {['Efectivo', 'Tarjeta', 'QR/Transferencia', 'Pendiente'].map(m => (
                                    <button
                                      key={m}
                                      type="button"
                                      onClick={() => setSaleForm(p => ({ ...p, paymentMethod: m }))}
                                      className={`px-3 py-2 rounded-lg text-[10px] font-bold border transition-all ${
                                        saleForm.paymentMethod === m
                                          ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                                          : 'bg-[#131728] border-[#232B4C] text-slate-400 hover:border-indigo-500/50'
                                      }`}
                                    >
                                      {m}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {/* Estado */}
                              <div>
                                <label className="text-[10px] text-slate-400 font-bold block mb-1.5">Estado de la venta *</label>
                                <div className="grid grid-cols-3 gap-2">
                                  {[
                                    { label: 'Pagado',   color: 'emerald' },
                                    { label: 'Pendiente', color: 'amber' },
                                    { label: 'Anulado',  color: 'red' },
                                  ].map(({ label, color }) => (
                                    <button
                                      key={label}
                                      type="button"
                                      onClick={() => setSaleForm(p => ({ ...p, status: label }))}
                                      className={`px-3 py-2 rounded-lg text-[10px] font-bold border transition-all ${
                                        saleForm.status === label
                                          ? `bg-${color}-500/15 border-${color}-500/50 text-${color}-400`
                                          : 'bg-[#131728] border-[#232B4C] text-slate-400 hover:border-slate-500'
                                      }`}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* ── Sección 4: Observaciones ── */}
                          <div className="space-y-3">
                            <h5 className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider font-mono border-b border-[#1E2442] pb-1">Observaciones</h5>
                            <textarea
                              rows="2"
                              placeholder="Notas internas sobre la venta (opcional)..."
                              value={saleForm.notes}
                              onChange={e => setSaleForm(p => ({ ...p, notes: e.target.value }))}
                              className="w-full bg-[#131728] border border-[#232B4C] rounded-lg p-2.5 text-xs text-white outline-none focus:border-indigo-500 resize-none"
                            />
                          </div>

                        </div>

                        {/* Botones */}
                        <div className="flex justify-end gap-2.5 pt-4 mt-5 border-t border-[#1E2442]/50">
                          <button
                            type="button"
                            onClick={() => setShowSaleModal(false)}
                            className="px-4 py-2 bg-[#1A1F36] border border-[#232B4A] text-slate-300 text-xs font-semibold rounded-lg hover:bg-[#252B4E] transition-colors cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveSale}
                            className="px-5 py-2 bg-gradient-to-r from-indigo-500 to-indigo-700 hover:from-indigo-400 hover:to-indigo-600 text-white text-xs font-bold rounded-lg shadow-md transition-all cursor-pointer"
                          >
                            Registrar venta
                          </button>
                        </div>

                      </div>
                    </div>
                  )}

                  {/* Tabla de Ventas */}
                  <div className="bg-[#0C0E17] border border-[#1B2136] rounded-xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[#1B2136] bg-[#0E111E] text-slate-400 uppercase tracking-wider font-mono text-[10px] font-bold">
                            <th className="p-4">Fecha</th>
                            <th className="p-4">Cliente</th>
                            <th className="p-4">Productos</th>
                            <th className="p-4">Total</th>
                            <th className="p-4">Método de Pago</th>
                            <th className="p-4 text-center">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1B2136]/40">
                          {sales.length === 0 ? (
                            <tr>
                              <td colSpan="6" className="p-12 text-center text-slate-500 font-medium">
                                <div className="flex flex-col items-center justify-center space-y-2">
                                  <TrendingUp className="w-8 h-8 text-slate-600 opacity-40" />
                                  <span className="text-xs">No existen ventas registradas</span>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            sales.map(sale => (
                              <tr key={sale.id} className="hover:bg-[#12162B]/35 transition-colors">
                                <td className="p-4 text-slate-300 font-mono">{sale.date}</td>
                                <td className="p-4 text-white font-semibold">{sale.clientName}</td>
                                <td className="p-4 text-slate-300">
                                  {sale.items.map((it, i) => (
                                    <span key={i} className="block">{it.productName} ×{it.qty}</span>
                                  ))}
                                </td>
                                <td className="p-4 text-emerald-400 font-black font-mono">{sale.total} Bs</td>
                                <td className="p-4 text-slate-300">{sale.paymentMethod}</td>
                                <td className="p-4 text-center">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    sale.status === 'Pagado' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                    sale.status === 'Pendiente' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                    'bg-red-500/10 text-red-400 border border-red-500/20'
                                  }`}>
                                    {sale.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              )}

            </div>
          )}

          {/* ==========================================
              7. PESTAÑA: COMISIONES DEL STAFF
              ========================================== */}
          {activeTab === 'commissions' && (
            <div className="space-y-4">
              <div className="bg-nexus-surface border border-nexus-border rounded-xl overflow-hidden shadow-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-nexus-border bg-nexus-background text-nexus-text-secondary uppercase tracking-wider font-mono text-[10px] font-bold">
                      <th className="p-4">Profesional</th>
                      <th className="p-4 text-right">Servicios</th>
                      <th className="p-4 text-right">Comisión Total</th>
                      <th className="p-4 text-right">Pagada</th>
                      <th className="p-4 text-right">Pendiente</th>
                      <th className="p-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-nexus-border">
                    {barberCommissionsList.map(barb => (
                      <tr key={barb?.id} className="hover:bg-nexus-surface-hover transition-colors">
                        <td className="p-4 flex items-center gap-2.5">
                          <img src={barb?.avatar} alt={barb?.name} className="w-8 h-8 rounded-full object-cover border border-nexus-border" />
                          <span className="font-bold text-nexus-text">{barb?.name}</span>
                        </td>
                        <td className="p-4 text-right font-mono text-nexus-text-secondary">{barb?.serviciosCount}</td>
                        <td className="p-4 text-right font-mono font-black text-nexus-primary text-sm font-bold">{formatBs(barb?.comisionTotal)}</td>
                        <td className="p-4 text-right font-mono font-bold text-nexus-success-text">{formatBs(barb?.comisionPagada)}</td>
                        <td className="p-4 text-right font-mono font-bold text-nexus-error-text">{formatBs(barb?.comisionPendiente)}</td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setCommissionDetailBarberId(barb?.id)}
                              className="px-3 py-1.5 rounded-lg bg-nexus-background border border-nexus-border text-nexus-text-secondary text-[10px] font-bold uppercase tracking-wide hover:bg-nexus-surface-hover transition-colors"
                            >
                              Ver Detalle
                            </button>
                            <button
                              onClick={() => handleLiquidarComisiones(barb)}
                              disabled={!(barb?.comisionPendiente > 0)}
                              className="px-3 py-1.5 rounded-lg bg-nexus-primary text-white text-[10px] font-bold uppercase tracking-wide hover:bg-nexus-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Liquidar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {barberCommissionsList.length === 0 && (
                      <tr>
                        <td colSpan="6" className="p-8 text-center text-nexus-text-muted">Sin profesionales asignados en esta sucursal.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {commissionDetailBarberId && (() => {
                const detailBarber = barberCommissionsList.find(b => b?.id === commissionDetailBarberId);
                if (!detailBarber) return null;
                return (
                  <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-nexus-surface border border-nexus-border rounded-2xl w-full max-w-lg p-5 relative shadow-xl max-h-[80vh] flex flex-col">
                      <button
                        onClick={() => setCommissionDetailBarberId(null)}
                        className="absolute top-3 right-3 text-nexus-text-muted hover:text-nexus-text"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      <h3 className="text-base font-bold text-nexus-text mb-1">Detalle de Comisiones</h3>
                      <p className="text-xs text-nexus-text-secondary mb-4">{detailBarber?.name}</p>
                      <div className="overflow-y-auto space-y-2 pr-1">
                        {(detailBarber?.detalle || []).map(item => (
                          <div key={item.id} className="flex items-center justify-between bg-nexus-background border border-nexus-border rounded-lg p-3">
                            <div>
                              <p className="text-xs font-bold text-nexus-text">{item.serviceName}</p>
                              <p className="text-[10px] text-nexus-text-secondary font-mono">{item.date}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-mono font-black text-nexus-primary">{formatBs(item.amount)}</p>
                              <span className={`text-[9px] font-bold uppercase tracking-wide ${item.paid ? 'text-nexus-success-text' : 'text-nexus-error-text'}`}>
                                {item.paid ? 'Pagada' : 'Pendiente'}
                              </span>
                            </div>
                          </div>
                        ))}
                        {(detailBarber?.detalle || []).length === 0 && (
                          <p className="text-center text-nexus-text-muted text-xs py-6">Sin servicios completados en este periodo.</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ==========================================
              8. PESTAÑA: ASISTENCIAS
              ========================================== */}
          {activeTab === 'assistance' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-nexus-surface p-4 border border-nexus-border rounded-xl">
                <h4 className="text-xs font-bold text-nexus-text uppercase tracking-wider font-mono">Control Biométrico de Asistencias</h4>
                <button
                  onClick={() => setActiveModal('assistance')}
                  className="px-4 py-2 bg-nexus-primary text-white font-extrabold rounded-lg text-xs shadow-md cursor-pointer font-bold"
                >
                  Marcar PIN Asistencia
                </button>
              </div>

              <div className="bg-nexus-surface border border-nexus-border rounded-xl overflow-hidden shadow-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-nexus-border bg-nexus-background text-nexus-text-secondary uppercase tracking-wider font-mono text-[10px] font-bold">
                      <th className="p-4">Profesional</th>
                      <th className="p-4 text-center">Asistido</th>
                      <th className="p-4 text-center">Retrasos</th>
                      <th className="p-4 text-center">A Tiempo</th>
                      <th className="p-4 text-center">Faltas</th>
                      <th className="p-4 text-right">Hoy (Entrada / Salida)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-nexus-border">
                    {attendanceSummaryList.map(barb => (
                      <tr key={barb?.id} className="hover:bg-nexus-surface-hover transition-colors">
                        <td className="p-4 flex items-center gap-2.5">
                          <img src={barb?.avatar} alt={barb?.name} className="w-8 h-8 rounded-full object-cover border border-nexus-border" />
                          <span className="font-bold text-nexus-text">{barb?.name}</span>
                        </td>
                        <td className="p-4 text-center font-mono font-bold text-nexus-text">{barb?.attended} días</td>
                        <td className="p-4 text-center font-mono text-nexus-error-text font-bold">{barb?.delayed} días</td>
                        <td className="p-4 text-center font-mono text-nexus-primary font-bold">{barb?.ontime} días</td>
                        <td className="p-4 text-center font-mono text-nexus-text-muted">{barb?.absent} días</td>
                        <td className="p-4 text-right font-mono text-xs">
                          {barb?.attendance?.in ? (
                            <span className="text-nexus-primary font-bold">{barb?.attendance?.in}</span>
                          ) : (
                            <span className="text-nexus-text-muted">--:--</span>
                          )}
                          <span className="text-nexus-text-muted mx-1.5">/</span>
                          {barb?.attendance?.out ? (
                            <span className="text-nexus-primary font-bold">{barb?.attendance?.out}</span>
                          ) : (
                            <span className="text-nexus-text-muted">--:--</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ==========================================
              9. PESTAÑA: ANALÍTICAS
              ========================================== */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-nexus-surface border border-nexus-border rounded-xl p-5 shadow-lg">
                  <h4 className="text-xs font-bold text-nexus-text uppercase tracking-wider font-mono mb-4">Servicios Más Rentables</h4>
                  <div className="space-y-3.5">
                    {(services || []).slice(0, 4).map((s, idx) => {
                      const percentages = [85, 65, 45, 25];
                      return (
                        <div key={s?.id}>
                          <div className="flex justify-between items-center text-xs mb-1">
                            <span className="text-nexus-text-secondary font-semibold">{s?.name}</span>
                            <span className="text-nexus-primary font-mono font-bold">{percentages[idx]}% de ventas</span>
                          </div>
                          <div className="w-full bg-nexus-background h-2 rounded-full overflow-hidden">
                            <div className="bg-nexus-primary h-full rounded-full" style={{ width: `${percentages[idx]}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-nexus-surface border border-nexus-border rounded-xl p-5 shadow-lg">
                  <h4 className="text-xs font-bold text-nexus-text uppercase tracking-wider font-mono mb-4">Canales de Reserva (%)</h4>
                  <div className="relative h-44 w-full flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-3xl font-black text-nexus-primary font-mono">75%</p>
                      <p className="text-[10px] text-nexus-text-muted uppercase tracking-widest font-mono font-bold">Reserva Online</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
            activeSection={settingsSection}
            whatsappSettings={whatsappSettings}
            setWhatsappSettings={setWhatsappSettings}
            automationLogs={automationLogs}
            toggleWhatsAppConnection={toggleWhatsAppConnection}
            handleTestTriggerMessage={handleTestTriggerMessage}
          />
          )}

        </div>

        <footer className="py-4 px-6 border-t border-nexus-border bg-nexus-background flex flex-col sm:flex-row items-center justify-between text-[10px] text-nexus-text-muted gap-2.5 font-mono">
        <p>© 2026 GallyCorp Inc. Plataforma SaaS de Control & Reservas.</p>
      </footer>

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
            // ciclo de render extra:
            handleCreateReservationFromDraft(draft);
          }}
        />
      )}

      {/* 2. MODAL EDITAR / MODIFICAR RESERVACIÓN */}
      {activeModal === 'edit-reservation' && editingReservation && (
        <AppointmentManageModal
          appointment={editingReservation}
          role="admin"
          services={services}
          professionals={branchBarbers}
          onClose={() => setActiveModal(null)}
          onChangeField={(field, value) => {
            if (field === 'professionalId') {
              setEditingReservation(prev => ({ ...prev, professionalId: value, barberId: value }));
            } else {
              setEditingReservation(prev => ({ ...prev, [field]: value }));
            }
          }}
          onSubmit={handleUpdateReservation}
          onDelete={handleDeleteReservation}
          onTransition={(nextStatus) => handleUpdateStatus(editingReservation?.id, nextStatus)}
        />
      )}

      {/* 3. MODAL EXCLUSIVO: BLOQUEAR HORARIO ADMINISTRATIVO */}
      {activeModal === 'add-blockout' && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-nexus-surface border border-nexus-border rounded-2xl w-full max-w-sm p-5 relative shadow-xl">
            <h3 className="text-base font-bold text-nexus-error-text mb-1 font-mono">Bloquear Horario Administrativo</h3>
            <p className="text-[10px] text-nexus-text-secondary mb-4">Evita que se agenden reservas en este rango de tiempo.</p>

            <form onSubmit={handleCreateBlockout} className="space-y-3.5">
              <div>
                <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1 font-sans">Profesional Staff *</label>
                <select 
                  required
                  value={blockoutForm.barberId}
                  onChange={(e) => setBlockoutForm(prev => ({ ...prev, barberId: e.target.value }))}
                  className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2.5 text-xs text-nexus-text outline-none"
                >
                  <option value="">Seleccione Profesional...</option>
                  {(branchBarbers || []).filter(b => b?.active).map(b => (
                    <option key={b?.id} value={b?.id}>{b?.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1 uppercase tracking-wider">Motivo / Razón del Bloqueo *</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej. Limpieza, Almuerzo, Reunión"
                  value={blockoutForm.reason}
                  onChange={(e) => setBlockoutForm(prev => ({ ...prev, reason: e.target.value }))}
                  className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2.5 text-xs text-nexus-text outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1">Hora Inicio *</label>
                  <input 
                    type="time" 
                    required
                    value={blockoutForm.startTime}
                    onChange={(e) => setBlockoutForm(prev => ({ ...prev, startTime: e.target.value }))}
                    className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2 text-xs text-nexus-text outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1">Hora Fin *</label>
                  <input 
                    type="time" 
                    required
                    value={blockoutForm.endTime}
                    onChange={(e) => setBlockoutForm(prev => ({ ...prev, endTime: e.target.value }))}
                    className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2 text-xs text-nexus-text outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button 
                  type="button" 
                  onClick={() => setActiveModal(null)}
                  className="px-3.5 py-1.5 bg-nexus-surface border border-nexus-border text-nexus-text-secondary text-xs font-semibold rounded-lg hover:bg-nexus-surface-hover cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-3.5 py-1.5 bg-nexus-error text-white text-xs font-bold rounded-lg hover:opacity-90 cursor-pointer"
                >
                  Bloquear Horario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. MODAL CONTEXTUAL: ACCIONES AL CLICAR ESPACIO VACÍO */}
      {activeModal === 'slot-actions' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-nexus-surface border border-nexus-border rounded-2xl w-full max-w-xs p-5 relative shadow-xl text-center">
            <h4 className="text-sm font-bold text-nexus-text mb-1">Gestión de Horario</h4>
            <p className="text-[10px] text-nexus-text-secondary font-mono mb-4">Bloque: {clickedSlot?.time} ({selectedDate})</p>

            <div className="space-y-2">
              <button 
                onClick={startResFromSlot}
                className="w-full py-2 bg-nexus-primary hover:bg-nexus-primary-hover text-white text-xs font-bold rounded-lg transition-all cursor-pointer"
              >
                Crear nueva reserva
              </button>
              <button 
                onClick={startBlockoutFromSlot}
                className="w-full py-2 bg-nexus-surface border border-nexus-border hover:bg-nexus-surface-hover text-nexus-error-text text-xs font-bold rounded-lg transition-all cursor-pointer"
              >
                Bloquear este espacio
              </button>
              <button 
                onClick={() => setActiveModal(null)}
                className="w-full py-1.5 text-nexus-text-muted hover:text-nexus-text-secondary text-[10px] font-bold cursor-pointer"
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
      {activeModal === 'add-barber' && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-nexus-surface border border-nexus-border rounded-2xl w-full max-w-4xl p-0 relative shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="bg-nexus-background border-b border-nexus-border px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold text-nexus-text tracking-tight flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-nexus-primary" />
                  {editingBarberId ? 'Editar Perfil del Profesional' : 'Registrar Nuevo Profesional'}
                </h3>
                <p className="text-[10px] text-nexus-text-secondary">Complete los pasos para configurar el perfil profesional del staff.</p>
              </div>

              <div className="flex items-center gap-2.5 font-mono text-[11px] self-stretch md:self-auto justify-between md:justify-start">
                <button 
                  type="button"
                  onClick={() => setBarberStep(1)}
                  className={`px-3 py-1 rounded-md font-bold transition-all flex items-center gap-1.5 ${
                    barberStep === 1 
                      ? 'bg-nexus-primary text-white shadow-md' 
                      : 'bg-nexus-surface text-nexus-text-secondary hover:text-nexus-text'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-black/10 flex items-center justify-center text-[9px] font-black">1</span>
                  Básico
                </button>
                <div className="w-6 h-[1.5px] bg-nexus-border hidden sm:block" />
                <button 
                  type="button"
                  onClick={() => {
                    if (validateStep1()) {
                      setBarberStep(2);
                    }
                  }}
                  className={`px-3 py-1 rounded-md font-bold transition-all flex items-center gap-1.5 ${
                    barberStep === 2 
                      ? 'bg-nexus-primary text-white shadow-md' 
                      : 'bg-nexus-surface text-nexus-text-secondary hover:text-nexus-text'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-black/10 flex items-center justify-center text-[9px] font-black">2</span>
                  Servicios
                </button>
                <div className="w-6 h-[1.5px] bg-nexus-border hidden sm:block" />
                <button 
                  type="button"
                  onClick={() => {
                    if (validateStep1()) {
                      setBarberStep(3);
                    }
                  }}
                  className={`px-3 py-1 rounded-md font-bold transition-all flex items-center gap-1.5 ${
                    barberStep === 3 
                      ? 'bg-nexus-primary text-white shadow-md' 
                      : 'bg-nexus-surface text-nexus-text-secondary hover:text-nexus-text'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-black/10 flex items-center justify-center text-[9px] font-black">3</span>
                  Disponibilidad
                </button>
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
                    <span className="text-[10px] text-nexus-text-secondary uppercase tracking-widest font-mono font-bold block mb-1">Fotografía del Staff</span>
                    <div className="relative">
                      <img 
                        src={newBarber.avatar} 
                        alt="Preview Avatar" 
                        className="w-32 h-32 rounded-xl object-cover border-4 border-nexus-border group-hover:border-nexus-primary transition-all duration-300 shadow-md"
                      />
                      <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Upload className="w-6 h-6 text-white" />
                      </div>
                    </div>
                    <div className="text-[11px] text-nexus-text-secondary mt-2">
                      <span className="text-nexus-primary font-bold block mb-1">Subir Archivo</span>
                      Suelte su imagen aquí o haga clic para buscar.
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-4">
                    <div className="grid grid-cols-2 gap-3.5">
                      <div>
                        <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1">Nombre *</label>
                        <input 
                          type="text" 
                          required
                          placeholder="Ej. Sofía"
                          value={newBarber.firstName}
                          onChange={(e) => setNewBarber(prev => ({ ...prev, firstName: e.target.value }))}
                          className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2.5 text-xs text-nexus-text outline-none focus:border-nexus-primary"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1">Apellido *</label>
                        <input 
                          type="text" 
                          required
                          placeholder="Ej. Méndez"
                          value={newBarber.lastName}
                          onChange={(e) => setNewBarber(prev => ({ ...prev, lastName: e.target.value }))}
                          className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2.5 text-xs text-nexus-text outline-none focus:border-nexus-primary"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3.5">
                      <div>
                        <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1">Nombre de Usuario Comercial</label>
                        <div className="flex items-center bg-nexus-surface border border-nexus-border rounded-lg px-3 py-2 text-xs text-nexus-text-secondary font-mono font-bold select-none">
                          <span>@</span>
                          <input 
                            type="text"
                            readOnly
                            value={newBarber.username}
                            placeholder="sofia.mendez"
                            className="bg-transparent border-none outline-none text-nexus-primary ml-1 w-full font-bold"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1">Sucursal Activa *</label>
                        <select 
                          value={newBarber.branch}
                          onChange={(e) => setNewBarber(prev => ({ ...prev, branch: e.target.value }))}
                          className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2.5 text-xs text-nexus-text outline-none focus:border-nexus-primary"
                        >
                          {(branches || []).map(b => (
                            <option key={b?.id} value={b?.name}>{b?.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3.5">
                      <div>
                        <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1">PIN de Asistencia Biométrica</label>
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
                            className="w-full bg-transparent border-none p-2.5 text-xs text-nexus-text outline-none font-mono font-bold tracking-widest"
                          />
                          <button 
                            type="button"
                            onClick={handleRegeneratePin}
                            className="p-1.5 hover:bg-nexus-surface-hover text-nexus-text-secondary hover:text-nexus-text rounded transition-colors"
                            title="Regenerar PIN Aleatorio"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-nexus-primary" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1">Estado de Incorporación</label>
                        <div className="flex items-center gap-2 mt-2">
                          <button 
                            type="button"
                            onClick={() => setNewBarber(prev => ({ ...prev, active: !prev.active }))}
                            className="p-1 hover:bg-nexus-surface-hover rounded-md transition-colors"
                          >
                            {newBarber.active ? (
                              <ToggleRight className="w-8 h-8 text-nexus-primary" />
                            ) : (
                              <ToggleLeft className="w-8 h-8 text-nexus-text-muted" />
                            )}
                          </button>
                          <span className="text-[11px] font-bold text-nexus-text font-mono">
                            {newBarber.active ? 'Habilitado para trabajar' : 'Suspendido / No activo'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3.5 pt-2 border-t border-nexus-border">
                      <div>
                        <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1">Contraseña de Portal *</label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Lock className="w-3.5 h-3.5 text-nexus-text-muted" />
                          </span>
                          <input 
                            type={showPassword ? "text" : "password"} 
                            required
                            placeholder="••••••••"
                            value={newBarber.password}
                            onChange={(e) => setNewBarber(prev => ({ ...prev, password: e.target.value }))}
                            className="w-full bg-nexus-background border border-nexus-border rounded-lg pl-9 pr-10 py-2.5 text-xs text-nexus-text outline-none focus:border-nexus-primary font-mono"
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
                        <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1">Confirmar Contraseña *</label>
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
                            className="w-full bg-nexus-background border border-nexus-border rounded-lg pl-9 pr-10 py-2.5 text-xs text-nexus-text outline-none focus:border-nexus-primary font-mono"
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
                      <h4 className="text-[11px] font-black uppercase text-nexus-primary tracking-wider font-mono font-bold">Servicios Seleccionados ({newBarber.services.length})</h4>
                      <button 
                        type="button" 
                        onClick={() => setNewBarber(prev => ({ ...prev, services: [] }))}
                        className="text-[10px] text-nexus-error-text font-bold hover:underline"
                      >
                        Limpiar Selección
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
                                <h5 className="text-[11px] font-bold text-nexus-text leading-tight">{original.name}</h5>
                                <p className="text-[9px] text-nexus-text-muted font-mono">Precio: {original.price} Bs</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setNewBarber(prev => ({
                                    ...prev,
                                    services: prev.services.filter(s => s.serviceId !== assigned.serviceId)
                                  }));
                                }}
                                className="p-1 hover:bg-nexus-error-bg text-nexus-error-text rounded-lg"
                                title="Quitar Servicio"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="pt-2 border-t border-nexus-border flex items-center justify-between">
                              <span className="text-[10px] text-nexus-text-secondary font-bold font-mono">Personalizar Comisión</span>
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
                                className="text-[10px] font-extrabold text-nexus-primary hover:underline"
                              >
                                {assigned.commissionEnabled ? 'ACTIVADA' : 'DESACTIVADA'}
                              </button>
                            </div>

                            {assigned.commissionEnabled && (
                              <div className="grid grid-cols-2 gap-2 pt-1.5 animate-fadeIn">
                                <div>
                                  <label className="text-[8px] text-nexus-text-muted font-bold uppercase tracking-widest font-mono">Tipo</label>
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
                                    className="w-full bg-nexus-background border border-nexus-border rounded-md p-1.5 text-[10px] text-nexus-text"
                                  >
                                    <option value="%">Porcentaje %</option>
                                    <option value="Bs">Monto Fijo (Bs)</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[8px] text-nexus-text-muted font-bold uppercase tracking-widest font-mono">Valor Comisión</label>
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
                                    className="w-full bg-nexus-background border border-nexus-border rounded-md p-1.5 text-[10px] text-nexus-text font-mono"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {newBarber.services.length === 0 && (
                        <div className="text-center text-nexus-text-muted py-16">
                          <Scissors className="w-8 h-8 mx-auto mb-2 opacity-35" />
                          <p className="text-[10px] font-bold">No hay servicios seleccionados</p>
                          <p className="text-[9px] text-nexus-text-muted">Agrégar de la lista de disponibles a la derecha.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-nexus-background border border-nexus-border rounded-xl p-5 flex flex-col h-[380px] shadow-sm">
                    <div className="space-y-3.5 mb-3">
                      <div className="flex justify-between items-center">
                        <h4 className="text-[11px] font-black uppercase text-nexus-text-secondary tracking-wider font-mono font-bold">Servicios Disponibles</h4>
                        <button 
                          type="button"
                          onClick={() => {
                            const currentIds = newBarber.services.map(s => s.serviceId);
                            const toAdd = filteredWizardServices
                              .filter(s => !currentIds.includes(s.id))
                              .map(s => ({ serviceId: s.id, commissionEnabled: false, type: '%', value: 40 }));
                            setNewBarber(prev => ({ ...prev, services: [...prev.services, ...toAdd] }));
                          }}
                          className="text-[10px] text-nexus-primary font-bold hover:underline cursor-pointer"
                        >
                          Seleccionar Todos
                        </button>
                      </div>

                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                          <Search className="w-3.5 h-3.5 text-nexus-text-muted" />
                        </span>
                        <input 
                          type="text" 
                          placeholder="Buscar tratamiento..." 
                          value={serviceSearch}
                          onChange={(e) => setServiceSearch(e.target.value)}
                          className="w-full bg-nexus-surface border border-nexus-border rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-nexus-text outline-none"
                        />
                      </div>

                      <div className="flex bg-nexus-surface border border-nexus-border rounded-lg p-0.5">
                        {['Todos', 'Públicos', 'Internos'].map(tab => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setServiceTab(tab)}
                            className={`flex-1 py-1 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
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
                              isSelected 
                                ? 'bg-nexus-primary-soft border-nexus-primary/40 hover:opacity-90' 
                                : 'bg-nexus-surface border-nexus-border hover:bg-nexus-surface-hover'
                            }`}
                          >
                            <div>
                              <p className="font-bold text-nexus-text">{s.name}</p>
                              <p className="text-[9px] text-nexus-text-muted font-mono">{s.duration} min — {s.price} Bs</p>
                            </div>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold font-mono ${
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

{barberStep === 3 && (
                <div className="bg-nexus-background border border-nexus-border rounded-xl p-5 shadow-sm space-y-4 animate-fadeIn">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="text-[11px] font-black uppercase text-nexus-text-secondary tracking-wider font-mono font-bold">Configuración de Horarios Laborales</h4>
                      <p className="text-[9px] text-nexus-text-muted">Ajuste la disponibilidad semanal que se mostrará en los turnos de la agenda.</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-nexus-border bg-nexus-surface">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-nexus-border bg-nexus-background text-[9px] text-nexus-text-secondary uppercase tracking-widest font-mono font-bold">
                          <th className="py-2.5 px-4">Día de la semana</th>
                          <th className="py-2.5 px-4 text-center">Estado</th>
                          <th className="py-2.5 px-4 text-center">Hora de Inicio</th>
                          <th className="py-2.5 px-4 text-center">Hora de Finalización</th>
                          <th className="py-2.5 px-4 text-right">Acciones de Plantilla</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-nexus-border">
                        {newBarber.availability.map((av, idx) => {
                          const isRest = av.status === 'Descanso';
                          return (
                            <tr key={av.day} className="hover:bg-nexus-surface-hover transition-colors">
                              <td className="py-2 px-4 font-bold text-nexus-text">
                                {av.day}
                              </td>
                              <td className="py-2 px-4 text-center">
                                <button
                                  type="button"
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
                                  className={`px-2 py-0.5 rounded text-[9px] font-extrabold font-mono tracking-wider transition-colors border cursor-pointer font-bold ${
                                    isRest 
                                      ? 'bg-nexus-error-bg text-nexus-error-text border-nexus-error/25 hover:opacity-80' 
                                      : 'bg-nexus-primary-soft text-nexus-primary border-nexus-primary/25 hover:opacity-80'
                                  }`}
                                >
                                  {av.status.toUpperCase()}
                                </button>
                              </td>
                              <td className="py-2 px-4 text-center">
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
                                  className={`bg-nexus-surface border border-nexus-border rounded px-2 py-1 text-[11px] outline-none text-nexus-text font-mono text-center transition-opacity ${
                                    isRest ? 'opacity-40 pointer-events-none' : ''
                                  }`}
                                />
                              </td>
                              <td className="py-2 px-4 text-center">
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
                                  className={`bg-nexus-surface border border-nexus-border rounded px-2 py-1 text-[11px] outline-none text-nexus-text font-mono text-center transition-opacity ${
                                    isRest ? 'opacity-40 pointer-events-none' : ''
                                  }`}
                                />
                              </td>
                              <td className="py-2 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleCopyAvailabilityToAll(idx)}
                                  className="px-2 py-1 bg-nexus-surface border border-nexus-border hover:border-nexus-primary rounded text-[9px] font-bold text-nexus-text-secondary transition-colors inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Copy className="w-3 h-3 text-nexus-primary" /> Copiar horarios a todos
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
                className="px-4 py-2 bg-nexus-surface border border-nexus-border hover:bg-nexus-surface-hover text-nexus-text-secondary font-bold rounded-lg text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <div className="flex items-center gap-2.5">
                {barberStep > 1 && (
                  <button 
                    type="button"
                    onClick={() => setBarberStep(prev => prev - 1)}
                    className="px-4 py-2 bg-nexus-surface hover:bg-nexus-surface-hover border border-nexus-border text-nexus-text-secondary font-bold rounded-lg text-xs transition-colors cursor-pointer"
                  >
                    Anterior
                  </button>
                )}

                {barberStep < 3 ? (
                  <button 
                    type="button"
                    onClick={handleNextStep}
                    className="px-4 py-2 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-bold rounded-lg text-xs shadow-md transition-colors cursor-pointer font-bold"
                  >
                    Siguiente paso
                  </button>
                ) : (
                  <button 
                    type="button"
                    onClick={handleSaveBarber}
                    className="px-5 py-2 bg-nexus-primary hover:bg-nexus-primary-hover text-white font-extrabold rounded-lg text-xs shadow-md transition-all cursor-pointer font-bold"
                  >
                    {editingBarberId ? 'Guardar Cambios' : 'Crear Profesional'}
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
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-nexus-surface border border-nexus-border rounded-2xl w-full max-w-lg p-6 relative shadow-xl overflow-hidden">
            <h3 className="text-base font-extrabold text-nexus-text mb-1 tracking-tight flex items-center gap-2 font-bold">
              <Building2 className="w-5 h-5 text-nexus-primary" />
              {editingBranchId ? 'Editar Sucursal' : 'Crear Nueva Sucursal'}
            </h3>
            <p className="text-[10px] text-nexus-text-secondary mb-4">Complete la información física y de contacto comercial.</p>

            <form onSubmit={handleCreateBranch} className="space-y-4">
              <div>
                <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1 uppercase tracking-wider">Nombre de la Sucursal *</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej. Equipetrol Premium"
                  value={newBranch.name}
                  onChange={(e) => setNewBranch(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2.5 text-xs text-nexus-text outline-none focus:border-nexus-primary"
                />
              </div>

              <div>
                <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1 uppercase tracking-wider">Teléfono de Sucursal</label>
                <div className="flex items-center bg-nexus-background border border-nexus-border rounded-lg px-2.5 gap-2">
                  {detectedBranchCountry && (
                    <div className="flex items-center gap-1 shrink-0 text-xs">
                      <span>{detectedBranchCountry?.flag}</span>
                      <span className="text-[9px] font-mono text-nexus-text-secondary font-bold">{detectedBranchCountry?.code}</span>
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
                    className="w-full bg-transparent border-0 py-2.5 text-xs text-nexus-text outline-none"
                  />
                </div>
                {detectedBranchCountry && (
                  <span className="text-[8px] text-nexus-primary font-bold mt-1 block">
                    Ubicación del prefijo comercial detectado ({detectedBranchCountry?.country})
                  </span>
                )}
              </div>

              <div>
                <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1 uppercase tracking-wider">Horario de Atención</label>
                <input 
                  type="text" 
                  placeholder="Ej. Lunes a Sábado, 09:00 - 20:00"
                  value={newBranch.schedule}
                  onChange={(e) => setNewBranch(prev => ({ ...prev, schedule: e.target.value }))}
                  className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2.5 text-xs text-nexus-text outline-none focus:border-nexus-primary"
                />
              </div>

              <div className="relative">
                <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1 uppercase tracking-wider">Ubicación / Dirección Física *</label>
                <div className="relative flex items-center">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <MapPin className="w-4 h-4 text-nexus-error" />
                  </span>
                  <input 
                    type="text" 
                    required
                    placeholder="Escriba dirección de búsqueda (ej. Central, Equipetrol)..."
                    value={locationSearch}
                    onChange={(e) => {
                      setLocationSearch(e.target.value);
                      setNewBranch(prev => ({ ...prev, address: e.target.value }));
                      setShowLocationList(true);
                    }}
                    onFocus={() => setShowLocationList(true)}
                    className="w-full bg-nexus-background border border-nexus-border rounded-lg pl-8 pr-2.5 py-2.5 text-xs text-nexus-text outline-none focus:border-nexus-primary"
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
                          <p className="font-bold text-nexus-text text-[11px] truncate">{l?.name}</p>
                          <p className="text-[9px] text-nexus-text-muted truncate">{l?.address}</p>
                        </div>
                      </div>
                    ))}
                    {filteredSimulatedLocations.length === 0 && (
                      <p className="p-3 text-[10px] text-nexus-text-muted text-center">No hay sugerencias con esa dirección. Intente otra calle.</p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-[9px] text-nexus-text-muted font-bold uppercase tracking-widest">Mapa Interactivo de Coordenadas</label>
                  <span className="text-[8px] text-nexus-primary font-mono">Zoom, arrastra el pin o haz clic para reubicar</span>
                </div>
                
                <div className="relative h-48 w-full rounded-xl overflow-hidden border border-nexus-border bg-nexus-background z-10">
                  <div ref={mapContainerRef} className="w-full h-full text-black" />
                  
                  <div className="absolute bottom-2 left-2 bg-nexus-surface/90 border border-nexus-border px-2 py-1 rounded text-[8px] text-nexus-text-secondary font-mono z-25 flex gap-2 select-none pointer-events-none">
                    <span>Lat: {newBranch?.lat?.toFixed(5)}</span>
                    <span>Lng: {newBranch?.lng?.toFixed(5)}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-nexus-border">
                <button 
                  type="button" 
                  onClick={() => {
                    setActiveModal(null);
                    setNewBranch({ name: '', phone: '', address: '', schedule: '', lat: -17.7732, lng: -63.1821, createdDate: '' });
                    setLocationSearch('');
                  }} 
                  className="px-4 py-2 bg-nexus-surface border border-nexus-border hover:bg-nexus-surface-hover text-nexus-text-secondary text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 bg-nexus-primary hover:bg-nexus-primary-hover text-white text-xs font-bold rounded-lg shadow-md transition-all cursor-pointer font-bold"
                >
                  {editingBranchId ? 'Guardar Cambios' : 'Crear Sucursal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. MODAL: AGREGAR SERVICIOS */}
      {/* 7. MODAL: AGREGAR SERVICIOS */}
      {activeModal === 'add-service' && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-nexus-surface border border-nexus-border rounded-2xl w-full max-w-md p-6 relative shadow-xl">
            <h3 className="text-base font-extrabold text-nexus-text mb-1 tracking-tight flex items-center gap-2 font-bold">
              <Scissors className="w-5 h-5 text-nexus-primary" />
              Crear Nuevo Servicio
            </h3>
            <p className="text-[10px] text-nexus-text-secondary mb-4">Ingrese los detalles y la disponibilidad semanal del tratamiento.</p>
            
            <form onSubmit={handleCreateService} className="space-y-4">
              <div>
                <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1 uppercase tracking-wider">Nombre del Servicio *</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej. Sesión GallyFlow Express"
                  value={newService.name}
                  onChange={(e) => setNewService(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2.5 text-xs text-nexus-text outline-none focus:border-nexus-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1 uppercase tracking-wider">Precio *</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      required
                      placeholder="100"
                      value={newService.price}
                      onChange={(e) => setNewService(prev => ({ ...prev, price: e.target.value }))}
                      className="w-full bg-nexus-background border border-nexus-border rounded-lg pl-3 pr-8 p-2.5 text-xs text-nexus-text outline-none focus:border-nexus-primary font-mono font-bold"
                    />
                    <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs font-bold text-nexus-text-muted select-none font-bold">Bs</span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-nexus-text-secondary font-bold block mb-1 uppercase tracking-wider">Tiempo de Duración *</label>
                  <select 
                    required
                    value={newService.duration}
                    onChange={(e) => setNewService(prev => ({ ...prev, duration: e.target.value }))}
                    className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2.5 text-xs text-nexus-text outline-none focus:border-nexus-primary font-bold font-sans"
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

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-[10px] text-nexus-text-secondary font-bold uppercase tracking-wider">Disponibilidad por Días *</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNewService(prev => ({ ...prev, availableDays: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] }))}
                      className="text-[9px] text-nexus-primary hover:underline font-bold cursor-pointer"
                    >
                      Todos
                    </button>
                    <span className="text-nexus-text-muted text-[9px] font-bold">|</span>
                    <button
                      type="button"
                      onClick={() => setNewService(prev => ({ ...prev, availableDays: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] }))}
                      className="text-[9px] text-nexus-primary hover:underline font-bold cursor-pointer"
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

              <div className="flex justify-end gap-2.5 pt-3 border-t border-nexus-border">
                <button 
                  type="button" 
                  onClick={() => setActiveModal(null)} 
                  className="px-4 py-2 bg-nexus-surface border border-nexus-border hover:bg-nexus-surface-hover text-nexus-text-secondary text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 bg-nexus-primary hover:bg-nexus-primary-hover text-white text-xs font-bold rounded-lg shadow-md transition-all cursor-pointer font-bold"
                >
                  Crear Servicio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. MODAL: ASISTENCIA BIOMÉTRICO */}
      {/* 8. MODAL: ASISTENCIA BIOMÉTRICO */}
      {activeModal === 'assistance' && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-nexus-surface border border-nexus-border rounded-2xl w-full max-w-sm p-5 relative shadow-xl">
            <h3 className="text-base font-bold text-nexus-text mb-1">Biométrico de Asistencia</h3>
            <p className="text-[11px] text-nexus-text-secondary mb-4">Ingresa tu PIN personal para autorizar el marcaje de hoy.</p>
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
                className="w-full bg-nexus-background border border-nexus-border text-center tracking-widest text-lg rounded-lg p-2.5 text-nexus-text outline-none font-mono" 
              />
              <div className="flex justify-end gap-2.5 pt-2">
                <button type="button" onClick={() => { setActiveModal(null); setAssistPin(''); }} className="px-3.5 py-1.5 bg-nexus-surface border border-nexus-border text-nexus-text-secondary text-xs font-semibold rounded-lg font-mono font-bold cursor-pointer">Cerrar</button>
                <button type="submit" className="px-3.5 py-1.5 bg-nexus-primary hover:bg-nexus-primary-hover text-white text-xs font-bold rounded-lg font-mono font-bold cursor-pointer">Registrar</button>
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
  );
}