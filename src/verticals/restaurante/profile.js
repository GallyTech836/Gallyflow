import { lazy } from 'react';
import { LayoutDashboard, ClipboardList, LayoutGrid, UtensilsCrossed, Wallet } from 'lucide-react';

// Registro de módulos del vertical restaurante para el panel del admin.
//   key        -> clave del módulo (RESTAURANT_MODULES de businessProfileModel.js)
//   capability -> capacidad que lo habilita (capabilityModel.js)
// Para agregar un módulo: sumar la entrada aquí, su clave en RESTAURANT_MODULES
// y su capacidad en capabilityModel.js. El menú lateral se arma solo.
export const RESTAURANTE_NAV = [
  {
    section: 'Principal',
    items: [
      { key: 'dashboard', label: 'Dashboard', title: 'Panel general', icon: LayoutDashboard, capability: 'dashboard',
        Component: lazy(() => import('./admin/DashboardPage')) },
      { key: 'orders', label: 'Pedidos', title: 'Pedidos y cocina', icon: ClipboardList, capability: 'pedidos',
        Component: lazy(() => import('./admin/PedidosPage')) },
    ],
  },
  {
    section: 'Gestión',
    items: [
      { key: 'tables', label: 'Mesas', title: 'Mesas y zonas', icon: LayoutGrid, capability: 'mesas',
        Component: lazy(() => import('./admin/MesasPage')) },
      { key: 'menu', label: 'Menú', title: 'Menú del restaurante', icon: UtensilsCrossed, capability: 'menuRestaurante',
        Component: lazy(() => import('./admin/MenuPage')) },
      { key: 'pos', label: 'Caja', title: 'Caja y cobros', icon: Wallet, capability: 'cajaRestaurante',
        Component: lazy(() => import('./admin/CajaPage')) },
    ],
  },
];
